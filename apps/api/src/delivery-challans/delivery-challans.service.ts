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
import type { CreateDeliveryChallanDto } from './dto/delivery-challan.dto';

/**
 * Delivery challans record goods dispatched before a tax invoice exists.
 * They post NO accounting/stock until converted to an invoice (which does
 * the SALES voucher, output GST and stock). Mirrors the Estimate flow.
 */
@Injectable()
export class DeliveryChallansService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly invoices: InvoicesService,
  ) {}

  async create(
    companyId: string,
    userId: string,
    dto: CreateDeliveryChallanDto,
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
      throw new BadRequestException('Delivery challans can only be raised on customers');
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

    const challan = await this.prisma.$transaction(async (tx) => {
      const counter = await tx.deliveryChallanCounter.upsert({
        where: { companyId_fiscalYear: { companyId, fiscalYear } },
        create: { companyId, fiscalYear, nextNo: 2 },
        update: { nextNo: { increment: 1 } },
      });
      return tx.deliveryChallan.create({
        data: {
          companyId,
          partyId: party.id,
          branchId: dto.branchId ?? null,
          challanNo: counter.nextNo - 1,
          fiscalYear,
          date: new Date(dto.date),
          placeOfSupply,
          isInterState,
          vehicleNo: dto.vehicleNo,
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
    return this.serialize(challan);
  }

  /** Edit an open challan — re-resolves lines and recomputes GST. */
  async update(
    companyId: string,
    challanId: string,
    dto: CreateDeliveryChallanDto,
    branchScope?: string,
  ) {
    const existing = await this.prisma.deliveryChallan.findFirst({
      where: { id: challanId, companyId, ...(branchScope && { branchId: branchScope }) },
    });
    if (!existing) throw new NotFoundException('Delivery challan not found');
    if (existing.status === EstimateStatus.CONVERTED) {
      throw new BadRequestException('A converted challan cannot be edited');
    }
    if (existing.status === EstimateStatus.CANCELLED) {
      throw new BadRequestException('A cancelled challan cannot be edited');
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
      throw new BadRequestException('Delivery challans can only be raised on customers');
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
      await tx.deliveryChallanLine.deleteMany({ where: { challanId } });
      await tx.deliveryChallan.update({
        where: { id: challanId },
        data: {
          partyId: party.id,
          branchId: dto.branchId ?? null,
          date: new Date(dto.date),
          placeOfSupply,
          isInterState,
          vehicleNo: dto.vehicleNo,
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
    return this.getOne(companyId, challanId, branchScope);
  }

  async list(companyId: string, branchScope?: string) {
    const rows = await this.prisma.deliveryChallan.findMany({
      where: { companyId, ...(branchScope && { branchId: branchScope }) },
      include: this.fullInclude,
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      take: 200,
    });
    return rows.map((c) => this.serialize(c));
  }

  async getOne(companyId: string, challanId: string, branchScope?: string) {
    const challan = await this.prisma.deliveryChallan.findFirst({
      where: { id: challanId, companyId, ...(branchScope && { branchId: branchScope }) },
      include: this.fullInclude,
    });
    if (!challan) throw new NotFoundException('Delivery challan not found');
    return this.serialize(challan);
  }

  async cancel(companyId: string, challanId: string, branchScope?: string) {
    const challan = await this.prisma.deliveryChallan.findFirst({
      where: { id: challanId, companyId, ...(branchScope && { branchId: branchScope }) },
    });
    if (!challan) throw new NotFoundException('Delivery challan not found');
    if (challan.status === EstimateStatus.CONVERTED) {
      throw new BadRequestException(
        'A converted challan cannot be cancelled — cancel the invoice instead',
      );
    }
    if (challan.status === EstimateStatus.CANCELLED) {
      throw new BadRequestException('Challan is already cancelled');
    }
    await this.prisma.deliveryChallan.update({
      where: { id: challan.id },
      data: { status: EstimateStatus.CANCELLED },
    });
    return this.getOne(companyId, challanId, branchScope);
  }

  /** Permanently delete a delivery challan and its line items. */
  async remove(companyId: string, challanId: string) {
    const doc = await this.prisma.deliveryChallan.findFirst({
      where: { id: challanId, companyId },
      select: { id: true },
    });
    if (!doc) throw new NotFoundException('Delivery challan not found');
    await this.prisma.$transaction(async (tx) => {
      await tx.deliveryChallanLine.deleteMany({ where: { challanId } });
      await tx.deliveryChallan.delete({ where: { id: challanId } });
    });
    return { deleted: true };
  }

  /**
   * Bill a delivery challan: create the GST invoice (posts the SALES voucher)
   * and link the two. Batch-tracked items can't be auto-converted — the
   * invoice needs an explicit batch to sell from.
   */
  async convertToInvoice(
    companyId: string,
    challanId: string,
    userId: string,
    branchScope?: string,
  ) {
    const challan = await this.prisma.deliveryChallan.findFirst({
      where: { id: challanId, companyId, ...(branchScope && { branchId: branchScope }) },
      include: { lines: { orderBy: { lineNo: 'asc' }, include: { item: true } } },
    });
    if (!challan) throw new NotFoundException('Delivery challan not found');
    if (challan.status === EstimateStatus.CONVERTED || challan.invoiceId) {
      throw new BadRequestException('Challan is already converted to an invoice');
    }
    if (challan.status === EstimateStatus.CANCELLED) {
      throw new BadRequestException('A cancelled challan cannot be converted');
    }
    const batchItem = challan.lines.find((l) => l.item?.trackBatches);
    if (batchItem) {
      throw new BadRequestException(
        `"${batchItem.item?.name}" tracks batches — create the invoice manually to pick the batch to sell from`,
      );
    }

    const challanNo = this.displayNo(challan.fiscalYear, challan.challanNo);
    const today = new Date().toISOString().slice(0, 10);
    const invoice = await this.invoices.create(
      companyId,
      userId,
      {
        partyId: challan.partyId,
        branchId: challan.branchId ?? undefined,
        date: today,
        placeOfSupply: challan.placeOfSupply ?? undefined,
        notes: challan.notes
          ? `${challan.notes} · Converted from ${challanNo}`
          : `Converted from ${challanNo}`,
        lines: challan.lines.map((l) => ({
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

    await this.prisma.deliveryChallan.update({
      where: { id: challan.id },
      data: { invoiceId: invoice.id, status: EstimateStatus.CONVERTED },
    });
    return this.getOne(companyId, challanId, branchScope);
  }

  /** Maps a challan to the invoice-PDF shape so it reuses the same layout. */
  async getForPdf(
    companyId: string,
    challanId: string,
    branchScope?: string,
  ): Promise<FullInvoice> {
    const challan = await this.prisma.deliveryChallan.findFirst({
      where: { id: challanId, companyId, ...(branchScope && { branchId: branchScope }) },
      include: {
        company: true,
        party: true,
        lines: { orderBy: { lineNo: 'asc' } },
      },
    });
    if (!challan) throw new NotFoundException('Delivery challan not found');
    const mapped = {
      ...challan,
      invoiceNo: challan.challanNo,
      dueDate: null,
      status: challan.status === EstimateStatus.CANCELLED ? 'CANCELLED' : 'ISSUED',
    };
    return mapped as unknown as FullInvoice;
  }

  // -------------------------------------------------------------

  private async resolveLines(
    companyId: string,
    lines: CreateDeliveryChallanDto['lines'],
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
    return `DC/${fiscalYear}/${String(no).padStart(4, '0')}`;
  }

  private readonly fullInclude = {
    party: { select: { id: true, name: true, gstin: true } },
    branch: { select: { id: true, name: true } },
    invoice: { select: { id: true, fiscalYear: true, invoiceNo: true } },
    lines: { orderBy: { lineNo: 'asc' as const } },
  };

  private serialize(challan: {
    id: string;
    challanNo: number;
    fiscalYear: string;
    date: Date;
    placeOfSupply: string | null;
    isInterState: boolean;
    vehicleNo: string | null;
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
    return {
      id: challan.id,
      challanNo: this.displayNo(challan.fiscalYear, challan.challanNo),
      date: challan.date,
      placeOfSupply: challan.placeOfSupply,
      isInterState: challan.isInterState,
      vehicleNo: challan.vehicleNo,
      notes: challan.notes,
      status: challan.status,
      party: challan.party,
      branch: challan.branch ?? null,
      invoice: challan.invoice
        ? {
            id: challan.invoice.id,
            invoiceNo: `INV/${challan.invoice.fiscalYear}/${String(challan.invoice.invoiceNo).padStart(4, '0')}`,
          }
        : null,
      subtotal: Number(challan.subtotal),
      discountTotal: Number(challan.discountTotal),
      taxableAmount: Number(challan.taxableAmount),
      cgstAmount: Number(challan.cgstAmount),
      sgstAmount: Number(challan.sgstAmount),
      igstAmount: Number(challan.igstAmount),
      roundOff: Number(challan.roundOff),
      freightCharges: Number(challan.freightCharges),
      otherCharges: Number(challan.otherCharges),
      total: Number(challan.total),
      lines: challan.lines.map((line) => ({
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
