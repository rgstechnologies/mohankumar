import { BadRequestException, Injectable } from '@nestjs/common';
import { EntryType, VoucherType } from '@prisma/client';
import { AccountingService } from '../accounting/accounting.service';
import { PrismaService } from '../prisma/prisma.service';
import type { CreatePartyTransferDto } from './party-transfers.dto';

/**
 * Move an outstanding balance from one party to another via a JOURNAL voucher:
 * Dr the destination party's ledger, Cr the source party's ledger. The amount
 * shifts from "from" to "to" and shows up in both parties' statements.
 */
@Injectable()
export class PartyTransfersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accounting: AccountingService,
  ) {}

  async create(companyId: string, userId: string, dto: CreatePartyTransferDto) {
    if (dto.fromPartyId === dto.toPartyId) {
      throw new BadRequestException('Choose two different parties');
    }
    const parties = await this.prisma.party.findMany({
      where: { id: { in: [dto.fromPartyId, dto.toPartyId] }, companyId, isActive: true },
      select: { id: true, name: true, ledgerId: true },
    });
    const from = parties.find((p) => p.id === dto.fromPartyId);
    const to = parties.find((p) => p.id === dto.toPartyId);
    if (!from || !to) throw new BadRequestException('Unknown party');

    const narration = dto.notes
      ? `Balance transfer: ${from.name} → ${to.name} · ${dto.notes}`
      : `Balance transfer: ${from.name} → ${to.name}`;

    return this.accounting.createVoucher(companyId, userId, {
      type: VoucherType.JOURNAL,
      date: dto.date,
      narration,
      lines: [
        { ledgerId: to.ledgerId, type: EntryType.DEBIT, amount: dto.amount },
        { ledgerId: from.ledgerId, type: EntryType.CREDIT, amount: dto.amount },
      ],
    });
  }
}
