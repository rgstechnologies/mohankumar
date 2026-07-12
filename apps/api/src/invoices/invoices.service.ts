import { randomBytes } from 'crypto';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  EntryType,
  EstimateStatus,
  InvoiceStatus,
  PartyType,
  Prisma,
  VoucherStatus,
  VoucherType,
} from '@prisma/client';
import { AccountingService } from '../accounting/accounting.service';
import type { VoucherLineDto } from '../accounting/dto/accounting.dto';
import { fiscalYearOf } from '../accounting/fiscal-year.util';
import { BatchesService } from '../inventory/batches.service';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateInvoiceDto, RecordPaymentDto } from './dto/invoice.dto';
import { calculateInvoice, type CalcLineInput } from './gst-calculator';
import type { FullInvoice } from './invoice-pdf.service';

@Injectable()
export class InvoicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accounting: AccountingService,
    private readonly batches: BatchesService,
  ) {}

  async create(
    companyId: string,
    userId: string,
    dto: CreateInvoiceDto,
    branchScope?: string,
  ) {
    // Branch managers always bill from their own branch.
    if (branchScope) dto.branchId = branchScope;
    const [company, party] = await Promise.all([
      this.prisma.company.findUniqueOrThrow({
        where: { id: companyId },
        select: {
          stateCode: true,
          fyStartMonth: true,
          loyaltyEnabled: true,
          loyaltyEarnPercent: true,
          loyaltyRedeemValue: true,
        },
      }),
      this.prisma.party.findFirst({
        where: { id: dto.partyId, companyId, isActive: true },
      }),
    ]);
    if (!party) throw new BadRequestException('Unknown party');
    if (party.type !== PartyType.CUSTOMER) {
      throw new BadRequestException('Sales invoices can only be raised on customers');
    }
    if (dto.branchId) {
      const branch = await this.prisma.branch.findFirst({
        where: { id: dto.branchId, companyId, isActive: true },
      });
      if (!branch) throw new BadRequestException('Unknown branch');
    }

    // Place of supply: explicit override > party state > company state (local sale).
    const placeOfSupply =
      dto.placeOfSupply ?? party.stateCode ?? company.stateCode ?? null;
    const isInterState =
      company.stateCode !== null &&
      placeOfSupply !== null &&
      placeOfSupply !== company.stateCode;

    // Resolve lines against the item master.
    const itemIds = dto.lines
      .map((l) => l.itemId)
      .filter((id): id is string => Boolean(id));
    const items = await this.prisma.item.findMany({
      where: { id: { in: itemIds }, companyId, isActive: true },
    });
    const itemById = new Map(items.map((i) => [i.id, i]));

    const resolved = dto.lines.map((line, index) => {
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
      const rate = line.rate ?? (item?.salePrice ? Number(item.salePrice) : undefined);
      if (rate === undefined) {
        throw new BadRequestException(
          `Line ${index + 1}: rate is required (item has no sale price)`,
        );
      }
      if (item?.trackBatches && !line.batchNo?.trim()) {
        throw new BadRequestException(
          `Line ${index + 1}: "${item.name}" tracks batches — pick the batch to sell from`,
        );
      }
      return {
        itemId: item?.id ?? null,
        itemName: item?.name ?? description,
        trackBatches: item?.trackBatches ?? false,
        batchNo: line.batchNo,
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

    // Resolve + validate batches (existence, expiry, available stock).
    const invoiceDate = new Date(dto.date);
    const batchIdByLine = new Map<number, string>();
    for (let i = 0; i < resolved.length; i++) {
      const r = resolved[i];
      if (r.itemId && r.trackBatches && r.batchNo) {
        const batch = await this.batches.resolveForSale(
          companyId,
          r.itemId,
          r.itemName,
          r.batchNo,
          r.calc.quantity,
          invoiceDate,
        );
        batchIdByLine.set(i, batch.id);
      }
    }

    const extraCharges =
      (Number(dto.freightCharges) || 0) + (Number(dto.otherCharges) || 0);
    const calc = calculateInvoice(
      resolved.map((r) => r.calc),
      isInterState,
      extraCharges,
    );

    // Loyalty redemption: apply requested points as a post-tax discount,
    // capped by the customer's balance and by the invoice total.
    const redeemRequested = dto.redeemPoints ?? 0;
    const redeemValue = Number(company.loyaltyRedeemValue);
    let redeemPoints = 0;
    let redeemAmount = 0;
    if (
      redeemRequested > 0 &&
      company.loyaltyEnabled &&
      redeemValue > 0 &&
      party.name !== 'Walk-in Customer'
    ) {
      if (redeemRequested > party.loyaltyPoints) {
        throw new BadRequestException(
          `Not enough loyalty points — balance is ${party.loyaltyPoints}`,
        );
      }
      const maxByTotal = Math.floor(Number(calc.total) / redeemValue);
      redeemPoints = Math.min(redeemRequested, maxByTotal);
      redeemAmount = Math.round(redeemPoints * redeemValue * 100) / 100;
    }

    // Build the accounting entries.
    const ledgers = await this.systemLedgers(companyId);
    const loyaltyLedgerId =
      redeemAmount > 0 ? await this.loyaltyDiscountLedger(companyId) : null;
    const freightLedgerId =
      extraCharges > 0 ? await this.freightChargesLedger(companyId, false) : null;
    const voucherLines = this.buildSalesVoucherLines(
      ledgers,
      calc,
      party.ledgerId,
      loyaltyLedgerId ? { amount: redeemAmount, ledgerId: loyaltyLedgerId } : undefined,
      freightLedgerId ? { amount: extraCharges, ledgerId: freightLedgerId } : undefined,
    );

    const voucherDto = {
      type: VoucherType.SALES,
      date: dto.date,
      narration: `Sales invoice to ${party.name}`,
      lines: voucherLines,
    };
    await this.accounting.validateVoucherInput(companyId, voucherDto);

    const fiscalYear = fiscalYearOf(new Date(dto.date), company.fyStartMonth);

    const invoice = await this.prisma.$transaction(async (tx) => {
      // When loyalty is in play, lock the party row up-front and re-read the
      // balance so concurrent invoices for the same customer can't lost-update
      // the points or over-redeem (re-validate the redemption against fresh).
      const doLoyalty = company.loyaltyEnabled && party.name !== 'Walk-in Customer';
      let loyaltyBalance = party.loyaltyPoints;
      if (doLoyalty) {
        await tx.$queryRaw`SELECT id FROM parties WHERE id = ${party.id} FOR UPDATE`;
        const fresh = await tx.party.findUniqueOrThrow({
          where: { id: party.id },
          select: { loyaltyPoints: true },
        });
        loyaltyBalance = fresh.loyaltyPoints;
        if (redeemPoints > loyaltyBalance) {
          throw new BadRequestException(
            `Not enough loyalty points — balance is ${loyaltyBalance}`,
          );
        }
      }

      const voucher = await this.accounting.postVoucherTx(
        tx,
        companyId,
        userId,
        voucherDto,
      );

      const counter = await tx.invoiceCounter.upsert({
        where: { companyId_fiscalYear: { companyId, fiscalYear } },
        create: { companyId, fiscalYear, nextNo: 2 },
        update: { nextNo: { increment: 1 } },
      });

      const created = await tx.invoice.create({
        data: {
          companyId,
          partyId: party.id,
          branchId: dto.branchId ?? null,
          voucherId: voucher.id,
          invoiceNo: counter.nextNo - 1,
          fiscalYear,
          date: new Date(dto.date),
          dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
          placeOfSupply,
          isInterState,
          notes: dto.notes,
          bankAccountId: dto.bankAccountId ?? null,
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
          loyaltyDiscount: redeemAmount,
          loyaltyPointsRedeemed: redeemPoints,
          createdById: userId,
          lines: {
            create: resolved.map((r, index) => ({
              itemId: r.itemId,
              batchId: batchIdByLine.get(index) ?? null,
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

      // Loyalty (skip the POS walk-in): redeem the applied points first, then
      // award earn points on the gross sale. Both adjust the same balance.
      if (doLoyalty) {
        const ref = `INV/${created.fiscalYear}/${String(created.invoiceNo).padStart(4, '0')}`;
        let runningBal = loyaltyBalance;
        if (redeemPoints > 0) {
          runningBal -= redeemPoints;
          await tx.party.update({
            where: { id: party.id },
            data: { loyaltyPoints: runningBal },
          });
          await tx.loyaltyTxn.create({
            data: {
              companyId,
              partyId: party.id,
              type: 'REDEEM',
              points: -redeemPoints,
              balanceAfter: runningBal,
              reference: ref,
              createdById: userId,
            },
          });
        }
        const pct = Number(company.loyaltyEarnPercent);
        const earned = pct > 0 ? Math.round((Number(calc.total) * pct) / 100) : 0;
        if (earned > 0) {
          runningBal += earned;
          await tx.party.update({
            where: { id: party.id },
            data: { loyaltyPoints: runningBal },
          });
          await tx.loyaltyTxn.create({
            data: {
              companyId,
              partyId: party.id,
              type: 'EARN',
              points: earned,
              balanceAfter: runningBal,
              reference: ref,
              createdById: userId,
            },
          });
        }
      }

      return created;
    });

    return this.serialize(invoice);
  }

  /** The SALES voucher lines for an invoice: party Dr, Sales + GST + round-off Cr. */
  private buildSalesVoucherLines(
    ledgers: Record<string, string>,
    calc: {
      total: number;
      taxableAmount: number;
      cgstAmount: number;
      sgstAmount: number;
      igstAmount: number;
      roundOff: number;
    },
    partyLedgerId: string,
    redeem?: { amount: number; ledgerId: string },
    extra?: { amount: number; ledgerId: string },
  ): VoucherLineDto[] {
    // A loyalty redemption is a post-tax discount the seller bears: the party
    // owes (total − redeemed) and the redeemed rupees go to a discount expense,
    // keeping `total`/GST on the full sale value.
    const redeemAmt = redeem && redeem.amount > 0 ? redeem.amount : 0;
    const lines: VoucherLineDto[] = [
      { ledgerId: partyLedgerId, type: EntryType.DEBIT, amount: calc.total - redeemAmt },
      ...(redeemAmt > 0
        ? [{ ledgerId: redeem!.ledgerId, type: EntryType.DEBIT, amount: redeemAmt }]
        : []),
      { ledgerId: ledgers['Sales'], type: EntryType.CREDIT, amount: calc.taxableAmount },
    ];
    if (calc.cgstAmount > 0) {
      lines.push({ ledgerId: ledgers['CGST Payable'], type: EntryType.CREDIT, amount: calc.cgstAmount });
      lines.push({ ledgerId: ledgers['SGST Payable'], type: EntryType.CREDIT, amount: calc.sgstAmount });
    }
    if (calc.igstAmount > 0) {
      lines.push({ ledgerId: ledgers['IGST Payable'], type: EntryType.CREDIT, amount: calc.igstAmount });
    }
    // Non-taxed freight/other charges: income credited, party already owes them
    // (calc.total includes them).
    if (extra && extra.amount > 0) {
      lines.push({ ledgerId: extra.ledgerId, type: EntryType.CREDIT, amount: extra.amount });
    }
    if (calc.roundOff > 0) {
      lines.push({ ledgerId: ledgers['Rounding Off'], type: EntryType.CREDIT, amount: calc.roundOff });
    } else if (calc.roundOff < 0) {
      lines.push({ ledgerId: ledgers['Rounding Off'], type: EntryType.DEBIT, amount: Math.abs(calc.roundOff) });
    }
    return lines;
  }

  /**
   * Find-or-create the "Freight & Other Charges" ledger. For sales it's an
   * income (Indirect Income); for purchases an expense (Indirect Expenses).
   */
  private async freightChargesLedger(
    companyId: string,
    isPurchase: boolean,
  ): Promise<string> {
    const name = 'Freight & Other Charges';
    const existing = await this.prisma.ledger.findUnique({
      where: { companyId_name: { companyId, name } },
      select: { id: true },
    });
    if (existing) return existing.id;
    const groupName = isPurchase ? 'Indirect Expenses' : 'Indirect Income';
    const group = await this.prisma.accountGroup.findFirst({
      where: { companyId, name: groupName },
      select: { id: true },
    });
    if (!group) {
      throw new BadRequestException(
        `Account group "${groupName}" is missing — re-seed the chart of accounts`,
      );
    }
    const created = await this.prisma.ledger.create({
      data: { companyId, groupId: group.id, name, isSystem: true },
      select: { id: true },
    });
    return created.id;
  }

  /**
   * Edit a posted invoice in place — only when SAFE: no payments, no credit
   * notes, no live e-invoice (IRN), and no batch-tracked lines. The original
   * SALES voucher is re-stated (same number) and lines replaced; stock re-derives
   * from the updated ISSUED lines. Anything unsafe must be cancelled & reissued.
   */
  async update(
    companyId: string,
    invoiceId: string,
    dto: CreateInvoiceDto,
    branchScope?: string,
  ) {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id: invoiceId, companyId, ...(branchScope && { branchId: branchScope }) },
      include: {
        payments: { select: { id: true } },
        creditNotes: { where: { status: 'ISSUED' }, select: { id: true } },
        eInvoice: { select: { status: true } },
        lines: { select: { item: { select: { trackBatches: true } } } },
      },
    });
    if (!invoice) throw new NotFoundException('Invoice not found');
    if (invoice.status === InvoiceStatus.CANCELLED) {
      throw new BadRequestException('A cancelled invoice cannot be edited');
    }
    if (invoice.payments.length > 0) {
      throw new BadRequestException(
        'This invoice has recorded payments — cancel & reissue to change it',
      );
    }
    if (invoice.creditNotes.length > 0) {
      throw new BadRequestException(
        'This invoice has credit notes — cancel those, or cancel & reissue',
      );
    }
    if (invoice.eInvoice && invoice.eInvoice.status === 'GENERATED') {
      throw new BadRequestException(
        'Cancel the e-invoice (IRN) first, then edit — or cancel & reissue',
      );
    }
    if (invoice.lines.some((l) => l.item?.trackBatches)) {
      throw new BadRequestException(
        'This invoice has batch-tracked items — cancel & reissue to change it',
      );
    }
    if (Number(invoice.loyaltyDiscount) > 0) {
      throw new BadRequestException(
        'This invoice has redeemed loyalty points — cancel & reissue to change it',
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
      throw new BadRequestException('Sales invoices can only be raised on customers');
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

    const itemIds = dto.lines
      .map((l) => l.itemId)
      .filter((id): id is string => Boolean(id));
    const items = await this.prisma.item.findMany({
      where: { id: { in: itemIds }, companyId, isActive: true },
    });
    const itemById = new Map(items.map((i) => [i.id, i]));

    const resolved = dto.lines.map((line, index) => {
      const item = line.itemId ? itemById.get(line.itemId) : undefined;
      if (line.itemId && !item) {
        throw new BadRequestException(`Line ${index + 1}: unknown item`);
      }
      if (item?.trackBatches) {
        throw new BadRequestException(
          `"${item.name}" tracks batches — cancel & reissue to change batch sales`,
        );
      }
      const description = line.description?.trim() || item?.name;
      if (!description) {
        throw new BadRequestException(
          `Line ${index + 1}: description is required when no item is selected`,
        );
      }
      const rate = line.rate ?? (item?.salePrice ? Number(item.salePrice) : undefined);
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

    const extraCharges =
      (Number(dto.freightCharges) || 0) + (Number(dto.otherCharges) || 0);
    const calc = calculateInvoice(
      resolved.map((r) => r.calc),
      isInterState,
      extraCharges,
    );
    const ledgers = await this.systemLedgers(companyId);
    const freightLedgerId =
      extraCharges > 0 ? await this.freightChargesLedger(companyId, false) : null;
    const voucherLines = this.buildSalesVoucherLines(
      ledgers,
      calc,
      party.ledgerId,
      undefined,
      freightLedgerId ? { amount: extraCharges, ledgerId: freightLedgerId } : undefined,
    );
    const narration = `Sales invoice to ${party.name}`;
    await this.accounting.validateVoucherInput(companyId, {
      type: VoucherType.SALES,
      date: dto.date,
      narration,
      lines: voucherLines,
    });

    await this.prisma.$transaction(async (tx) => {
      // Re-state the SALES voucher in place (same number) with the new amounts.
      await tx.voucherLine.deleteMany({ where: { voucherId: invoice.voucherId } });
      await tx.voucher.update({
        where: { id: invoice.voucherId },
        data: {
          date: new Date(dto.date),
          narration,
          lines: {
            create: voucherLines.map((l, index) => ({
              ledgerId: l.ledgerId,
              lineNo: index + 1,
              type: l.type,
              amount: l.amount,
            })),
          },
        },
      });
      await tx.invoiceLine.deleteMany({ where: { invoiceId } });
      await tx.invoice.update({
        where: { id: invoiceId },
        data: {
          partyId: party.id,
          branchId: dto.branchId ?? null,
          date: new Date(dto.date),
          dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
          placeOfSupply,
          isInterState,
          notes: dto.notes,
          bankAccountId: dto.bankAccountId ?? null,
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
    return this.getOne(companyId, invoiceId, branchScope);
  }

  async list(companyId: string, branchScope?: string) {
    const invoices = await this.prisma.invoice.findMany({
      where: { companyId, ...(branchScope && { branchId: branchScope }), },
      include: this.fullInclude,
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      take: 200,
    });
    return invoices.map((inv) => this.serialize(inv));
  }

  async getOne(companyId: string, invoiceId: string, branchScope?: string) {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id: invoiceId, companyId, ...(branchScope && { branchId: branchScope }), },
      include: this.fullInclude,
    });
    if (!invoice) throw new NotFoundException('Invoice not found');
    return this.serialize(invoice);
  }

  /** Raw record with company + party details — used by the PDF renderer. */
  /** Creates (or reuses) the unguessable public-share token. */
  async share(companyId: string, invoiceId: string, branchScope?: string) {
    const invoice = await this.prisma.invoice.findFirst({
      where: {
        id: invoiceId,
        companyId,
        ...(branchScope && { branchId: branchScope }),
      },
      include: { party: { select: { name: true, phone: true } } },
    });
    if (!invoice) throw new NotFoundException('Invoice not found');
    if (invoice.status === 'CANCELLED') {
      throw new BadRequestException('Cancelled invoices cannot be shared');
    }
    const shareToken =
      invoice.shareToken ?? randomBytes(24).toString('hex');
    if (!invoice.shareToken) {
      await this.prisma.invoice.update({
        where: { id: invoice.id },
        data: { shareToken },
      });
    }
    return {
      shareToken,
      invoiceNo: `INV/${invoice.fiscalYear}/${String(invoice.invoiceNo).padStart(4, '0')}`,
      total: Number(invoice.total),
      date: invoice.date,
      party: invoice.party,
    };
  }

  async revokeShare(companyId: string, invoiceId: string) {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id: invoiceId, companyId },
    });
    if (!invoice) throw new NotFoundException('Invoice not found');
    await this.prisma.invoice.update({
      where: { id: invoice.id },
      data: { shareToken: null },
    });
  }

  /** Public path — the token IS the authorization. */
  async getByShareToken(token: string) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { shareToken: token },
      include: {
        company: true,
        party: true,
        lines: { orderBy: { lineNo: 'asc' } },
        payments: true,
      },
    });
    if (!invoice || invoice.status === 'CANCELLED') {
      throw new NotFoundException('This link is no longer valid');
    }
    return invoice;
  }

  async getForPdf(companyId: string, invoiceId: string, branchScope?: string) {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id: invoiceId, companyId, ...(branchScope && { branchId: branchScope }), },
      include: {
        company: true,
        party: true,
        lines: { orderBy: { lineNo: 'asc' } },
        payments: true,
        eInvoice: true,
        eWayBill: true,
        bankAccount: true,
      },
    });
    if (!invoice) throw new NotFoundException('Invoice not found');
    // Per-invoice bank override: print the chosen bank's details (else the
    // company default mirrored onto company.bank*).
    if (invoice.bankAccount) {
      const b = invoice.bankAccount;
      invoice.company = {
        ...invoice.company,
        bankName: b.bankName ?? b.accountName,
        bankAccountName: b.accountName,
        bankAccountNo: b.accountNo,
        bankIfsc: b.ifsc,
        bankBranch: b.branch,
      };
    }
    return invoice;
  }

  /**
   * A synthetic, never-persisted invoice carrying the company's real seller
   * details with the supplied template/logo override applied — used to preview
   * unsaved layout changes. The PDF renderer reads template + logo off
   * `company`, so we only override there.
   */
  async buildTemplatePreview(
    companyId: string,
    override: { template?: object; logo?: string | null },
  ): Promise<FullInvoice> {
    const company = await this.prisma.company.findUniqueOrThrow({
      where: { id: companyId },
    });
    const previewCompany = {
      ...company,
      invoiceTemplate:
        override.template !== undefined
          ? (override.template as Prisma.JsonValue)
          : company.invoiceTemplate,
      // Clear saved per-form templates so the previewed override wins for EVERY
      // docKind (else a saved documentTemplates[docKind] would shadow it — which
      // made the estimate preview ignore the gallery selection).
      documentTemplates: null,
      logo: override.logo !== undefined ? override.logo : company.logo,
    };

    const d = (n: number) => new Prisma.Decimal(n);
    const mkLine = (
      lineNo: number,
      description: string,
      qty: number,
      rate: number,
      gstRate: number,
    ) => {
      const taxable = qty * rate;
      const gst = (taxable * gstRate) / 100;
      return {
        id: `preview-${lineNo}`,
        invoiceId: 'preview',
        lineNo,
        itemId: null,
        description,
        hsnCode: '5208',
        quantity: d(qty),
        unit: 'PCS',
        rate: d(rate),
        discount: d(0),
        taxableValue: d(taxable),
        gstRate: d(gstRate),
        cgst: d(gst / 2),
        sgst: d(gst / 2),
        igst: d(0),
        total: d(taxable + gst),
      };
    };
    const lines = [
      mkLine(1, 'Cotton Fabric 40s Bleached', 50, 120, 5),
      mkLine(2, 'Stitching & finishing charges', 1, 2000, 12),
    ];
    const taxable = 50 * 120 + 2000;
    const cgst = (50 * 120 * 0.05) / 2 + (2000 * 0.12) / 2;
    const now = new Date();
    const due = new Date(now.getTime() + 15 * 86400_000);

    const invoice = {
      id: 'preview',
      companyId,
      partyId: 'preview',
      branchId: null,
      voucherId: 'preview',
      invoiceNo: 1,
      fiscalYear: fiscalYearOf(now, company.fyStartMonth),
      date: now,
      dueDate: due,
      placeOfSupply: company.stateCode ?? '33',
      isInterState: false,
      notes: 'Sample invoice — preview of your saved layout.',
      subtotal: d(taxable),
      discountTotal: d(0),
      taxableAmount: d(taxable),
      cgstAmount: d(cgst),
      sgstAmount: d(cgst),
      igstAmount: d(0),
      roundOff: d(0),
      total: d(taxable + cgst * 2),
      loyaltyDiscount: d(0),
      loyaltyPointsRedeemed: 0,
      status: InvoiceStatus.ISSUED,
      shareToken: null,
      createdById: 'preview',
      createdAt: now,
      updatedAt: now,
      company: previewCompany,
      party: {
        id: 'preview',
        companyId,
        name: 'Sample Customer',
        type: PartyType.CUSTOMER,
        addressLine1: '123 Market Street',
        city: 'Coimbatore',
        gstin: '33BBBCS5678B1Z9',
      },
      lines,
      // Sample part-payment so the Received/Balance preview rows have data.
      payments: [
        { amount: d(Math.round((taxable + cgst * 2) / 2)), method: 'CASH', date: now },
      ],
    };
    return invoice as unknown as FullInvoice;
  }

  async cancel(companyId: string, invoiceId: string) {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id: invoiceId, companyId },
      include: {
        payments: true,
        creditNotes: { where: { status: 'ISSUED' }, select: { id: true } },
      },
    });
    if (!invoice) throw new NotFoundException('Invoice not found');
    if (invoice.status === InvoiceStatus.CANCELLED) {
      throw new BadRequestException('Invoice is already cancelled');
    }
    if (invoice.payments.length > 0) {
      throw new BadRequestException(
        'Cannot cancel an invoice with recorded payments',
      );
    }
    if (invoice.creditNotes.length > 0) {
      throw new BadRequestException(
        'Cannot cancel an invoice with credit notes — cancel the notes first',
      );
    }

    await this.prisma.$transaction([
      this.prisma.voucher.update({
        where: { id: invoice.voucherId },
        data: { status: VoucherStatus.CANCELLED },
      }),
      this.prisma.invoice.update({
        where: { id: invoice.id },
        data: { status: InvoiceStatus.CANCELLED },
      }),
    ]);
    return this.getOne(companyId, invoiceId);
  }

  /**
   * Permanently delete an invoice and everything tied to it: its line items,
   * recorded payments and credit notes, the e-invoice/e-way bill, and every
   * voucher it (or its payments/notes) posted — so the ledger and derived stock
   * fully un-wind. Any source document it was converted from (estimate, proforma,
   * challan, sales order) is unlinked and reverted so it can be re-used.
   */
  async remove(companyId: string, invoiceId: string) {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id: invoiceId, companyId },
      select: {
        id: true,
        voucherId: true,
        payments: { select: { voucherId: true } },
        creditNotes: { select: { id: true, voucherId: true } },
      },
    });
    if (!invoice) throw new NotFoundException('Invoice not found');

    const noteIds = invoice.creditNotes.map((n) => n.id);
    const voucherIds = [
      invoice.voucherId,
      ...invoice.payments.map((p) => p.voucherId),
      ...invoice.creditNotes.map((n) => n.voucherId),
    ].filter((v): v is string => !!v);

    // Children are removed explicitly (DB FK cascade can't be relied on), then
    // the invoice, then every voucher it posted — fully unwinding the ledger;
    // stock is derived from live invoices, so it restores automatically.
    await this.prisma.$transaction(async (tx) => {
      // Revert any source documents this invoice was generated from.
      await tx.estimate.updateMany({ where: { invoiceId, companyId }, data: { invoiceId: null, status: EstimateStatus.ACCEPTED } });
      await tx.proformaInvoice.updateMany({ where: { invoiceId, companyId }, data: { invoiceId: null, status: EstimateStatus.ACCEPTED } });
      await tx.deliveryChallan.updateMany({ where: { invoiceId, companyId }, data: { invoiceId: null, status: EstimateStatus.ACCEPTED } });
      await tx.salesOrder.updateMany({ where: { invoiceId, companyId }, data: { invoiceId: null, status: EstimateStatus.ACCEPTED } });
      await tx.payment.deleteMany({ where: { invoiceId } });
      if (noteIds.length) await tx.noteLine.deleteMany({ where: { noteId: { in: noteIds } } });
      await tx.note.deleteMany({ where: { invoiceId } });
      await tx.eInvoice.deleteMany({ where: { invoiceId } });
      await tx.eWayBill.deleteMany({ where: { invoiceId } });
      await tx.invoiceLine.deleteMany({ where: { invoiceId } });
      await tx.invoice.delete({ where: { id: invoiceId } });
      if (voucherIds.length) {
        // Unmatch any bank-statement lines reconciled against these voucher
        // lines first — the FK isn't ON DELETE in the live DB, so deleting the
        // lines would either fail or strand the bank line as "reconciled".
        const vLines = await tx.voucherLine.findMany({
          where: { voucherId: { in: voucherIds } },
          select: { id: true },
        });
        if (vLines.length) {
          await tx.bankStatementLine.updateMany({
            where: { matchedVoucherLineId: { in: vLines.map((l) => l.id) } },
            data: { matchedVoucherLineId: null },
          });
        }
        await tx.voucherLine.deleteMany({ where: { voucherId: { in: voucherIds } } });
        await tx.voucher.deleteMany({ where: { id: { in: voucherIds }, companyId } });
      }
    });
    return { deleted: true };
  }

  async recordPayment(
    companyId: string,
    invoiceId: string,
    userId: string,
    dto: RecordPaymentDto,
    branchScope?: string,
  ) {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id: invoiceId, companyId, ...(branchScope && { branchId: branchScope }), },
      include: {
        party: true,
        payments: true,
        creditNotes: { where: { status: 'ISSUED' }, select: { total: true } },
      },
    });
    if (!invoice) throw new NotFoundException('Invoice not found');
    if (invoice.status === InvoiceStatus.CANCELLED) {
      throw new BadRequestException('Cannot record payment on a cancelled invoice');
    }

    const paid = invoice.payments.reduce((sum, p) => sum + Number(p.amount), 0);
    const noted = invoice.creditNotes.reduce((sum, n) => sum + Number(n.total), 0);
    const outstanding =
      Math.round((Number(invoice.total) - paid - noted) * 100) / 100;
    if (dto.amount > outstanding) {
      throw new BadRequestException(
        `Amount exceeds outstanding balance of ₹${outstanding}`,
      );
    }

    const voucherDto = {
      type: VoucherType.RECEIPT,
      date: dto.date,
      narration: `Payment received against invoice INV/${invoice.fiscalYear}/${String(invoice.invoiceNo).padStart(4, '0')}`,
      lines: [
        { ledgerId: dto.ledgerId, type: EntryType.DEBIT, amount: dto.amount },
        {
          ledgerId: invoice.party.ledgerId,
          type: EntryType.CREDIT,
          amount: dto.amount,
        },
      ],
    };
    await this.accounting.validateVoucherInput(companyId, voucherDto);

    await this.prisma.$transaction(async (tx) => {
      // Lock the invoice and re-check outstanding INSIDE the txn: two concurrent
      // payments must not both pass the pre-check and over-apply (TOCTOU).
      await tx.$queryRaw`SELECT id FROM invoices WHERE id = ${invoiceId} FOR UPDATE`;
      const fresh = await tx.invoice.findUniqueOrThrow({
        where: { id: invoiceId },
        select: {
          status: true,
          total: true,
          payments: { select: { amount: true } },
          creditNotes: { where: { status: 'ISSUED' }, select: { total: true } },
        },
      });
      if (fresh.status === InvoiceStatus.CANCELLED) {
        throw new BadRequestException('Cannot record payment on a cancelled invoice');
      }
      const paidNow = fresh.payments.reduce((s, p) => s + Number(p.amount), 0);
      const notedNow = fresh.creditNotes.reduce((s, n) => s + Number(n.total), 0);
      const outstandingNow =
        Math.round((Number(fresh.total) - paidNow - notedNow) * 100) / 100;
      if (dto.amount > outstandingNow) {
        throw new BadRequestException(
          `Amount exceeds outstanding balance of ₹${outstandingNow}`,
        );
      }
      const voucher = await this.accounting.postVoucherTx(
        tx,
        companyId,
        userId,
        voucherDto,
      );
      await tx.payment.create({
        data: {
          companyId,
          invoiceId,
          voucherId: voucher.id,
          date: new Date(dto.date),
          amount: dto.amount,
          method: dto.method ?? 'CASH',
          reference: dto.reference,
        },
      });
    });

    return this.getOne(companyId, invoiceId);
  }

  // -------------------------------------------------------------

  private readonly fullInclude = {
    party: { select: { id: true, name: true, gstin: true } },
    branch: { select: { id: true, name: true } },
    lines: { orderBy: { lineNo: 'asc' as const } },
    payments: { orderBy: { date: 'asc' as const } },
    creditNotes: {
      where: { status: 'ISSUED' as const },
      select: { total: true },
    },
    eInvoice: { select: { status: true, irn: true } },
    eWayBill: { select: { status: true, ewbNo: true } },
  };

  /** Find-or-create the "Loyalty Discount" expense ledger (for redemptions). */
  private async loyaltyDiscountLedger(companyId: string): Promise<string> {
    const existing = await this.prisma.ledger.findUnique({
      where: { companyId_name: { companyId, name: 'Loyalty Discount' } },
      select: { id: true },
    });
    if (existing) return existing.id;
    const group = await this.prisma.accountGroup.findFirst({
      where: { companyId, name: 'Indirect Expenses' },
      select: { id: true },
    });
    if (!group) {
      throw new BadRequestException(
        'Account group "Indirect Expenses" is missing — re-seed the chart of accounts',
      );
    }
    const created = await this.prisma.ledger.create({
      data: { companyId, groupId: group.id, name: 'Loyalty Discount', isSystem: true },
      select: { id: true },
    });
    return created.id;
  }

  private async systemLedgers(
    companyId: string,
  ): Promise<Record<string, string>> {
    const names = [
      'Sales',
      'CGST Payable',
      'SGST Payable',
      'IGST Payable',
      'Rounding Off',
    ];
    const ledgers = await this.prisma.ledger.findMany({
      where: { companyId, name: { in: names } },
      select: { id: true, name: true },
    });
    const map = Object.fromEntries(ledgers.map((l) => [l.name, l.id]));
    for (const name of names) {
      if (!map[name]) {
        throw new BadRequestException(
          `Missing system ledger "${name}" — was this company seeded correctly?`,
        );
      }
    }
    return map;
  }

  private serialize(invoice: {
    id: string;
    invoiceNo: number;
    fiscalYear: string;
    date: Date;
    dueDate: Date | null;
    placeOfSupply: string | null;
    isInterState: boolean;
    notes: string | null;
    status: string;
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
    loyaltyDiscount: Prisma.Decimal;
    loyaltyPointsRedeemed: number;
    party: { id: string; name: string; gstin: string | null };
    branch?: { id: string; name: string } | null;
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
    payments: {
      id: string;
      date: Date;
      amount: Prisma.Decimal;
      method: string;
      reference: string | null;
    }[];
    creditNotes?: { total: Prisma.Decimal }[];
    eInvoice?: { status: string; irn: string } | null;
    eWayBill?: { status: string; ewbNo: string } | null;
  }) {
    const paidAmount =
      Math.round(
        invoice.payments.reduce((sum, p) => sum + Number(p.amount), 0) * 100,
      ) / 100;
    const notesTotal =
      Math.round(
        (invoice.creditNotes ?? []).reduce((sum, n) => sum + Number(n.total), 0) * 100,
      ) / 100;
    const total = Number(invoice.total);
    const loyaltyDiscount = Number(invoice.loyaltyDiscount);
    // Redemption settles part of the bill (seller-borne), like a payment.
    const settled = paidAmount + notesTotal + loyaltyDiscount;
    return {
      id: invoice.id,
      invoiceNo: `INV/${invoice.fiscalYear}/${String(invoice.invoiceNo).padStart(4, '0')}`,
      date: invoice.date,
      dueDate: invoice.dueDate,
      placeOfSupply: invoice.placeOfSupply,
      isInterState: invoice.isInterState,
      notes: invoice.notes,
      status: invoice.status,
      party: invoice.party,
      branch: invoice.branch ?? null,
      subtotal: Number(invoice.subtotal),
      discountTotal: Number(invoice.discountTotal),
      taxableAmount: Number(invoice.taxableAmount),
      cgstAmount: Number(invoice.cgstAmount),
      sgstAmount: Number(invoice.sgstAmount),
      igstAmount: Number(invoice.igstAmount),
      roundOff: Number(invoice.roundOff),
      freightCharges: Number(invoice.freightCharges),
      otherCharges: Number(invoice.otherCharges),
      total,
      loyaltyDiscount,
      loyaltyPointsRedeemed: invoice.loyaltyPointsRedeemed,
      paidAmount,
      creditNotesTotal: notesTotal,
      eInvoice: invoice.eInvoice
        ? { status: invoice.eInvoice.status, irn: invoice.eInvoice.irn }
        : null,
      eWayBill: invoice.eWayBill
        ? { status: invoice.eWayBill.status, ewbNo: invoice.eWayBill.ewbNo }
        : null,
      outstanding: Math.max(
        0,
        Math.round((total - settled) * 100) / 100,
      ),
      paymentStatus:
        invoice.status === 'CANCELLED'
          ? 'CANCELLED'
          : settled >= total
            ? 'PAID'
            : settled === 0
              ? 'UNPAID'
              : 'PARTIAL',
      lines: invoice.lines.map((line) => ({
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
      payments: invoice.payments.map((p) => ({
        id: p.id,
        date: p.date,
        amount: Number(p.amount),
        method: p.method,
        reference: p.reference,
      })),
    };
  }
}
