import { BadRequestException, Injectable } from '@nestjs/common';
import { AccountingService } from '../accounting/accounting.service';
import { InvoicesService } from '../invoices/invoices.service';
import { EstimatesService } from '../estimates/estimates.service';
import { PurchasesService } from '../purchases/purchases.service';
import { ReportsService } from '../reports/reports.service';
import type { TableDoc } from './table-doc';

export const EXPORTABLE_REPORTS = [
  'trial-balance',
  'profit-loss',
  'balance-sheet',
  'gstr1',
  'gstr3b',
  'invoices',
  'estimates',
  'purchases',
  'stock',
  'ledger-statement',
  'estimate-report',
  'sales-report',
] as const;

export type ExportableReport = (typeof EXPORTABLE_REPORTS)[number];

interface ExportQuery {
  from?: string;
  to?: string;
  asOf?: string;
  ledgerId?: string;
}

const today = () => new Date().toISOString().slice(0, 10);

@Injectable()
export class ExportsService {
  constructor(
    private readonly reports: ReportsService,
    private readonly invoices: InvoicesService,
    private readonly estimates: EstimatesService,
    private readonly purchases: PurchasesService,
    private readonly accounting: AccountingService,
  ) {}

  async buildDoc(
    companyId: string,
    report: ExportableReport,
    query: ExportQuery,
  ): Promise<TableDoc> {
    switch (report) {
      case 'trial-balance':
        return this.trialBalance(companyId, query);
      case 'profit-loss':
        return this.profitLoss(companyId, query);
      case 'balance-sheet':
        return this.balanceSheet(companyId, query);
      case 'gstr1':
        return this.gstr1(companyId, query);
      case 'gstr3b':
        return this.gstr3b(companyId, query);
      case 'invoices':
        return this.invoiceRegister(companyId);
      case 'estimates':
        return this.estimatesRegister(companyId);
      case 'purchases':
        return this.purchaseRegister(companyId);
      case 'stock':
        return this.stockReport(companyId);
      case 'ledger-statement':
        return this.ledgerStatement(companyId, query);
      case 'estimate-report':
        return this.estimateReportExport(companyId);
      case 'sales-report':
        return this.salesReportExport(companyId);
      default:
        throw new BadRequestException('Invalid report type');
    }
  }

  private async trialBalance(companyId: string, q: ExportQuery): Promise<TableDoc> {
    const data = await this.reports.trialBalance(companyId, q.asOf);
    return {
      title: 'Trial Balance',
      subtitle: `As of ${data.asOf}`,
      fileName: `trial-balance-${data.asOf}`,
      sheets: [
        {
          name: 'Trial Balance',
          columns: [
            { header: 'Ledger', key: 'ledger', width: 2 },
            { header: 'Group', key: 'group', width: 1.5 },
            { header: 'Debit', key: 'debit', format: 'currency' },
            { header: 'Credit', key: 'credit', format: 'currency' },
          ],
          rows: data.rows.map((r) => ({
            ledger: r.ledger,
            group: r.group,
            debit: r.debit || null,
            credit: r.credit || null,
          })),
          totalsRow: { ledger: 'Total', debit: data.totalDebit, credit: data.totalCredit },
        },
      ],
    };
  }

  private async profitLoss(companyId: string, q: ExportQuery): Promise<TableDoc> {
    const data = await this.reports.profitAndLoss(companyId, q.from, q.to);
    const columns = [
      { header: 'Ledger', key: 'ledger', width: 2 },
      { header: 'Group', key: 'group', width: 1.5 },
      { header: 'Amount', key: 'amount', format: 'currency' as const },
    ];
    return {
      title: 'Profit & Loss',
      subtitle: `${data.from} to ${data.to} · Net ${data.netProfit >= 0 ? 'Profit' : 'Loss'}: ₹${Math.abs(data.netProfit).toLocaleString('en-IN')}`,
      fileName: `profit-loss-${data.from}-to-${data.to}`,
      sheets: [
        {
          name: 'Income',
          columns,
          rows: data.income,
          totalsRow: { ledger: 'Total income', amount: data.totalIncome },
        },
        {
          name: 'Expenses',
          columns,
          rows: data.expenses,
          totalsRow: { ledger: 'Total expenses', amount: data.totalExpenses },
        },
        {
          name: 'Summary',
          columns: [
            { header: 'Particulars', key: 'label', width: 2 },
            { header: 'Amount', key: 'amount', format: 'currency' },
          ],
          rows: [
            { label: 'Total income', amount: data.totalIncome },
            { label: 'Total expenses', amount: data.totalExpenses },
          ],
          totalsRow: {
            label: data.netProfit >= 0 ? 'Net profit' : 'Net loss',
            amount: Math.abs(data.netProfit),
          },
        },
      ],
    };
  }

