import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  EntryType,
  InvoiceStatus,
  PartyType,
  Prisma,
  VoucherStatus,
  VoucherType,
} from '@prisma/client';
import { AccountingService } from '../accounting/accounting.service';
import type { VoucherLineDto } from '../accounting/dto/accounting.dto';
import { fiscalYearOf } from '../accounting/fiscal-year.util';
import type { RecordPaymentDto } from '../invoices/dto/invoice.dto';
import type { FullInvoice } from '../invoices/invoice-pdf.service';
import { calculateInvoice, type CalcLineInput } from '../invoices/gst-calculator';
import { BatchesService } from '../inventory/batches.service';
import { PrismaService } from '../prisma/prisma.service';
import type { CreatePurchaseBillDto } from './dto/purchase.dto';

@Injectable()
export class PurchasesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accounting: AccountingService,
    private readonly batches: BatchesService,
  ) {}

  async create(
    companyId: string,
    userId: string,
    dto: CreatePurchaseBillDto,
    branchScope?: string,
  ) {
    // Branch managers always book purchases into their own branch.
    if (branchScope) dto.branchId = branchScope;
    const [company, party] = await Promise.all([
      this.prisma.company.findUniqueOrThrow({
        where: { id: companyId },
        select: { stateCode: true, fyStartMonth: true },
      }),
      this.prisma.party.findFirst({
        where: { id: dto.partyId, companyId, isActive: true },
      }),
    ]);
    if (!party) throw new BadRequestException('Unknown party');
    if (party.type !== PartyType.VENDOR) {
      throw new BadRequestException('Purchase bills can only be booked on vendors');
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
      const rate =
        line.rate ??
        (item?.purchasePrice ? Number(item.purchasePrice) : undefined);
      if (rate === undefined) {
        throw new BadRequestException(
          `Line ${index + 1}: rate is required (item has no purchase price)`,
        );
      }
      if (item?.trackBatches && !line.batchNo?.trim()) {
        throw new BadRequestException(
          `Line ${index + 1}: "${item.name}" tracks batches — a batch number is required`,
        );
      }
      return {
        itemId: item?.id ?? null,
        trackBatches: item?.trackBatches ?? false,
        batchNo: line.batchNo,
        expiryDate: line.expiryDate,
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

    // Create/find batches for tracked items before opening the transaction.
    const batchIdByLine = new Map<number, string>();
    for (let i = 0; i < resolved.length; i++) {
      const r = resolved[i];
      if (r.itemId && r.trackBatches && r.batchNo) {
        const batch = await this.batches.upsertBatch(
          companyId,
          r.itemId,
          r.batchNo,
          r.expiryDate,
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

    // Mirror of the sales posting: expenses + input credit Dr, vendor Cr.
    const ledgers = await this.systemLedgers(companyId);
    const freightLedgerId =
      extraCharges > 0 ? await this.freightChargesLedger(companyId) : null;
    const voucherLines = this.buildPurchaseVoucherLines(
      ledgers,
      calc,
      party.ledgerId,
      freightLedgerId ? { amount: extraCharges, ledgerId: freightLedgerId } : undefined,
    );

    const voucherDto = {
      type: VoucherType.PURCHASE,
      date: dto.date,
      narration: `Purchase from ${party.name}${dto.supplierBillNo ? ` (bill ${dto.supplierBillNo})` : ''}`,
      lines: voucherLines,
    };
    await this.accounting.validateVoucherInput(companyId, voucherDto);

    const fiscalYear = fiscalYearOf(new Date(dto.date), company.fyStartMonth);

    const bill = await this.prisma.$transaction(async (tx) => {
      const voucher = await this.accounting.postVoucherTx(
        tx,
        companyId,
        userId,
        voucherDto,
      );
      const counter = await tx.purchaseBillCounter.upsert({
        where: { companyId_fiscalYear: { companyId, fiscalYear } },
        create: { companyId, fiscalYear, nextNo: 2 },
        update: { nextNo: { increment: 1 } },
      });
      return tx.purchaseBill.create({
        data: {
          companyId,
          partyId: party.id,
          branchId: dto.branchId ?? null,
          voucherId: voucher.id,
          billNo: counter.nextNo - 1,
          fiscalYear,
          supplierBillNo: dto.supplierBillNo,
          date: new Date(dto.date),
          dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
          isInterState,
          notes: dto.notes,
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
    });

    return this.serialize(bill);
  }

  /** PURCHASE voucher lines: Purchases + input GST + round-off Dr, vendor Cr. */
  private buildPurchaseVoucherLines(
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
    extra?: { amount: number; ledgerId: string },
  ): VoucherLineDto[] {
    const lines: VoucherLineDto[] = [
      { ledgerId: ledgers['Purchases'], type: EntryType.DEBIT, amount: calc.taxableAmount },
    ];
    if (extra && extra.amount > 0) {
      lines.push({ ledgerId: extra.ledgerId, type: EntryType.DEBIT, amount: extra.amount });
    }
    if (calc.cgstAmount > 0) {
      lines.push({ ledgerId: ledgers['CGST Input'], type: EntryType.DEBIT, amount: calc.cgstAmount });
      lines.push({ ledgerId: ledgers['SGST Input'], type: EntryType.DEBIT, amount: calc.sgstAmount });
    }
    if (calc.igstAmount > 0) {
      lines.push({ ledgerId: ledgers['IGST Input'], type: EntryType.DEBIT, amount: calc.igstAmount });
    }
    if (calc.roundOff > 0) {
      lines.push({ ledgerId: ledgers['Rounding Off'], type: EntryType.DEBIT, amount: calc.roundOff });
    } else if (calc.roundOff < 0) {
      lines.push({ ledgerId: ledgers['Rounding Off'], type: EntryType.CREDIT, amount: Math.abs(calc.roundOff) });
    }
    lines.push({ ledgerId: partyLedgerId, type: EntryType.CREDIT, amount: calc.total });
    return lines;
  }

  /** Find-or-create the "Freight & Other Charges" expense ledger (purchases). */
  private async freightChargesLedger(companyId: string): Promise<string> {
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
    if (!group) {
      throw new BadRequestException(
        'Account group "Indirect Expenses" is missing — re-seed the chart of accounts',
      );
    }
    const created = await this.prisma.ledger.create({
      data: { companyId, groupId: group.id, name, isSystem: true },
      select: { id: true },
    });
    return created.id;
  }

  /**
   * Edit a posted purchase bill in place — only when SAFE: no payments, no
   * debit notes, no batch-tracked lines. Re-states the PURCHASE voucher (same
   * number); stock + input GST re-derive. Anything unsafe → cancel & reissue.
   */
  async update(
    companyId: string,
    billId: string,
    dto: CreatePurchaseBillDto,
    branchScope?: string,
  ) {
    const bill = await this.prisma.purchaseBill.findFirst({
      where: { id: billId, companyId, ...(branchScope && { branchId: branchScope }) },
      include: {
        payments: { select: { id: true } },
        debitNotes: { where: { status: 'ISSUED' }, select: { id: true } },
        lines: { select: { item: { select: { trackBatches: true } } } },
      },
    });
    if (!bill) throw new NotFoundException('Purchase bill not found');
    if (bill.status === InvoiceStatus.CANCELLED) {
      throw new BadRequestException('A cancelled bill cannot be edited');
    }
    if (bill.payments.length > 0) {
      throw new BadRequestException(
        'This bill has recorded payments — cancel & reissue to change it',
      );
    }
    if (bill.debitNotes.length > 0) {
      throw new BadRequestException(
        'This bill has debit notes — cancel those, or cancel & reissue',
      );
    }
    if (bill.lines.some((l) => l.item?.trackBatches)) {
      throw new BadRequestException(
        'This bill has batch-tracked items — cancel & reissue to change it',
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
      throw new BadRequestException('Purchase bills can only be booked on vendors');
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
          `"${item.name}" tracks batches — cancel & reissue to change batch purchases`,
        );
      }
      const description = line.description?.trim() || item?.name;
      if (!description) {
        throw new BadRequestException(
          `Line ${index + 1}: description is required when no item is selected`,
        );
      }
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

    const extraCharges =
      (Number(dto.freightCharges) || 0) + (Number(dto.otherCharges) || 0);
    const calc = calculateInvoice(
      resolved.map((r) => r.calc),
      isInterState,
      extraCharges,
    );
    const ledgers = await this.systemLedgers(companyId);
    const freightLedgerId =
      extraCharges > 0 ? await this.freightChargesLedger(companyId) : null;
    const voucherLines = this.buildPurchaseVoucherLines(
      ledgers,
      calc,
      party.ledgerId,
      freightLedgerId ? { amount: extraCharges, ledgerId: freightLedgerId } : undefined,
    );
    const narration = `Purchase from ${party.name}${dto.supplierBillNo ? ` (bill ${dto.supplierBillNo})` : ''}`;
    await this.accounting.validateVoucherInput(companyId, {
      type: VoucherType.PURCHASE,
      date: dto.date,
      narration,
      lines: voucherLines,
    });

    await this.prisma.$transaction(async (tx) => {
      await tx.voucherLine.deleteMany({ where: { voucherId: bill.voucherId } });
      await tx.voucher.update({
        where: { id: bill.voucherId },
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
      await tx.purchaseBillLine.deleteMany({ where: { billId } });
      await tx.purchaseBill.update({
        where: { id: billId },
        data: {
          partyId: party.id,
          branchId: dto.branchId ?? null,
          supplierBillNo: dto.supplierBillNo,
          date: new Date(dto.date),
          dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
          isInterState,
          notes: dto.notes,
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
    return this.getOne(companyId, billId, branchScope);
  }

  async list(companyId: string, branchScope?: string, fiscalYear?: string) {
    const bills = await this.prisma.purchaseBill.findMany({
      where: {
        companyId,
        ...(branchScope && { branchId: branchScope }),
        ...(fiscalYear && { fiscalYear }),
      },
      include: this.fullInclude,
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      take: 200,
    });
    return bills.map((b) => this.serialize(b));
  }

  async getOne(companyId: string, billId: string, branchScope?: string) {
    const bill = await this.prisma.purchaseBill.findFirst({
      where: { id: billId, companyId, ...(branchScope && { branchId: branchScope }), },
      include: this.fullInclude,
    });
    if (!bill) throw new NotFoundException('Purchase bill not found');
    return this.serialize(bill);
  }

  /** Maps a purchase bill to the shared invoice-PDF shape (docKind purchaseBill). */
  async getForPdf(
    companyId: string,
    billId: string,
    branchScope?: string,
  ): Promise<FullInvoice> {
    const bill = await this.prisma.purchaseBill.findFirst({
      where: { id: billId, companyId, ...(branchScope && { branchId: branchScope }) },
      include: {
        company: true,
        party: true,
        lines: { orderBy: { lineNo: 'asc' } },
      },
    });
    if (!bill) throw new NotFoundException('Purchase bill not found');
    return {
      ...bill,
      invoiceNo: bill.billNo,
      status: bill.status === InvoiceStatus.CANCELLED ? 'CANCELLED' : 'ISSUED',
    } as unknown as FullInvoice;
  }

  async cancel(companyId: string, billId: string) {
    const bill = await this.prisma.purchaseBill.findFirst({
      where: { id: billId, companyId },
      include: {
        payments: true,
        debitNotes: { where: { status: 'ISSUED' }, select: { id: true } },
      },
    });
    if (!bill) throw new NotFoundException('Purchase bill not found');
    if (bill.status === InvoiceStatus.CANCELLED) {
      throw new BadRequestException('Bill is already cancelled');
    }
    if (bill.payments.length > 0) {
      throw new BadRequestException('Cannot cancel a bill with recorded payments');
    }
    if (bill.debitNotes.length > 0) {
      throw new BadRequestException(
        'Cannot cancel a bill with debit notes — cancel the notes first',
      );
    }
    await this.prisma.$transaction([
      this.prisma.voucher.update({
        where: { id: bill.voucherId },
        data: { status: VoucherStatus.CANCELLED },
      }),
      this.prisma.purchaseBill.update({
        where: { id: bill.id },
        data: { status: InvoiceStatus.CANCELLED },
      }),
    ]);
    return this.getOne(companyId, billId);
  }

  /**
   * Permanently delete a purchase bill and everything tied to it: line items,
   * payments and debit notes, plus every voucher it posted — unwinding the
   * ledger and derived stock. A source purchase estimate is reverted so it can
   * be re-used.
   */
  async remove(companyId: string, billId: string) {
    const bill = await this.prisma.purchaseBill.findFirst({
      where: { id: billId, companyId },
      select: {
        id: true,
        voucherId: true,
        payments: { select: { voucherId: true } },
        debitNotes: { select: { id: true, voucherId: true } },
      },
    });
    if (!bill) throw new NotFoundException('Purchase bill not found');
    const noteIds = bill.debitNotes.map((n) => n.id);
    const voucherIds = [
      bill.voucherId,
      ...bill.payments.map((p) => p.voucherId),
      ...bill.debitNotes.map((n) => n.voucherId),
    ].filter((v): v is string => !!v);

    await this.prisma.$transaction(async (tx) => {
      await tx.billPayment.deleteMany({ where: { billId } });
      if (noteIds.length) await tx.noteLine.deleteMany({ where: { noteId: { in: noteIds } } });
      await tx.note.deleteMany({ where: { purchaseBillId: billId } });
      await tx.purchaseBillLine.deleteMany({ where: { billId } });
      await tx.purchaseBill.delete({ where: { id: billId } });
      if (voucherIds.length) {
        await tx.voucherLine.deleteMany({ where: { voucherId: { in: voucherIds } } });
        await tx.voucher.deleteMany({ where: { id: { in: voucherIds }, companyId } });
      }
    });
    return { deleted: true };
  }

  /** Pay a vendor: Dr vendor ledger, Cr cash/bank — PAYMENT voucher. */
  async recordPayment(
    companyId: string,
    billId: string,
    userId: string,
    dto: RecordPaymentDto,
    branchScope?: string,
  ) {
    const bill = await this.prisma.purchaseBill.findFirst({
      where: { id: billId, companyId, ...(branchScope && { branchId: branchScope }), },
      include: {
        party: true,
        payments: true,
        debitNotes: { where: { status: 'ISSUED' }, select: { total: true } },
      },
    });
    if (!bill) throw new NotFoundException('Purchase bill not found');
    if (bill.status === InvoiceStatus.CANCELLED) {
      throw new BadRequestException('Cannot pay against a cancelled bill');
    }

    const paid = bill.payments.reduce((sum, p) => sum + Number(p.amount), 0);
    const noted = bill.debitNotes.reduce((sum, n) => sum + Number(n.total), 0);
    const outstanding =
      Math.round((Number(bill.total) - paid - noted) * 100) / 100;
    if (dto.amount > outstanding) {
      throw new BadRequestException(
        `Amount exceeds outstanding balance of ₹${outstanding}`,
      );
    }

    const voucherDto = {
      type: VoucherType.PAYMENT,
      date: dto.date,
      narration: `Payment to ${bill.party.name} against bill PB/${bill.fiscalYear}/${String(bill.billNo).padStart(4, '0')}`,
      lines: [
        {
          ledgerId: bill.party.ledgerId,
          type: EntryType.DEBIT,
          amount: dto.amount,
        },
        { ledgerId: dto.ledgerId, type: EntryType.CREDIT, amount: dto.amount },
      ],
    };
    await this.accounting.validateVoucherInput(companyId, voucherDto);

    await this.prisma.$transaction(async (tx) => {
      // Lock the bill and re-check outstanding INSIDE the txn so concurrent
      // payments can't both pass the pre-check and over-pay (TOCTOU).
      await tx.$queryRaw`SELECT id FROM purchase_bills WHERE id = ${billId} FOR UPDATE`;
      const fresh = await tx.purchaseBill.findUniqueOrThrow({
        where: { id: billId },
        select: {
          status: true,
          total: true,
          payments: { select: { amount: true } },
          debitNotes: { where: { status: 'ISSUED' }, select: { total: true } },
        },
      });
      if (fresh.status === InvoiceStatus.CANCELLED) {
        throw new BadRequestException('Cannot pay against a cancelled bill');
      }
      const paidNow = fresh.payments.reduce((s, p) => s + Number(p.amount), 0);
      const notedNow = fresh.debitNotes.reduce((s, n) => s + Number(n.total), 0);
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
      await tx.billPayment.create({
        data: {
          companyId,
          billId,
          voucherId: voucher.id,
          date: new Date(dto.date),
          amount: dto.amount,
          method: dto.method ?? 'CASH',
          reference: dto.reference,
        },
      });
    });

    return this.getOne(companyId, billId);
  }

  // -------------------------------------------------------------
  // Stock
  // -------------------------------------------------------------

  /**
   * Stock on hand per item: opening + purchased − sold (ACTIVE documents
   * only). Valuation uses the weighted-average purchase rate, falling back
   * to the item's purchase price.
   */
  async stockReport(companyId: string) {
    const [items, purchased, sold, noteMoves] = await Promise.all([
      this.prisma.item.findMany({
        where: { companyId, isActive: true },
        orderBy: { name: 'asc' },
      }),
      this.prisma.purchaseBillLine.groupBy({
        by: ['itemId'],
        where: {
          itemId: { not: null },
          bill: { companyId, status: InvoiceStatus.ISSUED },
        },
        _sum: { quantity: true, taxableValue: true },
      }),
      this.prisma.invoiceLine.groupBy({
        by: ['itemId'],
        where: {
          itemId: { not: null },
          invoice: { companyId, status: InvoiceStatus.ISSUED, isOnline: true },
        },
        _sum: { quantity: true },
      }),
      this.prisma.noteLine.groupBy({
        by: ['itemId'],
        where: {
          itemId: { not: null },
          note: { companyId, status: InvoiceStatus.ISSUED, type: 'CREDIT_NOTE' },
        },
        _sum: { quantity: true },
      }).then(async (creditIn) => ({
        creditIn,
        debitOut: await this.prisma.noteLine.groupBy({
          by: ['itemId'],
          where: {
            itemId: { not: null },
            note: { companyId, status: InvoiceStatus.ISSUED, type: 'DEBIT_NOTE' },
          },
          _sum: { quantity: true },
        }),
      })),
    ]);

    const creditInMap = new Map(
      noteMoves.creditIn.map((row) => [row.itemId as string, Number(row._sum.quantity ?? 0)]),
    );
    const debitOutMap = new Map(
      noteMoves.debitOut.map((row) => [row.itemId as string, Number(row._sum.quantity ?? 0)]),
    );

    const inByItem = new Map(
      purchased.map((row) => [
        row.itemId as string,
        {
          qty: Number(row._sum.quantity ?? 0),
          value: Number(row._sum.taxableValue ?? 0),
        },
      ]),
    );
    const outByItem = new Map(
      sold.map((row) => [row.itemId as string, Number(row._sum.quantity ?? 0)]),
    );

    // Per-batch breakdown for items that track batches.
    const trackedIds = items.filter((i) => i.trackBatches).map((i) => i.id);
    const batchesByItem = new Map<
      string,
      { batchNo: string; expiryDate: Date | null; qty: number; expired: boolean; expiringSoon: boolean }[]
    >();
    if (trackedIds.length > 0) {
      const allBatches = await this.prisma.itemBatch.findMany({
        where: { companyId, itemId: { in: trackedIds } },
        orderBy: [{ expiryDate: 'asc' }, { createdAt: 'asc' }],
      });
      const qtyByBatch = await this.batches.availability(companyId, {
        batchIds: allBatches.map((b) => b.id),
      });
      const now = Date.now();
      const DAY = 24 * 3600 * 1000;
      for (const b of allBatches) {
        const list = batchesByItem.get(b.itemId) ?? [];
        list.push({
          batchNo: b.batchNo,
          expiryDate: b.expiryDate,
          qty: qtyByBatch.get(b.id) ?? 0,
          expired: b.expiryDate !== null && b.expiryDate.getTime() < now,
          expiringSoon:
            b.expiryDate !== null &&
            b.expiryDate.getTime() >= now &&
            b.expiryDate.getTime() <= now + 30 * DAY,
        });
        batchesByItem.set(b.itemId, list);
      }
    }

    return items.map((item) => {
      const opening = Number(item.openingStock);
      const purchasedQty = inByItem.get(item.id)?.qty ?? 0;
      const soldQty = outByItem.get(item.id) ?? 0;
      // Sales returns come back into stock; purchase returns leave it.
      const returnsIn = creditInMap.get(item.id) ?? 0;
      const returnsOut = debitOutMap.get(item.id) ?? 0;
      const onHand =
        Math.round(
          (opening + purchasedQty - soldQty + returnsIn - returnsOut) * 1000,
        ) / 1000;

      const avgPurchaseRate =
        purchasedQty > 0
          ? (inByItem.get(item.id)!.value ?? 0) / purchasedQty
          : item.purchasePrice !== null
            ? Number(item.purchasePrice)
            : 0;
      const stockValue = Math.round(onHand * avgPurchaseRate * 100) / 100;

      const reorderLevel =
        item.reorderLevel === null ? null : Number(item.reorderLevel);
      return {
        itemId: item.id,
        name: item.name,
        sku: item.sku,
        unit: item.unit,
        hsnCode: item.hsnCode,
        barcode: item.barcode,
        trackBatches: item.trackBatches,
        batches: batchesByItem.get(item.id) ?? [],
        openingStock: opening,
        purchasedQty,
        soldQty,
        onHand,
        avgRate: Math.round(avgPurchaseRate * 100) / 100,
        stockValue,
        reorderLevel,
        lowStock: reorderLevel !== null && onHand <= reorderLevel,
      };
    });
  }

  // -------------------------------------------------------------

  private readonly fullInclude = {
    party: { select: { id: true, name: true, gstin: true } },
    branch: { select: { id: true, name: true } },
    lines: { orderBy: { lineNo: 'asc' as const } },
    payments: { orderBy: { date: 'asc' as const } },
    debitNotes: {
      where: { status: 'ISSUED' as const },
      select: { total: true },
    },
  };

  private async systemLedgers(
    companyId: string,
  ): Promise<Record<string, string>> {
    const names = [
      'Purchases',
      'CGST Input',
      'SGST Input',
      'IGST Input',
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

  private serialize(bill: {
    id: string;
    billNo: number;
    fiscalYear: string;
    supplierBillNo: string | null;
    date: Date;
    dueDate: Date | null;
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
    debitNotes?: { total: Prisma.Decimal }[];
  }) {
    const paidAmount =
      Math.round(
        bill.payments.reduce((sum, p) => sum + Number(p.amount), 0) * 100,
      ) / 100;
    const notesTotal =
      Math.round(
        (bill.debitNotes ?? []).reduce((sum, n) => sum + Number(n.total), 0) * 100,
      ) / 100;
    const total = Number(bill.total);
    return {
      id: bill.id,
      billNo: `PB/${bill.fiscalYear}/${String(bill.billNo).padStart(4, '0')}`,
      supplierBillNo: bill.supplierBillNo,
      date: bill.date,
      dueDate: bill.dueDate,
      isInterState: bill.isInterState,
      notes: bill.notes,
      status: bill.status,
      party: bill.party,
      branch: bill.branch ?? null,
      subtotal: Number(bill.subtotal),
      discountTotal: Number(bill.discountTotal),
      taxableAmount: Number(bill.taxableAmount),
      cgstAmount: Number(bill.cgstAmount),
      sgstAmount: Number(bill.sgstAmount),
      igstAmount: Number(bill.igstAmount),
      roundOff: Number(bill.roundOff),
      freightCharges: Number(bill.freightCharges),
      otherCharges: Number(bill.otherCharges),
      total,
      paidAmount,
      debitNotesTotal: notesTotal,
      outstanding: Math.max(
        0,
        Math.round((total - paidAmount - notesTotal) * 100) / 100,
      ),
      paymentStatus:
        bill.status === 'CANCELLED'
          ? 'CANCELLED'
          : paidAmount + notesTotal >= total
            ? 'PAID'
            : paidAmount + notesTotal === 0
              ? 'UNPAID'
              : 'PARTIAL',
      lines: bill.lines.map((line) => ({
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
      payments: bill.payments.map((p) => ({
        id: p.id,
        date: p.date,
        amount: Number(p.amount),
        method: p.method,
        reference: p.reference,
      })),
    };
  }
}
