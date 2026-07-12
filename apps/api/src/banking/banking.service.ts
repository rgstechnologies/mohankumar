import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EntryType, VoucherStatus, VoucherType } from '@prisma/client';
import { AccountingService } from '../accounting/accounting.service';
import { displayVoucherNo } from '../accounting/fiscal-year.util';
import { PrismaService } from '../prisma/prisma.service';
import { parseStatementCsv } from './statement-parser';

const DAY = 24 * 3600 * 1000;
/** Auto-match window: a book entry within ±5 days of the statement date. */
const MATCH_WINDOW_DAYS = 5;

@Injectable()
export class BankingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accounting: AccountingService,
  ) {}

  /** Bank ledgers available for reconciliation. */
  async bankLedgers(companyId: string) {
    return this.prisma.ledger.findMany({
      where: {
        companyId,
        isActive: true,
        group: { name: { in: ['Bank Accounts', 'Cash-in-Hand'] } },
      },
      select: { id: true, name: true, group: { select: { name: true } } },
      orderBy: { name: 'asc' },
    });
  }

  /** Imports a statement CSV and auto-matches lines against the books. */
  async importStatement(
    companyId: string,
    ledgerId: string,
    fileName: string,
    csv: string,
  ) {
    const ledger = await this.prisma.ledger.findFirst({
      where: { id: ledgerId, companyId, isActive: true },
    });
    if (!ledger) throw new NotFoundException('Bank ledger not found');
    if (!csv?.trim()) throw new BadRequestException('Empty file');

    const rows = parseStatementCsv(csv);

    const batch = await this.prisma.$transaction(async (tx) => {
      const created = await tx.bankImportBatch.create({
        data: {
          companyId,
          ledgerId,
          fileName: fileName || 'statement.csv',
          lineCount: rows.length,
        },
      });
      await tx.bankStatementLine.createMany({
        data: rows.map((row) => ({
          batchId: created.id,
          companyId,
          ledgerId,
          date: new Date(row.date),
          description: row.description.slice(0, 300),
          amount: row.amount,
          // Money INTO the bank account = book DEBIT on the bank ledger.
          type: row.direction === 'IN' ? EntryType.DEBIT : EntryType.CREDIT,
        })),
      });
      return created;
    });

    const matched = await this.autoMatch(companyId, ledgerId);
    return { batchId: batch.id, imported: rows.length, autoMatched: matched };
  }

  /**
   * Matches unmatched statement lines to unmatched book entries with the
   * same amount + direction within the date window (closest date wins).
   */
  private async autoMatch(companyId: string, ledgerId: string): Promise<number> {
    const [unmatchedStatement, candidates] = await Promise.all([
      this.prisma.bankStatementLine.findMany({
        where: { companyId, ledgerId, matchedVoucherLineId: null },
        orderBy: { date: 'asc' },
      }),
      this.prisma.voucherLine.findMany({
        where: {
          ledgerId,
          bankMatch: null,
          voucher: { status: VoucherStatus.ACTIVE },
        },
        include: { voucher: { select: { date: true } } },
      }),
    ]);

    const available = new Set(candidates.map((c) => c.id));
    let matchedCount = 0;

    for (const line of unmatchedStatement) {
      const lineTime = line.date.getTime();
      let best: { id: string; distance: number } | null = null;

      for (const candidate of candidates) {
        if (!available.has(candidate.id)) continue;
        if (candidate.type !== line.type) continue;
        if (Number(candidate.amount) !== Number(line.amount)) continue;
        const distance = Math.abs(candidate.voucher.date.getTime() - lineTime);
        if (distance > MATCH_WINDOW_DAYS * DAY) continue;
        if (!best || distance < best.distance) {
          best = { id: candidate.id, distance };
        }
      }

      if (best) {
        await this.prisma.bankStatementLine.update({
          where: { id: line.id },
          data: { matchedVoucherLineId: best.id },
        });
        available.delete(best.id);
        matchedCount++;
      }
    }
    return matchedCount;
  }

  /** Full reconciliation view for a bank ledger. */
  async reconciliation(companyId: string, ledgerId: string) {
    const ledger = await this.prisma.ledger.findFirst({
      where: { id: ledgerId, companyId },
      select: { id: true, name: true, openingBalance: true, openingType: true },
    });
    if (!ledger) throw new NotFoundException('Bank ledger not found');

    const [statementLines, bookLines, batches] = await Promise.all([
      this.prisma.bankStatementLine.findMany({
        where: { companyId, ledgerId },
        include: {
          matchedLine: {
            include: {
              voucher: {
                select: { type: true, voucherNo: true, fiscalYear: true, narration: true },
              },
            },
          },
        },
        orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
        take: 300,
      }),
      this.prisma.voucherLine.findMany({
        where: {
          ledgerId,
          bankMatch: null,
          voucher: { status: VoucherStatus.ACTIVE },
        },
        include: {
          voucher: {
            select: {
              type: true,
              voucherNo: true,
              fiscalYear: true,
              date: true,
              narration: true,
            },
          },
        },
        orderBy: { voucher: { date: 'desc' } },
        take: 100,
      }),
      this.prisma.bankImportBatch.findMany({
        where: { companyId, ledgerId },
        orderBy: { importedAt: 'desc' },
        take: 10,
      }),
    ]);

    // Book balance (opening + active movement)
    const sums = await this.prisma.voucherLine.groupBy({
      by: ['type'],
      where: { ledgerId, voucher: { status: VoucherStatus.ACTIVE } },
      _sum: { amount: true },
    });
    let net =
      Number(ledger.openingBalance) *
      (ledger.openingType === EntryType.DEBIT ? 1 : -1);
    for (const row of sums) {
      const amount = Number(row._sum.amount ?? 0);
      net += row.type === EntryType.DEBIT ? amount : -amount;
    }

    const matchedCount = statementLines.filter((l) => l.matchedVoucherLineId).length;

    return {
      ledger: { id: ledger.id, name: ledger.name },
      bookBalance: Math.abs(Math.round(net * 100) / 100),
      bookBalanceType: net >= 0 ? 'DEBIT' : 'CREDIT',
      summary: {
        statementLines: statementLines.length,
        matched: matchedCount,
        unmatchedStatement: statementLines.length - matchedCount,
        unmatchedBook: bookLines.length,
      },
      batches: batches.map((b) => ({
        id: b.id,
        fileName: b.fileName,
        lineCount: b.lineCount,
        importedAt: b.importedAt,
      })),
      statementLines: statementLines.map((line) => ({
        id: line.id,
        date: line.date,
        description: line.description,
        amount: Number(line.amount),
        direction: line.type === EntryType.DEBIT ? 'IN' : 'OUT',
        matched: line.matchedLine
          ? {
              voucherLineId: line.matchedLine.id,
              voucherNo: displayVoucherNo(
                line.matchedLine.voucher.type,
                line.matchedLine.voucher.fiscalYear,
                line.matchedLine.voucher.voucherNo,
              ),
              narration: line.matchedLine.voucher.narration,
            }
          : null,
      })),
      unmatchedBookLines: bookLines.map((line) => ({
        voucherLineId: line.id,
        date: line.voucher.date,
        voucherNo: displayVoucherNo(
          line.voucher.type,
          line.voucher.fiscalYear,
          line.voucher.voucherNo,
        ),
        narration: line.voucher.narration,
        type: line.type,
        amount: Number(line.amount),
      })),
    };
  }

  /** Manually link a statement line to a book entry. */
  async match(companyId: string, statementLineId: string, voucherLineId: string) {
    const [line, voucherLine] = await Promise.all([
      this.prisma.bankStatementLine.findFirst({
        where: { id: statementLineId, companyId },
      }),
      this.prisma.voucherLine.findFirst({
        where: {
          id: voucherLineId,
          ledger: { companyId },
          voucher: { status: VoucherStatus.ACTIVE },
        },
        include: { bankMatch: true },
      }),
    ]);
    if (!line) throw new NotFoundException('Statement line not found');
    if (!voucherLine) throw new NotFoundException('Book entry not found');
    if (voucherLine.ledgerId !== line.ledgerId) {
      throw new BadRequestException('Entry belongs to a different ledger');
    }
    if (voucherLine.bankMatch) {
      throw new BadRequestException('This book entry is already matched');
    }
    if (voucherLine.type !== line.type) {
      throw new BadRequestException(
        'Direction mismatch — a deposit must match a debit entry, a withdrawal a credit entry',
      );
    }

    return this.prisma.bankStatementLine.update({
      where: { id: line.id },
      data: { matchedVoucherLineId: voucherLineId },
    });
  }

  /**
   * Books a voucher for a statement line that has no book entry yet (bank
   * charges, interest, unrecorded receipts/payments) and matches it in one
   * action. Direction decides the voucher: money in → RECEIPT, out → PAYMENT.
   */
  async createVoucherFromLine(
    companyId: string,
    userId: string,
    statementLineId: string,
    counterLedgerId: string,
    narration?: string,
  ) {
    const line = await this.prisma.bankStatementLine.findFirst({
      where: { id: statementLineId, companyId },
    });
    if (!line) throw new NotFoundException('Statement line not found');
    if (line.matchedVoucherLineId) {
      throw new BadRequestException('This statement line is already matched');
    }
    if (counterLedgerId === line.ledgerId) {
      throw new BadRequestException(
        'Pick a counter ledger other than the bank ledger itself',
      );
    }

    const moneyIn = line.type === EntryType.DEBIT;
    const voucher = await this.accounting.createVoucher(companyId, userId, {
      type: moneyIn ? VoucherType.RECEIPT : VoucherType.PAYMENT,
      date: line.date.toISOString().slice(0, 10),
      narration: (narration?.trim() || line.description).slice(0, 1000),
      lines: [
        {
          ledgerId: line.ledgerId,
          type: line.type,
          amount: Number(line.amount),
        },
        {
          ledgerId: counterLedgerId,
          type: moneyIn ? EntryType.CREDIT : EntryType.DEBIT,
          amount: Number(line.amount),
        },
      ],
    });

    // The serialized voucher hides line ids — fetch the bank-side line to link.
    const bankLine = await this.prisma.voucherLine.findFirst({
      where: { voucherId: voucher.id, ledgerId: line.ledgerId },
      select: { id: true },
    });
    if (bankLine) {
      await this.prisma.bankStatementLine.update({
        where: { id: line.id },
        data: { matchedVoucherLineId: bankLine.id },
      });
    }
    return voucher;
  }

  async unmatch(companyId: string, statementLineId: string) {
    const line = await this.prisma.bankStatementLine.findFirst({
      where: { id: statementLineId, companyId },
    });
    if (!line) throw new NotFoundException('Statement line not found');
    return this.prisma.bankStatementLine.update({
      where: { id: line.id },
      data: { matchedVoucherLineId: null },
    });
  }
}
