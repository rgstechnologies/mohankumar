import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InvoiceStatus, NoteType } from '@prisma/client';
import { fiscalYearOf } from '../accounting/fiscal-year.util';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateStockTransferDto } from './dto/stock-transfer.dto';

const q3 = (n: number) => Math.round(n * 1000) / 1000;

/** Location key: a branch id, or '' for the Head Office / unassigned pool. */
const loc = (branchId: string | null | undefined): string => branchId ?? '';

export const transferDisplayNo = (fiscalYear: string, no: number): string =>
  `TRF/${fiscalYear}/${String(no).padStart(4, '0')}`;

interface LocQty {
  /** itemId → location → qty */
  items: Map<string, Map<string, number>>;
  /** batchId → location → qty */
  batches: Map<string, Map<string, number>>;
}

/**
 * Inter-branch stock transfers + per-branch stock arithmetic.
 *
 * Stock at a location = opening (Head Office only)
 *   + purchases booked to it − sales billed from it
 *   + sales returns (CN, via the invoice's branch)
 *   − purchase returns (DN, via the bill's branch)
 *   + transfers in − transfers out,
 * over ISSUED documents only. Documents without a branch belong to the
 * Head Office pool ('' key), so company totals always reconcile.
 */
@Injectable()
export class StockTransfersService {
  constructor(private readonly prisma: PrismaService) {}

  // -------------------------------------------------------------
  // Per-location quantities
  // -------------------------------------------------------------

  private async locationQuantities(
    companyId: string,
    itemIds?: string[],
  ): Promise<LocQty> {
    const itemFilter = itemIds ? { in: itemIds } : { not: null };

    const [purchased, sold, noteLines, transferLines, items] = await Promise.all([
      this.prisma.purchaseBillLine.findMany({
        where: { itemId: itemFilter, bill: { companyId, status: InvoiceStatus.ISSUED } },
        select: {
          itemId: true,
          batchId: true,
          quantity: true,
          bill: { select: { branchId: true } },
        },
      }),
      this.prisma.invoiceLine.findMany({
        where: { itemId: itemFilter, invoice: { companyId, status: InvoiceStatus.ISSUED } },
        select: {
          itemId: true,
          batchId: true,
          quantity: true,
          invoice: { select: { branchId: true } },
        },
      }),
      this.prisma.noteLine.findMany({
        where: { itemId: itemFilter, note: { companyId, status: InvoiceStatus.ISSUED } },
        select: {
          itemId: true,
          batchId: true,
          quantity: true,
          note: {
            select: {
              type: true,
              invoice: { select: { branchId: true } },
              purchaseBill: { select: { branchId: true } },
            },
          },
        },
      }),
      this.prisma.stockTransferLine.findMany({
        where: {
          ...(itemIds && { itemId: { in: itemIds } }),
          transfer: { companyId, status: InvoiceStatus.ISSUED },
        },
        select: {
          itemId: true,
          batchId: true,
          quantity: true,
          transfer: { select: { fromBranchId: true, toBranchId: true } },
        },
      }),
      this.prisma.item.findMany({
        where: { companyId, ...(itemIds && { id: { in: itemIds } }) },
        select: { id: true, openingStock: true },
      }),
    ]);

    const result: LocQty = { items: new Map(), batches: new Map() };
    const apply = (
      itemId: string | null,
      batchId: string | null,
      location: string,
      qty: number,
    ) => {
      if (!itemId || qty === 0) return;
      const byLoc = result.items.get(itemId) ?? new Map<string, number>();
      byLoc.set(location, q3((byLoc.get(location) ?? 0) + qty));
      result.items.set(itemId, byLoc);
      if (batchId) {
        const bLoc = result.batches.get(batchId) ?? new Map<string, number>();
        bLoc.set(location, q3((bLoc.get(location) ?? 0) + qty));
        result.batches.set(batchId, bLoc);
      }
    };

    for (const item of items) apply(item.id, null, loc(null), Number(item.openingStock));
    for (const l of purchased)
      apply(l.itemId, l.batchId, loc(l.bill.branchId), Number(l.quantity));
    for (const l of sold)
      apply(l.itemId, l.batchId, loc(l.invoice.branchId), -Number(l.quantity));
    for (const l of noteLines) {
      if (l.note.type === NoteType.CREDIT_NOTE) {
        // Sales return — stock comes back to the branch that billed it.
        apply(l.itemId, l.batchId, loc(l.note.invoice?.branchId), Number(l.quantity));
      } else {
        // Purchase return — stock leaves the branch that bought it.
        apply(l.itemId, l.batchId, loc(l.note.purchaseBill?.branchId), -Number(l.quantity));
      }
    }
    for (const l of transferLines) {
      apply(l.itemId, l.batchId, loc(l.transfer.fromBranchId), -Number(l.quantity));
      apply(l.itemId, l.batchId, loc(l.transfer.toBranchId), Number(l.quantity));
    }
    return result;
  }

