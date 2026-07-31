'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ExportButtons } from '@/components/table';
import { useFeedback } from '@/components/feedback';
import { Button, Card, HelpTip, Badge, Input, Label, Combobox } from '@/components/ui';
import { fetchParties, inr, type PartyRow } from '@/lib/accounting';
import { api, ApiError, downloadFile } from '@/lib/api';

type Report = 'gstr1' | 'estimates' | 'sales';

const REPORTS: Report[] = ['gstr1', 'estimates', 'sales'];

/** Start/end of the current Indian financial year (1 Apr – 31 Mar). */
function currentFinancialYear(): { from: string; to: string } {
  const now = new Date();
  const startYear = now.getMonth() + 1 >= 4 ? now.getFullYear() : now.getFullYear() - 1;
  return { from: `${startYear}-04-01`, to: `${startYear + 1}-03-31` };
}

export function ReportsTab({ companyId }: { companyId: string }) {
  const t = useTranslations('reports');
  const [report, setReport] = useState<Report>('gstr1');
  // The Estimate/Sales reports are scoped to a date range (defaults to the
  // current financial year). GSTR-1 has its own month selector and ignores it.
  const [range, setRange] = useState(currentFinancialYear);
  const dateScoped = report === 'estimates' || report === 'sales';

  // Customer (party) filter — only shown for date-scoped reports.
  const [parties, setParties] = useState<PartyRow[]>([]);
  const [partyId, setPartyId] = useState('');

  // Load parties once for the customer filter dropdown.
  useEffect(() => {
    fetchParties(companyId)
      .then((list) => setParties(list.filter((p) => p.type === 'CUSTOMER')))
      .catch(() => { /* ignore — filter just won't populate */ });
  }, [companyId]);

  // Reset party filter when switching report type.
  useEffect(() => {
    if (!dateScoped) setPartyId('');
  }, [report, dateScoped]);

  // Data is tagged with the report it belongs to — switching reports renders
  // the loading state until the matching response arrives, and a slow stale
  // response can never be shown under the wrong report.
  const [data, setData] = useState<{
    report: Report;
    payload: Record<string, unknown>;
  } | null>(null);

  const load = useCallback(async () => {
    const scoped = report === 'estimates' || report === 'sales';
    const params = new URLSearchParams();
    if (scoped) {
      params.set('from', range.from);
      params.set('to', range.to);
    }
    if (scoped && partyId) params.set('partyId', partyId);
    const qs = params.toString() ? `?${params.toString()}` : '';
    const payload = await api.get<Record<string, unknown>>(
      `/companies/${companyId}/reports/${report}${qs}`,
    );
    setData({ report, payload });
  }, [companyId, report, range.from, range.to, partyId]);

  useEffect(() => {
    void load();
  }, [load]);

  const current = data && data.report === report ? data.payload : null;

  // Build export params including customer filter.
  const exportParams: Record<string, string | undefined> = dateScoped
    ? { from: range.from, to: range.to, ...(partyId ? { partyId } : {}) }
    : {};

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
          {report === 'gstr1' && <PortalJsonButton companyId={companyId} />}
          <ExportButtons
            companyId={companyId}
            report={report === 'estimates' ? 'estimate-report' : report === 'sales' ? 'sales-report' : report}
            params={exportParams}
          />
        </div>
      </div>

      {dateScoped && (
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <Label>{t('range.from')}</Label>
            <Input
              type="date"
              value={range.from}
              max={range.to}
              onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))}
            />
          </div>
          <div>
            <Label>{t('range.to')}</Label>
            <Input
              type="date"
              value={range.to}
              min={range.from}
              onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))}
            />
          </div>
          <Button variant="secondary" onClick={() => setRange(currentFinancialYear())}>
            {t('range.currentFy')}
          </Button>

          {/* Customer filter */}
          <div className="min-w-[240px]">
            <Label>Customer</Label>
            <Combobox
              value={partyId}
              onChange={setPartyId}
              placeholder="All customers"
              options={[
                { value: '', label: 'All customers' },
                ...parties.map((p) => ({
                  value: p.id,
                  label: p.name,
                  hint: p.gstin || undefined,
                })),
              ]}
            />
          </div>

          {partyId && (
            <Button variant="secondary" onClick={() => setPartyId('')}>
              Clear filter
            </Button>
          )}
        </div>
      )}

      {!current ? (
        <p className="text-sm text-muted">{t('loadingReport')}</p>
      ) : report === 'gstr1' ? (
        <Gstr1 data={current as never} />
      ) : report === 'estimates' ? (
        <CreditDebitReport title={t('picker.estimates')} data={current as never} />
      ) : (
        <CreditDebitReport title={t('picker.sales')} data={current as never} />
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

interface CreditDebitRow {
  id: string;
  date: string;
  description: string;
  debit: number;
  credit: number;
}

interface CreditDebitReportData {
  rows: CreditDebitRow[];
  totalDebit: number;
  totalCredit: number;
  netAmount: number;
}

function CreditDebitReport({
  title,
  data,
}: {
  title: string;
  data: CreditDebitReportData;
}) {
  const t = useTranslations('reports');
  const tc = useTranslations('common');
  const td = useTranslations('docEntry');

  return (
    <div className="space-y-6">
      {/* Metrics Banner */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {/* Debit metric */}
        <Card className="flex flex-col justify-between transition-shadow hover:shadow-md">
          <div>
            <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-muted">
              <span>{t('totalDebit')}</span>
              <span className="text-rose-500">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                </svg>
              </span>
            </div>
            <div className="mt-2 text-2xl font-bold text-ink tabular-nums">
              ₹{inr(data.totalDebit)}
            </div>
          </div>
          <p className="mt-2 text-[11px] text-faint">Cumulative charges &amp; bills billed</p>
        </Card>

        {/* Credit metric */}
        <Card className="flex flex-col justify-between transition-shadow hover:shadow-md">
          <div>
            <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-muted">
              <span>{t('totalCredit')}</span>
              <span className="text-emerald-500">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 10l7-7m0 0l7 7m-7-7v18" />
                </svg>
              </span>
            </div>
            <div className="mt-2 text-2xl font-bold text-ink tabular-nums">
              ₹{inr(data.totalCredit)}
            </div>
          </div>
          <p className="mt-2 text-[11px] text-faint">Cumulative payments received</p>
        </Card>

        {/* Net Money metric */}
        <div className={`flex flex-col justify-between rounded-xl border p-5 shadow-[0_1px_2px_rgba(16,24,40,0.04),0_1px_3px_rgba(16,24,40,0.06)] transition-shadow hover:shadow-md ${
          data.netAmount >= 0 
            ? 'border-emerald-200 bg-emerald-50/40 text-emerald-800' 
            : 'border-rose-200 bg-rose-50/40 text-rose-800'
        }`}>
          <div>
            <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider opacity-85">
              <span>{t('totalMoney')}</span>
              <span>
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </span>
            </div>
            <div className="mt-2 text-2xl font-extrabold tabular-nums">
              {data.netAmount < 0 ? '− ' : ''}₹{inr(Math.abs(data.netAmount))}
            </div>
          </div>
          <p className="mt-2 text-[11px] opacity-75">Net cash position (Credit − Debit)</p>
        </div>
      </div>

      {/* Main Table Card */}
      <Card 
        title={title} 
        action={
          <span className="rounded-full bg-subtle px-2.5 py-0.5 text-xs font-semibold text-muted">
            {data.rows.length} {data.rows.length === 1 ? 'record' : 'records'}
          </span>
        }
      >
        <div className="overflow-x-auto -mx-5 -mb-5">
          <table className="w-full min-w-[650px] text-sm">
            <thead>
              <tr className="border-b border-line bg-subtle/50 text-left text-[11px] font-semibold uppercase tracking-wider text-muted">
                <th className="py-2.5 pl-5 w-32">{tc('date')}</th>
                <th className="py-2.5 w-40">{tc('type') || 'Transaction'}</th>
                <th className="py-2.5 pl-2">{td('description')}</th>
                <th className="py-2.5 text-right pr-6 w-36">{t('debit')}</th>
                <th className="py-2.5 text-right pr-5 w-36">{t('credit')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {data.rows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-muted">
                    <div className="flex flex-col items-center justify-center space-y-2">
                      <svg className="h-8 w-8 text-faint" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      <span className="text-sm font-medium">{t('noRecords') || 'No transaction records found'}</span>
                    </div>
                  </td>
                </tr>
              ) : (
                data.rows.map((row) => {
                  const isDebit = row.debit > 0;
                  return (
                    <tr 
                      key={row.id} 
                      className="group transition-colors hover:bg-subtle/40"
                    >
                      <td className="py-3 pl-5 text-muted font-medium">
                        {new Date(row.date).toLocaleDateString('en-IN', {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric'
                        })}
                      </td>
                      <td className="py-3">
                        <Badge tone={isDebit ? 'bad' : 'good'}>
                          {isDebit ? t('debit') : t('credit')}
                        </Badge>
                      </td>
                      <td className="py-3 pl-2 font-medium text-ink group-hover:text-brand-700 transition-colors">
                        {row.description}
                      </td>
                      <td className="py-3 text-right pr-6 tabular-nums font-semibold text-rose-600 dark:text-rose-400">
                        {isDebit ? `₹${inr(row.debit)}` : '—'}
                      </td>
                      <td className="py-3 text-right pr-5 tabular-nums font-semibold text-emerald-600 dark:text-emerald-400">
                        {!isDebit ? `₹${inr(row.credit)}` : '—'}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
