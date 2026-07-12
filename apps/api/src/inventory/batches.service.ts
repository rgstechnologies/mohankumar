import { BadRequestException, Injectable } from '@nestjs/common';
import { InvoiceStatus, NoteType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const q3 = (n: number) => Math.round(n * 1000) / 1000;
const DAY = 24 * 3600 * 1000;

export interface BatchStock {
  id: string;
  batchNo: string;
  expiryDate: Date | null;
  qty: number;
  expired: boolean;
  expiringSoon: boolean;
}

/**
 * Batch (lot) stock arithmetic. Batch quantity =
 * purchased − sold + sales-returns (CN) − purchase-returns (DN),
 * over ISSUED documents only.
 */
@Injectable()
export class BatchesService {
  constructor(private readonly prisma: PrismaService) {}

  /** Per-batch on-hand quantities. Restrict with itemId/batchIds when known. */
  async availability(
    companyId: string,
    filter: { itemId?: string; batchIds?: string[] } = {},
  ): Promise<Map<string, number>> {
    const batchWhere: Prisma.ItemBatchWhereInput = {
      companyId,
      ...(filter.itemId && { itemId: filter.itemId }),
      ...(filter.batchIds && { id: { in: filter.batchIds } }),
    };
    const batches = await this.prisma.itemBatch.findMany({
      where: batchWhere,
      select: { id: true },
    });
    const ids = batches.map((b) => b.id);
    if (ids.length === 0) return new Map();

    const [purchased, sold, creditIn, debitOut] = await Promise.all([
      this.prisma.purchaseBillLine.groupBy({
        by: ['batchId'],
        where: {
          batchId: { in: ids },
          bill: { status: InvoiceStatus.ISSUED },
        },
        _sum: { quantity: true },
      }),
      this.prisma.invoiceLine.groupBy({
        by: ['batchId'],
        where: {
          batchId: { in: ids },
          invoice: { status: InvoiceStatus.ISSUED },
        },
        _sum: { quantity: true },
      }),
      this.prisma.noteLine.groupBy({
        by: ['batchId'],
        where: {
          batchId: { in: ids },
          note: { status: InvoiceStatus.ISSUED, type: NoteType.CREDIT_NOTE },
        },
        _sum: { quantity: true },
      }),
      this.prisma.noteLine.groupBy({
        by: ['batchId'],
        where: {
          batchId: { in: ids },
          note: { status: InvoiceStatus.ISSUED, type: NoteType.DEBIT_NOTE },
        },
        _sum: { quantity: true },
      }),
    ]);

    const result = new Map<string, number>(ids.map((id) => [id, 0]));
    const apply = (rows: { batchId: string | null; _sum: { quantity: Prisma.Decimal | null } }[], sign: 1 | -1) => {
      for (const row of rows) {
        if (!row.batchId) continue;
        result.set(
          row.batchId,
          q3((result.get(row.batchId) ?? 0) + sign * Number(row._sum.quantity ?? 0)),
        );
      }
    };
    apply(purchased, 1);
    apply(sold, -1);
    apply(creditIn, 1);
    apply(debitOut, -1);
    return result;
  }

  /** Batches of one item with stock + expiry flags (for the sales batch picker). */
  async listItemBatches(companyId: string, itemId: string): Promise<BatchStock[]> {
    const [batches, qty] = await Promise.all([
      this.prisma.itemBatch.findMany({
        where: { companyId, itemId },
        orderBy: [{ expiryDate: 'asc' }, { createdAt: 'asc' }],
      }),
      this.availability(companyId, { itemId }),
    ]);
    const now = Date.now();
    return batches.map((b) => ({
      id: b.id,
      batchNo: b.batchNo,
      expiryDate: b.expiryDate,
      qty: qty.get(b.id) ?? 0,
      expired: b.expiryDate !== null && b.expiryDate.getTime() < now,
      expiringSoon:
        b.expiryDate !== null &&
        b.expiryDate.getTime() >= now &&
        b.expiryDate.getTime() <= now + 30 * DAY,
    }));
  }

  /** Find-or-create a batch at purchase time. */
  async upsertBatch(
    companyId: string,
    itemId: string,
    batchNo: string,
    expiryDate?: string,
  ) {
    const trimmed = batchNo.trim();
    if (!trimmed) throw new BadRequestException('Batch number cannot be empty');
    return this.prisma.itemBatch.upsert({
      where: { itemId_batchNo: { itemId, batchNo: trimmed } },
      create: {
        companyId,
        itemId,
        batchNo: trimmed,
        expiryDate: expiryDate ? new Date(expiryDate) : null,
      },
      // Existing batch keeps its expiry unless this purchase supplies one.
      update: expiryDate ? { expiryDate: new Date(expiryDate) } : {},
    });
  }

  /** Resolve + validate a batch for a sales line. */
  async resolveForSale(
    companyId: string,
    itemId: string,
    itemName: string,
    batchNo: string,
    quantity: number,
    saleDate: Date,
  ) {
    const batch = await this.prisma.itemBatch.findUnique({
      where: { itemId_batchNo: { itemId, batchNo: batchNo.trim() } },
    });
    if (!batch || batch.companyId !== companyId) {
      throw new BadRequestException(
        `"${itemName}": unknown batch "${batchNo}" — batches are created when you purchase stock`,
      );
    }
    if (batch.expiryDate && batch.expiryDate.getTime() < saleDate.getTime()) {
      throw new BadRequestException(
        `"${itemName}" batch ${batch.batchNo} expired on ${batch.expiryDate.toISOString().slice(0, 10)} — it cannot be sold`,
      );
    }
    const qty = await this.availability(companyId, { batchIds: [batch.id] });
    const available = qty.get(batch.id) ?? 0;
    if (quantity > available) {
      throw new BadRequestException(
        `"${itemName}" batch ${batch.batchNo} has only ${available} in stock (requested ${quantity})`,
      );
    }
    return batch;
  }

  /** Expired / expiring-soon batches that still hold stock — for alerts. */
  async expiryAlerts(companyId: string) {
    const cutoff = new Date(Date.now() + 30 * DAY);
    const batches = await this.prisma.itemBatch.findMany({
      where: { companyId, expiryDate: { not: null, lte: cutoff } },
      include: { item: { select: { name: true, unit: true } } },
    });
    if (batches.length === 0) return [];
    const qty = await this.availability(companyId, {
      batchIds: batches.map((b) => b.id),
    });
    const now = Date.now();
    return batches
      .map((b) => ({
        batchNo: b.batchNo,
        itemName: b.item.name,
        unit: b.item.unit,
        expiryDate: b.expiryDate!,
        qty: qty.get(b.id) ?? 0,
        expired: b.expiryDate!.getTime() < now,
      }))
      .filter((b) => b.qty > 0);
  }
}