  private async balanceSheet(companyId: string, q: ExportQuery): Promise<TableDoc> {
    const data = await this.reports.balanceSheet(companyId, q.asOf);
    const columns = [
      { header: 'Ledger', key: 'ledger', width: 2 },
      { header: 'Group', key: 'group', width: 1.5 },
      { header: 'Amount', key: 'amount', format: 'currency' as const },
    ];
    return {
      title: 'Balance Sheet',
      subtitle: `As of ${data.asOf}`,
      fileName: `balance-sheet-${data.asOf}`,
      sheets: [
        {
          name: 'Liabilities & Capital',
          columns,
          rows: [
            ...data.liabilities,
            { ledger: 'Profit & Loss A/c', group: '—', amount: data.profitAndLoss },
          ],
          totalsRow: { ledger: 'Total', amount: data.totalLiabilities },
        },
        {
          name: 'Assets',
          columns,
          rows: data.assets,
          totalsRow: { ledger: 'Total', amount: data.totalAssets },
        },
      ],
    };
  }

  private async gstr1(companyId: string, q: ExportQuery): Promise<TableDoc> {
    const data = await this.reports.gstr1(companyId, q.from, q.to);
    return {
      title: 'GSTR-1 — Outward Supplies',
      subtitle: `${data.from} to ${data.to}`,
      fileName: `gstr1-${data.from}-to-${data.to}`,
      sheets: [
        {
          name: 'B2B',
          columns: [
            { header: 'GSTIN of Recipient', key: 'gstin', width: 1.6 },
            { header: 'Receiver Name', key: 'party', width: 1.8 },
            { header: 'Invoice Number', key: 'invoiceNo', width: 1.4 },
            { header: 'Invoice Date', key: 'date', format: 'date' },
            { header: 'Place Of Supply', key: 'placeOfSupply' },
            { header: 'Invoice Value', key: 'total', format: 'currency' },
            { header: 'Taxable Value', key: 'taxable', format: 'currency' },
            { header: 'CGST', key: 'cgst', format: 'currency' },
            { header: 'SGST', key: 'sgst', format: 'currency' },
            { header: 'IGST', key: 'igst', format: 'currency' },
          ],
          rows: data.b2b,
          totalsRow: {
            gstin: 'Total',
            taxable: data.totals.taxable,
            cgst: data.totals.cgst,
            sgst: data.totals.sgst,
            igst: data.totals.igst,
          },
        },
        {
          name: 'B2C',
          columns: [
            { header: 'Place Of Supply', key: 'placeOfSupply' },
            { header: 'Taxable Value', key: 'taxable', format: 'currency' },
            { header: 'Tax Amount', key: 'tax', format: 'currency' },
          ],
          rows: data.b2c,
        },
        {
          name: 'HSN Summary',
          columns: [
            { header: 'HSN', key: 'hsn' },
            { header: 'Total Quantity', key: 'qty', format: 'number' },
            { header: 'Taxable Value', key: 'taxable', format: 'currency' },
            { header: 'CGST', key: 'cgst', format: 'currency' },
            { header: 'SGST', key: 'sgst', format: 'currency' },
            { header: 'IGST', key: 'igst', format: 'currency' },
          ],
          rows: data.hsnSummary,
        },
      ],
    };
  }

  private async gstr3b(companyId: string, q: ExportQuery): Promise<TableDoc> {
    const data = await this.reports.gstr3b(companyId, q.from, q.to);
    return {
      title: 'GSTR-3B Summary',
      subtitle: `${data.from} to ${data.to}`,
      fileName: `gstr3b-${data.from}-to-${data.to}`,
      sheets: [
        {
          name: 'GSTR-3B',
          columns: [
            { header: 'Section', key: 'section', width: 2.5 },
            { header: 'Taxable Value', key: 'taxable', format: 'currency' },
            { header: 'CGST', key: 'cgst', format: 'currency' },
            { header: 'SGST', key: 'sgst', format: 'currency' },
            { header: 'IGST', key: 'igst', format: 'currency' },
          ],
          rows: [
            { section: '3.1(a) Outward taxable supplies', ...data.outwardSupplies },
            { section: '4(A) Eligible ITC', ...data.eligibleItc },
            { section: 'Net payable (liability − ITC)', taxable: null, ...data.netPayable },
          ],
        },
      ],
    };
  }

