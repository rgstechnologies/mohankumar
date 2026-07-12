import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EstimateStatus, PartyType, Prisma } from '@prisma/client';
import { fiscalYearOf } from '../accounting/fiscal-year.util';
import { InvoicesService } from '../invoices/invoices.service';
import type { FullInvoice } from '../invoices/invoice-pdf.service';
import {
  calculateInvoice,
  type CalcLineInput,
} from '../invoices/gst-calculator';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateSalesOrderDto } from './dto/sales-order.dto';

/**
 * Sales orders are confirmed customer orders (the sell-side mirror of
 * purchase orders). They post NO accounting/stock until converted to an
 * invoice (which does the SALES voucher, output GST and stock).
 */
@Injectable()
export class SalesOrdersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly invoices: InvoicesService,
  ) {}

  async create(
    companyId: string,
    userId: string,
    dto: CreateSalesOrderDto,
    branchScope?: string,
  ) {
    if (branchScope) dto.branchId = branchScope;
    const [company, party] = await Promise.all([
      this.prisma.company.findUniqueOrThrow({
        where: { id: companyId },
        select: { stateCode: true, fyStartMonth: true },
      }),
      this.prisma.party.findFirst({
        where: { id: dto.partyId, companyId, isActive: true },
      }),
    ]);
    if (!party) throw new BadRequestException('Unknown party');
    if (party.type !== PartyType.CUSTOMER) {
      throw new BadRequestException('Sales orders can only be raised on customers');
    }
    if (dto.branchId) {
      const branch = await this.prisma.branch.findFirst({
        where: { id: dto.branchId, companyId, isActive: true },
      });
      if (!branch) throw new BadRequestException('Unknown branch');
    }

    const placeOfSupply =
      dto.placeOfSupply ?? party.stateCode ?? company.stateCode ?? null;
    const isInterState =
      company.stateCode !== null &&
      placeOfSupply !== null &&
      placeOfSupply !== company.stateCode;

    const resolved = await this.resolveLines(companyId, dto.lines);
    const extraCharges =
      (Number(dto.freightCharges) || 0) + (Number(dto.otherCharges) || 0);
    const calc = calculateInvoice(
      resolved.map((r) => r.calc),
      isInterState,
      extraCharges,
    );

    const fiscalYear = fiscalYearOf(new Date(dto.date), company.fyStartMonth);

    const order = await this.prisma.$transaction(async (tx) => {
      const counter = await tx.salesOrderCounter.upsert({
        where: { companyId_fiscalYear: { companyId, fiscalYear } },
        create: { companyId, fiscalYear, nextNo: 2 },
        update: { nextNo: { increment: 1 } },
      });
      return tx.salesOrder.create({
        data: {
          companyId,
          partyId: party.id,
          branchId: dto.branchId ?? null,
          orderNo: counter.nextNo - 1,
          fiscalYear,
          date: new Date(dto.date),
          expectedDate: dto.expectedDate ? new Date(dto.expectedDate) : null,
          placeOfSupply,
          isInterState,
          notes: dto.notes,
          subtotal: calc.subtotal,
          discountTotal: calc.discountTotal,
          taxableAmount: calc.taxableAmount,
          cgstAmount: calc.cgstAmount,
          sgstAmount: calc.sgstAmount,
          igstAmount: calc.igstAmount,
          roundOff: calc.roundOff,
          freightCharges: dto.freightCharges ?? 0,
          otherCharges: dto.otherCharges ?? 0,
          total: calc.total,
          createdById: userId,
          lines: {
            create: resolved.map((r, index) => ({
              itemId: r.itemId,
              lineNo: index + 1,
              description: r.description,
              hsnCode: r.hsnCode,
              unit: r.unit,
              quantity: calc.lines[index].quantity,
              rate: calc.lines[index].rate,
              discountPct: calc.lines[index].discountPct,
              taxableValue: calc.lines[index].taxableValue,
              gstRate: calc.lines[index].gstRate,
              cgst: calc.lines[index].cgst,
              sgst: calc.lines[index].sgst,
              igst: calc.lines[index].igst,
              total: calc.lines[index].total,
            })),
          },
        },
        include: this.fullInclude,
      });
    });
    return this.serialize(order);
  }

  /** Edit an open sales order — re-resolves lines and recomputes GST. */
  async update(
    companyId: string,
    orderId: string,
    dto: CreateSalesOrderDto,
    branchScope?: string,
  ) {
    const existing = await this.prisma.salesOrder.findFirst({
      where: { id: orderId, companyId, ...(branchScope && { branchId: branchScope }) },
    });
    if (!existing) throw new NotFoundException('Sales order not found');
    if (existing.status === EstimateStatus.CONVERTED) {
      throw new BadRequestException('A converted order cannot be edited');
    }
    if (existing.status === EstimateStatus.CANCELLED) {
      throw new BadRequestException('A cancelled order cannot be edited');
    }
    if (branchScope) dto.branchId = branchScope;

    const [company, party] = await Promise.all([
      this.prisma.company.findUniqueOrThrow({
        where: { id: companyId },
        select: { stateCode: true },
      }),
      this.prisma.party.findFirst({
        where: { id: dto.partyId, companyId, isActive: true },
      }),
    ]);
    if (!party) throw new BadRequestException('Unknown party');
    if (party.type !== PartyType.CUSTOMER) {
      throw new BadRequestException('Sales orders can only be raised on customers');
    }
    if (dto.branchId) {
      const branch = await this.prisma.branch.findFirst({
        where: { id: dto.branchId, companyId, isActive: true },
      });
      if (!branch) throw new BadRequestException('Unknown branch');
    }

    const placeOfSupply =
      dto.placeOfSupply ?? party.stateCode ?? company.stateCode ?? null;
    const isInterState =
      company.stateCode !== null &&
      placeOfSupply !== null &&
      placeOfSupply !== company.stateCode;

    const resolved = await this.resolveLines(companyId, dto.lines);
    const extraCharges =
      (Number(dto.freightCharges) || 0) + (Number(dto.otherCharges) || 0);
    const calc = calculateInvoice(
      resolved.map((r) => r.calc),
      isInterState,
      extraCharges,
    );

    await this.prisma.$transaction(async (tx) => {
      await tx.salesOrderLine.deleteMany({ where: { orderId } });
      await tx.salesOrder.update({
        where: { id: orderId },
        data: {
          partyId: party.id,
          branchId: dto.branchId ?? null,
          date: new Date(dto.date),
          expectedDate: dto.expectedDate ? new Date(dto.expectedDate) : null,
          placeOfSupply,
          isInterState,
          notes: dto.notes,
          subtotal: calc.subtotal,
          discountTotal: calc.discountTotal,
          taxableAmount: calc.taxableAmount,
          cgstAmount: calc.cgstAmount,
          sgstAmount: calc.sgstAmount,
          igstAmount: calc.igstAmount,
          roundOff: calc.roundOff,
          freightCharges: dto.freightCharges ?? 0,
          otherCharges: dto.otherCharges ?? 0,
          total: calc.total,
          lines: {
            create: resolved.map((r, index) => ({
              itemId: r.itemId,
              lineNo: index + 1,
              description: r.description,
              hsnCode: r.hsnCode,
              unit: r.unit,
              quantity: calc.lines[index].quantity,
              rate: calc.lines[index].rate,
              discountPct: calc.lines[index].discountPct,
              taxableValue: calc.lines[index].taxableValue,
              gstRate: calc.lines[index].gstRate,
              cgst: calc.lines[index].cgst,
              sgst: calc.lines[index].sgst,
              igst: calc.lines[index].igst,
              total: calc.lines[index].total,
            })),
          },
        },
      });
    });
    return this.getOne(companyId, orderId, branchScope);
  }

  async list(companyId: string, branchScope?: string) {
    const rows = await this.prisma.salesOrder.findMany({
      where: { companyId, ...(branchScope && { branchId: branchScope }) },
      include: this.fullInclude,
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      take: 200,
    });
    return rows.map((o) => this.serialize(o));
  }

  async getOne(companyId: string, orderId: string, branchScope?: string) {
    const order = await this.prisma.salesOrder.findFirst({
      where: { id: orderId, companyId, ...(branchScope && { branchId: branchScope }) },
      include: this.fullInclude,
    });
    if (!order) throw new NotFoundException('Sales order not found');
    return this.serialize(order);
  }

  async cancel(companyId: string, orderId: string, branchScope?: string) {
    const order = await this.prisma.salesOrder.findFirst({
      where: { id: orderId, companyId, ...(branchScope && { branchId: branchScope }) },
    });
    if (!order) throw new NotFoundException('Sales order not found');
    if (order.status === EstimateStatus.CONVERTED) {
      throw new BadRequestException(
        'A converted order cannot be cancelled — cancel the invoice instead',
      );
    }
    if (order.status === EstimateStatus.CANCELLED) {
      throw new BadRequestException('Order is already cancelled');
    }
    await this.prisma.salesOrder.update({
      where: { id: order.id },
      data: { status: EstimateStatus.CANCELLED },
    });
    return this.getOne(companyId, orderId, branchScope);
  }

  /** Permanently delete a sales order and its line items. */
  async remove(companyId: string, orderId: string) {
    const doc = await this.prisma.salesOrder.findFirst({
      where: { id: orderId, companyId },
      select: { id: true },
    });
    if (!doc) throw new NotFoundException('Sales order not found');
    await this.prisma.$transaction(async (tx) => {
      await tx.salesOrderLine.deleteMany({ where: { orderId } });
      await tx.salesOrder.delete({ where: { id: orderId } });
    });
    return { deleted: true };
  }

  /**
   * Bill a sales order: create the GST invoice (posts the SALES voucher) and
   * link the two. Batch-tracked items can't be auto-converted — the invoice
   * needs an explicit batch to sell from.
   */
  async convertToInvoice(
    companyId: string,
    orderId: string,
    userId: string,
    branchScope?: string,
  ) {
    const order = await this.prisma.salesOrder.findFirst({
      where: { id: orderId, companyId, ...(branchScope && { branchId: branchScope }) },
      include: { lines: { orderBy: { lineNo: 'asc' }, include: { item: true } } },
    });
    if (!order) throw new NotFoundException('Sales order not found');
    if (order.status === EstimateStatus.CONVERTED || order.invoiceId) {
      throw new BadRequestException('Order is already converted to an invoice');
    }
    if (order.status === EstimateStatus.CANCELLED) {
      throw new BadRequestException('A cancelled order cannot be converted');
    }
    const batchItem = order.lines.find((l) => l.item?.trackBatches);
    if (batchItem) {
      throw new BadRequestException(
        `"${batchItem.item?.name}" tracks batches — create the invoice manually to pick the batch to sell from`,
      );
    }

    const orderNo = this.displayNo(order.fiscalYear, order.orderNo);
    const today = new Date().toISOString().slice(0, 10);
    const invoice = await this.invoices.create(
      companyId,
      userId,
      {
        partyId: order.partyId,
        branchId: order.branchId ?? undefined,
        date: today,
        placeOfSupply: order.placeOfSupply ?? undefined,
        notes: order.notes
          ? `${order.notes} · Converted from ${orderNo}`
          : `Converted from ${orderNo}`,
        lines: order.lines.map((l) => ({
          itemId: l.itemId ?? undefined,
          description: l.description,
          quantity: Number(l.quantity),
          rate: Number(l.rate),
          discountPct: Number(l.discountPct),
          gstRate: Number(l.gstRate) as never,
        })),
      },
      branchScope,
    );

    await this.prisma.salesOrder.update({
      where: { id: order.id },
      data: { invoiceId: invoice.id, status: EstimateStatus.CONVERTED },
    });
    return this.getOne(companyId, orderId, branchScope);
  }

  /** Maps a sales order to the invoice-PDF shape so it reuses the same layout. */
  async getForPdf(
    companyId: string,
    orderId: string,
    branchScope?: string,
  ): Promise<FullInvoice> {
    const order = await this.prisma.salesOrder.findFirst({
      where: { id: orderId, companyId, ...(branchScope && { branchId: branchScope }) },
      include: {
        company: true,
        party: true,
        lines: { orderBy: { lineNo: 'asc' } },
      },
    });
    if (!order) throw new NotFoundException('Sales order not found');
    const mapped = {
      ...order,
      invoiceNo: order.orderNo,
      dueDate: order.expectedDate,
      status: order.status === EstimateStatus.CANCELLED ? 'CANCELLED' : 'ISSUED',
    };
    return mapped as unknown as FullInvoice;
  }

  // -------------------------------------------------------------

  private async resolveLines(
    companyId: string,
    lines: CreateSalesOrderDto['lines'],
  ) {
    const itemIds = lines
      .map((l) => l.itemId)
      .filter((id): id is string => Boolean(id));
    const items = await this.prisma.item.findMany({
      where: { id: { in: itemIds }, companyId, isActive: true },
    });
    const itemById = new Map(items.map((i) => [i.id, i]));

    return lines.map((line, index) => {
      const item = line.itemId ? itemById.get(line.itemId) : undefined;
      if (line.itemId && !item) {
        throw new BadRequestException(`Line ${index + 1}: unknown item`);
      }
      const description = line.description?.trim() || item?.name;
      if (!description) {
        throw new BadRequestException(
          `Line ${index + 1}: description is required when no item is selected`,
        );
      }
      const rate =
        line.rate ?? (item?.salePrice ? Number(item.salePrice) : undefined);
      if (rate === undefined) {
        throw new BadRequestException(
          `Line ${index + 1}: rate is required (item has no sale price)`,
        );
      }
      return {
        itemId: item?.id ?? null,
        description,
        hsnCode: item?.hsnCode ?? null,
        unit: item?.unit ?? 'PCS',
        calc: {
          quantity: line.quantity,
          rate,
          discountPct: line.discountPct ?? 0,
          gstRate: line.gstRate ?? (item ? Number(item.gstRate) : 0),
        } satisfies CalcLineInput,
      };
    });
  }

  private displayNo(fiscalYear: string, no: number) {
    return `SO/${fiscalYear}/${String(no).padStart(4, '0')}`;
  }

  private readonly fullInclude = {
    party: { select: { id: true, name: true, gstin: true } },
    branch: { select: { id: true, name: true } },
    invoice: { select: { id: true, fiscalYear: true, invoiceNo: true } },
    lines: { orderBy: { lineNo: 'asc' as const } },
  };

  private serialize(order: {
    id: string;
    orderNo: number;
    fiscalYear: string;
    date: Date;
    expectedDate: Date | null;
    placeOfSupply: string | null;
    isInterState: boolean;
    notes: string | null;
    status: EstimateStatus;
    subtotal: Prisma.Decimal;
    discountTotal: Prisma.Decimal;
    taxableAmount: Prisma.Decimal;
    cgstAmount: Prisma.Decimal;
    sgstAmount: Prisma.Decimal;
    igstAmount: Prisma.Decimal;
    roundOff: Prisma.Decimal;
    freightCharges: Prisma.Decimal;
    otherCharges: Prisma.Decimal;
    total: Prisma.Decimal;
    party: { id: string; name: string; gstin: string | null };
    branch?: { id: string; name: string } | null;
    invoice?: { id: string; fiscalYear: string; invoiceNo: number } | null;
    lines: {
      lineNo: number;
      itemId: string | null;
      description: string;
      hsnCode: string | null;
      unit: string;
      quantity: Prisma.Decimal;
      rate: Prisma.Decimal;
      discountPct: Prisma.Decimal;
      taxableValue: Prisma.Decimal;
      gstRate: Prisma.Decimal;
      cgst: Prisma.Decimal;
      sgst: Prisma.Decimal;
      igst: Prisma.Decimal;
      total: Prisma.Decimal;
    }[];
  }) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const isOverdue =
      order.status === EstimateStatus.OPEN &&
      order.expectedDate !== null &&
      order.expectedDate < today;
    return {
      id: order.id,
      orderNo: this.displayNo(order.fiscalYear, order.orderNo),
      date: order.date,
      expectedDate: order.expectedDate,
      placeOfSupply: order.placeOfSupply,
      isInterState: order.isInterState,
      notes: order.notes,
      status: order.status,
      isOverdue,
      party: order.party,
      branch: order.branch ?? null,
      invoice: order.invoice
        ? {
            id: order.invoice.id,
            invoiceNo: `INV/${order.invoice.fiscalYear}/${String(order.invoice.invoiceNo).padStart(4, '0')}`,
          }
        : null,
      subtotal: Number(order.subtotal),
      discountTotal: Number(order.discountTotal),
      taxableAmount: Number(order.taxableAmount),
      cgstAmount: Number(order.cgstAmount),
      sgstAmount: Number(order.sgstAmount),
      igstAmount: Number(order.igstAmount),
      roundOff: Number(order.roundOff),
      freightCharges: Number(order.freightCharges),
      otherCharges: Number(order.otherCharges),
      total: Number(order.total),
      lines: order.lines.map((line) => ({
        lineNo: line.lineNo,
        itemId: line.itemId,
        description: line.description,
        hsnCode: line.hsnCode,
        unit: line.unit,
        quantity: Number(line.quantity),
        rate: Number(line.rate),
        discountPct: Number(line.discountPct),
        taxableValue: Number(line.taxableValue),
        gstRate: Number(line.gstRate),
        cgst: Number(line.cgst),
        sgst: Number(line.sgst),
        igst: Number(line.igst),
        total: Number(line.total),
      })),
    };
  }
}
