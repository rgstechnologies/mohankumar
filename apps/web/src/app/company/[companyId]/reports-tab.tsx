'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ExportButtons } from '@/components/table';
import { useFeedback } from '@/components/feedback';
import { Button, Card, HelpTip } from '@/components/ui';
import { inr } from '@/lib/accounting';
import { api, ApiError, downloadFile } from '@/lib/api';

type Report = 'trial-balance' | 'profit-loss' | 'balance-sheet' | 'gstr1' | 'gstr3b';

const REPORTS: Report[] = ['trial-balance', 'profit-loss', 'balance-sheet', 'gstr1', 'gstr3b'];

export function ReportsTab({ companyId }: { companyId: string }) {
  const t = useTranslations('reports');
  const [report, setReport] = useState<Report>('trial-balance');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  // Data is tagged with the report it belongs to — switching reports renders
  // the loading state until the matching response arrives, and a slow stale
  // response can never be shown under the wrong report.
  const [data, setData] = useState<{
    report: Report;
    payload: Record<string, unknown>;
  } | null>(null);

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    if (fromDate) params.set('from', fromDate);
    if (toDate) params.set('to', toDate);
    const qs = params.toString() ? `?${params.toString()}` : '';
    const payload = await api.get<Record<string, unknown>>(
      `/companies/${companyId}/reports/${report}${qs}`,
    );
    setData({ report, payload });
  }, [companyId, report, fromDate, toDate]);

  useEffect(() => {
    void load();
  }, [load]);

  const current = data && data.report === report ? data.payload : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1 rounded-lg border border-line bg-surface p-1">
          {REPORTS.map((r) => (
            <button
              key={r}
              onClick={() => setReport(r)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                report === r ? 'bg-brand-600 text-white' : 'text-muted hover:bg-subtle'
              }`}
            >
              {t(`picker.${r}`)}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            placeholder="From Date"
            className="rounded-lg border border-line-strong bg-surface px-2 py-1.5 text-xs shadow-sm outline-none focus:border-brand-500"
            aria-label="From Date"
          />
          <input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            placeholder="To Date"
            className="rounded-lg border border-line-strong bg-surface px-2 py-1.5 text-xs shadow-sm outline-none focus:border-brand-500"
            aria-label="To Date"
          />
          {report === 'gstr1' && <PortalJsonButton companyId={companyId} />}
          <ExportButtons
            companyId={companyId}
            report={report}
            params={{ from: fromDate || undefined, to: toDate || undefined }}
          />
        </div>
      </div>

      {!current ? (
        <p className="text-sm text-muted">{t('loadingReport')}</p>
      ) : report === 'trial-balance' ? (
        <TrialBalance data={current as never} />
      ) : report === 'profit-loss' ? (
        <ProfitLoss data={current as never} />
      ) : report === 'balance-sheet' ? (
        <BalanceSheet data={current as never} />
      ) : report === 'gstr1' ? (
        <Gstr1 data={current as never} />
      ) : (
        <Gstr3b data={current as never} />
      )}
    </div>
  );
}

/** One-click GSTR-1 JSON for the GST portal's offline tool — no GSP needed. */
function PortalJsonButton({ companyId }: { companyId: string }) {
  const t = useTranslations('reports');
  const { toast } = useFeedback();
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [busy, setBusy] = useState(false);

  async function onDownload() {
    setBusy(true);
    try {
      await downloadFile(`/companies/${companyId}/exports/gstr1-json?month=${month}`);
      toast(t('portalJson.done'));
    } catch (err) {
      toast(err instanceof ApiError ? err.message : t('portalJson.failed'), 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="flex items-center gap-1.5">
      <input
        type="month"
        value={month}
        onChange={(e) => setMonth(e.target.value)}
        className="rounded-lg border border-line-strong bg-surface px-2 py-1.5 text-sm shadow-sm outline-none focus:border-brand-500"
        aria-label={t('portalJson.month')}
      />
      <Button variant="secondary" onClick={() => void onDownload()} disabled={busy || !month}>
        {busy ? '…' : t('portalJson.download')}
      </Button>
      <HelpTip text={t('portalJson.hint')} />
    </span>
  );
}

function TrialBalance({
  data,
}: {
  data: {
    asOf: string;
    rows: { ledgerId: string; ledger: string; group: string; debit: number; credit: number }[];
    totalDebit: number;
    totalCredit: number;
  };
}) {
  const t = useTranslations('reports');
  const tc = useTranslations('common');
  return (
    <Card>
      <h3 className="mb-3 text-sm font-semibold">{t('trialBalanceAsOf', { date: data.asOf })}</h3>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-line bg-subtle text-left text-[11px] font-semibold uppercase tracking-wide text-muted">
            <th className="py-2">{t('ledger')}</th>
            <th className="py-2">{t('group')}</th>
            <th className="py-2 text-right">{t('debit')}</th>
            <th className="py-2 text-right">{t('credit')}</th>
          </tr>
        </thead>
        <tbody>
          {data.rows.map((row) => (
            <tr key={row.ledgerId} className="border-b border-line hover:bg-subtle">
              <td className="py-1.5">{row.ledger}</td>
              <td className="py-1.5 text-muted">{row.group}</td>
              <td className="py-1.5 text-right tabular-nums">
                {row.debit > 0 ? inr(row.debit) : ''}
              </td>
              <td className="py-1.5 text-right tabular-nums">
                {row.credit > 0 ? inr(row.credit) : ''}
              </td>
            </tr>
          ))}
          <tr className="border-t-2 border-line-strong font-bold">
            <td className="py-2" colSpan={2}>
              {tc('total')}
            </td>
            <td className="py-2 text-right tabular-nums">₹{inr(data.totalDebit)}</td>
            <td className="py-2 text-right tabular-nums">₹{inr(data.totalCredit)}</td>
          </tr>
        </tbody>
      </table>
    </Card>
  );
}

function ProfitLoss({
  data,
}: {
  data: {
    from: string;
    to: string;
    income: { ledger: string; amount: number }[];
    expenses: { ledger: string; amount: number }[];
    totalIncome: number;
    totalExpenses: number;
    netProfit: number;
  };
}) {
  const t = useTranslations('reports');
  return (
    <Card>
      <h3 className="mb-3 text-sm font-semibold">
        {t('profitLossRange', { from: data.from, to: data.to })}
      </h3>
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        <div>
          <h4 className="mb-2 text-xs font-semibold uppercase text-faint">{t('income')}</h4>
          {data.income.map((row) => (
            <div key={row.ledger} className="flex justify-between border-b border-slate-50 py-1.5 text-sm">
              <span>{row.ledger}</span>
              <span className="tabular-nums">₹{inr(row.amount)}</span>
            </div>
          ))}
          <div className="flex justify-between py-2 text-sm font-bold">
            <span>{t('totalIncome')}</span>
            <span className="tabular-nums">₹{inr(data.totalIncome)}</span>
          </div>
        </div>
        <div>
          <h4 className="mb-2 text-xs font-semibold uppercase text-faint">{t('expenses')}</h4>
          {data.expenses.map((row) => (
            <div key={row.ledger} className="flex justify-between border-b border-slate-50 py-1.5 text-sm">
              <span>{row.ledger}</span>
              <span className="tabular-nums">₹{inr(row.amount)}</span>
            </div>
          ))}
          <div className="flex justify-between py-2 text-sm font-bold">
            <span>{t('totalExpenses')}</span>
            <span className="tabular-nums">₹{inr(data.totalExpenses)}</span>
          </div>
        </div>
      </div>
      <div
        className={`mt-4 rounded-lg p-3 text-center text-sm font-bold ${
          data.netProfit >= 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'
        }`}
      >
        {data.netProfit >= 0 ? t('netProfit') : t('netLoss')}: ₹{inr(Math.abs(data.netProfit))}
      </div>
    </Card>
  );
}

function BalanceSheet({
  data,
}: {
  data: {
    asOf: string;
    assets: { ledger: string; amount: number }[];
    liabilities: { ledger: string; amount: number }[];
    profitAndLoss: number;
    totalAssets: number;
    totalLiabilities: number;
  };
}) {
  const t = useTranslations('reports');
  const tc = useTranslations('common');
  return (
    <Card>
      <h3 className="mb-3 text-sm font-semibold">{t('balanceSheetAsOf', { date: data.asOf })}</h3>
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        <div>
          <h4 className="mb-2 text-xs font-semibold uppercase text-faint">
            {t('liabilitiesCapital')}
          </h4>
          {data.liabilities.map((row) => (
            <div key={row.ledger} className="flex justify-between border-b border-slate-50 py-1.5 text-sm">
              <span>{row.ledger}</span>
              <span className="tabular-nums">₹{inr(row.amount)}</span>
            </div>
          ))}
          <div className="flex justify-between border-b border-slate-50 py-1.5 text-sm">
            <span>{t('profitLossAccount')}</span>
            <span className="tabular-nums">₹{inr(data.profitAndLoss)}</span>
          </div>
          <div className="flex justify-between py-2 text-sm font-bold">
            <span>{tc('total')}</span>
            <span className="tabular-nums">₹{inr(data.totalLiabilities)}</span>
          </div>
        </div>
        <div>
          <h4 className="mb-2 text-xs font-semibold uppercase text-faint">{t('assets')}</h4>
          {data.assets.map((row) => (
            <div key={row.ledger} className="flex justify-between border-b border-slate-50 py-1.5 text-sm">
              <span>{row.ledger}</span>
              <span className="tabular-nums">₹{inr(row.amount)}</span>
            </div>
          ))}
          <div className="flex justify-between py-2 text-sm font-bold">
            <span>{tc('total')}</span>
            <span className="tabular-nums">₹{inr(data.totalAssets)}</span>
          </div>
        </div>
      </div>
    </Card>
  );
}

function Gstr1({
  data,
}: {
  data: {
    from: string;
    to: string;
    b2b: {
      invoiceNo: string;
      date: string;
      gstin: string;
      party: string;
      taxable: number;
      cgst: number;
      sgst: number;
      igst: number;
      total: number;
    }[];
    b2c: { placeOfSupply: string; taxable: number; tax: number }[];
    hsnSummary: { hsn: string; qty: number; taxable: number; cgst: number; sgst: number; igst: number }[];
    totals: { invoices: number; taxable: number; cgst: number; sgst: number; igst: number };
  };
}) {
  const t = useTranslations('reports');
  const tc = useTranslations('common');
  return (
    <div className="space-y-4">
      <Card>
        <h3 className="mb-3 text-sm font-semibold">
          {t('gstr1Header', { from: data.from, to: data.to, count: data.totals.invoices })}
        </h3>
        <h4 className="mb-2 text-xs font-semibold uppercase text-faint">
          {t('b2bSupplies')}
        </h4>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line bg-subtle text-left text-[11px] font-semibold uppercase tracking-wide text-muted">
              <th className="py-2">{t('invoice')}</th>
              <th className="py-2">GSTIN</th>
              <th className="py-2 text-right">{t('taxable')}</th>
              <th className="py-2 text-right">CGST</th>
              <th className="py-2 text-right">SGST</th>
              <th className="py-2 text-right">IGST</th>
              <th className="py-2 text-right">{tc('total')}</th>
            </tr>
          </thead>
          <tbody>
            {data.b2b.map((row) => (
              <tr key={row.invoiceNo} className="border-b border-line hover:bg-subtle">
                <td className="py-1.5 font-mono text-xs">{row.invoiceNo}</td>
                <td className="py-1.5 font-mono text-xs">{row.gstin}</td>
                <td className="py-1.5 text-right tabular-nums">{inr(row.taxable)}</td>
                <td className="py-1.5 text-right tabular-nums">{inr(row.cgst)}</td>
                <td className="py-1.5 text-right tabular-nums">{inr(row.sgst)}</td>
                <td className="py-1.5 text-right tabular-nums">{inr(row.igst)}</td>
                <td className="py-1.5 text-right tabular-nums">{inr(row.total)}</td>
              </tr>
            ))}
            <tr className="border-t-2 border-line-strong font-bold">
              <td className="py-2" colSpan={2}>
                {t('totals')}
              </td>
              <td className="py-2 text-right tabular-nums">₹{inr(data.totals.taxable)}</td>
              <td className="py-2 text-right tabular-nums">₹{inr(data.totals.cgst)}</td>
              <td className="py-2 text-right tabular-nums">₹{inr(data.totals.sgst)}</td>
              <td className="py-2 text-right tabular-nums">₹{inr(data.totals.igst)}</td>
              <td />
            </tr>
          </tbody>
        </table>
      </Card>

      <Card>
        <h4 className="mb-2 text-xs font-semibold uppercase text-faint">
          {t('hsnSummary')}
        </h4>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line bg-subtle text-left text-[11px] font-semibold uppercase tracking-wide text-muted">
              <th className="py-2">HSN</th>
              <th className="py-2 text-right">{t('qty')}</th>
              <th className="py-2 text-right">{t('taxable')}</th>
              <th className="py-2 text-right">CGST</th>
              <th className="py-2 text-right">SGST</th>
              <th className="py-2 text-right">IGST</th>
            </tr>
          </thead>
          <tbody>
            {data.hsnSummary.map((row) => (
              <tr key={row.hsn} className="border-b border-line hover:bg-subtle">
                <td className="py-1.5 font-mono text-xs">{row.hsn}</td>
                <td className="py-1.5 text-right tabular-nums">{row.qty}</td>
                <td className="py-1.5 text-right tabular-nums">{inr(row.taxable)}</td>
                <td className="py-1.5 text-right tabular-nums">{inr(row.cgst)}</td>
                <td className="py-1.5 text-right tabular-nums">{inr(row.sgst)}</td>
                <td className="py-1.5 text-right tabular-nums">{inr(row.igst)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

function Gstr3b({
  data,
}: {
  data: {
    from: string;
    to: string;
    outwardSupplies: { taxable: number; cgst: number; sgst: number; igst: number };
    eligibleItc: { taxable: number; cgst: number; sgst: number; igst: number };
    netPayable: { cgst: number; sgst: number; igst: number };
  };
}) {
  const t = useTranslations('reports');
  const Row = ({ label, v }: { label: string; v: { taxable?: number; cgst: number; sgst: number; igst: number } }) => (
    <tr className="border-b border-line hover:bg-subtle">
      <td className="py-2">{label}</td>
      <td className="py-2 text-right tabular-nums">{v.taxable !== undefined ? inr(v.taxable) : '—'}</td>
      <td className="py-2 text-right tabular-nums">{inr(v.cgst)}</td>
      <td className="py-2 text-right tabular-nums">{inr(v.sgst)}</td>
      <td className="py-2 text-right tabular-nums">{inr(v.igst)}</td>
    </tr>
  );
  return (
    <Card>
      <h3 className="mb-3 text-sm font-semibold">
        {t('gstr3bHeader', { from: data.from, to: data.to })}
      </h3>
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-line bg-subtle text-left text-[11px] font-semibold uppercase tracking-wide text-muted">
            <th className="py-2">{t('section')}</th>
            <th className="py-2 text-right">{t('taxable')}</th>
            <th className="py-2 text-right">CGST</th>
            <th className="py-2 text-right">SGST</th>
            <th className="py-2 text-right">IGST</th>
          </tr>
        </thead>
        <tbody>
          <Row label={t('gstr3bOutwardSupplies')} v={data.outwardSupplies} />
          <Row label={t('gstr3bEligibleItc')} v={data.eligibleItc} />
          <Row label={t('gstr3bNetPayable')} v={data.netPayable} />
        </tbody>
      </table>
      <p className="mt-3 text-xs text-faint">{t('gstr3bNote')}</p>
    </Card>
  );
}