  /** Branch-wise stock matrix for the UI: one row per item, one column per location. */
  async stockByBranch(companyId: string) {
    const [items, branches, qty] = await Promise.all([
      this.prisma.item.findMany({
        where: { companyId, isActive: true },
        orderBy: { name: 'asc' },
        select: { id: true, name: true, unit: true, trackBatches: true },
      }),
      this.prisma.branch.findMany({
        where: { companyId },
        orderBy: { createdAt: 'asc' },
        select: { id: true, name: true, isActive: true },
      }),
      this.locationQuantities(companyId),
    ]);

    const locations = [{ id: '', name: 'Head Office', isActive: true }, ...branches];
    const rows = items.map((item) => {
      const byLoc = qty.items.get(item.id) ?? new Map<string, number>();
      const quantities = Object.fromEntries(
        locations.map((l) => [l.id, byLoc.get(l.id) ?? 0]),
      );
      return {
        itemId: item.id,
        name: item.name,
        unit: item.unit,
        trackBatches: item.trackBatches,
        quantities,
        total: q3([...byLoc.values()].reduce((s, n) => s + n, 0)),
      };
    });
    return { locations, rows };
  }

  // -------------------------------------------------------------
  // Transfers
  // -------------------------------------------------------------

  private readonly fullInclude = {
    fromBranch: { select: { id: true, name: true } },
    toBranch: { select: { id: true, name: true } },
    lines: {
      orderBy: { lineNo: 'asc' as const },
      include: {
        item: { select: { id: true, name: true, unit: true } },
        batch: { select: { batchNo: true } },
      },
    },
  };

  private serialize(transfer: {
    id: string;
    transferNo: number;
    fiscalYear: string;
    date: Date;
    narration: string | null;
    status: InvoiceStatus;
    fromBranch: { id: string; name: string } | null;
    toBranch: { id: string; name: string } | null;
    lines: {
      lineNo: number;
      quantity: unknown;
      item: { id: string; name: string; unit: string };
      batch: { batchNo: string } | null;
    }[];
  }) {
    return {
      id: transfer.id,
      transferNo: transferDisplayNo(transfer.fiscalYear, transfer.transferNo),
      date: transfer.date,
      narration: transfer.narration,
      status: transfer.status,
      fromBranch: transfer.fromBranch,
      toBranch: transfer.toBranch,
      lines: transfer.lines.map((l) => ({
        lineNo: l.lineNo,
        itemId: l.item.id,
        itemName: l.item.name,
        unit: l.item.unit,
        batchNo: l.batch?.batchNo ?? null,
        quantity: Number(l.quantity),
      })),
    };
  }

  async list(companyId: string, branchScope?: string) {
    const transfers = await this.prisma.stockTransfer.findMany({
      where: {
        companyId,
        ...(branchScope && {
          OR: [{ fromBranchId: branchScope }, { toBranchId: branchScope }],
        }),
      },
      include: this.fullInclude,
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      take: 200,
    });
    return transfers.map((t) => this.serialize(t));
  }

