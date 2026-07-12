import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateBankDto, UpdateBankDto } from './dto/bank.dto';

@Injectable()
export class BanksService {
  constructor(private readonly prisma: PrismaService) {}

  async list(companyId: string) {
    const rows = await this.prisma.bankAccount.findMany({
      where: { companyId, isActive: true },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
      include: { ledger: { select: { id: true, name: true } } },
    });
    return rows.map((b) => ({
      id: b.id,
      ledgerId: b.ledgerId,
      accountName: b.accountName,
      bankName: b.bankName,
      accountNo: b.accountNo,
      ifsc: b.ifsc,
      branch: b.branch,
      upiId: b.upiId,
      isDefault: b.isDefault,
    }));
  }

  /** Creates the bank + its "Bank Accounts" ledger; first/explicit one prints. */
  async create(companyId: string, dto: CreateBankDto) {
    const group = await this.prisma.accountGroup.findUnique({
      where: { companyId_name: { companyId, name: 'Bank Accounts' } },
    });
    if (!group) {
      throw new BadRequestException('Missing system group "Bank Accounts"');
    }
    const name = dto.accountName.trim();
    const taken = await this.prisma.ledger.findUnique({
      where: { companyId_name: { companyId, name } },
    });
    if (taken) {
      throw new BadRequestException('A ledger with this name already exists');
    }
    const count = await this.prisma.bankAccount.count({
      where: { companyId, isActive: true },
    });
    const makeDefault = dto.isDefault || count === 0;

    return this.prisma.$transaction(async (tx) => {
      const ledger = await tx.ledger.create({
        data: { companyId, groupId: group.id, name, isSystem: false },
      });
      if (makeDefault) {
        await tx.bankAccount.updateMany({ where: { companyId }, data: { isDefault: false } });
      }
      const bank = await tx.bankAccount.create({
        data: {
          companyId,
          ledgerId: ledger.id,
          accountName: name,
          bankName: dto.bankName,
          accountNo: dto.accountNo,
          ifsc: dto.ifsc,
          branch: dto.branch,
          upiId: dto.upiId,
          isDefault: makeDefault,
        },
      });
      await this.syncDefault(tx, companyId);
      return bank;
    });
  }

  async update(companyId: string, bankId: string, dto: UpdateBankDto) {
    const bank = await this.prisma.bankAccount.findFirst({
      where: { id: bankId, companyId },
    });
    if (!bank) throw new NotFoundException('Bank account not found');
    await this.prisma.$transaction(async (tx) => {
      await tx.bankAccount.update({
        where: { id: bankId },
        data: {
          bankName: dto.bankName,
          accountNo: dto.accountNo,
          ifsc: dto.ifsc,
          branch: dto.branch,
          upiId: dto.upiId,
          ...(dto.isDefault ? { isDefault: true } : {}),
        },
      });
      if (dto.isDefault) {
        await tx.bankAccount.updateMany({
          where: { companyId, id: { not: bankId } },
          data: { isDefault: false },
        });
      }
      await this.syncDefault(tx, companyId);
    });
    return { ok: true };
  }

  async setDefault(companyId: string, bankId: string) {
    const bank = await this.prisma.bankAccount.findFirst({
      where: { id: bankId, companyId, isActive: true },
    });
    if (!bank) throw new NotFoundException('Bank account not found');
    await this.prisma.$transaction(async (tx) => {
      await tx.bankAccount.updateMany({ where: { companyId }, data: { isDefault: false } });
      await tx.bankAccount.update({ where: { id: bankId }, data: { isDefault: true } });
      await this.syncDefault(tx, companyId);
    });
    return { ok: true };
  }

  /** Deactivates a bank (keeps its ledger + postings); re-points the default. */
  async remove(companyId: string, bankId: string) {
    const bank = await this.prisma.bankAccount.findFirst({
      where: { id: bankId, companyId },
    });
    if (!bank) throw new NotFoundException('Bank account not found');
    await this.prisma.$transaction(async (tx) => {
      await tx.bankAccount.update({
        where: { id: bankId },
        data: { isActive: false, isDefault: false },
      });
      // Promote the oldest remaining account to default if we removed it.
      if (bank.isDefault) {
        const next = await tx.bankAccount.findFirst({
          where: { companyId, isActive: true },
          orderBy: { createdAt: 'asc' },
        });
        if (next) await tx.bankAccount.update({ where: { id: next.id }, data: { isDefault: true } });
      }
      await this.syncDefault(tx, companyId);
    });
    return { ok: true };
  }

  /** Mirrors the default bank's print details onto Company.bank* (or clears). */
  private async syncDefault(
    tx: Prisma.TransactionClient,
    companyId: string,
  ): Promise<void> {
    const d = await tx.bankAccount.findFirst({
      where: { companyId, isActive: true, isDefault: true },
    });
    await tx.company.update({
      where: { id: companyId },
      data: {
        bankName: d?.bankName ?? d?.accountName ?? null,
        bankAccountName: d?.accountName ?? null,
        bankAccountNo: d?.accountNo ?? null,
        bankIfsc: d?.ifsc ?? null,
        bankBranch: d?.branch ?? null,
      },
    });
  }
}
