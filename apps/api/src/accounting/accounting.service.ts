import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  EntryType,
  Prisma,
  VoucherStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  DEFAULT_ACCOUNT_GROUPS,
  DEFAULT_LEDGERS,
  type SeedGroup,
} from './chart-of-accounts.seed';
import type { CreateLedgerDto, CreateVoucherDto } from './dto/accounting.dto';
import { displayVoucherNo, fiscalYearOf } from './fiscal-year.util';

/** Convert rupees to integer paise for exact balance comparison. */
const toPaise = (amount: number): number => Math.round(amount * 100);

@Injectable()
export class AccountingService {
  constructor(private readonly prisma: PrismaService) {}

  // -------------------------------------------------------------
  // Chart of accounts
  // -------------------------------------------------------------

  /** Seeds the default group tree + system ledgers for a new company. */
  async seedDefaults(
    tx: Prisma.TransactionClient,
    companyId: string,
  ): Promise<void> {
    const groupIdByName = new Map<string, string>();

    const createTree = async (groups: SeedGroup[], parentId?: string) => {
      for (const group of groups) {
        const created = await tx.accountGroup.create({
          data: {
            companyId,
            name: group.name,
            nature: group.nature,
            parentId,
            isSystem: true,
          },
        });
        groupIdByName.set(group.name, created.id);
        if (group.children) await createTree(group.children, created.id);
      }
    };
    await createTree(DEFAULT_ACCOUNT_GROUPS);

    await tx.ledger.createMany({
      data: DEFAULT_LEDGERS.map((l) => ({
        companyId,
        name: l.name,
        groupId: groupIdByName.get(l.group)!,
        isSystem: true,
      })),
    });
  }

  async listGroups(companyId: string) {
    const groups = await this.prisma.accountGroup.findMany({
      where: { companyId },
      orderBy: [{ nature: 'asc' }, { name: 'asc' }],
    });

    // Assemble the tree in memory (the per-company set is small).
    type Node = (typeof groups)[number] & { children: Node[] };
    const nodes = new Map<string, Node>(
      groups.map((g) => [g.id, { ...g, children: [] }]),
    );
    const roots: Node[] = [];
    for (const node of nodes.values()) {
      if (node.parentId && nodes.has(node.parentId)) {
        nodes.get(node.parentId)!.children.push(node);
      } else {
        roots.push(node);
      }
    }
    return roots;
  }

  // -------------------------------------------------------------
  // Ledgers
  // -------------------------------------------------------------

  async createLedger(companyId: string, dto: CreateLedgerDto) {
    const group = await this.prisma.accountGroup.findFirst({
      where: { id: dto.groupId, companyId },
    });
    if (!group) throw new BadRequestException('Unknown account group');

    const existing = await this.prisma.ledger.findUnique({
      where: { companyId_name: { companyId, name: dto.name.trim() } },
    });
    if (existing) {
      throw new BadRequestException('A ledger with this name already exists');
    }

    return this.prisma.ledger.create({
      data: {
        companyId,
        groupId: dto.groupId,
        name: dto.name.trim(),
        openingBalance: dto.openingBalance ?? 0,
        openingType: dto.openingType ?? EntryType.DEBIT,
        description: dto.description,
      },
      include: { group: { select: { name: true, nature: true } } },
    });
  }

  /** Ledgers with computed current balances (opening + posted lines). */
  async listLedgers(companyId: string) {
    const ledgers = await this.prisma.ledger.findMany({
      where: { companyId, isActive: true },
      include: { group: { select: { name: true, nature: true } } },
      orderBy: { name: 'asc' },
    });

    const sums = await this.prisma.voucherLine.groupBy({
      by: ['ledgerId', 'type'],
      where: {
        ledger: { companyId },
        voucher: { status: VoucherStatus.ACTIVE },
      },
      _sum: { amount: true },
    });
    const totals = new Map<string, { debit: number; credit: number }>();
    for (const row of sums) {
      const entry = totals.get(row.ledgerId) ?? { debit: 0, credit: 0 };
      const amount = Number(row._sum.amount ?? 0);
      if (row.type === EntryType.DEBIT) entry.debit += amount;
      else entry.credit += amount;
      totals.set(row.ledgerId, entry);
    }

    return ledgers.map((ledger) => {
      const t = totals.get(ledger.id) ?? { debit: 0, credit: 0 };
      const opening =
        Number(ledger.openingBalance) *
        (ledger.openingType === EntryType.DEBIT ? 1 : -1);
      // Positive = debit balance, negative = credit balance.
      const net = opening + t.debit - t.credit;
      return {
        ...ledger,
        openingBalance: Number(ledger.openingBalance),
        balance: Math.abs(net),
        balanceType: net >= 0 ? EntryType.DEBIT : EntryType.CREDIT,
      };
    });
  }