  private async invoiceRegister(companyId: string): Promise<TableDoc> {
    const invoices = await this.invoices.list(companyId);
    return {
      title: 'Sales Invoice Register',
      fileName: `invoice-register-${today()}`,
      sheets: [
        {
          name: 'Invoices',
          columns: [
            { header: 'Invoice No', key: 'invoiceNo', width: 1.4 },
            { header: 'Date', key: 'date', format: 'date' },
            { header: 'Customer', key: 'customer', width: 1.8 },
            { header: 'GSTIN', key: 'gstin', width: 1.5 },
            { header: 'Taxable', key: 'taxableAmount', format: 'currency' },
            { header: 'CGST', key: 'cgstAmount', format: 'currency' },
            { header: 'SGST', key: 'sgstAmount', format: 'currency' },
            { header: 'IGST', key: 'igstAmount', format: 'currency' },
            { header: 'Total', key: 'total', format: 'currency' },
            { header: 'Paid', key: 'paidAmount', format: 'currency' },
            { header: 'Returns', key: 'creditNotesTotal', format: 'currency' },
            { header: 'Outstanding', key: 'outstanding', format: 'currency' },
            { header: 'Status', key: 'paymentStatus' },
          ],
          rows: invoices.map((inv) => ({
            ...inv,
            customer: inv.party.name,
            gstin: inv.party.gstin,
          })),
        },
      ],
    };
  }

  private async estimatesRegister(companyId: string): Promise<TableDoc> {
    const estimates = await this.estimates.list(companyId);
    return {
      title: 'Estimates Register',
      fileName: `estimates-register-${today()}`,
      sheets: [
        {
          name: 'Estimates',
          columns: [
            { header: 'Estimate No', key: 'estimateNo', width: 1.4 },
            { header: 'Date', key: 'date', format: 'date' },
            { header: 'Customer', key: 'customer', width: 1.8 },
            { header: 'GSTIN', key: 'gstin', width: 1.5 },
            { header: 'Taxable', key: 'taxableAmount', format: 'currency' },
            { header: 'CGST', key: 'cgstAmount', format: 'currency' },
            { header: 'SGST', key: 'sgstAmount', format: 'currency' },
            { header: 'IGST', key: 'igstAmount', format: 'currency' },
            { header: 'Total', key: 'total', format: 'currency' },
            { header: 'Status', key: 'status' },
          ],
          rows: estimates.map((est) => ({
            ...est,
            customer: est.party.name,
            gstin: est.party.gstin,
          })),
        },
      ],
    };
  }

  private async purchaseRegister(companyId: string): Promise<TableDoc> {
    const bills = await this.purchases.list(companyId);
    return {
      title: 'Purchase Register',
      fileName: `purchase-register-${today()}`,
      sheets: [
        {
          name: 'Purchases',
          columns: [
            { header: 'Bill No', key: 'billNo', width: 1.4 },
            { header: 'Vendor Bill No', key: 'supplierBillNo', width: 1.2 },
            { header: 'Date', key: 'date', format: 'date' },
            { header: 'Vendor', key: 'vendor', width: 1.8 },
            { header: 'GSTIN', key: 'gstin', width: 1.5 },
            { header: 'Taxable', key: 'taxableAmount', format: 'currency' },
            { header: 'CGST', key: 'cgstAmount', format: 'currency' },
            { header: 'SGST', key: 'sgstAmount', format: 'currency' },
            { header: 'IGST', key: 'igstAmount', format: 'currency' },
            { header: 'Total', key: 'total', format: 'currency' },
            { header: 'Paid', key: 'paidAmount', format: 'currency' },
            { header: 'Returns', key: 'debitNotesTotal', format: 'currency' },
            { header: 'Outstanding', key: 'outstanding', format: 'currency' },
            { header: 'Status', key: 'paymentStatus' },
          ],
          rows: bills.map((bill) => ({
            ...bill,
            vendor: bill.party.name,
            gstin: bill.party.gstin,
          })),
        },
      ],
    };
  }

