import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  EntryType,
  PartyPaymentDirection,
  PartyType,
  PaymentMethod,
  Prisma,
  VoucherStatus,
  VoucherType,
} from '@prisma/client';
import { stateCodeForName } from '@bookly/shared';
import { AccountingService } from '../accounting/accounting.service';
import { PartyBalanceService } from '../balances/party-balance.service';
import { estimateNo } from '../common/document-number.util';
import { PrismaService } from '../prisma/prisma.service';
import type {
  CreateItemDto,
  CreatePartyDto,
  RecordPartyPaymentDto,
  UpdateItemDto,
  UpdatePartyDto,
} from './dto/party.dto';

const PARTY_GROUP: Record<PartyType, string> = {
  [PartyType.CUSTOMER]: 'Sundry Debtors',
  [PartyType.VENDOR]: 'Sundry Creditors',
};

/** Trim + drop blank-named entries from user-defined item attributes. */
function normalizeCustomFields(
  fields?: { name: string; value?: string }[] | null,
): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  if (!fields || fields.length === 0) return Prisma.JsonNull;
  const clean = fields
    .map((f) => ({ name: (f.name ?? '').trim(), value: (f.value ?? '').trim() }))
    .filter((f) => f.name.length > 0);
  return clean.length ? clean : Prisma.JsonNull;
}

