import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EntryType, EstimateStatus, PartyType, Prisma, VoucherType } from '@prisma/client';
import { AccountingService } from '../accounting/accounting.service';
import { fiscalYearOf } from '../accounting/fiscal-year.util';
import { InvoicesService } from '../invoices/invoices.service';
import type { FullInvoice } from '../invoices/invoice-pdf.service';
import {
  calculateInvoice,
  type CalcLineInput,
} from '../invoices/gst-calculator';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateEstimateDto, SetEstimateStatusDto } from './dto/estimate.dto';

@Injectable()
export class EstimatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly invoices: InvoicesService,
    private readonly accounting: AccountingService,
  ) {}

  /**
   * When the company reconciles Payment-In against estimates, an estimate is a
   * real bill: it posts a receivable (Dr customer, Cr Sales + GST + freight).
   * Returns the line set for a SALES voucher built from the stored amounts.
   */
  private async estimateReceivableLines(
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
    const names = ['Sales', 'CGST Payable', 'SGST Payable', 'IGST Payable', 'Rounding Off'];
    const found = await this.prisma.ledger.findMany({
      where: { companyId, name: { in: names } },
      select: { id: true, name: true },
    });
    const L = Object.fromEntries(found.map((l) => [l.name, l.id]));
    for (const n of names) {
      if (!L[n]) throw new BadRequestException(`Missing system ledger "${n}"`);
    }
    const lines: { ledgerId: string; type: EntryType; amount: number }[] = [
      { ledgerId: partyLedgerId, type: EntryType.DEBIT, amount: calc.total },
      { ledgerId: L['Sales'], type: EntryType.CREDIT, amount: calc.taxableAmount },
    ];
    if (calc.cgstAmount > 0) {
      lines.push({ ledgerId: L['CGST Payable'], type: EntryType.CREDIT, amount: calc.cgstAmount });
      lines.push({ ledgerId: L['SGST Payable'], type: EntryType.CREDIT, amount: calc.sgstAmount });
    }
    if (calc.igstAmount > 0) {
      lines.push({ ledgerId: L['IGST Payable'], type: EntryType.CREDIT, amount: calc.igstAmount });
    }
    if (extraCharges > 0) {
      lines.push({
        ledgerId: await this.freightIncomeLedger(companyId),
        type: EntryType.CREDIT,
        amount: extraCharges,
      });
    }
    if (calc.roundOff > 0) {
      lines.push({ ledgerId: L['Rounding Off'], type: EntryType.CREDIT, amount: calc.roundOff });
    } else if (calc.roundOff < 0) {
      lines.push({ ledgerId: L['Rounding Off'], type: EntryType.DEBIT, amount: Math.abs(calc.roundOff) });
    }
    return lines;
  }

  /** Find-or-create the "Freight & Other Charges" income ledger. */
  private async freightIncomeLedger(companyId: string): Promise<string> {
    const name = 'Freight & Other Charges';
    const existing = await this.prisma.ledger.findUnique({
      where: { companyId_name: { companyId, name } },
      select: { id: true },
    });
    if (existing) return existing.id;
    const group = await this.prisma.accountGroup.findFirst({
      where: { companyId, name: 'Indirect Income' },
      select: { id: true },
    });
    if (!group) throw new BadRequestException('Account group "Indirect Income" is missing');
    const created = await this.prisma.ledger.create({
      data: { companyId, groupId: group.id, name, isSystem: true },
      select: { id: true },
    });
    return created.id;
  }

  async create(
    companyId: string,
    userId: string,
    dto: CreateEstimateDto,
    branchScope?: string,
  ) {
    if (branchScope) dto.branchId = branchScope;
    const [company, party] = await Promise.all([
      this.prisma.company.findUniqueOrThrow({
        where: { id: companyId },
        select: { stateCode: true, fyStartMonth: true, salesPaymentLink: true },
      }),
      this.prisma.party.findFirst({
        where: { id: dto.partyId, companyId, isActive: true },
      }),
    ]);
    if (!party) throw new BadRequestException('Unknown party');
    if (party.type !== PartyType.CUSTOMER) {
      throw new BadRequestException('Estimates can only be raised on customers');
    }
    if (dto.branchId) {
      const branch = await this.prisma.branch.findFirst({
        where: { id: dto.branchId, companyId, isActive: true },
      });
      if (!branch) throw new BadRequestException('Unknown branch');
    }

    const placeOfSupply =
      dto.placeOfSupply ?? party.stateCode ?? company.stateCode ?? null;
    const isInterState =
      company.stateCode !== null &&
      placeOfSupply !== null &&
      placeOfSupply !== company.stateCode;

    const resolved = await this.resolveLines(companyId, dto.lines);
    const extraCharges =
      (Number(dto.freightCharges) || 0) + (Number(dto.otherCharges) || 0);
    const calc = calculateInvoice(
      resolved.map((r) => r.calc),
      isInterState,
      extraCharges,
    );

    const fiscalYear = fiscalYearOf(new Date(dto.date), company.fyStartMonth);

    // Estimate-as-bill: pre-build the receivable voucher (Dr customer, Cr Sales).
    const bookAsBill = company.salesPaymentLink === 'estimate';
    const voucherDto = bookAsBill
      ? {
          type: VoucherType.SALES,
          date: dto.date,
          narration: `Estimate (booked) to ${party.name}`,
          lines: await this.estimateReceivableLines(
            companyId,
            party.ledgerId,
            calc,
            extraCharges,
          ),
        }
      : null;
    if (voucherDto) await this.accounting.validateVoucherInput(companyId, voucherDto);

    const estimate = await this.prisma.$transaction(async (tx) => {
      const counter = await tx.estimateCounter.upsert({
        where: { companyId_fiscalYear: { companyId, fiscalYear } },
        create: { companyId, fiscalYear, nextNo: 2 },
        update: { nextNo: { increment: 1 } },
      });
      const voucher = voucherDto
        ? await this.accounting.postVoucherTx(tx, companyId, userId, voucherDto)
        : null;
      return tx.estimate.create({
        data: {
          companyId,
          partyId: party.id,
          branchId: dto.branchId ?? null,
          voucherId: voucher?.id ?? null,
          estimateNo: counter.nextNo - 1,
          fiscalYear,
          date: new Date(dto.date),
          validUntil: dto.validUntil ? new Date(dto.validUntil) : null,
          placeOfSupply,
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

  /** Edit an open estimate — re-resolves lines and recomputes GST. */
  async update(
    companyId: string,
    estimateId: string,
    dto: CreateEstimateDto,
    branchScope?: string,
  ) {
    const existing = await this.prisma.estimate.findFirst({
      where: { id: estimateId, companyId, ...(branchScope && { branchId: branchScope }) },
    });
    if (!existing) throw new NotFoundException('Estimate not found');
    if (existing.status === EstimateStatus.CONVERTED) {
      throw new BadRequestException('A converted estimate cannot be edited');
    }
    if (existing.status === EstimateStatus.CANCELLED) {
      throw new BadRequestException('A cancelled estimate cannot be edited');
    }
    if (existing.voucherId) {
      throw new BadRequestException(
        'This estimate is booked as a bill (posted to accounts) — cancel & reissue to change it',
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
    if (party.type !== PartyType.CUSTOMER) {
      throw new BadRequestException('Estimates can only be raised on customers');
    }
    if (dto.branchId) {
      const branch = await this.prisma.branch.findFirst({
        where: { id: dto.branchId, companyId, isActive: true },
      });
      if (!branch) throw new BadRequestException('Unknown branch');
    }

    const placeOfSupply =
      dto.placeOfSupply ?? party.stateCode ?? company.stateCode ?? null;
    const isInterState =
      company.stateCode !== null &&
      placeOfSupply !== null &&
      placeOfSupply !== company.stateCode;

    const resolved = await this.resolveLines(companyId, dto.lines);
    const extraCharges =
      (Number(dto.freightCharges) || 0) + (Number(dto.otherCharges) || 0);
    const calc = calculateInvoice(
      resolved.map((r) => r.calc),
      isInterState,
      extraCharges,
    );

    await this.prisma.$transaction(async (tx) => {
      await tx.estimateLine.deleteMany({ where: { estimateId } });
      await tx.estimate.update({
        where: { id: estimateId },
        data: {
          partyId: party.id,
          branchId: dto.branchId ?? null,
          date: new Date(dto.date),
          validUntil: dto.validUntil ? new Date(dto.validUntil) : null,
          placeOfSupply,
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
    const rows = await this.prisma.estimate.findMany({
      where: { companyId, ...(branchScope && { branchId: branchScope }) },
      include: this.fullInclude,
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      take: 200,
    });
    return rows.map((e) => this.serialize(e));
  }

  async getOne(companyId: string, estimateId: string, branchScope?: string) {
    const estimate = await this.prisma.estimate.findFirst({
      where: { id: estimateId, companyId, ...(branchScope && { branchId: branchScope }) },
      include: this.fullInclude,
    });
    if (!estimate) throw new NotFoundException('Estimate not found');
    return this.serialize(estimate);
  }

  async setStatus(
    companyId: string,
    estimateId: string,
    dto: SetEstimateStatusDto,
    branchScope?: string,
  ) {
    const estimate = await this.prisma.estimate.findFirst({
      where: { id: estimateId, companyId, ...(branchScope && { branchId: branchScope }) },
    });
    if (!estimate) throw new NotFoundException('Estimate not found');
    if (estimate.status === EstimateStatus.CONVERTED) {
      throw new BadRequestException('A converted estimate cannot change status');
    }
    if (estimate.status === EstimateStatus.CANCELLED) {
      throw new BadRequestException('A cancelled estimate cannot change status');
    }
    await this.prisma.estimate.update({
      where: { id: estimate.id },
      data: { status: dto.status as EstimateStatus },
    });
    return this.getOne(companyId, estimateId, branchScope);
  }

  async cancel(companyId: string, estimateId: string, branchScope?: string) {
    const estimate = await this.prisma.estimate.findFirst({
      where: { id: estimateId, companyId, ...(branchScope && { branchId: branchScope }) },
    });
    if (!estimate) throw new NotFoundException('Estimate not found');
    if (estimate.status === EstimateStatus.CONVERTED) {
      throw new BadRequestException(
        'A converted estimate cannot be cancelled — cancel the invoice instead',
      );
    }
    if (estimate.status === EstimateStatus.CANCELLED) {
      throw new BadRequestException('Estimate is already cancelled');
    }
    // A booked estimate (receivable posted) with payments cannot be cancelled.
    if (estimate.voucherId) {
      const paid = await this.prisma.partyPayment.count({
        where: { estimateId: estimate.id },
      });
      if (paid > 0) {
        throw new BadRequestException(
          'This estimate has payments recorded against it — reverse them before cancelling',
        );
      }
    }
    await this.prisma.estimate.update({
      where: { id: estimate.id },
      data: { status: EstimateStatus.CANCELLED },
    });
    // Void the receivable voucher so the booked sale reverses out of accounts.
    if (estimate.voucherId) {
      await this.accounting.cancelVoucher(companyId, estimate.voucherId);
    }
    return this.getOne(companyId, estimateId, branchScope);
  }

  /**
   * Permanently delete an estimate, its line items and (if it was booked as a
   * bill) its receivable voucher — fully unwinding the ledger. Recorded advance
   * receipts are left on-account (unlinked), not destroyed.
   */
  async remove(companyId: string, estimateId: string) {
    const estimate = await this.prisma.estimate.findFirst({
      where: { id: estimateId, companyId },
      select: { id: true, voucherId: true },
    });
    if (!estimate) throw new NotFoundException('Estimate not found');
    await this.prisma.$transaction(async (tx) => {
      // Leave advance receipts on-account (just unlink them from the estimate).
      await tx.partyPayment.updateMany({ where: { estimateId }, data: { estimateId: null } });
      await tx.estimateLine.deleteMany({ where: { estimateId } });
      await tx.estimate.delete({ where: { id: estimateId } });
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

  /**
   * Turn an open/accepted estimate into a real GST invoice (posts the SALES
   * voucher) and link the two. Batch-tracked items can't be auto-converted —
   * the invoice needs an explicit batch to sell from.
   */
  async convertToInvoice(
    companyId: string,
    estimateId: string,
    userId: string,
    branchScope?: string,
  ) {
    const estimate = await this.prisma.estimate.findFirst({
      where: { id: estimateId, companyId, ...(branchScope && { branchId: branchScope }) },
      include: { lines: { orderBy: { lineNo: 'asc' }, include: { item: true } } },
    });
    if (!estimate) throw new NotFoundException('Estimate not found');
    if (estimate.status === EstimateStatus.CONVERTED || estimate.invoiceId) {
      throw new BadRequestException('Estimate is already converted to an invoice');
    }
    if (estimate.voucherId) {
      throw new BadRequestException(
        'This estimate is already booked as a bill in accounts — it is the final document and cannot be converted',
      );
    }
    if (estimate.status === EstimateStatus.CANCELLED) {
      throw new BadRequestException('A cancelled estimate cannot be converted');
    }
    if (estimate.status === EstimateStatus.DECLINED) {
      throw new BadRequestException('A declined estimate cannot be converted');
    }
    // Only a taxed estimate becomes a GST tax invoice. A tax-free estimate has
    // no GST to carry into the invoice, so block the conversion outright.
    const estimateTax =
      Number(estimate.cgstAmount) +
      Number(estimate.sgstAmount) +
      Number(estimate.igstAmount);
    if (estimateTax <= 0) {
      throw new BadRequestException(
        'Only a taxed estimate can be converted to a GST invoice — add GST to the items first',
      );
    }
    const batchItem = estimate.lines.find((l) => l.item?.trackBatches);
    if (batchItem) {
      throw new BadRequestException(
        `"${batchItem.item?.name}" tracks batches — create the invoice manually to pick the batch to sell from`,
      );
    }

    const estimateNo = this.displayNo(estimate.fiscalYear, estimate.estimateNo);
    const today = new Date().toISOString().slice(0, 10);
    const invoice = await this.invoices.create(
      companyId,
      userId,
      {
        partyId: estimate.partyId,
        branchId: estimate.branchId ?? undefined,
        date: today,
        placeOfSupply: estimate.placeOfSupply ?? undefined,
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

    await this.prisma.estimate.update({
      where: { id: estimate.id },
      data: { invoiceId: invoice.id, status: EstimateStatus.CONVERTED },
    });
    return this.getOne(companyId, estimateId, branchScope);
  }

  /** Maps an estimate to the invoice-PDF shape so it reuses the same layout. */
  async getForPdf(
    companyId: string,
    estimateId: string,
    branchScope?: string,
  ): Promise<FullInvoice> {
    const estimate = await this.prisma.estimate.findFirst({
      where: { id: estimateId, companyId, ...(branchScope && { branchId: branchScope }) },
      include: {
        company: true,
        party: true,
        lines: { orderBy: { lineNo: 'asc' } },
      },
    });
    if (!estimate) throw new NotFoundException('Estimate not found');
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
    lines: CreateEstimateDto['lines'],
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
      const rate =
        line.rate ?? (item?.salePrice ? Number(item.salePrice) : undefined);
      if (rate === undefined) {
        throw new BadRequestException(
          `Line ${index + 1}: rate is required (item has no sale price)`,
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
    return `EST/${fiscalYear}/${String(no).padStart(4, '0')}`;
  }

  private readonly fullInclude = {
    party: { select: { id: true, name: true, gstin: true } },
    branch: { select: { id: true, name: true } },
    invoice: { select: { id: true, fiscalYear: true, invoiceNo: true } },
    lines: { orderBy: { lineNo: 'asc' as const } },
    payments: { select: { amount: true } },
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
    voucherId: string | null;
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
    invoice?: { id: string; fiscalYear: string; invoiceNo: number } | null;
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
    payments?: { amount: Prisma.Decimal }[];
  }) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const isExpired =
      estimate.status === EstimateStatus.OPEN &&
      estimate.validUntil !== null &&
      estimate.validUntil < today;
    const advanceReceived = (estimate.payments ?? []).reduce(
      (sum, p) => sum + Number(p.amount),
      0,
    );
    const taxAmount =
      Number(estimate.cgstAmount) +
      Number(estimate.sgstAmount) +
      Number(estimate.igstAmount);
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
      // A tax-free estimate cannot be converted to a GST invoice.
      isTaxed: taxAmount > 0,
      // Booked-as-a-bill (estimate-link mode) — it's the final doc, not convertible.
      isBooked: estimate.voucherId != null,
      advanceReceived,
      party: estimate.party,
      branch: estimate.branch ?? null,
      invoice: estimate.invoice
        ? {
            id: estimate.invoice.id,
            invoiceNo: `INV/${estimate.invoice.fiscalYear}/${String(estimate.invoice.invoiceNo).padStart(4, '0')}`,
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
