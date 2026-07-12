import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ChequeStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateChequeDto, SetChequeStatusDto } from './dto/cheque.dto';

/**
 * Cheque register — tracks cheques received/issued through their lifecycle.
 * A tracking tool only: it does NOT post accounting entries (the money
 * movement is recorded through the normal payment flow).
 */
@Injectable()
export class ChequesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    companyId: string,
    userId: string,
    dto: CreateChequeDto,
    branchScope?: string,
  ) {
    if (branchScope) dto.branchId = branchScope;
    const party = await this.resolveParty(companyId, dto);
    if (dto.branchId) {
      const branch = await this.prisma.branch.findFirst({
        where: { id: dto.branchId, companyId, isActive: true },
      });
      if (!branch) throw new BadRequestException('Unknown branch');
    }

    const cheque = await this.prisma.cheque.create({
      data: {
        companyId,
        branchId: dto.branchId ?? null,
        partyId: party?.id ?? null,
        partyName: party ? null : dto.partyName?.trim() || null,
        direction: dto.direction,
        chequeNo: dto.chequeNo.trim(),
        bankName: dto.bankName?.trim() || null,
        amount: dto.amount,
        chequeDate: new Date(dto.chequeDate),
        notes: dto.notes,
        createdById: userId,
      },
      include: this.fullInclude,
    });
    return this.serialize(cheque);
  }

  async list(companyId: string, branchScope?: string) {
    const rows = await this.prisma.cheque.findMany({
      where: { companyId, ...(branchScope && { branchId: branchScope }) },
      include: this.fullInclude,
      orderBy: [{ chequeDate: 'asc' }, { createdAt: 'desc' }],
      take: 300,
    });
    return rows.map((c) => this.serialize(c));
  }

  /** Edit a still-pending cheque. */
  async update(
    companyId: string,
    chequeId: string,
    dto: CreateChequeDto,
    branchScope?: string,
  ) {
    const existing = await this.prisma.cheque.findFirst({
      where: { id: chequeId, companyId, ...(branchScope && { branchId: branchScope }) },
    });
    if (!existing) throw new NotFoundException('Cheque not found');
    if (existing.status !== ChequeStatus.PENDING) {
      throw new BadRequestException('Only a pending cheque can be edited');
    }
    if (branchScope) dto.branchId = branchScope;
    const party = await this.resolveParty(companyId, dto);
    await this.prisma.cheque.update({
      where: { id: chequeId },
      data: {
        branchId: dto.branchId ?? null,
        partyId: party?.id ?? null,
        partyName: party ? null : dto.partyName?.trim() || null,
        direction: dto.direction,
        chequeNo: dto.chequeNo.trim(),
        bankName: dto.bankName?.trim() || null,
        amount: dto.amount,
        chequeDate: new Date(dto.chequeDate),
        notes: dto.notes,
      },
    });
    return this.getOne(companyId, chequeId, branchScope);
  }

  async setStatus(
    companyId: string,
    chequeId: string,
    dto: SetChequeStatusDto,
    branchScope?: string,
  ) {
    const cheque = await this.prisma.cheque.findFirst({
      where: { id: chequeId, companyId, ...(branchScope && { branchId: branchScope }) },
    });
    if (!cheque) throw new NotFoundException('Cheque not found');
    const status = dto.status as ChequeStatus;
    const cleared = status === ChequeStatus.CLEARED || status === ChequeStatus.BOUNCED;
    await this.prisma.cheque.update({
      where: { id: chequeId },
      data: {
        status,
        clearedDate: cleared ? new Date(dto.date ?? new Date().toISOString()) : null,
      },
    });
    return this.getOne(companyId, chequeId, branchScope);
  }

  async getOne(companyId: string, chequeId: string, branchScope?: string) {
    const cheque = await this.prisma.cheque.findFirst({
      where: { id: chequeId, companyId, ...(branchScope && { branchId: branchScope }) },
      include: this.fullInclude,
    });
    if (!cheque) throw new NotFoundException('Cheque not found');
    return this.serialize(cheque);
  }

  // -------------------------------------------------------------

  private async resolveParty(companyId: string, dto: CreateChequeDto) {
    if (dto.partyId) {
      const party = await this.prisma.party.findFirst({
        where: { id: dto.partyId, companyId, isActive: true },
        select: { id: true, name: true },
      });
      if (!party) throw new BadRequestException('Unknown party');
      return party;
    }
    if (!dto.partyName?.trim()) {
      throw new BadRequestException('Select a party or enter a name');
    }
    return null;
  }

  private readonly fullInclude = {
    party: { select: { id: true, name: true } },
    branch: { select: { id: true, name: true } },
  };

  private serialize(cheque: {
    id: string;
    direction: string;
    chequeNo: string;
    bankName: string | null;
    amount: Prisma.Decimal;
    chequeDate: Date;
    status: ChequeStatus;
    clearedDate: Date | null;
    notes: string | null;
    partyName: string | null;
    party: { id: string; name: string } | null;
    branch: { id: string; name: string } | null;
  }) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return {
      id: cheque.id,
      direction: cheque.direction,
      chequeNo: cheque.chequeNo,
      bankName: cheque.bankName,
      amount: Number(cheque.amount),
      chequeDate: cheque.chequeDate,
      status: cheque.status,
      clearedDate: cheque.clearedDate,
      notes: cheque.notes,
      party: cheque.party,
      partyName: cheque.party?.name ?? cheque.partyName ?? '—',
      branch: cheque.branch ?? null,
      isOverdue:
        cheque.status === ChequeStatus.PENDING && cheque.chequeDate < today,
    };
  }
}
