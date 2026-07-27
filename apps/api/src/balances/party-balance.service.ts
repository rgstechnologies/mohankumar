import { Injectable } from '@nestjs/common';
import { invoiceNo, estimateNo, billNo } from '../common/document-number.util';
import { EstimateStatus, InvoiceStatus, PartyType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/** The document types a party's outstanding can be tracked against. */
export type BalanceDocType = 'invoice' | 'estimate' | 'purchase';

export interface CompanyDefaults {
  salesPaymentLink: string; // 'invoice' | 'estimate'
}

export interface PartyLite {
  id: string;
  type: PartyType;
  balanceDocType: string | null;
}

export interface OutstandingDoc {
  id: string;
  no: string;
  date: Date;
  total: number;
  paid: number;
  outstanding: number;
}

export interface PartyOutstanding {
  docType: BalanceDocType;
  outstanding: number;
}

const r2 = (n: number) => Math.round(n * 100) / 100;
// Estimate-like documents that still represent a live obligation. CONVERTED is
// excluded: once an estimate becomes an invoice/bill, the receivable lives on
// that invoice — counting the estimate too would overstate the balance forever.
const EST_ACTIVE = {
  notIn: [
    EstimateStatus.CANCELLED,
    EstimateStatus.DECLINED,
    EstimateStatus.CONVERTED,
  ],
};

/**
 * Strict, document-based outstanding-balance engine.
 *
 * Every customer/vendor is tracked against exactly ONE document type — set per
 * party (`balanceDocType`) or inherited from the company default. The amount
 * owed is always `Σ(document total − payments linked to that document)` for that
 * one type, never mixing estimates with invoices (or purchase-estimates with
 * bills). This single service is the source of truth used by the party list,
 * profile, dashboards, reports, payment screens and search popups so the
 * separation holds identically everywhere.
 */
@Injectable()
export class PartyBalanceService {
  constructor(private readonly prisma: PrismaService) {}

  /** The document type that governs this party's outstanding balance. */
  resolveDocType(party: PartyLite, company: CompanyDefaults): BalanceDocType {
    if (
      party.balanceDocType === 'invoice' ||
      party.balanceDocType === 'estimate' ||
      party.balanceDocType === 'purchase'
    ) {
      return party.balanceDocType;
    }
    if (party.type === PartyType.CUSTOMER) {
      return company.salesPaymentLink === 'estimate' ? 'estimate' : 'invoice';
    }
    // Vendors are always tracked against purchase bills.
    return 'purchase';
  }

  /**
   * Bulk outstanding for many parties at once (party list, dashboard totals).
   * Returns a map of partyId → { docType, outstanding }.
   */
  async outstandingByParty(
    companyId: string,
    parties: PartyLite[],
    company: CompanyDefaults,
  ): Promise<Map<string, PartyOutstanding>> {
    const docTypeOf = new Map<string, BalanceDocType>();
    const buckets: Record<BalanceDocType, string[]> = {
      invoice: [],
      estimate: [],
      purchase: [],
    };
    for (const p of parties) {
      const dt = this.resolveDocType(p, company);
      docTypeOf.set(p.id, dt);
      buckets[dt].push(p.id);
    }

    const sums = new Map<string, number>();
    const add = (partyId: string, amount: number) =>
      sums.set(partyId, (sums.get(partyId) ?? 0) + Math.max(0, amount));

    await Promise.all([
      this.sumInvoices(companyId, buckets.invoice, add),
      this.sumEstimates(companyId, buckets.estimate, add),
      this.sumPurchaseBills(companyId, buckets.purchase, add),
    ]);

    const result = new Map<string, PartyOutstanding>();
    for (const p of parties) {
      result.set(p.id, {
        docType: docTypeOf.get(p.id)!,
        outstanding: r2(sums.get(p.id) ?? 0),
      });
    }
    return result;
  }

  /** Outstanding for a single party, with the open documents behind it. */
  async outstandingDetail(
    companyId: string,
    party: PartyLite,
    company: CompanyDefaults,
  ): Promise<{ docType: BalanceDocType; outstanding: number; documents: OutstandingDoc[] }> {
    const docType = this.resolveDocType(party, company);
    const documents = await this.openDocuments(companyId, party.id, docType);
    const outstanding = r2(documents.reduce((s, d) => s + d.outstanding, 0));
    return { docType, outstanding, documents };
  }

  /**
   * A document-based statement for the party: every document of its tracked
   * type (paid + unpaid), oldest first, with paid/outstanding per document and
   * the running total still due. Respects the strict doc-type separation, so a
   * customer tracked by estimates never sees invoices here (and vice-versa).
   */
  async statement(
    companyId: string,
    party: PartyLite,
    company: CompanyDefaults,
  ): Promise<{
    docType: BalanceDocType;
    outstanding: number;
    documents: OutstandingDoc[];
  }> {
    const docType = this.resolveDocType(party, company);
    const documents = await this.openDocuments(companyId, party.id, docType, false);
    const outstanding = r2(documents.reduce((s, d) => s + d.outstanding, 0));
    return { docType, outstanding, documents };
  }

  /** Documents of the party's tracked type; `onlyOpen` keeps just the unpaid. */
  async openDocuments(
    companyId: string,
    partyId: string,
    docType: BalanceDocType,
    onlyOpen = true,
  ): Promise<OutstandingDoc[]> {
    const keep = (d: OutstandingDoc) => !onlyOpen || d.outstanding > 0.005;
    if (docType === 'invoice') {
      const rows = await this.prisma.invoice.findMany({
        where: { companyId, partyId, status: InvoiceStatus.ISSUED },
        select: {
          id: true, invoiceNo: true, fiscalYear: true, date: true, total: true,
          payments: { select: { amount: true } },
          creditNotes: { where: { status: 'ISSUED' }, select: { total: true } },
        },
        orderBy: { date: 'asc' },
      });
      return rows
        .map((r) => {
          const paid =
            r.payments.reduce((s, p) => s + Number(p.amount), 0) +
            r.creditNotes.reduce((s, n) => s + Number(n.total), 0);
          return {
            id: r.id,
            no: invoiceNo(r.fiscalYear, r.invoiceNo),
            date: r.date,
            total: Number(r.total),
            paid: r2(paid),
            outstanding: r2(Number(r.total) - paid),
          };
        })
        .filter(keep);
    }
    if (docType === 'estimate') {
      const rows = await this.prisma.estimate.findMany({
        where: { companyId, partyId, status: EST_ACTIVE },
        select: {
          id: true, estimateNo: true, fiscalYear: true, date: true, total: true,
          payments: { select: { amount: true } },
        },
        orderBy: { date: 'asc' },
      });
      return rows
        .map((r) => {
          const paid = r.payments.reduce((s, p) => s + Number(p.amount), 0);
          return {
            id: r.id,
            no: estimateNo(r.fiscalYear, r.estimateNo),
            date: r.date,
            total: Number(r.total),
            paid: r2(paid),
            outstanding: r2(Number(r.total) - paid),
          };
        })
        .filter(keep);
    }
    // purchase
    const rows = await this.prisma.purchaseBill.findMany({
      where: { companyId, partyId, status: InvoiceStatus.ISSUED },
      select: {
        id: true, billNo: true, fiscalYear: true, date: true, total: true,
        payments: { select: { amount: true } },
      },
      orderBy: { date: 'asc' },
    });
    return rows
      .map((r) => {
        const paid = r.payments.reduce((s, p) => s + Number(p.amount), 0);
        return {
          id: r.id,
          no: billNo(r.fiscalYear, r.billNo),
          date: r.date,
          total: Number(r.total),
          paid: r2(paid),
          outstanding: r2(Number(r.total) - paid),
        };
      })
      .filter(keep);
  }

  // -- bulk summers (one query per type) ------------------------------------

  private async sumInvoices(
    companyId: string,
    partyIds: string[],
    add: (partyId: string, amount: number) => void,
  ) {
    if (!partyIds.length) return;
    const rows = await this.prisma.invoice.findMany({
      where: { companyId, partyId: { in: partyIds }, status: InvoiceStatus.ISSUED },
      select: {
        partyId: true, total: true,
        payments: { select: { amount: true } },
        creditNotes: { where: { status: 'ISSUED' }, select: { total: true } },
      },
    });
    for (const r of rows) {
      const paid =
        r.payments.reduce((s, p) => s + Number(p.amount), 0) +
        r.creditNotes.reduce((s, n) => s + Number(n.total), 0);
      add(r.partyId, Number(r.total) - paid);
    }
  }

  private async sumEstimates(
    companyId: string,
    partyIds: string[],
    add: (partyId: string, amount: number) => void,
  ) {
    if (!partyIds.length) return;
    const rows = await this.prisma.estimate.findMany({
      where: { companyId, partyId: { in: partyIds }, status: EST_ACTIVE },
      select: { partyId: true, total: true, payments: { select: { amount: true } } },
    });
    for (const r of rows) {
      const paid = r.payments.reduce((s, p) => s + Number(p.amount), 0);
      add(r.partyId, Number(r.total) - paid);
    }
  }

  private async sumPurchaseBills(
    companyId: string,
    partyIds: string[],
    add: (partyId: string, amount: number) => void,
  ) {
    if (!partyIds.length) return;
    const rows = await this.prisma.purchaseBill.findMany({
      where: { companyId, partyId: { in: partyIds }, status: InvoiceStatus.ISSUED },
      select: { partyId: true, total: true, payments: { select: { amount: true } } },
    });
    for (const r of rows) {
      const paid = r.payments.reduce((s, p) => s + Number(p.amount), 0);
      add(r.partyId, Number(r.total) - paid);
    }
  }

}