  /** Ledger statement: entries in a period with running balance. */
  async ledgerStatement(
    companyId: string,
    ledgerId: string,
    from?: string,
    to?: string,
  ) {
    const ledger = await this.prisma.ledger.findFirst({
      where: { id: ledgerId, companyId },
      include: { group: { select: { name: true, nature: true } } },
    });
    if (!ledger) throw new NotFoundException('Ledger not found');

    const fromDate = from ? new Date(from) : undefined;
    const toDate = to ? new Date(to) : undefined;

    // Opening for the period = ledger opening + all activity before `from`.
    let openingPaise =
      toPaise(Number(ledger.openingBalance)) *
      (ledger.openingType === EntryType.DEBIT ? 1 : -1);

    if (fromDate) {
      const before = await this.prisma.voucherLine.groupBy({
        by: ['type'],
        where: {
          ledgerId,
          voucher: { status: VoucherStatus.ACTIVE, date: { lt: fromDate } },
        },
        _sum: { amount: true },
      });
      for (const row of before) {
        const paise = toPaise(Number(row._sum.amount ?? 0));
        openingPaise += row.type === EntryType.DEBIT ? paise : -paise;
      }
    }

    const lines = await this.prisma.voucherLine.findMany({
      where: {
        ledgerId,
        voucher: {
          status: VoucherStatus.ACTIVE,
          ...(fromDate || toDate
            ? { date: { ...(fromDate && { gte: fromDate }), ...(toDate && { lte: toDate }) } }
            : {}),
        },
      },
      include: {
        voucher: {
          select: {
            id: true,
            type: true,
            voucherNo: true,
            fiscalYear: true,
            date: true,
            narration: true,
          },
        },
      },
      orderBy: [{ voucher: { date: 'asc' } }, { voucher: { createdAt: 'asc' } }],
    });

    let runningPaise = openingPaise;
    const entries = lines.map((line) => {
      const paise = toPaise(Number(line.amount));
      runningPaise += line.type === EntryType.DEBIT ? paise : -paise;
      return {
        voucherId: line.voucher.id,
        voucherNo: displayVoucherNo(
          line.voucher.type,
          line.voucher.fiscalYear,
          line.voucher.voucherNo,
        ),
        date: line.voucher.date,
        narration: line.voucher.narration,
        type: line.type,
        amount: Number(line.amount),
        runningBalance: Math.abs(runningPaise) / 100,
        runningBalanceType:
          runningPaise >= 0 ? EntryType.DEBIT : EntryType.CREDIT,
      };
    });

    return {
      ledger: { id: ledger.id, name: ledger.name, group: ledger.group },
      openingBalance: Math.abs(openingPaise) / 100,
      openingType: openingPaise >= 0 ? EntryType.DEBIT : EntryType.CREDIT,
      entries,
      closingBalance: Math.abs(runningPaise) / 100,
      closingType: runningPaise >= 0 ? EntryType.DEBIT : EntryType.CREDIT,
    };
  }

  // -------------------------------------------------------------
  // Vouchers — the double-entry engine
  // -------------------------------------------------------------

  async createVoucher(companyId: string, userId: string, dto: CreateVoucherDto) {
    await this.validateVoucherInput(companyId, dto);
    const voucher = await this.prisma.$transaction(async (tx) =>
      this.postVoucherTx(tx, companyId, userId, dto),
    );
    return this.serializeVoucher(voucher);
  }

  /** Validates balance + ledger ownership. Throws BadRequest on violation. */
  async validateVoucherInput(
    companyId: string,
    dto: CreateVoucherDto,
  ): Promise<void> {
    // Debits must equal credits — compared in integer paise, never floats.
    let debitPaise = 0;
    let creditPaise = 0;
    for (const line of dto.lines) {
      if (line.type === EntryType.DEBIT) debitPaise += toPaise(line.amount);
      else creditPaise += toPaise(line.amount);
    }
    if (debitPaise === 0 || creditPaise === 0) {
      throw new BadRequestException(
        'A voucher needs at least one debit and one credit line',
      );
    }
    if (debitPaise !== creditPaise) {
      throw new BadRequestException(
        `Voucher is not balanced: debits ₹${debitPaise / 100} ≠ credits ₹${creditPaise / 100}`,
      );
    }

    const ledgerIds = [...new Set(dto.lines.map((l) => l.ledgerId))];
    const count = await this.prisma.ledger.count({
      where: { id: { in: ledgerIds }, companyId, isActive: true },
    });
    if (count !== ledgerIds.length) {
      throw new BadRequestException('One or more ledgers are invalid');
    }
  }

