import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  EntryType,
  OpeningDocKind,
  VoucherType,
} from '@prisma/client';
import { AccountingService } from '../accounting/accounting.service';
import { displayVoucherNo } from '../accounting/fiscal-year.util';
import { PrismaService } from '../prisma/prisma.service';

const r2 = (n: number) => Math.round(n * 100) / 100;

@Injectable()
export class OpeningDocsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accounting: AccountingService,
  ) {}

  async list(companyId: string, kind?: OpeningDocKind) {
    const docs = await this.prisma.openingDocument.findMany({
      where: { companyId, ...(kind ? { kind } : {}) },
      include: { party: { select: { id: true, name: true } } },
      orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
    });
    return docs.map((doc) => {
      const amount = Number(doc.amount);
      const settled = Number(doc.settled);
      return {
        id: doc.id,
        kind: doc.kind,
        party: doc.party,
        refNo: doc.refNo,
        date: doc.date,
        dueDate: doc.dueDate,
        amount,
        settled,
        outstanding: r2(amount - settled),
        notes: doc.notes,
      };
    });
  }

  /**
   * Records money against an opening document: a real RECEIPT (receivable)
   * or PAYMENT (payable) voucher between a cash/bank ledger and the party's
   * ledger, atomically with the settled-amount bump.
   */
  async settle(
    companyId: string,
    userId: string,
    docId: string,
    amount: number,
    ledgerId: string,
    date?: string,
  ) {
    const doc = await this.prisma.openingDocument.findFirst({
      where: { id: docId, companyId },
      include: { party: { select: { name: true, ledgerId: true } } },
    });
    if (!doc) throw new NotFoundException('Opening document not found');

    const outstanding = r2(Number(doc.amount) - Number(doc.settled));
    if (outstanding <= 0) {
      throw new BadRequestException('This document is already settled');
    }
    if (amount > outstanding + 0.005) {
      throw new BadRequestException(
        `Amount exceeds the outstanding ₹${outstanding}`,
      );
    }

    const cashBank = await this.prisma.ledger.findFirst({
      where: {
        id: ledgerId,
        companyId,
        isActive: true,
        group: { name: { in: ['Cash-in-Hand', 'Bank Accounts'] } },
      },
    });
    if (!cashBank) {
      throw new BadRequestException('Pick a cash or bank ledger');
    }

    const receivable = doc.kind === OpeningDocKind.RECEIVABLE;
    const voucherInput = {
      type: receivable ? VoucherType.RECEIPT : VoucherType.PAYMENT,
      date: date ?? new Date().toISOString().slice(0, 10),
      narration: receivable
        ? `Received against opening invoice ${doc.refNo} — ${doc.party.name}`
        : `Paid against opening bill ${doc.refNo} — ${doc.party.name}`,
      lines: [
        {
          ledgerId: receivable ? ledgerId : doc.party.ledgerId,
          type: EntryType.DEBIT,
          amount,
        },
        {
          ledgerId: receivable ? doc.party.ledgerId : ledgerId,
          type: EntryType.CREDIT,
          amount,
        },
      ],
    };
    await this.accounting.validateVoucherInput(companyId, voucherInput);

    const result = await this.prisma.$transaction(async (tx) => {
      const voucher = await this.accounting.postVoucherTx(
        tx,
        companyId,
        userId,
        voucherInput,
      );
      const updated = await tx.openingDocument.update({
        where: { id: doc.id },
        data: { settled: { increment: amount } },
      });
      return { voucher, updated };
    });

    return {
      id: doc.id,
      settled: Number(result.updated.settled),
      outstanding: r2(Number(doc.amount) - Number(result.updated.settled)),
      voucherNo: displayVoucherNo(
        result.voucher.type,
        result.voucher.fiscalYear,
        result.voucher.voucherNo,
      ),
    };
  }
}