  async create(
    companyId: string,
    userId: string,
    dto: CreateStockTransferDto,
    branchScope?: string,
  ) {
    const fromId = dto.fromBranchId ?? null;
    const toId = dto.toBranchId ?? null;
    if (fromId === toId) {
      throw new BadRequestException('Source and destination must be different');
    }
    if (branchScope && fromId !== branchScope && toId !== branchScope) {
      throw new ForbiddenException('Transfers must involve your branch');
    }

    const branchIds = [fromId, toId].filter((id): id is string => id !== null);
    const [company, branches, items] = await Promise.all([
      this.prisma.company.findUniqueOrThrow({ where: { id: companyId } }),
      this.prisma.branch.findMany({
        where: { id: { in: branchIds }, companyId, isActive: true },
      }),
      this.prisma.item.findMany({
        where: { id: { in: dto.lines.map((l) => l.itemId) }, companyId, isActive: true },
      }),
    ]);
    if (branches.length !== branchIds.length) {
      throw new BadRequestException('Unknown or inactive branch');
    }
    const itemById = new Map(items.map((i) => [i.id, i]));

    // Resolve batches for batch-tracked items.
    const resolvedLines: { itemId: string; batchId: string | null; quantity: number }[] = [];
    for (const line of dto.lines) {
      const item = itemById.get(line.itemId);
      if (!item) throw new BadRequestException('Unknown or inactive item on a line');
      let batchId: string | null = null;
      if (item.trackBatches) {
        if (!line.batchNo?.trim()) {
          throw new BadRequestException(
            `"${item.name}" tracks batches — pick the batch to transfer`,
          );
        }
        const batch = await this.prisma.itemBatch.findUnique({
          where: { itemId_batchNo: { itemId: item.id, batchNo: line.batchNo.trim() } },
        });
        if (!batch || batch.companyId !== companyId) {
          throw new BadRequestException(
            `"${item.name}": unknown batch "${line.batchNo}"`,
          );
        }
        batchId = batch.id;
      }
      resolvedLines.push({ itemId: item.id, batchId, quantity: line.quantity });
    }

    // Availability at the source location (aggregated per item / per batch).
    const qty = await this.locationQuantities(companyId, [
      ...new Set(resolvedLines.map((l) => l.itemId)),
    ]);
    const fromKey = loc(fromId);
    const wantByItem = new Map<string, number>();
    const wantByBatch = new Map<string, number>();
    for (const l of resolvedLines) {
      wantByItem.set(l.itemId, q3((wantByItem.get(l.itemId) ?? 0) + l.quantity));
      if (l.batchId)
        wantByBatch.set(l.batchId, q3((wantByBatch.get(l.batchId) ?? 0) + l.quantity));
    }
    const sourceName =
      fromId === null ? 'Head Office' : branches.find((b) => b.id === fromId)!.name;
    for (const [itemId, want] of wantByItem) {
      const available = qty.items.get(itemId)?.get(fromKey) ?? 0;
      if (want > available) {
        throw new BadRequestException(
          `"${itemById.get(itemId)!.name}" has only ${available} in stock at ${sourceName} (requested ${want})`,
        );
      }
    }
    for (const [batchId, want] of wantByBatch) {
      const available = qty.batches.get(batchId)?.get(fromKey) ?? 0;
      if (want > available) {
        const line = resolvedLines.find((l) => l.batchId === batchId)!;
        throw new BadRequestException(
          `"${itemById.get(line.itemId)!.name}" batch has only ${available} at ${sourceName} (requested ${want})`,
        );
      }
    }

    const date = new Date(dto.date);
    const fiscalYear = fiscalYearOf(date, company.fyStartMonth);

    const created = await this.prisma.$transaction(async (tx) => {
      const counter = await tx.stockTransferCounter.upsert({
        where: { companyId_fiscalYear: { companyId, fiscalYear } },
        create: { companyId, fiscalYear, nextNo: 2 },
        update: { nextNo: { increment: 1 } },
      });
      const transferNo = counter.nextNo - 1;
      return tx.stockTransfer.create({
        data: {
          companyId,
          transferNo,
          fiscalYear,
          date,
          fromBranchId: fromId,
          toBranchId: toId,
          narration: dto.narration,
          createdById: userId,
          lines: {
            create: resolvedLines.map((l, i) => ({
              lineNo: i + 1,
              itemId: l.itemId,
              batchId: l.batchId,
              quantity: l.quantity,
            })),
          },
        },
        include: this.fullInclude,
      });
    });
    return this.serialize(created);
  }

  async cancel(companyId: string, transferId: string, branchScope?: string) {
    const transfer = await this.prisma.stockTransfer.findFirst({
      where: {
        id: transferId,
        companyId,
        ...(branchScope && {
          OR: [{ fromBranchId: branchScope }, { toBranchId: branchScope }],
        }),
      },
    });
    if (!transfer) throw new NotFoundException('Transfer not found');
    if (transfer.status === InvoiceStatus.CANCELLED) {
      throw new BadRequestException('Transfer is already cancelled');
    }
    const updated = await this.prisma.stockTransfer.update({
      where: { id: transferId },
      data: { status: InvoiceStatus.CANCELLED },
      include: this.fullInclude,
    });
    return this.serialize(updated);
  }
}
