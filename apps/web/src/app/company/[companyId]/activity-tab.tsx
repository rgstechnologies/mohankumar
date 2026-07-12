'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { SearchInput } from '@/components/table';
import { Badge, Button, Card } from '@/components/ui';
import { api } from '@/lib/api';

interface AuditRow {
  id: string;
  at: string;
  user: string;
  method: string;
  action: string;
  status: number;
  ip: string | null;
}

const METHOD_TONE: Record<string, 'good' | 'warn' | 'neutral'> = {
  POST: 'good',
  PATCH: 'warn',
  PUT: 'warn',
  DELETE: 'warn',
};

/** Who-did-what trail of every change in this company. Owners/admins only. */
export function ActivityTab({ companyId }: { companyId: string }) {
  const t = useTranslations('activity');
  const tc = useTranslations('common');
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(
        await api.get<AuditRow[]>(
          `/companies/${companyId}/audit-logs${q ? `?q=${encodeURIComponent(q)}` : ''}`,
        ),
      );
    } finally {
      setLoading(false);
    }
  }, [companyId, q]);

  useEffect(() => {
    const handle = setTimeout(() => void load().catch(() => {}), 250);
    return () => clearTimeout(handle);
  }, [load]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SearchInput value={q} onChange={setQ} placeholder={t('searchPlaceholder')} />
        <Button variant="secondary" onClick={() => void load()}>
          {t('refresh')}
        </Button>
      </div>

      <Card>
        {loading && rows.length === 0 ? (
          <p className="text-sm text-muted">{tc('loading')}</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted">{t('empty')}</p>
        ) : (
          <div className="overflow-x-auto"><table className="w-full min-w-[600px] text-sm">
            <thead>
              <tr className="border-b border-line bg-subtle text-left text-[11px] font-semibold uppercase tracking-wide text-muted">
                <th className="py-2">{t('colWhen')}</th>
                <th className="py-2">{t('colWho')}</th>
                <th className="py-2">{t('colAction')}</th>
                <th className="py-2 text-center">{tc('status')}</th>
                <th className="py-2 text-right">IP</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b border-line last:border-0 hover:bg-subtle">
                  <td className="py-1.5 whitespace-nowrap text-xs text-muted">
                    {new Date(row.at).toLocaleString('en-IN')}
                  </td>
                  <td className="py-1.5">{row.user}</td>
                  <td className="py-1.5">
                    <Badge tone={METHOD_TONE[row.method] ?? 'neutral'}>{row.method}</Badge>{' '}
                    <span className="font-mono text-xs text-muted">{row.action}</span>
                  </td>
                  <td
                    className={`py-1.5 text-center text-xs font-medium ${
                      row.status < 400 ? 'text-emerald-600' : 'text-red-500'
                    }`}
                  >
                    {row.status}
                  </td>
                  <td className="py-1.5 text-right font-mono text-xs text-faint">
                    {row.ip ?? '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
        <p className="mt-3 text-xs text-faint">{t('note')}</p>
      </Card>
    </div>
  );
}
