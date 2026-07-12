import { Injectable } from '@nestjs/common';
import {
  AccountNature,
  EntryType,
  EstimateStatus,
  InvoiceStatus,
  PartyType,
  VoucherStatus,
} from '@prisma/client';
import { fiscalYearOf } from '../accounting/fiscal-year.util';
import { PartyBalanceService } from '../balances/party-balance.service';
import { PrismaService } from '../prisma/prisma.service';

const r2 = (n: number) => Math.round(n * 100) / 100;

interface LedgerNet {
  ledgerId: string;
  name: string;
  groupName: string;
  nature: AccountNature;
  /** Positive = debit balance, negative = credit balance (rupees). */
  net: number;
}

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly balances: PartyBalanceService,
  ) {}

  /** Start of the current fiscal year for a company. */
  private async fyStart(companyId: string): Promise<Date> {
    const company = await this.prisma.company.findUniqueOrThrow({
      where: { id: companyId },
      select: { fyStartMonth: true },
    });
    const now = new Date();
    const year =
      now.getUTCMonth() + 1 >= company.fyStartMonth
        ? now.getUTCFullYear()
        : now.getUTCFullYear() - 1;
    return new Date(Date.UTC(year, company.fyStartMonth - 1, 1));
  }

  /**
   * Net balance per ledger: opening (unless excluded) + debits − credits
   * within the window. The single building block for TB / P&L / BS.
   */
  private async ledgerNets(
    companyId: string,
    options: { from?: Date; to?: Date; includeOpening: boolean },
  ): Promise<LedgerNet[]> {
    const [ledgers, sums] = await Promise.all([
      this.prisma.ledger.findMany({
        where: { companyId, isActive: true },
        include: { group: { select: { name: true, nature: true } } },
        orderBy: { name: 'asc' },
      }),
      this.prisma.voucherLine.groupBy({
        by: ['ledgerId', 'type'],
        where: {
          ledger: { companyId },
          voucher: {
            status: VoucherStatus.ACTIVE,
            ...(options.from || options.to
              ? {
                  date: {
                    ...(options.from && { gte: options.from }),
                    ...(options.to && { lte: options.to }),
                  },
                }
              : {}),
          },
        },
        _sum: { amount: true },
      }),
    ]);

    const movement = new Map<string, number>();
    for (const row of sums) {
      const amount = Number(row._sum.amount ?? 0);
      const signed = row.type === EntryType.DEBIT ? amount : -amount;
      movement.set(row.ledgerId, (movement.get(row.ledgerId) ?? 0) + signed);
    }

    return ledgers.map((ledger) => {
      const opening = options.includeOpening
        ? Number(ledger.openingBalance) *
          (ledger.openingType === EntryType.DEBIT ? 1 : -1)
        : 0;
      return {
        ledgerId: ledger.id,
        name: ledger.name,
        groupName: ledger.group.name,
        nature: ledger.group.nature,
        net: r2(opening + (movement.get(ledger.id) ?? 0)),
      };
    });
  }

  /**
   * Directly-entered opening balances have no contra entry, so they can
   * leave the books out of balance. Like Tally, we surface the gap as a
   * synthetic "Difference in Opening Balances" line (positive = net debit).
   */
  private async openingDifference(companyId: string): Promise<number> {
    const ledgers = await this.prisma.ledger.findMany({
      where: { companyId, isActive: true },
      select: { openingBalance: true, openingType: true },
    });
    return r2(
      ledgers.reduce(
        (sum, l) =>
          sum +
          Number(l.openingBalance) * (l.openingType === EntryType.DEBIT ? 1 : -1),
        0,
      ),
    );
  }

  // -------------------------------------------------------------
  // Trial Balance
  // -------------------------------------------------------------

  async trialBalance(companyId: string, asOf?: string) {
    const [nets, openingDiff] = await Promise.all([
      this.ledgerNets(companyId, {
        to: asOf ? new Date(asOf) : undefined,
        includeOpening: true,
      }),
      this.openingDifference(companyId),
    ]);
    const rows = nets
      .filter((n) => n.net !== 0)
      .map((n) => ({
        ledgerId: n.ledgerId,
        ledger: n.name,
        group: n.groupName,
        debit: n.net > 0 ? n.net : 0,
        credit: n.net < 0 ? Math.abs(n.net) : 0,
      }));
    if (openingDiff !== 0) {
      rows.push({
        ledgerId: 'opening-difference',
        ledger: 'Difference in Opening Balances',
        group: '—',
        debit: openingDiff < 0 ? Math.abs(openingDiff) : 0,
        credit: openingDiff > 0 ? openingDiff : 0,
      });
    }
    return {
      asOf: asOf ?? new Date().toISOString().slice(0, 10),
      rows,
      totalDebit: r2(rows.reduce((s, row) => s + row.debit, 0)),
      totalCredit: r2(rows.reduce((s, row) => s + row.credit, 0)),
    };
  }

  // -------------------------------------------------------------
  // Profit & Loss (period activity; defaults to current FY)
  // -------------------------------------------------------------

  async profitAndLoss(companyId: string, from?: string, to?: string) {
    const fromDate = from ? new Date(from) : await this.fyStart(companyId);
    const toDate = to ? new Date(to) : undefined;
    const nets = await this.ledgerNets(companyId, {
      from: fromDate,
      to: toDate,
      includeOpening: false,
    });

    // Income ledgers carry credit balances (negative net); expenses debit.
    const income = nets
      .filter((n) => n.nature === AccountNature.INCOME && n.net !== 0)
      .map((n) => ({ ledger: n.name, group: n.groupName, amount: r2(-n.net) }));
    const expenses = nets
      .filter((n) => n.nature === AccountNature.EXPENSE && n.net !== 0)
      .map((n) => ({ ledger: n.name, group: n.groupName, amount: r2(n.net) }));

    const totalIncome = r2(income.reduce((s, x) => s + x.amount, 0));
    const totalExpenses = r2(expenses.reduce((s, x) => s + x.amount, 0));
    return {
      from: fromDate.toISOString().slice(0, 10),
      to: to ?? new Date().toISOString().slice(0, 10),
      income,
      expenses,
      totalIncome,
      totalExpenses,
      netProfit: r2(totalIncome - totalExpenses),
    };
  }

  // -------------------------------------------------------------
  // Balance Sheet (as of date, all history)
  // -------------------------------------------------------------

  async balanceSheet(companyId: string, asOf?: string) {
    const [nets, openingDiff] = await Promise.all([
      this.ledgerNets(companyId, {
        to: asOf ? new Date(asOf) : undefined,
        includeOpening: true,
      }),
      this.openingDifference(companyId),
    ]);

    const assets = nets
      .filter((n) => n.nature === AccountNature.ASSET && n.net !== 0)
      .map((n) => ({ ledger: n.name, group: n.groupName, amount: r2(n.net) }));
    const liabilities = nets
      .filter((n) => n.nature === AccountNature.LIABILITY && n.net !== 0)
      .map((n) => ({ ledger: n.name, group: n.groupName, amount: r2(-n.net) }));

    // Accumulated P&L (income − expenses over all history incl. openings)
    // sits on the liabilities side, keeping the sheet balanced.
    const plNet = r2(
      nets
        .filter(
          (n) =>
            n.nature === AccountNature.INCOME ||
            n.nature === AccountNature.EXPENSE,
        )
        .reduce((s, n) => s - n.net, 0),
    );

    // Contra-less opening balances land here, exactly as Tally shows them.
    if (openingDiff !== 0) {
      liabilities.push({
        ledger: 'Difference in Opening Balances',
        group: '—',
        amount: openingDiff,
      });
    }

    const totalAssets = r2(assets.reduce((s, x) => s + x.amount, 0));
    const totalLiabilities = r2(
      liabilities.reduce((s, x) => s + x.amount, 0) + plNet,
    );
    return {
      asOf: asOf ?? new Date().toISOString().slice(0, 10),
      assets,
      liabilities,
      profitAndLoss: plNet,
      totalAssets,
      totalLiabilities,
    };
  }

  // -------------------------------------------------------------
  // GSTR views (export-ready data; filing goes through a GSP later)
  // -------------------------------------------------------------

  async gstr1(companyId: string, from?: string, to?: string) {
    const fromDate = from ? new Date(from) : await this.fyStart(companyId);
    const toDate = to ? new Date(to) : new Date();

    const invoices = await this.prisma.invoice.findMany({
      where: {
        companyId,
        status: InvoiceStatus.ISSUED,
        date: { gte: fromDate, lte: toDate },
      },
      include: {
        party: { select: { name: true, gstin: true } },
        lines: true,
      },
      orderBy: { date: 'asc' },
    });

    const b2b = invoices
      .filter((inv) => inv.party.gstin)
      .map((inv) => ({
        invoiceNo: `INV/${inv.fiscalYear}/${String(inv.invoiceNo).padStart(4, '0')}`,
        date: inv.date,
        gstin: inv.party.gstin,
        party: inv.party.name,
        placeOfSupply: inv.placeOfSupply,
        taxable: Number(inv.taxableAmount),
        cgst: Number(inv.cgstAmount),
        sgst: Number(inv.sgstAmount),
        igst: Number(inv.igstAmount),
        total: Number(inv.total),
      }));

    const b2cMap = new Map<string, { taxable: number; tax: number }>();
    for (const inv of invoices.filter((i) => !i.party.gstin)) {
      const key = inv.placeOfSupply ?? 'NA';
      const entry = b2cMap.get(key) ?? { taxable: 0, tax: 0 };
      entry.taxable += Number(inv.taxableAmount);
      entry.tax +=
        Number(inv.cgstAmount) + Number(inv.sgstAmount) + Number(inv.igstAmount);
      b2cMap.set(key, entry);
    }

    // HSN summary (GSTR-1 table 12)
    const hsnMap = new Map<
      string,
      { qty: number; taxable: number; cgst: number; sgst: number; igst: number }
    >();
    for (const inv of invoices) {
      for (const line of inv.lines) {
        const key = line.hsnCode ?? '—';
        const entry =
          hsnMap.get(key) ?? { qty: 0, taxable: 0, cgst: 0, sgst: 0, igst: 0 };
        entry.qty += Number(line.quantity);
        entry.taxable += Number(line.taxableValue);
        entry.cgst += Number(line.cgst);
        entry.sgst += Number(line.sgst);
        entry.igst += Number(line.igst);
        hsnMap.set(key, entry);
      }
    }

    const creditNotes = await this.prisma.note.findMany({
      where: {
        companyId,
        type: 'CREDIT_NOTE',
        status: InvoiceStatus.ISSUED,
        date: { gte: fromDate, lte: toDate },
      },
      include: { party: { select: { name: true, gstin: true } } },
      orderBy: { date: 'asc' },
    });

    return {
      from: fromDate.toISOString().slice(0, 10),
      to: toDate.toISOString().slice(0, 10),
      b2b,
      creditNotes: creditNotes.map((n) => ({
        noteNo: `CRN/${n.fiscalYear}/${String(n.noteNo).padStart(4, '0')}`,
        date: n.date,
        gstin: n.party.gstin,
        party: n.party.name,
        taxable: Number(n.taxableAmount),
        cgst: Number(n.cgstAmount),
        sgst: Number(n.sgstAmount),
        igst: Number(n.igstAmount),
        total: Number(n.total),
      })),
      b2c: [...b2cMap.entries()].map(([placeOfSupply, v]) => ({
        placeOfSupply,
        taxable: r2(v.taxable),
        tax: r2(v.tax),
      })),
      hsnSummary: [...hsnMap.entries()].map(([hsn, v]) => ({
        hsn,
        qty: v.qty,
        taxable: r2(v.taxable),
        cgst: r2(v.cgst),
        sgst: r2(v.sgst),
        igst: r2(v.igst),
      })),
      totals: {
        invoices: invoices.length,
        taxable: r2(invoices.reduce((s, i) => s + Number(i.taxableAmount), 0)),
        cgst: r2(invoices.reduce((s, i) => s + Number(i.cgstAmount), 0)),
        sgst: r2(invoices.reduce((s, i) => s + Number(i.sgstAmount), 0)),
        igst: r2(invoices.reduce((s, i) => s + Number(i.igstAmount), 0)),
      },
    };
  }

  async gstr3b(companyId: string, from?: string, to?: string) {
    const fromDate = from ? new Date(from) : await this.fyStart(companyId);
    const toDate = to ? new Date(to) : new Date();
    const window = { gte: fromDate, lte: toDate };

    const [outward, inward, creditNotes, debitNotes] = await Promise.all([
      this.prisma.invoice.aggregate({
        where: { companyId, status: InvoiceStatus.ISSUED, date: window },
        _sum: {
          taxableAmount: true,
          cgstAmount: true,
          sgstAmount: true,
          igstAmount: true,
        },
      }),
      this.prisma.purchaseBill.aggregate({
        where: { companyId, status: InvoiceStatus.ISSUED, date: window },
        _sum: {
          taxableAmount: true,
          cgstAmount: true,
          sgstAmount: true,
          igstAmount: true,
        },
      }),
      this.prisma.note.aggregate({
        where: { companyId, type: 'CREDIT_NOTE', status: InvoiceStatus.ISSUED, date: window },
        _sum: { taxableAmount: true, cgstAmount: true, sgstAmount: true, igstAmount: true },
      }),
      this.prisma.note.aggregate({
        where: { companyId, type: 'DEBIT_NOTE', status: InvoiceStatus.ISSUED, date: window },
        _sum: { taxableAmount: true, cgstAmount: true, sgstAmount: true, igstAmount: true },
      }),
    ]);

    // Outward liability is net of credit notes; ITC is net of debit notes.
    const out = {
      taxable: r2(Number(outward._sum.taxableAmount ?? 0) - Number(creditNotes._sum.taxableAmount ?? 0)),
      cgst: r2(Number(outward._sum.cgstAmount ?? 0) - Number(creditNotes._sum.cgstAmount ?? 0)),
      sgst: r2(Number(outward._sum.sgstAmount ?? 0) - Number(creditNotes._sum.sgstAmount ?? 0)),
      igst: r2(Number(outward._sum.igstAmount ?? 0) - Number(creditNotes._sum.igstAmount ?? 0)),
    };
    const itc = {
      taxable: r2(Number(inward._sum.taxableAmount ?? 0) - Number(debitNotes._sum.taxableAmount ?? 0)),
      cgst: r2(Number(inward._sum.cgstAmount ?? 0) - Number(debitNotes._sum.cgstAmount ?? 0)),
      sgst: r2(Number(inward._sum.sgstAmount ?? 0) - Number(debitNotes._sum.sgstAmount ?? 0)),
      igst: r2(Number(inward._sum.igstAmount ?? 0) - Number(debitNotes._sum.igstAmount ?? 0)),
    };

    return {
      from: fromDate.toISOString().slice(0, 10),
      to: toDate.toISOString().slice(0, 10),
      outwardSupplies: out,
      eligibleItc: itc,
      netPayable: {
        cgst: r2(out.cgst - itc.cgst),
        sgst: r2(out.sgst - itc.sgst),
        igst: r2(out.igst - itc.igst),
      },
    };
  }

  // -------------------------------------------------------------
  // Dashboard
  // -------------------------------------------------------------

  /** Sales vs purchases per month for the last `months` months (for charts). */
  private async monthlySeries(companyId: string, months = 6) {
    const start = new Date();
    start.setUTCDate(1);
    start.setUTCHours(0, 0, 0, 0);
    start.setUTCMonth(start.getUTCMonth() - (months - 1));

    const [sales, purchases] = await Promise.all([
      this.prisma.$queryRaw<{ month: string; total: number }[]>`
        SELECT to_char(date_trunc('month', "date"), 'YYYY-MM') AS month,
               COALESCE(SUM("total"), 0)::float AS total
        FROM "invoices"
        WHERE "companyId" = ${companyId} AND "status" = 'ISSUED' AND "date" >= ${start}
        GROUP BY 1`,
      this.prisma.$queryRaw<{ month: string; total: number }[]>`
        SELECT to_char(date_trunc('month', "date"), 'YYYY-MM') AS month,
               COALESCE(SUM("total"), 0)::float AS total
        FROM "purchase_bills"
        WHERE "companyId" = ${companyId} AND "status" = 'ISSUED' AND "date" >= ${start}
        GROUP BY 1`,
    ]);

    const salesByMonth = new Map(sales.map((r) => [r.month, r.total]));
    const purchasesByMonth = new Map(purchases.map((r) => [r.month, r.total]));

    const series: { month: string; label: string; sales: number; purchases: number }[] = [];
    const cursor = new Date(start);
    for (let i = 0; i < months; i++) {
      const key = cursor.toISOString().slice(0, 7);
      series.push({
        month: key,
        label: cursor.toLocaleString('en-IN', { month: 'short', timeZone: 'UTC' }),
        sales: r2(salesByMonth.get(key) ?? 0),
        purchases: r2(purchasesByMonth.get(key) ?? 0),
      });
      cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    }
    return series;
  }

  async dashboard(companyId: string) {
    const now = new Date();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const fyStartDate = await this.fyStart(companyId);
    const company = await this.prisma.company.findUniqueOrThrow({
      where: { id: companyId },
      select: {
        fyStartMonth: true,
        salesPaymentLink: true,
        purchasePaymentLink: true,
      },
    });

    // The Overview reflects the selected Payment Link: when sales/purchase
    // payments reconcile against estimates, every figure is derived from
    // estimates rather than invoices/bills (and vice-versa).
    const salesViaEstimate = company.salesPaymentLink === 'estimate';
    const purchaseViaEstimate = company.purchasePaymentLink === 'purchaseEstimate';
    const estActive = { notIn: [EstimateStatus.CANCELLED, EstimateStatus.DECLINED] };

    const aggSales = (gte: Date) =>
      salesViaEstimate
        ? this.prisma.estimate.aggregate({
            where: { companyId, status: estActive, date: { gte } },
            _sum: { total: true },
            _count: true,
          })
        : this.prisma.invoice.aggregate({
            where: { companyId, status: InvoiceStatus.ISSUED, date: { gte } },
            _sum: { total: true },
            _count: true,
          });

    const [salesMTD, salesFY, purchasesMTD, nets, items, soldQty, boughtQty] =
      await Promise.all([
        aggSales(monthStart),
        aggSales(fyStartDate),
        purchaseViaEstimate
          ? this.prisma.purchaseEstimate.aggregate({
              where: { companyId, status: estActive, date: { gte: monthStart } },
              _sum: { total: true },
              _count: true,
            })
          : this.prisma.purchaseBill.aggregate({
              where: { companyId, status: InvoiceStatus.ISSUED, date: { gte: monthStart } },
              _sum: { total: true },
              _count: true,
            }),
        this.ledgerNets(companyId, { includeOpening: true }),
        this.prisma.item.findMany({
          where: { companyId, isActive: true, reorderLevel: { not: null } },
        }),
        this.prisma.invoiceLine.groupBy({
          by: ['itemId'],
          where: { itemId: { not: null }, invoice: { companyId, status: InvoiceStatus.ISSUED } },
          _sum: { quantity: true },
        }),
        this.prisma.purchaseBillLine.groupBy({
          by: ['itemId'],
          where: { itemId: { not: null }, bill: { companyId, status: InvoiceStatus.ISSUED } },
          _sum: { quantity: true },
        }),
      ]);

    const sumGroup = (groups: string[]) =>
      r2(
        nets
          .filter((n) => groups.includes(n.groupName))
          .reduce((s, n) => s + n.net, 0),
      );
    const cashBank = sumGroup(['Cash-in-Hand', 'Bank Accounts']);

    // Receivables/payables use the strict, document-based outstanding — each
    // party tracked by its own document type (estimate vs invoice, etc.) — so
    // these figures match every other balance display in the app, instead of
    // the raw accounting-ledger nets (which also carry opening balances etc.).
    const partyList = await this.prisma.party.findMany({
      where: { companyId, isActive: true },
      select: { id: true, type: true, balanceDocType: true },
    });
    const outMap = await this.balances.outstandingByParty(companyId, partyList, company);
    let receivables = 0;
    let payables = 0;
    for (const p of partyList) {
      const amt = outMap.get(p.id)?.outstanding ?? 0;
      if (p.type === PartyType.CUSTOMER) receivables += amt;
      else payables += amt;
    }
    receivables = r2(receivables);
    payables = r2(payables);
    // Customer money still to collect.
    const outstanding = receivables;

    // Recent activity list — uses the company default doc type for the feed.
    let recentDocs: {
      id: string;
      invoiceNo: string;
      date: Date;
      party: string;
      total: number;
      status: string;
    }[];
    if (salesViaEstimate) {
      const recent = await this.prisma.estimate.findMany({
        where: { companyId },
        include: { party: { select: { name: true } } },
        orderBy: { createdAt: 'desc' },
        take: 5,
      });
      recentDocs = recent.map((e) => ({
        id: e.id,
        invoiceNo: `EST/${e.fiscalYear}/${String(e.estimateNo).padStart(4, '0')}`,
        date: e.date,
        party: e.party.name,
        total: Number(e.total),
        status: e.status,
      }));
    } else {
      const recent = await this.prisma.invoice.findMany({
        where: { companyId },
        include: { party: { select: { name: true } } },
        orderBy: { createdAt: 'desc' },
        take: 5,
      });
      recentDocs = recent.map((inv) => ({
        id: inv.id,
        invoiceNo: `INV/${inv.fiscalYear}/${String(inv.invoiceNo).padStart(4, '0')}`,
        date: inv.date,
        party: inv.party.name,
        total: Number(inv.total),
        status: inv.status,
      }));
    }

    const soldMap = new Map(
      soldQty.map((row) => [row.itemId as string, Number(row._sum.quantity ?? 0)]),
    );
    const boughtMap = new Map(
      boughtQty.map((row) => [row.itemId as string, Number(row._sum.quantity ?? 0)]),
    );
    const lowStockCount = items.filter((item) => {
      const onHand =
        Number(item.openingStock) +
        (boughtMap.get(item.id) ?? 0) -
        (soldMap.get(item.id) ?? 0);
      return onHand <= Number(item.reorderLevel);
    }).length;

    const monthly = await this.monthlySeries(companyId);

    return {
      fiscalYear: fiscalYearOf(now, company.fyStartMonth),
      monthly,
      salesThisMonth: Number(salesMTD._sum.total ?? 0),
      invoicesThisMonth: salesMTD._count,
      salesThisFY: Number(salesFY._sum.total ?? 0),
      invoicesThisFY: salesFY._count,
      purchasesThisMonth: Number(purchasesMTD._sum.total ?? 0),
      cashBank,
      receivables,
      payables,
      outstandingInvoiceAmount: outstanding,
      lowStockCount,
      recentInvoices: recentDocs,
    };
  }
}
