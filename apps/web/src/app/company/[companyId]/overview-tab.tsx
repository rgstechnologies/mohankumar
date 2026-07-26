'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Badge, Card } from '@/components/ui';
import { inr } from '@/lib/accounting';
import { api } from '@/lib/api';

interface Dashboard {
  fiscalYear: string;
  monthly: { month: string; label: string; sales: number; purchases: number }[];
  salesThisMonth: number;
  invoicesThisMonth: number;
  salesThisFY: number;
  invoicesThisFY: number;
  purchasesThisMonth?: number;
  cashBank: number;
  receivables: number;
  payables: number;
  outstandingInvoiceAmount: number;
  lowStockCount: number;
  recentInvoices: {
    id: string;
    invoiceNo: string;
    date: string;
    party: string;
    total: number;
    status: string;
  }[];
}

const CHIP: Record<string, string> = {
  brand: 'bg-brand-100 text-brand-600',
  emerald: 'bg-emerald-100 text-emerald-600',
  amber: 'bg-amber-100 text-amber-600',
  slate: 'bg-subtle text-muted',
};

function Kpi({
  label,
  value,
  sub,
  tone,
  accent = 'slate',
  icon,
  highlight,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: 'good' | 'warn';
  accent?: 'brand' | 'emerald' | 'amber' | 'slate';
  icon?: React.ReactNode;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border p-5 shadow-sm transition-shadow hover:shadow-md ${
        highlight
          ? 'border-brand-300 bg-brand-50'
          : 'border-line bg-surface'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-faint">{label}</p>
        {icon && (
          <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${CHIP[accent]}`}>
            <svg className="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              {icon}
            </svg>
          </span>
        )}
      </div>
      <p
        className={`mt-2 text-2xl font-bold tabular-nums ${
          tone === 'good' ? 'text-emerald-600' : tone === 'warn' ? 'text-amber-600' : 'text-ink'
        }`}
      >
        {value}
      </p>
      {sub && <p className="mt-1 text-xs text-faint">{sub}</p>}
    </div>
  );
}

const ICON = {
  sales: <path d="M3 17l6-6 4 4 7-7M15 8h5v5" />,
  cash: <path d="M3 7h18v10H3zM3 11h18M7 15h3" />,
  calendar: <path d="M7 3v3M17 3v3M4 8h16M5 5h14v15H5z" />,
  in: <path d="M4 14v5h16v-5M12 4v11M8 11l4 4 4-4" />,
  out: <path d="M4 14v5h16v-5M12 15V4M8 8l4-4 4 4" />,
  alert: <path d="M12 9v4M12 17h.01M10.3 4l-8 14A1.5 1.5 0 003.7 20.4h16.6A1.5 1.5 0 0021.7 18l-8-14a1.5 1.5 0 00-2.6 0z" />,
};

const tooltipStyle = {
  borderRadius: 8,
  border: '1px solid #e2e8f0',
  fontSize: 12,
  boxShadow: '0 4px 12px rgba(0,0,0,0.06)',
};

export function OverviewTab({ companyId }: { companyId: string }) {
  const t = useTranslations('overview');
  const [data, setData] = useState<Dashboard | null>(null);

  useEffect(() => {
    api.get<Dashboard>(`/companies/${companyId}/dashboard`).then(setData).catch(() => {});
  }, [companyId]);

  if (!data) {
    return <p className="text-sm text-muted">{t('loadingOverview')}</p>;
  }

  return (
    <div className="space-y-6">
      {/* KPI row */}
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-3">
        <Kpi
          label={t('salesThisMonth')}
          value={`₹${inr(data.salesThisMonth)}`}
          sub={t('invoicesCount', { count: data.invoicesThisMonth })}
          tone="good"
          accent="emerald"
          icon={ICON.sales}
          highlight
        />
        <Kpi label={t('cashBank')} value={`₹${inr(data.cashBank)}`} accent="brand" icon={ICON.cash} />
        <Kpi
          label={t('salesFY', { fiscalYear: data.fiscalYear })}
          value={`₹${inr(data.salesThisFY)}`}
          sub={t('invoicesCount', { count: data.invoicesThisFY })}
          accent="slate"
          icon={ICON.calendar}
        />
      </div>

      {/* Charts row */}
      <div className="grid gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2" title={t('sales')}>
          <div className="h-72">
            <ResponsiveContainer width="100%" height={288} minWidth={0}>
              <BarChart data={data.monthly} barGap={4}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 12, fill: '#94a3b8' }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: '#94a3b8' }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v: number) =>
                    v >= 100000 ? `${(v / 100000).toFixed(1)}L` : v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)
                  }
                />
                <Tooltip
                  contentStyle={tooltipStyle}
                  formatter={(value) => [`₹${inr(Number(value))}`, t('sales')]}
                />
                <Bar dataKey="sales" fill="#673de6" radius={[4, 4, 0, 0]} maxBarSize={36} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <div className="space-y-4">
          <Kpi
            label={t('receivables')}
            value={`₹${inr(data.receivables)}`}
            sub={t('unpaidInvoices', { amount: `₹${inr(data.outstandingInvoiceAmount)}` })}
            accent="emerald"
            icon={ICON.in}
          />
          <Kpi label={t('payables')} value={`₹${inr(data.payables)}`} accent="amber" icon={ICON.out} />
          <Kpi
            label={t('lowStockItems')}
            value={String(data.lowStockCount)}
            tone={data.lowStockCount > 0 ? 'warn' : undefined}
            accent={data.lowStockCount > 0 ? 'amber' : 'slate'}
            icon={ICON.alert}
          />
        </div>
      </div>

      {/* Recent invoices */}
      <Card title={t('recentInvoices')}>
        {data.recentInvoices.length === 0 ? (
          <p className="text-sm text-muted">{t('noInvoicesYet')}</p>
        ) : (
          <div className="overflow-x-auto"><table className="w-full min-w-[600px] text-sm">
            <tbody>
              {data.recentInvoices.map((inv) => (
                <tr key={inv.id} className="border-b border-line last:border-0 hover:bg-subtle">
                  <td className="py-2.5 font-mono text-xs text-muted">{inv.invoiceNo}</td>
                  <td className="py-2.5">{new Date(inv.date).toLocaleDateString('en-IN')}</td>
                  <td className="py-2.5 font-medium">{inv.party}</td>
                  <td className="py-2.5 text-right tabular-nums">₹{inr(inv.total)}</td>
                  <td className="py-2.5 pl-4 text-right">
                    <Badge tone={inv.status === 'CANCELLED' ? 'bad' : 'good'}>{inv.status}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
      </Card>
    </div>
  );
}