@Injectable()
export class PartiesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accounting: AccountingService,
    private readonly balances: PartyBalanceService,
  ) {}

  /** Company defaults for inheriting a party's document type. */
  private companyDefaults(companyId: string) {
    return this.prisma.company.findUniqueOrThrow({
      where: { id: companyId },
      select: { salesPaymentLink: true },
    });
  }

  // -------------------------------------------------------------
  // Parties
  // -------------------------------------------------------------

  /** Creates a party + its ledger atomically. */
  /** Validates a per-party document type against the party's kind (or clears it). */
  private validDocType(type: PartyType, v?: string | null): string | null {
    if (!v) return null;
    const allowed =
      type === PartyType.CUSTOMER
        ? ['invoice', 'estimate']
        : ['purchase', 'purchaseEstimate'];
    if (!allowed.includes(v)) {
      throw new BadRequestException(
        `Document type "${v}" is not valid for a ${type.toLowerCase()}`,
      );
    }
    return v;
  }

  async createParty(companyId: string, dto: CreatePartyDto) {
    const name = dto.name.trim();

    const group = await this.prisma.accountGroup.findUnique({
      where: { companyId_name: { companyId, name: PARTY_GROUP[dto.type] } },
    });
    if (!group) {
      throw new BadRequestException(
        `Missing system group "${PARTY_GROUP[dto.type]}" — was this company seeded correctly?`,
      );
    }

    const ledgerNameTaken = await this.prisma.ledger.findUnique({
      where: { companyId_name: { companyId, name } },
    });
    if (ledgerNameTaken) {
      throw new BadRequestException(
        'A ledger with this name already exists — party names must be unique across ledgers',
      );
    }

    // Customers default to receivable (DEBIT), vendors to payable (CREDIT).
    const openingType =
      dto.openingType ??
      (dto.type === PartyType.CUSTOMER ? EntryType.DEBIT : EntryType.CREDIT);

    return this.prisma.$transaction(async (tx) => {
      const ledger = await tx.ledger.create({
        data: {
          companyId,
          groupId: group.id,
          name,
          openingBalance: dto.openingBalance ?? 0,
          openingType,
          isSystem: false,
        },
      });
      return tx.party.create({
        data: {
          companyId,
          type: dto.type,
          name,
          aliasName: dto.aliasName?.trim() || null,
          gstin: dto.gstin,
          // GSTIN's first 2 digits are authoritative; else derive from state name.
          stateCode: dto.gstin?.slice(0, 2) ?? stateCodeForName(dto.state),
          state: dto.state?.trim() || null,
          email: dto.email,
          phone: dto.phone,
          addressLine1: dto.addressLine1,
          addressLine2: dto.addressLine2,
          city: dto.city,
          pincode: dto.pincode,
          image: dto.image,
          balanceDocType: this.validDocType(dto.type, dto.balanceDocType),
          ledgerId: ledger.id,
        },
        include: { ledger: { select: { id: true, name: true } } },
      });
    });
  }

  /** Parties with live receivable/payable balances from their ledgers. */
  async listParties(companyId: string, type?: PartyType) {
    const parties = await this.prisma.party.findMany({
      where: { companyId, isActive: true, ...(type && { type }) },
      include: {
        ledger: {
          select: { id: true, openingBalance: true, openingType: true },
        },
      },
      orderBy: { name: 'asc' },
    });

    const ledgerIds = parties.map((p) => p.ledgerId);
    const sums = await this.prisma.voucherLine.groupBy({
      by: ['ledgerId', 'type'],
      where: {
        ledgerId: { in: ledgerIds },
        voucher: { status: VoucherStatus.ACTIVE },
      },
      _sum: { amount: true },
    });
    const totals = new Map<string, number>();
    for (const row of sums) {
      const amount = Number(row._sum.amount ?? 0);
      const signed = row.type === EntryType.DEBIT ? amount : -amount;
      totals.set(row.ledgerId, (totals.get(row.ledgerId) ?? 0) + signed);
    }

    // Strict document-based outstanding, per the party's tracked doc type.
    const company = await this.companyDefaults(companyId);
    const outstanding = await this.balances.outstandingByParty(
      companyId,
      parties.map((p) => ({ id: p.id, type: p.type, balanceDocType: p.balanceDocType })),
      company,
    );

    return parties.map((party) => {
      const opening =
        Number(party.ledger.openingBalance) *
        (party.ledger.openingType === EntryType.DEBIT ? 1 : -1);
      const net = opening + (totals.get(party.ledgerId) ?? 0);
      const out = outstanding.get(party.id)!;
      return {
        id: party.id,
        type: party.type,
        name: party.name,
        aliasName: party.aliasName,
        gstin: party.gstin,
        stateCode: party.stateCode,
        state: party.state,
        email: party.email,
        phone: party.phone,
        addressLine1: party.addressLine1,
        addressLine2: party.addressLine2,
        city: party.city,
        pincode: party.pincode,
        ledgerId: party.ledgerId,
        // Document-based outstanding (estimate/invoice only) — what every
        // balance display must show. `balance`/`balanceType` is the raw
        // accounting-ledger net, kept for statutory/ledger views.
        outstanding: out.outstanding,
        docType: out.docType,
        balanceDocType: party.balanceDocType,
        balance: Math.abs(net),
        balanceType: net >= 0 ? EntryType.DEBIT : EntryType.CREDIT,
      };
    });
  }

  /** Renaming a party renames its ledger atomically — they stay in lockstep. */
  async updateParty(companyId: string, partyId: string, dto: UpdatePartyDto) {
    const party = await this.prisma.party.findFirst({
      where: { id: partyId, companyId },
    });
    if (!party) throw new NotFoundException('Party not found');

    const newName = dto.name?.trim();
    if (newName && newName !== party.name) {
      const taken = await this.prisma.ledger.findUnique({
        where: { companyId_name: { companyId, name: newName } },
      });
      if (taken && taken.id !== party.ledgerId) {
        throw new BadRequestException(
          'A ledger with this name already exists — party names must be unique across ledgers',
        );
      }
    }

    return this.prisma.$transaction(async (tx) => {
      if (newName && newName !== party.name) {
        await tx.ledger.update({
          where: { id: party.ledgerId },
          data: { name: newName },
        });
      }
      return tx.party.update({
        where: { id: party.id },
        data: {
          name: newName ?? undefined,
          aliasName:
            dto.aliasName !== undefined ? dto.aliasName.trim() || null : undefined,
          gstin: dto.gstin,
          stateCode: dto.gstin
            ? dto.gstin.slice(0, 2)
            : dto.state !== undefined
              ? stateCodeForName(dto.state)
              : undefined,
          state: dto.state !== undefined ? dto.state.trim() || null : undefined,
          email: dto.email,
          phone: dto.phone,
          addressLine1: dto.addressLine1,
          addressLine2: dto.addressLine2,
          city: dto.city,
          pincode: dto.pincode,
          image: dto.image,
          balanceDocType:
            dto.balanceDocType !== undefined
              ? this.validDocType(party.type, dto.balanceDocType)
              : undefined,
        },
        include: { ledger: { select: { id: true, name: true } } },
      });
    });
  }

  async getParty(companyId: string, partyId: string) {
    const party = await this.prisma.party.findFirst({
      where: { id: partyId, companyId },
      include: { ledger: { select: { id: true, name: true } } },
    });
    if (!party) throw new NotFoundException('Party not found');
    // Strict document-based outstanding for this party (estimate/invoice etc.).
    const company = await this.companyDefaults(companyId);
    const detail = await this.balances.outstandingDetail(companyId, party, company);
    return { ...party, ...detail };
  }

  /** Document-based statement (all tracked-type docs) for a party. */
  async partyStatement(companyId: string, partyId: string) {
    const party = await this.prisma.party.findFirst({
      where: { id: partyId, companyId },
      select: { id: true, type: true, balanceDocType: true, name: true },
    });
    if (!party) throw new NotFoundException('Party not found');
    const company = await this.companyDefaults(companyId);
    const statement = await this.balances.statement(companyId, party, company);
    return { party: { id: party.id, name: party.name, type: party.type }, ...statement };
  }

  /**
   * Records a receipt (from a customer) or payment (to a vendor) directly
   * against the party's ledger, posting the matching RECEIPT/PAYMENT voucher.
   * This reduces the party's outstanding balance. When linked to an estimate
   * or purchase order, it is also recorded as an advance against that document.
   */
  async recordPartyPayment(
    companyId: string,
    partyId: string,
    userId: string,
    dto: RecordPartyPaymentDto,
  ) {
    const party = await this.prisma.party.findFirst({
      where: { id: partyId, companyId },
    });
    if (!party) throw new NotFoundException('Party not found');

    const isCustomer = party.type === PartyType.CUSTOMER;

    // Validate the optional advance link & build a human reference for narration.
    let advanceRef: string | undefined;
    if (dto.estimateId) {
      if (!isCustomer) {
        throw new BadRequestException(
          'An estimate advance can only be recorded against a customer',
        );
      }
      const est = await this.prisma.estimate.findFirst({
        where: { id: dto.estimateId, companyId, partyId },
        select: { fiscalYear: true, estimateNo: true },
      });
      if (!est) {
        throw new BadRequestException('Estimate not found for this customer');
      }
      advanceRef = estimateNo(est.fiscalYear, est.estimateNo);
    }

    const base = isCustomer
      ? `Receipt from ${party.name}`
      : `Payment to ${party.name}`;
    const narration = advanceRef
      ? `${base} · Advance against ${advanceRef}`
      : base;

    // RECEIPT (customer): Dr cash/bank, Cr party ledger (cuts receivable).
    // PAYMENT (vendor):   Dr party ledger, Cr cash/bank (cuts payable).
    const voucherDto = {
      type: isCustomer ? VoucherType.RECEIPT : VoucherType.PAYMENT,
      date: dto.date,
      narration,
      lines: isCustomer
        ? [
            { ledgerId: dto.ledgerId, type: EntryType.DEBIT, amount: dto.amount },
            { ledgerId: party.ledgerId, type: EntryType.CREDIT, amount: dto.amount },
          ]
        : [
            { ledgerId: party.ledgerId, type: EntryType.DEBIT, amount: dto.amount },
            { ledgerId: dto.ledgerId, type: EntryType.CREDIT, amount: dto.amount },
          ],
    };
    await this.accounting.validateVoucherInput(companyId, voucherDto);

    await this.prisma.$transaction(async (tx) => {
      const voucher = await this.accounting.postVoucherTx(
        tx,
        companyId,
        userId,
        voucherDto,
      );
      await tx.partyPayment.create({
        data: {
          companyId,
          partyId,
          voucherId: voucher.id,
          direction: isCustomer
            ? PartyPaymentDirection.RECEIPT
            : PartyPaymentDirection.PAYMENT,
          date: new Date(dto.date),
          amount: dto.amount,
          method: dto.method ?? PaymentMethod.CASH,
          reference: dto.reference,
          note: dto.note,
          estimateId: dto.estimateId,
          source: dto.source ?? null,
        },
      });
    });

    return { ok: true };
  }

  /** Standalone receipts/payments recorded directly against a party. */
  async listPartyPayments(companyId: string, partyId: string) {
    const rows = await this.prisma.partyPayment.findMany({
      where: { companyId, partyId },
      orderBy: { date: 'desc' },
      include: {
        estimate: { select: { fiscalYear: true, estimateNo: true } },
      },
    });
    return rows.map((p) => ({
      id: p.id,
      direction: p.direction,
      date: p.date,
      amount: Number(p.amount),
      method: p.method,
      reference: p.reference,
      note: p.note,
      estimateId: p.estimateId,
      source: p.source,
      advanceRef: p.estimate
        ? estimateNo(p.estimate.fiscalYear, p.estimate.estimateNo)
        : null,
    }));
  }

  /**
   * Delete a standalone receipt/payment: cancels its accounting voucher (so the
   * party ledger balance reverts) and removes the row. Cancelled vouchers are
   * excluded from all balance maths, so this cleanly reverses the entry while
   * keeping the voucher as an audit trail.
   */
  async deletePartyPayment(
    companyId: string,
    partyId: string,
    paymentId: string,
  ) {
    const pay = await this.prisma.partyPayment.findFirst({
      where: { id: paymentId, companyId, partyId },
    });
    if (!pay) {
      throw new NotFoundException('Payment entry not found');
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.voucher.update({
        where: { id: pay.voucherId },
        data: { status: VoucherStatus.CANCELLED },
      });
      await tx.partyPayment.delete({ where: { id: paymentId } });
    });
    return { ok: true };
  }

  // -------------------------------------------------------------
  // Items
  // -------------------------------------------------------------

  async createItem(companyId: string, dto: CreateItemDto) {
    const existing = await this.prisma.item.findUnique({
      where: { companyId_name: { companyId, name: dto.name.trim() } },
    });
    if (existing) {
      throw new BadRequestException('An item with this name already exists');
    }

    const base = {
      companyId,
      sku: dto.sku,
      hsnCode: dto.hsnCode,
      unit: dto.unit ?? 'PCS',
      gstRate: dto.gstRate ?? 0,
      salePrice: dto.salePrice,
      purchasePrice: dto.purchasePrice,
      openingStock: dto.openingStock ?? 0,
      reorderLevel: dto.reorderLevel,
      barcode: dto.barcode?.trim() || null,
      trackBatches: dto.trackBatches ?? false,
      customFields: normalizeCustomFields(dto.customFields),
      description: dto.description,
    };
    const variants = dto.variants ?? [];

    // No variants → a plain item. With variants → parent + child items that
    // each inherit the parent's HSN/unit/GST and carry their own price/stock.
    return this.prisma.$transaction(async (tx) => {
      const parent = await tx.item.create({
        data: { ...base, name: dto.name.trim() },
      });
      for (const v of variants) {
        const childName = `${dto.name.trim()} - ${v.variantLabel.trim()}`;
        const clash = await tx.item.findUnique({
          where: { companyId_name: { companyId, name: childName } },
        });
        if (clash) {
          throw new BadRequestException(`Variant "${childName}" already exists`);
        }
        await tx.item.create({
          data: {
            ...base,
            name: childName,
            sku: v.sku ?? null,
            barcode: null,
            salePrice: v.salePrice ?? dto.salePrice,
            openingStock: v.openingStock ?? 0,
            parentItemId: parent.id,
            variantLabel: v.variantLabel.trim(),
          },
        });
      }
      return parent;
    });
  }

  async updateItem(companyId: string, itemId: string, dto: UpdateItemDto) {
    const item = await this.prisma.item.findFirst({
      where: { id: itemId, companyId },
    });
    if (!item) throw new NotFoundException('Item not found');

    const newName = dto.name?.trim();
    if (newName && newName !== item.name) {
      const taken = await this.prisma.item.findUnique({
        where: { companyId_name: { companyId, name: newName } },
      });
      if (taken) {
        throw new BadRequestException('An item with this name already exists');
      }
    }

    const updated = await this.prisma.item.update({
      where: { id: item.id },
      data: {
        name: newName ?? undefined,
        sku: dto.sku,
        hsnCode: dto.hsnCode,
        customFields:
          dto.customFields !== undefined
            ? normalizeCustomFields(dto.customFields)
            : undefined,
        unit: dto.unit,
        gstRate: dto.gstRate,
        salePrice: dto.salePrice,
        purchasePrice: dto.purchasePrice,
        openingStock: dto.openingStock,
        reorderLevel: dto.reorderLevel,
        barcode: dto.barcode !== undefined ? dto.barcode.trim() || null : undefined,
        trackBatches: dto.trackBatches,
        description: dto.description,
      },
    });
    return {
      ...updated,
      gstRate: Number(updated.gstRate),
      salePrice: updated.salePrice === null ? null : Number(updated.salePrice),
      purchasePrice:
        updated.purchasePrice === null ? null : Number(updated.purchasePrice),
      openingStock: Number(updated.openingStock),
      reorderLevel:
        updated.reorderLevel === null ? null : Number(updated.reorderLevel),
    };
  }

  async listItems(companyId: string) {
    const items = await this.prisma.item.findMany({
      where: { companyId, isActive: true },
      orderBy: { name: 'asc' },
    });
    return items.map((item) => ({
      ...item,
      gstRate: Number(item.gstRate),
      salePrice: item.salePrice === null ? null : Number(item.salePrice),
      purchasePrice:
        item.purchasePrice === null ? null : Number(item.purchasePrice),
      openingStock: Number(item.openingStock),
      reorderLevel:
        item.reorderLevel === null ? null : Number(item.reorderLevel),
    }));
  }
}
