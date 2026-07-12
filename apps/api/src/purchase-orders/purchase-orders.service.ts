import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PartyType, PoStatus, Prisma } from '@prisma/client';
import { fiscalYearOf } from '../accounting/fiscal-year.util';
import type { FullInvoice } from '../invoices/invoice-pdf.service';
import { PrismaService } from '../prisma/prisma.service';
import { PurchasesService } from '../purchases/purchases.service';
import type { CreateGrnDto, CreatePoDto } from './dto/purchase-order.dto';

const q3 = (n: number) => Math.round(n * 1000) / 1000;

@Injectable()
export class PurchaseOrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly purchases: PurchasesService,
  ) {}

  async create(
    companyId: string,
    userId: string,
    dto: CreatePoDto,
    branchScope?: string,
  ) {
    // Branch managers always order for their own branch.
    if (branchScope) dto.branchId = branchScope;
    const party = await this.prisma.party.findFirst({
      where: { id: dto.partyId, companyId, isActive: true },
    });
    if (!party) throw new BadRequestException('Unknown party');
    if (party.type !== PartyType.VENDOR) {
      throw new BadRequestException('Purchase orders can only be raised on vendors');
    }
    if (dto.branchId) {
      const branch = await this.prisma.branch.findFirst({
        where: { id: dto.branchId, companyId, isActive: true },
      });
      if (!branch) throw new BadRequestException('Unknown branch');
    }

    const itemIds = dto.lines
      .map((l) => l.itemId)
      .filter((id): id is string => Boolean(id));
    const items = await this.prisma.item.findMany({
      where: { id: { in: itemIds }, companyId, isActive: true },
    });
    const itemById = new Map(items.map((i) => [i.id, i]));

    const resolved = dto.lines.map((line, index) => {
      const item = line.itemId ? itemById.get(line.itemId) : undefined;
      if (line.itemId && !item) {
        throw new BadRequestException(`Line ${index + 1}: unknown item`);
      }
      const description = line.description?.trim() || item?.name;
      if (!description) {
        throw new BadRequestException(`Line ${index + 1}: description is required`);
      }
      const rate =
        line.rate ?? (item?.purchasePrice ? Number(item.purchasePrice) : undefined);
      if (rate === undefined) {
        throw new BadRequestException(
          `Line ${index + 1}: rate is required (item has no purchase price)`,
        );
      }
      return {
        itemId: item?.id ?? null,
        description,
        unit: item?.unit ?? 'PCS',
        quantity: line.quantity,
        rate,
      };
    });

    const company = await this.prisma.company.findUniqueOrThrow({
      where: { id: companyId },
      select: { fyStartMonth: true },
    });
    const fiscalYear = fiscalYearOf(new Date(dto.date), company.fyStartMonth);

    const po = await this.prisma.$transaction(async (tx) => {
      const counter = await tx.poCounter.upsert({
        where: { companyId_fiscalYear: { companyId, fiscalYear } },
        create: { companyId, fiscalYear, nextNo: 2 },
        update: { nextNo: { increment: 1 } },
      });
      return tx.purchaseOrder.create({
        data: {
          companyId,
          partyId: party.id,
          branchId: dto.branchId ?? null,
          poNo: counter.nextNo - 1,
          fiscalYear,
          date: new Date(dto.date),
          expectedDate: dto.expectedDate ? new Date(dto.expectedDate) : null,
          notes: dto.notes,
          createdById: userId,
          lines: {
            create: resolved.map((r, index) => ({
              itemId: r.itemId,
              lineNo: index + 1,
              description: r.description,
              unit: r.unit,
              quantity: r.quantity,
              rate: r.rate,
            })),
          },
        },
        include: this.fullInclude,
      });
    });

    return this.serialize(po);
  }

  /** Edit an open purchase order (only before any goods receipt). */
  async update(
    companyId: string,
    poId: string,
    dto: CreatePoDto,
    branchScope?: string,
  ) {
    const po = await this.prisma.purchaseOrder.findFirst({
      where: { id: poId, companyId, ...(branchScope && { branchId: branchScope }) },
      include: { grns: { select: { id: true } } },
    });
    if (!po) throw new NotFoundException('Purchase order not found');
    if (po.status !== PoStatus.OPEN || po.grns.length > 0) {
      throw new BadRequestException(
        'Only an open order with no goods receipts can be edited',
      );
    }
    if (branchScope) dto.branchId = branchScope;

    const party = await this.prisma.party.findFirst({
      where: { id: dto.partyId, companyId, isActive: true },
    });
    if (!party) throw new BadRequestException('Unknown party');
    if (party.type !== PartyType.VENDOR) {
      throw new BadRequestException('Purchase orders can only be raised on vendors');
    }
    if (dto.branchId) {
      const branch = await this.prisma.branch.findFirst({
        where: { id: dto.branchId, companyId, isActive: true },
      });
      if (!branch) throw new BadRequestException('Unknown branch');
    }

    const itemIds = dto.lines
      .map((l) => l.itemId)
      .filter((id): id is string => Boolean(id));
    const items = await this.prisma.item.findMany({
      where: { id: { in: itemIds }, companyId, isActive: true },
    });
    const itemById = new Map(items.map((i) => [i.id, i]));

    const resolved = dto.lines.map((line, index) => {
      const item = line.itemId ? itemById.get(line.itemId) : undefined;
      if (line.itemId && !item) {
        throw new BadRequestException(`Line ${index + 1}: unknown item`);
      }
      const description = line.description?.trim() || item?.name;
      if (!description) {
        throw new BadRequestException(`Line ${index + 1}: description is required`);
      }
      const rate =
        line.rate ?? (item?.purchasePrice ? Number(item.purchasePrice) : undefined);
      if (rate === undefined) {
        throw new BadRequestException(
          `Line ${index + 1}: rate is required (item has no purchase price)`,
        );
      }
      return {
        itemId: item?.id ?? null,
        description,
        unit: item?.unit ?? 'PCS',
        quantity: line.quantity,
        rate,
      };
    });

    await this.prisma.$transaction(async (tx) => {
      await tx.purchaseOrderLine.deleteMany({ where: { poId } });
      await tx.purchaseOrder.update({
        where: { id: poId },
        data: {
          partyId: party.id,
          branchId: dto.branchId ?? null,
          date: new Date(dto.date),
          expectedDate: dto.expectedDate ? new Date(dto.expectedDate) : null,
          notes: dto.notes,
          lines: {
            create: resolved.map((r, index) => ({
              itemId: r.itemId,
              lineNo: index + 1,
              description: r.description,
              unit: r.unit,
              quantity: r.quantity,
              rate: r.rate,
            })),
          },
        },
      });
    });

    return this.getOne(companyId, poId, branchScope);
  }

  async list(companyId: string, branchScope?: string) {
    const pos = await this.prisma.purchaseOrder.findMany({
      where: { companyId, ...(branchScope && { branchId: branchScope }), },
      include: this.fullInclude,
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      take: 200,
    });
    return pos.map((po) => this.serialize(po));
  }

  async getOne(companyId: string, poId: string, branchScope?: string) {
    const po = await this.prisma.purchaseOrder.findFirst({
      where: { id: poId, companyId, ...(branchScope && { branchId: branchScope }), },
      include: this.fullInclude,
    });
    if (!po) throw new NotFoundException('Purchase order not found');
    return this.serialize(po);
  }

  /**
   * Maps a purchase order to the shared invoice-PDF shape. POs carry no GST, so
   * tax fields are zeroed and the renderer skips the tax columns/summary.
   */
  async getForPdf(
    companyId: string,
    poId: string,
    branchScope?: string,
  ): Promise<FullInvoice> {
    const po = await this.prisma.purchaseOrder.findFirst({
      where: { id: poId, companyId, ...(branchScope && { branchId: branchScope }) },
      include: {
        company: true,
        party: true,
        lines: { orderBy: { lineNo: 'asc' } },
      },
    });
    if (!po) throw new NotFoundException('Purchase order not found');
    const lines = po.lines.map((l) => {
      const taxable = Number(l.quantity) * Number(l.rate);
      return {
        lineNo: l.lineNo,
        itemId: l.itemId,
        description: l.description,
        hsnCode: null,
        unit: l.unit,
        quantity: l.quantity,
        rate: l.rate,
        discountPct: new Prisma.Decimal(0),
        taxableValue: taxable,
        gstRate: 0,
        cgst: 0,
        sgst: 0,
        igst: 0,
        total: taxable,
      };
    });
    const total = lines.reduce((s, l) => s + l.total, 0);
    return {
      ...po,
      invoiceNo: po.poNo,
      dueDate: po.expectedDate,
      isInterState: false,
      taxableAmount: total,
      cgstAmount: 0,
      sgstAmount: 0,
      igstAmount: 0,
      roundOff: 0,
      total,
      lines,
      status: po.status === PoStatus.CANCELLED ? 'CANCELLED' : 'ISSUED',
    } as unknown as FullInvoice;
  }

  /** Record a goods receipt; updates received quantities + PO status. */
  async receiveGrn(
    companyId: string,
    poId: string,
    userId: string,
    dto: CreateGrnDto,
    branchScope?: string,
  ) {
    const po = await this.prisma.purchaseOrder.findFirst({
      where: { id: poId, companyId, ...(branchScope && { branchId: branchScope }), },
      include: { lines: true },
    });
    if (!po) throw new NotFoundException('Purchase order not found');
    if (po.status === PoStatus.CANCELLED || po.status === PoStatus.CLOSED) {
      throw new BadRequestException(`Cannot receive against a ${po.status} order`);
    }

    const lineById = new Map(po.lines.map((l) => [l.id, l]));
    for (const grnLine of dto.lines) {
      const poLine = lineById.get(grnLine.poLineId);
      if (!poLine) {
        throw new BadRequestException('GRN line refers to an unknown PO line');
      }
      const remaining = q3(Number(poLine.quantity) - Number(poLine.receivedQty));
      if (grnLine.quantity > remaining) {
        throw new BadRequestException(
          `"${poLine.description}": receiving ${grnLine.quantity} exceeds remaining ${remaining}`,
        );
      }
    }

    const company = await this.prisma.company.findUniqueOrThrow({
      where: { id: companyId },
      select: { fyStartMonth: true },
    });
    const fiscalYear = fiscalYearOf(new Date(dto.date), company.fyStartMonth);

    await this.prisma.$transaction(async (tx) => {
      const counter = await tx.grnCounter.upsert({
        where: { companyId_fiscalYear: { companyId, fiscalYear } },
        create: { companyId, fiscalYear, nextNo: 2 },
        update: { nextNo: { increment: 1 } },
      });
      await tx.grn.create({
        data: {
          companyId,
          poId,
          grnNo: counter.nextNo - 1,
          fiscalYear,
          date: new Date(dto.date),
          notes: dto.notes,
          createdById: userId,
          lines: {
            create: dto.lines.map((l) => ({
              poLineId: l.poLineId,
              quantity: l.quantity,
            })),
          },
        },
      });
      for (const grnLine of dto.lines) {
        await tx.purchaseOrderLine.update({
          where: { id: grnLine.poLineId },
          data: { receivedQty: { increment: grnLine.quantity } },
        });
      }

      // Recompute status from the updated lines.
      const lines = await tx.purchaseOrderLine.findMany({ where: { poId } });
      const fullyReceived = lines.every(
        (l) => Number(l.receivedQty) >= Number(l.quantity),
      );
      const anyReceived = lines.some((l) => Number(l.receivedQty) > 0);
      await tx.purchaseOrder.update({
        where: { id: poId },
        data: {
          status: fullyReceived
            ? PoStatus.RECEIVED
            : anyReceived
              ? PoStatus.PARTIAL
              : PoStatus.OPEN,
        },
      });
    });

    return this.getOne(companyId, poId);
  }

  /**
   * Books a purchase bill for the received quantities and closes the PO.
   * Financials + stock post here (not at GRN) so the books stay single-sourced.
   */
  async convertToBill(
    companyId: string,
    poId: string,
    userId: string,
    options: { date: string; supplierBillNo?: string },
  ) {
    const po = await this.prisma.purchaseOrder.findFirst({
      where: { id: poId, companyId },
      include: { lines: true, party: true },
    });
    if (!po) throw new NotFoundException('Purchase order not found');
    if (po.status !== PoStatus.PARTIAL && po.status !== PoStatus.RECEIVED) {
      throw new BadRequestException(
        'Receive goods (GRN) before converting the order to a bill',
      );
    }

    const billLines = po.lines
      .filter((l) => Number(l.receivedQty) > 0)
      .map((l) => ({
        itemId: l.itemId ?? undefined,
        description: l.description,
        quantity: Number(l.receivedQty),
        rate: Number(l.rate),
        // For free-text lines the item GST default doesn't apply: 0 unless item.
        gstRate: l.itemId ? undefined : 0,
      }));
    if (billLines.length === 0) {
      throw new BadRequestException('Nothing received yet');
    }

    const bill = await this.purchases.create(companyId, userId, {
      partyId: po.partyId,
      branchId: po.branchId ?? undefined,
      date: options.date,
      supplierBillNo: options.supplierBillNo,
      notes: `Against PO/${po.fiscalYear}/${String(po.poNo).padStart(4, '0')}`,
      lines: billLines,
    });

    await this.prisma.purchaseOrder.update({
      where: { id: poId },
      data: { status: PoStatus.CLOSED },
    });

    return bill;
  }

  async cancel(companyId: string, poId: string, branchScope?: string) {
    const po = await this.prisma.purchaseOrder.findFirst({
      where: { id: poId, companyId, ...(branchScope && { branchId: branchScope }), },
      include: { grns: { select: { id: true } } },
    });
    if (!po) throw new NotFoundException('Purchase order not found');
    if (po.status === PoStatus.CANCELLED) {
      throw new BadRequestException('Order is already cancelled');
    }
    if (po.grns.length > 0) {
      throw new BadRequestException('Cannot cancel an order with goods receipts');
    }
    await this.prisma.purchaseOrder.update({
      where: { id: poId },
      data: { status: PoStatus.CANCELLED },
    });
    return this.getOne(companyId, poId);
  }

  /**
   * Permanently delete a purchase order and its line items. Blocked when goods
   * receipts exist against it (delete/return those first), since GRNs carry
   * stock that would otherwise vanish silently.
   */
  async remove(companyId: string, poId: string) {
    const po = await this.prisma.purchaseOrder.findFirst({
      where: { id: poId, companyId },
      include: { grns: { select: { id: true } } },
    });
    if (!po) throw new NotFoundException('Purchase order not found');
    if (po.grns.length > 0) {
      throw new BadRequestException('Cannot delete an order with goods receipts');
    }
    await this.prisma.$transaction(async (tx) => {
      // Leave advance payments on-account, just unlink them from the PO (the
      // live-DB FK doesn't cascade, so a delete would otherwise fail/orphan).
      await tx.partyPayment.updateMany({
        where: { purchaseOrderId: poId },
        data: { purchaseOrderId: null },
      });
      await tx.purchaseOrderLine.deleteMany({ where: { poId } });
      await tx.purchaseOrder.delete({ where: { id: poId } });
    });
    return { deleted: true };
  }

  // -------------------------------------------------------------

  private readonly fullInclude = {
    party: { select: { id: true, name: true, gstin: true } },
    branch: { select: { id: true, name: true } },
    lines: { orderBy: { lineNo: 'asc' as const } },
    grns: {
      orderBy: { createdAt: 'asc' as const },
      include: { lines: true },
    },
  };

  private serialize(po: {
    id: string;
    poNo: number;
    fiscalYear: string;
    date: Date;
    expectedDate: Date | null;
    notes: string | null;
    status: PoStatus;
    party: { id: string; name: string; gstin: string | null };
    branch?: { id: string; name: string } | null;
    lines: {
      id: string;
      itemId: string | null;
      lineNo: number;
      description: string;
      unit: string;
      quantity: Prisma.Decimal;
      rate: Prisma.Decimal;
      receivedQty: Prisma.Decimal;
    }[];
    grns: {
      id: string;
      grnNo: number;
      fiscalYear: string;
      date: Date;
      notes: string | null;
      lines: { poLineId: string; quantity: Prisma.Decimal }[];
    }[];
  }) {
    const value = po.lines.reduce(
      (sum, l) => sum + Number(l.quantity) * Number(l.rate),
      0,
    );
    const totalQty = po.lines.reduce((s, l) => s + Number(l.quantity), 0);
    const receivedQty = po.lines.reduce((s, l) => s + Number(l.receivedQty), 0);
    return {
      id: po.id,
      poNo: `PO/${po.fiscalYear}/${String(po.poNo).padStart(4, '0')}`,
      date: po.date,
      expectedDate: po.expectedDate,
      notes: po.notes,
      status: po.status,
      party: po.party,
      branch: po.branch ?? null,
      value: Math.round(value * 100) / 100,
      receivedPct: totalQty > 0 ? Math.round((receivedQty / totalQty) * 100) : 0,
      lines: po.lines.map((l) => ({
        id: l.id,
        itemId: l.itemId,
        lineNo: l.lineNo,
        description: l.description,
        unit: l.unit,
        quantity: Number(l.quantity),
        rate: Number(l.rate),
        receivedQty: Number(l.receivedQty),
        remainingQty: q3(Number(l.quantity) - Number(l.receivedQty)),
      })),
      grns: po.grns.map((g) => ({
        id: g.id,
        grnNo: `GRN/${g.fiscalYear}/${String(g.grnNo).padStart(4, '0')}`,
        date: g.date,
        notes: g.notes,
        totalQty: g.lines.reduce((s, l) => s + Number(l.quantity), 0),
      })),
    };
  }
}