  /**
   * Posts a voucher inside an existing transaction — lets callers (invoices,
   * payments) keep their own writes and the voucher atomic. Call
   * validateVoucherInput() BEFORE opening the transaction.
   */
  async postVoucherTx(
    tx: Prisma.TransactionClient,
    companyId: string,
    userId: string,
    dto: CreateVoucherDto,
  ) {
    const company = await tx.company.findUniqueOrThrow({
      where: { id: companyId },
      select: { fyStartMonth: true },
    });
    const date = new Date(dto.date);
    const fiscalYear = fiscalYearOf(date, company.fyStartMonth);

    // Counter stores the NEXT number to hand out; the row returned after
    // upsert always has nextNo = assigned number + 1.
    const counter = await tx.voucherCounter.upsert({
      where: {
        companyId_type_fiscalYear: { companyId, type: dto.type, fiscalYear },
      },
      create: { companyId, type: dto.type, fiscalYear, nextNo: 2 },
      update: { nextNo: { increment: 1 } },
    });
    const voucherNo = counter.nextNo - 1;

    return tx.voucher.create({
      data: {
        companyId,
        type: dto.type,
        voucherNo,
        fiscalYear,
        date,
        narration: dto.narration,
        createdById: userId,
        lines: {
          create: dto.lines.map((line, index) => ({
            ledgerId: line.ledgerId,
            lineNo: index + 1,
            type: line.type,
            amount: line.amount,
          })),
        },
      },
      include: { lines: { include: { ledger: { select: { name: true } } } } },
    });
  }

  async listVouchers(
    companyId: string,
    filters: { type?: string; from?: string; to?: string },
  ) {
    const vouchers = await this.prisma.voucher.findMany({
      where: {
        companyId,
        ...(filters.type && { type: filters.type as never }),
        ...(filters.from || filters.to
          ? {
              date: {
                ...(filters.from && { gte: new Date(filters.from) }),
                ...(filters.to && { lte: new Date(filters.to) }),
              },
            }
          : {}),
      },
      include: { lines: { include: { ledger: { select: { name: true } } } } },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      take: 200,
    });
    return vouchers.map((v) => this.serializeVoucher(v));
  }

  async getVoucher(companyId: string, voucherId: string) {
    const voucher = await this.prisma.voucher.findFirst({
      where: { id: voucherId, companyId },
      include: { lines: { include: { ledger: { select: { name: true } } } } },
    });
    if (!voucher) throw new NotFoundException('Voucher not found');
    return this.serializeVoucher(voucher);
  }

  /** Vouchers are never deleted — cancellation keeps the audit trail. */
  async cancelVoucher(companyId: string, voucherId: string) {
    const voucher = await this.prisma.voucher.findFirst({
      where: { id: voucherId, companyId },
    });
    if (!voucher) throw new NotFoundException('Voucher not found');
    if (voucher.status === VoucherStatus.CANCELLED) {
      throw new BadRequestException('Voucher is already cancelled');
    }
    const updated = await this.prisma.voucher.update({
      where: { id: voucherId },
      data: { status: VoucherStatus.CANCELLED },
      include: { lines: { include: { ledger: { select: { name: true } } } } },
    });
    return this.serializeVoucher(updated);
  }

  private serializeVoucher(voucher: {
    id: string;
    type: string;
    voucherNo: number;
    fiscalYear: string;
    date: Date;
    narration: string | null;
    status: string;
    createdAt: Date;
    lines: {
      lineNo: number;
      type: string;
      amount: Prisma.Decimal;
      ledgerId: string;
      ledger: { name: string };
    }[];
  }) {
    return {
      id: voucher.id,
      type: voucher.type,
      voucherNo: displayVoucherNo(
        voucher.type,
        voucher.fiscalYear,
        voucher.voucherNo,
      ),
      fiscalYear: voucher.fiscalYear,
      date: voucher.date,
      narration: voucher.narration,
      status: voucher.status,
      createdAt: voucher.createdAt,
      lines: voucher.lines
        .sort((a, b) => a.lineNo - b.lineNo)
        .map((line) => ({
          lineNo: line.lineNo,
          ledgerId: line.ledgerId,
          ledgerName: line.ledger.name,
          type: line.type,
          amount: Number(line.amount),
        })),
      totalAmount: voucher.lines
        .filter((l) => l.type === 'DEBIT')
        .reduce((sum, l) => sum + Number(l.amount), 0),
    };
  }
}
