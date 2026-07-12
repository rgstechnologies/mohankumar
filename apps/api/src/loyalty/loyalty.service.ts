import { BadRequestException, Injectable } from '@nestjs/common';
import { PartyType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { AdjustLoyaltyDto } from './loyalty.dto';

@Injectable()
export class LoyaltyService {
  constructor(private readonly prisma: PrismaService) {}

  /** Customers with their current points balance. */
  async customers(companyId: string) {
    const rows = await this.prisma.party.findMany({
      where: { companyId, type: PartyType.CUSTOMER, isActive: true },
      select: { id: true, name: true, phone: true, loyaltyPoints: true },
      orderBy: [{ loyaltyPoints: 'desc' }, { name: 'asc' }],
    });
    return rows;
  }

  async history(companyId: string, partyId: string) {
    const rows = await this.prisma.loyaltyTxn.findMany({
      where: { companyId, partyId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return rows.map((r) => ({
      id: r.id,
      type: r.type,
      points: r.points,
      balanceAfter: r.balanceAfter,
      reference: r.reference,
      note: r.note,
      date: r.createdAt,
    }));
  }

  /**
   * Manual points change. `points` is signed: negative redeems, positive gifts.
   * Balance can never go below zero.
   */
  async adjust(companyId: string, userId: string, dto: AdjustLoyaltyDto) {
    if (dto.points === 0) throw new BadRequestException('Enter a non-zero number of points');
    const party = await this.prisma.party.findFirst({
      where: { id: dto.partyId, companyId, type: PartyType.CUSTOMER, isActive: true },
      select: { id: true },
    });
    if (!party) throw new BadRequestException('Unknown customer');

    return this.prisma.$transaction(async (tx) => {
      // Lock the party row so concurrent adjustments serialize — a read-modify-
      // write on the balance must not lost-update or drive the balance negative.
      await tx.$queryRaw`SELECT id FROM parties WHERE id = ${party.id} FOR UPDATE`;
      const fresh = await tx.party.findUniqueOrThrow({
        where: { id: party.id },
        select: { loyaltyPoints: true },
      });
      const balanceAfter = fresh.loyaltyPoints + dto.points;
      if (balanceAfter < 0) {
        throw new BadRequestException(
          `Not enough points — balance is ${fresh.loyaltyPoints}`,
        );
      }
      await tx.party.update({
        where: { id: party.id },
        data: { loyaltyPoints: balanceAfter },
      });
      await tx.loyaltyTxn.create({
        data: {
          companyId,
          partyId: party.id,
          type: dto.points < 0 ? 'REDEEM' : 'ADJUST',
          points: dto.points,
          balanceAfter,
          note: dto.note,
          createdById: userId,
        },
      });
      return { partyId: party.id, balance: balanceAfter };
    });
  }
}