  private async stockReport(companyId: string): Promise<TableDoc> {
    const stock = await this.purchases.stockReport(companyId);
    return {
      title: 'Stock Report',
      subtitle: `As of ${today()}`,
      fileName: `stock-${today()}`,
      sheets: [
        {
          name: 'Stock',
          columns: [
            { header: 'Item', key: 'name', width: 2 },
            { header: 'HSN', key: 'hsnCode' },
            { header: 'Unit', key: 'unit' },
            { header: 'Opening', key: 'openingStock', format: 'number' },
            { header: 'Purchased', key: 'purchasedQty', format: 'number' },
            { header: 'Sold', key: 'soldQty', format: 'number' },
            { header: 'On Hand', key: 'onHand', format: 'number' },
            { header: 'Avg Rate', key: 'avgRate', format: 'currency' },
            { header: 'Stock Value', key: 'stockValue', format: 'currency' },
            { header: 'Low Stock', key: 'low' },
          ],
          rows: stock.map((s) => ({ ...s, low: s.lowStock ? 'YES' : '' })),
          totalsRow: {
            name: 'Total',
            stockValue: Math.round(stock.reduce((sum, s) => sum + s.stockValue, 0) * 100) / 100,
          },
        },
      ],
    };
  }

  private async ledgerStatement(companyId: string, q: ExportQuery): Promise<TableDoc> {
    if (!q.ledgerId) {
      throw new BadRequestException('ledgerId is required for ledger-statement export');
    }
    const data = await this.accounting.ledgerStatement(
      companyId,
      q.ledgerId,
      q.from,
      q.to,
    );
    return {
      title: `Ledger Statement — ${data.ledger.name}`,
      subtitle: `${q.from ?? 'Beginning'} to ${q.to ?? today()} · Group: ${data.ledger.group.name}`,
      fileName: `ledger-${data.ledger.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${today()}`,
      sheets: [
        {
          name: 'Statement',
          columns: [
            { header: 'Date', key: 'date', format: 'date' },
            { header: 'Voucher', key: 'voucherNo', width: 1.4 },
            { header: 'Narration', key: 'narration', width: 2.5 },
            { header: 'Debit', key: 'debit', format: 'currency' },
            { header: 'Credit', key: 'credit', format: 'currency' },
            { header: 'Balance', key: 'balance', format: 'currency' },
            { header: 'Dr/Cr', key: 'balanceType' },
          ],
          rows: [
            {
              voucherNo: 'Opening balance',
              balance: data.openingBalance,
              balanceType: data.openingType === 'DEBIT' ? 'Dr' : 'Cr',
            },
            ...data.entries.map((e) => ({
              date: e.date,
              voucherNo: e.voucherNo,
              narration: e.narration,
              debit: e.type === 'DEBIT' ? e.amount : null,
              credit: e.type === 'CREDIT' ? e.amount : null,
              balance: e.runningBalance,
              balanceType: e.runningBalanceType === 'DEBIT' ? 'Dr' : 'Cr',
            })),
          ],
          totalsRow: {
            voucherNo: 'Closing balance',
            balance: data.closingBalance,
            balanceType: data.closingType === 'DEBIT' ? 'Dr' : 'Cr',
          },
        },
      ],
    };
  }

  private async estimateReportExport(companyId: string): Promise<TableDoc> {
    const data = await this.reports.estimateReport(companyId);
    return {
      title: 'Estimate Report',
      fileName: `estimate-report-${today()}`,
      sheets: [
        {
          name: 'Estimate Report',
          columns: [
            { header: 'Date', key: 'date', format: 'date' },
            { header: 'Description', key: 'description', width: 3 },
            { header: 'Debit', key: 'debit', format: 'currency' },
            { header: 'Credit', key: 'credit', format: 'currency' },
          ],
          rows: data.rows,
        },
      ],
    };
  }

  private async salesReportExport(companyId: string): Promise<TableDoc> {
    const data = await this.reports.salesReport(companyId);
    return {
      title: 'Sales Report',
      fileName: `sales-report-${today()}`,
      sheets: [
        {
          name: 'Sales Report',
          columns: [
            { header: 'Date', key: 'date', format: 'date' },
            { header: 'Description', key: 'description', width: 3 },
            { header: 'Debit', key: 'debit', format: 'currency' },
            { header: 'Credit', key: 'credit', format: 'currency' },
          ],
          rows: data.rows,
        },
      ],
    };
  }
}
