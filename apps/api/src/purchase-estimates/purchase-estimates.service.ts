import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EntryType, EstimateStatus, PartyType, Prisma, VoucherType } from '@prisma/client';
import { AccountingService } from '../accounting/accounting.service';
import { fiscalYearOf } from '../accounting/fiscal-year.util';
import {
  calculateInvoice,
  type CalcLineInput,
} from '../invoices/gst-calculator';
import type { FullInvoice } from '../invoices/invoice-pdf.service';
import { PurchasesService } from '../purchases/purchases.service';
import { PrismaService } from '../prisma/prisma.service';
import type {
  CreatePurchaseEstimateDto,
  SetPurchaseEstimateStatusDto,
} from './dto/purchase-estimate.dto';

@Injectable()
export class PurchaseEstimatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly purchases: PurchasesService,
    private readonly accounting: AccountingService,
  ) {}

  /**
   * Purchase-estimate-as-bill: posts a payable (Dr Purchases + input GST,
   * Cr vendor) built from the stored amounts, when the company reconciles
   * Payment-Out against purchase estimates.
   */
  private async purchaseEstimatePayableLines(
    companyId: string,
    partyLedgerId: string,
    calc: {
      total: number;
      taxableAmount: number;
      cgstAmount: number;
      sgstAmount: number;
      igstAmount: number;
      roundOff: number;
    },
    extraCharges: number,
  ): Promise<{ ledgerId: string; type: EntryType; amount: number }[]> {
    const names = ['Purchases', 'CGST Input', 'SGST Input', 'IGST Input', 'Rounding Off'];
    const found = await this.prisma.ledger.findMany({
      where: { companyId, name: { in: names } },
      select: { id: true, name: true },
    });
    const L = Object.fromEntries(found.map((l) => [l.name, l.id]));
    for (const n of names) {
      if (!L[n]) throw new BadRequestException(`Missing system ledger "${n}"`);
    }
    const lines: { ledgerId: string; type: EntryType; amount: number }[] = [
      { ledgerId: L['Purchases'], type: EntryType.DEBIT, amount: calc.taxableAmount },
    ];
    if (calc.cgstAmount > 0) {
      lines.push({ ledgerId: L['CGST Input'], type: EntryType.DEBIT, amount: calc.cgstAmount });
      lines.push({ ledgerId: L['SGST Input'], type: EntryType.DEBIT, amount: calc.sgstAmount });
    }
    if (calc.igstAmount > 0) {
      lines.push({ ledgerId: L['IGST Input'], type: EntryType.DEBIT, amount: calc.igstAmount });
    }
    if (extraCharges > 0) {
      lines.push({
        ledgerId: await this.freightExpenseLedger(companyId),
        type: EntryType.DEBIT,
        amount: extraCharges,
      });
    }
    if (calc.roundOff > 0) {
      lines.push({ ledgerId: L['Rounding Off'], type: EntryType.DEBIT, amount: calc.roundOff });
    } else if (calc.roundOff < 0) {
      lines.push({ ledgerId: L['Rounding Off'], type: EntryType.CREDIT, amount: Math.abs(calc.roundOff) });
    }
    // Vendor is credited the full payable.
    lines.push({ ledgerId: partyLedgerId, type: EntryType.CREDIT, amount: calc.total });
    return lines;
  }

  /** Find-or-create the "Freight & Other Charges" expense ledger. */
  private async freightExpenseLedger(companyId: string): Promise<string> {
    const name = 'Freight & Other Charges';
    const existing = await this.prisma.ledger.findUnique({
      where: { companyId_name: { companyId, name } },
      select: { id: true },
    });
    if (existing) return existing.id;
    const group = await this.prisma.accountGroup.findFirst({
      where: { companyId, name: 'Indirect Expenses' },
      select: { id: true },
    });
    if (!group) throw new BadRequestException('Account group "Indirect Expenses" is missing');
    const created = await this.prisma.ledger.create({
      data: { companyId, groupId: group.id, name, isSystem: true },
      select: { id: true },
    });
    return created.id;
  }

  async create(
    companyId: string,
    userId: string,
    dto: CreatePurchaseEstimateDto,
    branchScope?: string,
  ) {
    if (branchScope) dto.branchId = branchScope;
    const [company, party] = await Promise.all([
      this.prisma.company.findUniqueOrThrow({
        where: { id: companyId },
        select: { stateCode: true, fyStartMonth: true, purchasePaymentLink: true },
      }),
      this.prisma.party.findFirst({
        where: { id: dto.partyId, companyId, isActive: true },
      }),
    ]);
    if (!party) throw new BadRequestException('Unknown party');
    if (party.type !== PartyType.VENDOR) {
      throw new BadRequestException('Purchase estimates can only be raised on vendors');
    }
    if (dto.branchId) {
      const branch = await this.prisma.branch.findFirst({
        where: { id: dto.branchId, companyId, isActive: true },
      });
      if (!branch) throw new BadRequestException('Unknown branch');
    }

    // Mirrors the purchase bill: interstate-ness comes from the vendor's state.
    const isInterState =
      company.stateCode !== null &&
      party.stateCode !== null &&
      party.stateCode !== company.stateCode;

    const resolved = await this.resolveLines(companyId, dto.lines);
    const extraCharges =
      (Number(dto.freightCharges) || 0) + (Number(dto.otherCharges) || 0);
    const calc = calculateInvoice(
      resolved.map((r) => r.calc),
      isInterState,
      extraCharges,
    );
    const fiscalYear = fiscalYearOf(new Date(dto.date), company.fyStartMonth);

    // Purchase-estimate-as-bill: pre-build the payable voucher (Cr vendor).
    const bookAsBill = company.purchasePaymentLink === 'purchaseEstimate';
    const voucherDto = bookAsBill
      ? {
          type: VoucherType.PURCHASE,
          date: dto.date,
          narration: `Purchase estimate (booked) from ${party.name}`,
          lines: await this.purchaseEstimatePayableLines(
            companyId,
            party.ledgerId,
            calc,
            extraCharges,
          ),
        }
      : null;
    if (voucherDto) await this.accounting.validateVoucherInput(companyId, voucherDto);

    const estimate = await this.prisma.$transaction(async (tx) => {
      const counter = await tx.purchaseEstimateCounter.upsert({
        where: { companyId_fiscalYear: { companyId, fiscalYear } },
        create: { companyId, fiscalYear, nextNo: 2 },
        update: { nextNo: { increment: 1 } },
      });
      const voucher = voucherDto
        ? await this.accounting.postVoucherTx(tx, companyId, userId, voucherDto)
        : null;
      return tx.purchaseEstimate.create({
        data: {
          companyId,
          partyId: party.id,
          branchId: dto.branchId ?? null,
          voucherId: voucher?.id ?? null,
          estimateNo: counter.nextNo - 1,
          fiscalYear,
          date: new Date(dto.date),
          validUntil: dto.validUntil ? new Date(dto.validUntil) : null,
          placeOfSupply: party.stateCode ?? company.stateCode ?? null,
          isInterState,
          notes: dto.notes,
          showCompanyName: dto.showCompanyName,
          subtotal: calc.subtotal,
          discountTotal: calc.discountTotal,
          taxableAmount: calc.taxableAmount,
          cgstAmount: calc.cgstAmount,
          sgstAmount: calc.sgstAmount,
          igstAmount: calc.igstAmount,
          roundOff: calc.roundOff,
          freightCharges: dto.freightCharges ?? 0,
          otherCharges: dto.otherCharges ?? 0,
          total: calc.total,
          createdById: userId,
          lines: {
            create: resolved.map((r, index) => ({
              itemId: r.itemId,
              lineNo: index + 1,
              description: r.description,
              hsnCode: r.hsnCode,
              unit: r.unit,
              quantity: calc.lines[index].quantity,
              rate: calc.lines[index].rate,
              discountPct: calc.lines[index].discountPct,
              taxableValue: calc.lines[index].taxableValue,
              gstRate: calc.lines[index].gstRate,
              cgst: calc.lines[index].cgst,
              sgst: calc.lines[index].sgst,
              igst: calc.lines[index].igst,
              total: calc.lines[index].total,
            })),
          },
        },
        include: this.fullInclude,
      });
    });
    return this.serialize(estimate);
  }

  /** Edit an open purchase estimate — re-resolves lines and recomputes GST. */
  async update(
    companyId: string,
    estimateId: string,
    dto: CreatePurchaseEstimateDto,
    branchScope?: string,
  ) {
    const existing = await this.prisma.purchaseEstimate.findFirst({
      where: { id: estimateId, companyId, ...(branchScope && { branchId: branchScope }) },
    });
    if (!existing) throw new NotFoundException('Purchase estimate not found');
    if (existing.status === EstimateStatus.CONVERTED) {
      throw new BadRequestException('A converted estimate cannot be edited');
    }
    if (existing.status === EstimateStatus.CANCELLED) {
      throw new BadRequestException('A cancelled estimate cannot be edited');
    }
    if (existing.voucherId) {
      throw new BadRequestException(
        'This purchase estimate is booked as a bill (posted to accounts) — cancel & reissue to change it',
      );
    }
    if (branchScope) dto.branchId = branchScope;

    const [company, party] = await Promise.all([
      this.prisma.company.findUniqueOrThrow({
        where: { id: companyId },
        select: { stateCode: true },
      }),
      this.prisma.party.findFirst({
        where: { id: dto.partyId, companyId, isActive: true },
      }),
    ]);
    if (!party) throw new BadRequestException('Unknown party');
    if (party.type !== PartyType.VENDOR) {
      throw new BadRequestException('Purchase estimates can only be raised on vendors');
    }
    if (dto.branchId) {
      const branch = await this.prisma.branch.findFirst({
        where: { id: dto.branchId, companyId, isActive: true },
      });
      if (!branch) throw new BadRequestException('Unknown branch');
    }

    const isInterState =
      company.stateCode !== null &&
      party.stateCode !== null &&
      party.stateCode !== company.stateCode;

    const resolved = await this.resolveLines(companyId, dto.lines);
    const extraCharges =
      (Number(dto.freightCharges) || 0) + (Number(dto.otherCharges) || 0);
    const calc = calculateInvoice(
      resolved.map((r) => r.calc),
      isInterState,
      extraCharges,
    );

    await this.prisma.$transaction(async (tx) => {
      await tx.purchaseEstimateLine.deleteMany({ where: { estimateId } });
      await tx.purchaseEstimate.update({
        where: { id: estimateId },
        data: {
          partyId: party.id,
          branchId: dto.branchId ?? null,
          date: new Date(dto.date),
          validUntil: dto.validUntil ? new Date(dto.validUntil) : null,
          placeOfSupply: party.stateCode ?? company.stateCode ?? null,
          isInterState,
          notes: dto.notes,
          showCompanyName: dto.showCompanyName,
          subtotal: calc.subtotal,
          discountTotal: calc.discountTotal,
          taxableAmount: calc.taxableAmount,
          cgstAmount: calc.cgstAmount,
          sgstAmount: calc.sgstAmount,
          igstAmount: calc.igstAmount,
          roundOff: calc.roundOff,
          freightCharges: dto.freightCharges ?? 0,
          otherCharges: dto.otherCharges ?? 0,
          total: calc.total,
          lines: {
            create: resolved.map((r, index) => ({
              itemId: r.itemId,
              lineNo: index + 1,
              description: r.description,
              hsnCode: r.hsnCode,
              unit: r.unit,
              quantity: calc.lines[index].quantity,
              rate: calc.lines[index].rate,
              discountPct: calc.lines[index].discountPct,
              taxableValue: calc.lines[index].taxableValue,
              gstRate: calc.lines[index].gstRate,
              cgst: calc.lines[index].cgst,
              sgst: calc.lines[index].sgst,
              igst: calc.lines[index].igst,
              total: calc.lines[index].total,
            })),
          },
        },
      });
    });
    return this.getOne(companyId, estimateId, branchScope);
  }

  async list(companyId: string, branchScope?: string) {
    const rows = await this.prisma.purchaseEstimate.findMany({
      where: { companyId, ...(branchScope && { branchId: branchScope }) },
      include: this.fullInclude,
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      take: 200,
    });
    return rows.map((e) => this.serialize(e));
  }

  async getOne(companyId: string, estimateId: string, branchScope?: string) {
    const estimate = await this.prisma.purchaseEstimate.findFirst({
      where: { id: estimateId, companyId, ...(branchScope && { branchId: branchScope }) },
      include: this.fullInclude,
    });
    if (!estimate) throw new NotFoundException('Purchase estimate not found');
    return this.serialize(estimate);
  }

  async setStatus(
    companyId: string,
    estimateId: string,
    dto: SetPurchaseEstimateStatusDto,
    branchScope?: string,
  ) {
    const estimate = await this.prisma.purchaseEstimate.findFirst({
      where: { id: estimateId, companyId, ...(branchScope && { branchId: branchScope }) },
    });
    if (!estimate) throw new NotFoundException('Purchase estimate not found');
    if (estimate.status === EstimateStatus.CONVERTED) {
      throw new BadRequestException('A converted estimate cannot change status');
    }
    if (estimate.status === EstimateStatus.CANCELLED) {
      throw new BadRequestException('A cancelled estimate cannot change status');
    }
    await this.prisma.purchaseEstimate.update({
      where: { id: estimate.id },
      data: { status: dto.status as EstimateStatus },
    });
    return this.getOne(companyId, estimateId, branchScope);
  }

  async cancel(companyId: string, estimateId: string, branchScope?: string) {
    const estimate = await this.prisma.purchaseEstimate.findFirst({
      where: { id: estimateId, companyId, ...(branchScope && { branchId: branchScope }) },
    });
    if (!estimate) throw new NotFoundException('Purchase estimate not found');
    if (estimate.status === EstimateStatus.CONVERTED) {
      throw new BadRequestException(
        'A converted estimate cannot be cancelled — cancel the bill instead',
      );
    }
    if (estimate.status === EstimateStatus.CANCELLED) {
      throw new BadRequestException('Estimate is already cancelled');
    }
    if (estimate.voucherId) {
      const paid = await this.prisma.partyPayment.count({
        where: { purchaseEstimateId: estimate.id },
      });
      if (paid > 0) {
        throw new BadRequestException(
          'This purchase estimate has payments recorded against it — reverse them before cancelling',
        );
      }
    }
    await this.prisma.purchaseEstimate.update({
      where: { id: estimate.id },
      data: { status: EstimateStatus.CANCELLED },
    });
    if (estimate.voucherId) {
      await this.accounting.cancelVoucher(companyId, estimate.voucherId);
    }
    return this.getOne(companyId, estimateId, branchScope);
  }

  /**
   * Permanently delete a purchase estimate, its lines and (if booked as a bill)
   * its payable voucher. Advance payments are left on-account (unlinked).
   */
  async remove(companyId: string, estimateId: string) {
    const estimate = await this.prisma.purchaseEstimate.findFirst({
      where: { id: estimateId, companyId },
      select: { id: true, voucherId: true },
    });
    if (!estimate) throw new NotFoundException('Purchase estimate not found');
    await this.prisma.$transaction(async (tx) => {
      await tx.partyPayment.updateMany({ where: { purchaseEstimateId: estimateId }, data: { purchaseEstimateId: null } });
      await tx.purchaseEstimateLine.deleteMany({ where: { estimateId } });
      await tx.purchaseEstimate.delete({ where: { id: estimateId } });
      if (estimate.voucherId) {
        const vLines = await tx.voucherLine.findMany({
          where: { voucherId: estimate.voucherId },
          select: { id: true },
        });
        if (vLines.length) {
          await tx.bankStatementLine.updateMany({
            where: { matchedVoucherLineId: { in: vLines.map((l) => l.id) } },
            data: { matchedVoucherLineId: null },
          });
        }
        await tx.voucherLine.deleteMany({ where: { voucherId: estimate.voucherId } });
        await tx.voucher.deleteMany({ where: { id: estimate.voucherId, companyId } });
      }
    });
    return { deleted: true };
  }

  /** Turn an open/accepted vendor quotation into a purchase bill, and link them. */
  async convertToBill(
    companyId: string,
    estimateId: string,
    userId: string,
    branchScope?: string,
  ) {
    const estimate = await this.prisma.purchaseEstimate.findFirst({
      where: { id: estimateId, companyId, ...(branchScope && { branchId: branchScope }) },
      include: { lines: { orderBy: { lineNo: 'asc' }, include: { item: true } } },
    });
    if (!estimate) throw new NotFoundException('Purchase estimate not found');
    if (estimate.status === EstimateStatus.CONVERTED || estimate.purchaseBillId) {
      throw new BadRequestException('Estimate is already converted to a bill');
    }
    if (estimate.voucherId) {
      throw new BadRequestException(
        'This purchase estimate is already booked as a bill in accounts — it is the final document and cannot be converted',
      );
    }
    if (estimate.status === EstimateStatus.CANCELLED) {
      throw new BadRequestException('A cancelled estimate cannot be converted');
    }
    if (estimate.status === EstimateStatus.DECLINED) {
      throw new BadRequestException('A declined estimate cannot be converted');
    }
    const batchItem = estimate.lines.find((l) => l.item?.trackBatches);
    if (batchItem) {
      throw new BadRequestException(
        `"${batchItem.item?.name}" tracks batches — create the bill manually to record batch numbers`,
      );
    }

    const estimateNo = this.displayNo(estimate.fiscalYear, estimate.estimateNo);
    const today = new Date().toISOString().slice(0, 10);
    const bill = await this.purchases.create(
      companyId,
      userId,
      {
        partyId: estimate.partyId,
        branchId: estimate.branchId ?? undefined,
        date: today,
        notes: estimate.notes
          ? `${estimate.notes} · Converted from ${estimateNo}`
          : `Converted from ${estimateNo}`,
        lines: estimate.lines.map((l) => ({
          itemId: l.itemId ?? undefined,
          description: l.description,
          quantity: Number(l.quantity),
          rate: Number(l.rate),
          discountPct: Number(l.discountPct),
          gstRate: Number(l.gstRate) as never,
        })),
      },
      branchScope,
    );

    await this.prisma.purchaseEstimate.update({
      where: { id: estimate.id },
      data: { purchaseBillId: bill.id, status: EstimateStatus.CONVERTED },
    });
    return this.getOne(companyId, estimateId, branchScope);
  }

  /** Maps a purchase estimate to the PDF shape so it reuses the invoice layout. */
  async getForPdf(
    companyId: string,
    estimateId: string,
    branchScope?: string,
  ): Promise<FullInvoice> {
    const estimate = await this.prisma.purchaseEstimate.findFirst({
      where: { id: estimateId, companyId, ...(branchScope && { branchId: branchScope }) },
      include: {
        company: true,
        party: true,
        lines: { orderBy: { lineNo: 'asc' } },
      },
    });
    if (!estimate) throw new NotFoundException('Purchase estimate not found');
    const mapped = {
      ...estimate,
      invoiceNo: estimate.estimateNo,
      dueDate: estimate.validUntil,
      status: estimate.status === EstimateStatus.CANCELLED ? 'CANCELLED' : 'ISSUED',
    };
    return mapped as unknown as FullInvoice;
  }

  // -------------------------------------------------------------

  private async resolveLines(
    companyId: string,
    lines: CreatePurchaseEstimateDto['lines'],
  ) {
    const itemIds = lines
      .map((l) => l.itemId)
      .filter((id): id is string => Boolean(id));
    const items = await this.prisma.item.findMany({
      where: { id: { in: itemIds }, companyId, isActive: true },
    });
    const itemById = new Map(items.map((i) => [i.id, i]));

    return lines.map((line, index) => {
      const item = line.itemId ? itemById.get(line.itemId) : undefined;
      if (line.itemId && !item) {
        throw new BadRequestException(`Line ${index + 1}: unknown item`);
      }
      const description = line.description?.trim() || item?.name;
      if (!description) {
        throw new BadRequestException(
          `Line ${index + 1}: description is required when no item is selected`,
        );
      }
      // Vendor quotes default to the item's purchase price.
      const rate =
        line.rate ?? (item?.purchasePrice ? Number(item.purchasePrice) : undefined);
      if (rate === undefined) {
        throw new BadRequestException(
          `Line ${index + 1}: rate is required (item has no purchase price)`,
        );
      }
      return {
        itemId: item?.id ?? null,
        description,
        hsnCode: item?.hsnCode ?? null,
        unit: item?.unit ?? 'PCS',
        calc: {
          quantity: line.quantity,
          rate,
          discountPct: line.discountPct ?? 0,
          gstRate: line.gstRate ?? (item ? Number(item.gstRate) : 0),
        } satisfies CalcLineInput,
      };
    });
  }

  private displayNo(fiscalYear: string, no: number) {
    return `PEST/${fiscalYear}/${String(no).padStart(4, '0')}`;
  }

  private readonly fullInclude = {
    party: { select: { id: true, name: true, gstin: true } },
    branch: { select: { id: true, name: true } },
    purchaseBill: { select: { id: true, fiscalYear: true, billNo: true } },
    lines: { orderBy: { lineNo: 'asc' as const } },
  };

  private serialize(estimate: {
    id: string;
    estimateNo: number;
    fiscalYear: string;
    date: Date;
    validUntil: Date | null;
    placeOfSupply: string | null;
    isInterState: boolean;
    notes: string | null;
    showCompanyName: boolean;
    status: EstimateStatus;
    subtotal: Prisma.Decimal;
    discountTotal: Prisma.Decimal;
    taxableAmount: Prisma.Decimal;
    cgstAmount: Prisma.Decimal;
    sgstAmount: Prisma.Decimal;
    igstAmount: Prisma.Decimal;
    roundOff: Prisma.Decimal;
    freightCharges: Prisma.Decimal;
    otherCharges: Prisma.Decimal;
    total: Prisma.Decimal;
    party: { id: string; name: string; gstin: string | null };
    branch?: { id: string; name: string } | null;
    purchaseBill?: { id: string; fiscalYear: string; billNo: number } | null;
    lines: {
      lineNo: number;
      itemId: string | null;
      description: string;
      hsnCode: string | null;
      unit: string;
      quantity: Prisma.Decimal;
      rate: Prisma.Decimal;
      discountPct: Prisma.Decimal;
      taxableValue: Prisma.Decimal;
      gstRate: Prisma.Decimal;
      cgst: Prisma.Decimal;
      sgst: Prisma.Decimal;
      igst: Prisma.Decimal;
      total: Prisma.Decimal;
    }[];
  }) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const isExpired =
      estimate.status === EstimateStatus.OPEN &&
      estimate.validUntil !== null &&
      estimate.validUntil < today;
    return {
      id: estimate.id,
      estimateNo: this.displayNo(estimate.fiscalYear, estimate.estimateNo),
      date: estimate.date,
      validUntil: estimate.validUntil,
      placeOfSupply: estimate.placeOfSupply,
      isInterState: estimate.isInterState,
      notes: estimate.notes,
      showCompanyName: estimate.showCompanyName,
      status: estimate.status,
      isExpired,
      party: estimate.party,
      branch: estimate.branch ?? null,
      bill: estimate.purchaseBill
        ? {
            id: estimate.purchaseBill.id,
            billNo: `PB/${estimate.purchaseBill.fiscalYear}/${String(estimate.purchaseBill.billNo).padStart(4, '0')}`,
          }
        : null,
      subtotal: Number(estimate.subtotal),
      discountTotal: Number(estimate.discountTotal),
      taxableAmount: Number(estimate.taxableAmount),
      cgstAmount: Number(estimate.cgstAmount),
      sgstAmount: Number(estimate.sgstAmount),
      igstAmount: Number(estimate.igstAmount),
      roundOff: Number(estimate.roundOff),
      freightCharges: Number(estimate.freightCharges),
      otherCharges: Number(estimate.otherCharges),
      total: Number(estimate.total),
      lines: estimate.lines.map((line) => ({
        lineNo: line.lineNo,
        itemId: line.itemId,
        description: line.description,
        hsnCode: line.hsnCode,
        unit: line.unit,
        quantity: Number(line.quantity),
        rate: Number(line.rate),
        discountPct: Number(line.discountPct),
        taxableValue: Number(line.taxableValue),
        gstRate: Number(line.gstRate),
        cgst: Number(line.cgst),
        sgst: Number(line.sgst),
        igst: Number(line.igst),
        total: Number(line.total),
      })),
    };
  }
}
