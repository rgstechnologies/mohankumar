import { BadRequestException, Injectable } from '@nestjs/common';
import { AccountNature, EntryType, VoucherType } from '@prisma/client';
import { AccountingService } from '../accounting/accounting.service';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateExpenseDto, CreateOtherIncomeDto } from './dto/expense.dto';

/**
 * Friendly expense / other-income entry over the double-entry engine.
 * - Expense    → PAYMENT voucher: Dr category (EXPENSE), Cr cash/bank.
 * - OtherIncome→ RECEIPT voucher: Dr cash/bank, Cr category (INCOME).
 * Listing shows only standalone PAYMENT/RECEIPT vouchers — those NOT tied to
 * an invoice/bill/payroll payment — so the books stay single-sourced.
 */
@Injectable()
export class ExpensesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accounting: AccountingService,
  ) {}

  async createExpense(companyId: string, userId: string, dto: CreateExpenseDto) {
    const category = await this.requireLedger(companyId, dto.categoryLedgerId);
    if (category.group.nature !== AccountNature.EXPENSE) {
      throw new BadRequestException('Category must be an expense ledger');
    }
    const paidFrom = await this.requireLedger(companyId, dto.paidFromLedgerId);

    const base = dto.amount;
    const rate = dto.gstRate ?? 0;
    // Expense lines: the category (taxable) is debited; input GST debited so it's
    // claimable as ITC; cash/bank credited with the gross paid.
    const lines: { ledgerId: string; type: EntryType; amount: number }[] = [
      { ledgerId: category.id, type: EntryType.DEBIT, amount: base },
    ];
    let gross = base;
    if (rate > 0) {
      const r2 = (n: number) => Math.round(n * 100) / 100;
      const tax = r2((base * rate) / 100);
      const input = await this.inputGstLedgers(companyId);
      if (dto.isInterState) {
        lines.push({ ledgerId: input.igst, type: EntryType.DEBIT, amount: tax });
      } else {
        const cgst = r2(tax / 2);
        const sgst = r2(tax - cgst);
        lines.push({ ledgerId: input.cgst, type: EntryType.DEBIT, amount: cgst });
        lines.push({ ledgerId: input.sgst, type: EntryType.DEBIT, amount: sgst });
      }
      gross = r2(base + tax);
    }
    lines.push({ ledgerId: paidFrom.id, type: EntryType.CREDIT, amount: gross });

    const narration = await this.narration(companyId, dto.notes, dto.partyId);
    return this.accounting.createVoucher(companyId, userId, {
      type: VoucherType.PAYMENT,
      date: dto.date,
      narration,
      lines,
    });
  }

  /** Resolves the seeded input-GST ledgers used for claiming ITC. */
  private async inputGstLedgers(companyId: string) {
    const names = ['CGST Input', 'SGST Input', 'IGST Input'];
    const ledgers = await this.prisma.ledger.findMany({
      where: { companyId, name: { in: names } },
      select: { id: true, name: true },
    });
    const byName = new Map(ledgers.map((l) => [l.name, l.id]));
    const cgst = byName.get('CGST Input');
    const sgst = byName.get('SGST Input');
    const igst = byName.get('IGST Input');
    if (!cgst || !sgst || !igst) {
      throw new BadRequestException(
        'Input GST ledgers are missing — cannot claim ITC on this expense',
      );
    }
    return { cgst, sgst, igst };
  }

  async createOtherIncome(
    companyId: string,
    userId: string,
    dto: CreateOtherIncomeDto,
  ) {
    const category = await this.requireLedger(companyId, dto.categoryLedgerId);
    if (category.group.nature !== AccountNature.INCOME) {
      throw new BadRequestException('Category must be an income ledger');
    }
    const into = await this.requireLedger(companyId, dto.receivedIntoLedgerId);

    return this.accounting.createVoucher(companyId, userId, {
      type: VoucherType.RECEIPT,
      date: dto.date,
      narration: dto.notes,
      lines: [
        { ledgerId: into.id, type: EntryType.DEBIT, amount: dto.amount },
        { ledgerId: category.id, type: EntryType.CREDIT, amount: dto.amount },
      ],
    });
  }

  /** Lists standalone expenses + other-income (manual PAYMENT/RECEIPT vouchers). */
  async list(companyId: string) {
    const vouchers = await this.prisma.voucher.findMany({
      where: {
        companyId,
        // Exclude vouchers owned by another document so we only show
        // manually-entered entries.
        invoice: { is: null },
        payment: { is: null },
        purchaseBill: { is: null },
        billPayment: { is: null },
        payRun: { is: null },
        payRunPayment: { is: null },
        note: { is: null },
        // An expense PAYMENT must touch an expense ledger; other income a
        // RECEIPT touching an income ledger. This excludes party settlements
        // (debtor/creditor receipts & payments), which aren't expenses/income.
        OR: [
          {
            type: VoucherType.PAYMENT,
            lines: { some: { ledger: { group: { nature: AccountNature.EXPENSE } } } },
          },
          {
            type: VoucherType.RECEIPT,
            lines: { some: { ledger: { group: { nature: AccountNature.INCOME } } } },
          },
        ],
      },
      include: {
        lines: {
          include: {
            ledger: { include: { group: { select: { nature: true } } } },
          },
        },
      },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      take: 200,
    });

    return vouchers.map((v) => {
      const isExpense = v.type === VoucherType.PAYMENT;
      const total = v.lines
        .filter((l) => l.type === EntryType.DEBIT)
        .reduce((s, l) => s + Number(l.amount), 0);
      // Category = the EXPENSE/INCOME-nature line; account = its counterpart.
      const wantNature = isExpense ? AccountNature.EXPENSE : AccountNature.INCOME;
      const categoryLine =
        v.lines.find((l) => l.ledger.group.nature === wantNature) ??
        v.lines.find(
          (l) => l.type === (isExpense ? EntryType.DEBIT : EntryType.CREDIT),
        );
      const accountLine = v.lines.find(
        (l) => l.type === (isExpense ? EntryType.CREDIT : EntryType.DEBIT),
      );
      return {
        id: v.id,
        kind: isExpense ? ('EXPENSE' as const) : ('INCOME' as const),
        voucherNo: `${isExpense ? 'PMT' : 'RCT'}/${v.fiscalYear}/${String(v.voucherNo).padStart(4, '0')}`,
        date: v.date,
        category: categoryLine?.ledger.name ?? '—',
        account: accountLine?.ledger.name ?? '—',
        amount: Math.round(total * 100) / 100,
        narration: v.narration,
        status: v.status,
      };
    });
  }

  async cancel(companyId: string, voucherId: string) {
    return this.accounting.cancelVoucher(companyId, voucherId);
  }

  // -------------------------------------------------------------

  private async requireLedger(companyId: string, ledgerId: string) {
    const ledger = await this.prisma.ledger.findFirst({
      where: { id: ledgerId, companyId, isActive: true },
      include: { group: { select: { nature: true } } },
    });
    if (!ledger) throw new BadRequestException('Unknown ledger');
    return ledger;
  }

  private async narration(
    companyId: string,
    notes: string | undefined,
    partyId: string | undefined,
  ): Promise<string | undefined> {
    if (!partyId) return notes;
    const party = await this.prisma.party.findFirst({
      where: { id: partyId, companyId },
      select: { name: true },
    });
    if (!party) throw new BadRequestException('Unknown party');
    return notes ? `${party.name} · ${notes}` : `Paid to ${party.name}`;
  }
}
