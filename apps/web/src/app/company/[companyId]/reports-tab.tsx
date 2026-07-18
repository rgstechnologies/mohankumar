'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ExportButtons } from '@/components/table';
import { useFeedback } from '@/components/feedback';
import { Button, Card, HelpTip } from '@/components/ui';
import { inr } from '@/lib/accounting';
import { api, ApiError, downloadFile } from '@/lib/api';

type Report = 'gstr1';

const REPORTS: Report[] = ['gstr1'];

export function ReportsTab({ companyId }: { companyId: string }) {
  const t = useTranslations('reports');
  const [report, setReport] = useState<Report>('gstr1');
  // Data is tagged with the report it belongs to — switching reports renders
  // the loading state until the matching response arrives, and a slow stale
  // response can never be shown under the wrong report.
  const [data, setData] = useState<{
    report: Report;
    payload: Record<string, unknown>;
  } | null>(null);

  const load = useCallback(async () => {
    const payload = await api.get<Record<string, unknown>>(
      `/companies/${companyId}/reports/${report}`,
    );
    setData({ report, payload });
  }, [companyId, report]);

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
          {report === 'gstr1' && <PortalJsonButton companyId={companyId} />}
          <ExportButtons companyId={companyId} report={report} />
        </div>
      </div>

      {!current ? (
        <p className="text-sm text-muted">{t('loadingReport')}</p>
      ) : (
        <Gstr1 data={current as never} />
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
