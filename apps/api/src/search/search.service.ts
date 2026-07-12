import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { displayVoucherNo } from '../accounting/fiscal-year.util';

export interface SearchResult {
  type: 'party' | 'item' | 'ledger' | 'invoice' | 'purchase' | 'voucher';
  id: string;
  title: string;
  subtitle: string;
  /** Workspace tab where this entity lives. */
  tab: string;
}

const LIMIT_PER_TYPE = 5;

@Injectable()
export class SearchService {
  constructor(private readonly prisma: PrismaService) {}

  /** Universal search across every entity in a company. */
  async search(companyId: string, query: string): Promise<SearchResult[]> {
    const q = query.trim();
    if (q.length < 2) return [];

    const contains = { contains: q, mode: 'insensitive' as const };
    // Document numbers are int4 — don't treat long digit strings (barcodes,
    // GSTINs, phone numbers) as voucher/invoice numbers.
    const parsed = /^\d+$/.test(q) ? parseInt(q, 10) : undefined;
    const asNumber =
      parsed !== undefined && parsed <= 2_147_483_647 ? parsed : undefined;

    const [parties, items, ledgers, invoices, bills, vouchers] =
      await Promise.all([
        this.prisma.party.findMany({
          where: {
            companyId,
            isActive: true,
            OR: [{ name: contains }, { gstin: contains }, { city: contains }],
          },
          take: LIMIT_PER_TYPE,
        }),
        this.prisma.item.findMany({
          where: {
            companyId,
            isActive: true,
            OR: [{ name: contains }, { hsnCode: contains }, { sku: contains }, { barcode: contains }],
          },
          take: LIMIT_PER_TYPE,
        }),
        this.prisma.ledger.findMany({
          where: { companyId, isActive: true, name: contains },
          include: { group: { select: { name: true } } },
          take: LIMIT_PER_TYPE,
        }),
        this.prisma.invoice.findMany({
          where: {
            companyId,
            OR: [
              { party: { name: contains } },
              ...(asNumber !== undefined ? [{ invoiceNo: asNumber }] : []),
            ],
          },
          include: { party: { select: { name: true } } },
          orderBy: { date: 'desc' },
          take: LIMIT_PER_TYPE,
        }),
        this.prisma.purchaseBill.findMany({
          where: {
            companyId,
            OR: [
              { party: { name: contains } },
              { supplierBillNo: contains },
              ...(asNumber !== undefined ? [{ billNo: asNumber }] : []),
            ],
          },
          include: { party: { select: { name: true } } },
          orderBy: { date: 'desc' },
          take: LIMIT_PER_TYPE,
        }),
        this.prisma.voucher.findMany({
          where: { companyId, narration: contains },
          orderBy: { date: 'desc' },
          take: LIMIT_PER_TYPE,
        }),
      ]);

    const results: SearchResult[] = [
      ...parties.map((p) => ({
        type: 'party' as const,
        id: p.id,
        title: p.name,
        subtitle: `${p.type === 'CUSTOMER' ? 'Customer' : 'Vendor'}${p.gstin ? ` · ${p.gstin}` : ''}`,
        tab: 'parties',
      })),
      ...items.map((i) => ({
        type: 'item' as const,
        id: i.id,
        title: i.name,
        subtitle: `Item${i.hsnCode ? ` · HSN ${i.hsnCode}` : ''} · ${Number(i.gstRate)}% GST`,
        tab: 'items',
      })),
      ...ledgers.map((l) => ({
        type: 'ledger' as const,
        id: l.id,
        title: l.name,
        subtitle: `Ledger · ${l.group.name}`,
        tab: 'ledgers',
      })),
      ...invoices.map((inv) => ({
        type: 'invoice' as const,
        id: inv.id,
        title: `INV/${inv.fiscalYear}/${String(inv.invoiceNo).padStart(4, '0')}`,
        subtitle: `Invoice · ${inv.party.name} · ₹${Number(inv.total).toLocaleString('en-IN')}`,
        tab: 'invoices',
      })),
      ...bills.map((bill) => ({
        type: 'purchase' as const,
        id: bill.id,
        title: `PB/${bill.fiscalYear}/${String(bill.billNo).padStart(4, '0')}`,
        subtitle: `Purchase · ${bill.party.name} · ₹${Number(bill.total).toLocaleString('en-IN')}`,
        tab: 'purchases',
      })),
      ...vouchers.map((v) => ({
        type: 'voucher' as const,
        id: v.id,
        title: displayVoucherNo(v.type, v.fiscalYear, v.voucherNo),
        subtitle: `Voucher · ${v.narration ?? v.type}`,
        tab: 'vouchers',
      })),
    ];

    return results.slice(0, 20);
  }
}
