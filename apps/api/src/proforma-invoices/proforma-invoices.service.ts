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
import type { CreateProformaInvoiceDto, SetEstimateStatusDto } from './dto/proforma-invoice.dto';

@Injectable()
export class ProformaInvoicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly invoices: InvoicesService,
  ) {}

  async create(
    companyId: string,
    userId: string,
    dto: CreateProformaInvoiceDto,
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
      throw new BadRequestException('ProformaInvoices can only be raised on customers');
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

    const proformaInvoice = await this.prisma.$transaction(async (tx) => {
      const counter = await tx.proformaInvoiceCounter.upsert({
        where: { companyId_fiscalYear: { companyId, fiscalYear } },
        create: { companyId, fiscalYear, nextNo: 2 },
        update: { nextNo: { increment: 1 } },
      });
      return tx.proformaInvoice.create({
        data: {
          companyId,
          partyId: party.id,
          branchId: dto.branchId ?? null,
          proformaNo: counter.nextNo - 1,
          fiscalYear,
          date: new Date(dto.date),
          validUntil: dto.validUntil ? new Date(dto.validUntil) : null,
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
    return this.serialize(proformaInvoice);
  }

  /** Edit an open proformaInvoice — re-resolves lines and recomputes GST. */
  async update(
    companyId: string,
    proformaId: string,
    dto: CreateProformaInvoiceDto,
    branchScope?: string,
  ) {
    const existing = await this.prisma.proformaInvoice.findFirst({
      where: { id: proformaId, companyId, ...(branchScope && { branchId: branchScope }) },
    });
    if (!existing) throw new NotFoundException('ProformaInvoice not found');
    if (existing.status === EstimateStatus.CONVERTED) {
      throw new BadRequestException('A converted proformaInvoice cannot be edited');
    }
    if (existing.status === EstimateStatus.CANCELLED) {
      throw new BadRequestException('A cancelled proformaInvoice cannot be edited');
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
      throw new BadRequestException('ProformaInvoices can only be raised on customers');
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
      await tx.proformaInvoiceLine.deleteMany({ where: { proformaId } });
      await tx.proformaInvoice.update({
        where: { id: proformaId },
        data: {
          partyId: party.id,
          branchId: dto.branchId ?? null,
          date: new Date(dto.date),
          validUntil: dto.validUntil ? new Date(dto.validUntil) : null,
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
    return this.getOne(companyId, proformaId, branchScope);
  }

  async list(companyId: string, branchScope?: string) {
    const rows = await this.prisma.proformaInvoice.findMany({
      where: { companyId, ...(branchScope && { branchId: branchScope }) },
      include: this.fullInclude,
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      take: 200,
    });
    return rows.map((e) => this.serialize(e));
  }

  async getOne(companyId: string, proformaId: string, branchScope?: string) {
    const proformaInvoice = await this.prisma.proformaInvoice.findFirst({
      where: { id: proformaId, companyId, ...(branchScope && { branchId: branchScope }) },
      include: this.fullInclude,
    });
    if (!proformaInvoice) throw new NotFoundException('ProformaInvoice not found');
    return this.serialize(proformaInvoice);
  }

  async setStatus(
    companyId: string,
    proformaId: string,
    dto: SetEstimateStatusDto,
    branchScope?: string,
  ) {
    const proformaInvoice = await this.prisma.proformaInvoice.findFirst({
      where: { id: proformaId, companyId, ...(branchScope && { branchId: branchScope }) },
    });
    if (!proformaInvoice) throw new NotFoundException('ProformaInvoice not found');
    if (proformaInvoice.status === EstimateStatus.CONVERTED) {
      throw new BadRequestException('A converted proformaInvoice cannot change status');
    }
    if (proformaInvoice.status === EstimateStatus.CANCELLED) {
      throw new BadRequestException('A cancelled proformaInvoice cannot change status');
    }
    await this.prisma.proformaInvoice.update({
      where: { id: proformaInvoice.id },
      data: { status: dto.status as EstimateStatus },
    });
    return this.getOne(companyId, proformaId, branchScope);
  }

  async cancel(companyId: string, proformaId: string, branchScope?: string) {
    const proformaInvoice = await this.prisma.proformaInvoice.findFirst({
      where: { id: proformaId, companyId, ...(branchScope && { branchId: branchScope }) },
    });
    if (!proformaInvoice) throw new NotFoundException('ProformaInvoice not found');
    if (proformaInvoice.status === EstimateStatus.CONVERTED) {
      throw new BadRequestException(
        'A converted proformaInvoice cannot be cancelled — cancel the invoice instead',
      );
    }
    if (proformaInvoice.status === EstimateStatus.CANCELLED) {
      throw new BadRequestException('ProformaInvoice is already cancelled');
    }
    await this.prisma.proformaInvoice.update({
      where: { id: proformaInvoice.id },
      data: { status: EstimateStatus.CANCELLED },
    });
    return this.getOne(companyId, proformaId, branchScope);
  }

  /** Permanently delete a proforma invoice and its line items. */
  async remove(companyId: string, proformaId: string) {
    const doc = await this.prisma.proformaInvoice.findFirst({
      where: { id: proformaId, companyId },
      select: { id: true },
    });
    if (!doc) throw new NotFoundException('ProformaInvoice not found');
    await this.prisma.$transaction(async (tx) => {
      await tx.proformaInvoiceLine.deleteMany({ where: { proformaId } });
      await tx.proformaInvoice.delete({ where: { id: proformaId } });
    });
    return { deleted: true };
  }

  /**
   * Turn an open/accepted proformaInvoice into a real GST invoice (posts the SALES
   * voucher) and link the two. Batch-tracked items can't be auto-converted —
   * the invoice needs an explicit batch to sell from.
   */
  async convertToInvoice(
    companyId: string,
    proformaId: string,
    userId: string,
    branchScope?: string,
  ) {
    const proformaInvoice = await this.prisma.proformaInvoice.findFirst({
      where: { id: proformaId, companyId, ...(branchScope && { branchId: branchScope }) },
      include: { lines: { orderBy: { lineNo: 'asc' }, include: { item: true } } },
    });
    if (!proformaInvoice) throw new NotFoundException('ProformaInvoice not found');
    if (proformaInvoice.status === EstimateStatus.CONVERTED || proformaInvoice.invoiceId) {
      throw new BadRequestException('ProformaInvoice is already converted to an invoice');
    }
    if (proformaInvoice.status === EstimateStatus.CANCELLED) {
      throw new BadRequestException('A cancelled proformaInvoice cannot be converted');
    }
    if (proformaInvoice.status === EstimateStatus.DECLINED) {
      throw new BadRequestException('A declined proformaInvoice cannot be converted');
    }
    const batchItem = proformaInvoice.lines.find((l) => l.item?.trackBatches);
    if (batchItem) {
      throw new BadRequestException(
        `"${batchItem.item?.name}" tracks batches — create the invoice manually to pick the batch to sell from`,
      );
    }

    const proformaNo = this.displayNo(proformaInvoice.fiscalYear, proformaInvoice.proformaNo);
    const today = new Date().toISOString().slice(0, 10);
    const invoice = await this.invoices.create(
      companyId,
      userId,
      {
        partyId: proformaInvoice.partyId,
        branchId: proformaInvoice.branchId ?? undefined,
        date: today,
        placeOfSupply: proformaInvoice.placeOfSupply ?? undefined,
        notes: proformaInvoice.notes
          ? `${proformaInvoice.notes} · Converted from ${proformaNo}`
          : `Converted from ${proformaNo}`,
        lines: proformaInvoice.lines.map((l) => ({
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

    await this.prisma.proformaInvoice.update({
      where: { id: proformaInvoice.id },
      data: { invoiceId: invoice.id, status: EstimateStatus.CONVERTED },
    });
    return this.getOne(companyId, proformaId, branchScope);
  }

  /** Maps an proformaInvoice to the invoice-PDF shape so it reuses the same layout. */
  async getForPdf(
    companyId: string,
    proformaId: string,
    branchScope?: string,
  ): Promise<FullInvoice> {
    const proformaInvoice = await this.prisma.proformaInvoice.findFirst({
      where: { id: proformaId, companyId, ...(branchScope && { branchId: branchScope }) },
      include: {
        company: true,
        party: true,
        lines: { orderBy: { lineNo: 'asc' } },
      },
    });
    if (!proformaInvoice) throw new NotFoundException('ProformaInvoice not found');
    const mapped = {
      ...proformaInvoice,
      invoiceNo: proformaInvoice.proformaNo,
      dueDate: proformaInvoice.validUntil,
      status: proformaInvoice.status === EstimateStatus.CANCELLED ? 'CANCELLED' : 'ISSUED',
    };
    return mapped as unknown as FullInvoice;
  }

  // -------------------------------------------------------------

  private async resolveLines(
    companyId: string,
    lines: CreateProformaInvoiceDto['lines'],
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
    return `PI/${fiscalYear}/${String(no).padStart(4, '0')}`;
  }

  private readonly fullInclude = {
    party: { select: { id: true, name: true, gstin: true } },
    branch: { select: { id: true, name: true } },
    invoice: { select: { id: true, fiscalYear: true, invoiceNo: true } },
    lines: { orderBy: { lineNo: 'asc' as const } },
  };

  private serialize(proformaInvoice: {
    id: string;
    proformaNo: number;
    fiscalYear: string;
    date: Date;
    validUntil: Date | null;
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
    const isExpired =
      proformaInvoice.status === EstimateStatus.OPEN &&
      proformaInvoice.validUntil !== null &&
      proformaInvoice.validUntil < today;
    return {
      id: proformaInvoice.id,
      proformaNo: this.displayNo(proformaInvoice.fiscalYear, proformaInvoice.proformaNo),
      date: proformaInvoice.date,
      validUntil: proformaInvoice.validUntil,
      placeOfSupply: proformaInvoice.placeOfSupply,
      isInterState: proformaInvoice.isInterState,
      notes: proformaInvoice.notes,
      status: proformaInvoice.status,
      isExpired,
      party: proformaInvoice.party,
      branch: proformaInvoice.branch ?? null,
      invoice: proformaInvoice.invoice
        ? {
            id: proformaInvoice.invoice.id,
            invoiceNo: `INV/${proformaInvoice.invoice.fiscalYear}/${String(proformaInvoice.invoice.invoiceNo).padStart(4, '0')}`,
          }
        : null,
      subtotal: Number(proformaInvoice.subtotal),
      discountTotal: Number(proformaInvoice.discountTotal),
      taxableAmount: Number(proformaInvoice.taxableAmount),
      cgstAmount: Number(proformaInvoice.cgstAmount),
      sgstAmount: Number(proformaInvoice.sgstAmount),
      igstAmount: Number(proformaInvoice.igstAmount),
      roundOff: Number(proformaInvoice.roundOff),
      freightCharges: Number(proformaInvoice.freightCharges),
      otherCharges: Number(proformaInvoice.otherCharges),
      total: Number(proformaInvoice.total),
      lines: proformaInvoice.lines.map((line) => ({
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
