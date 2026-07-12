'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { EmptyState, Pagination, SearchInput, useTable } from '@/components/table';
import { useFeedback } from '@/components/feedback';
import { Button, Card, ErrorText, Input, Label } from '@/components/ui';
import {
  fetchLoyaltyCustomers,
  inr,
  type LoyaltyCustomer,
} from '@/lib/accounting';
import { api, ApiError } from '@/lib/api';

export function LoyaltyTab({
  companyId,
  canManage,
}: {
  companyId: string;
  canManage: boolean;
}) {
  const t = useTranslations('loyalty');
  const tc = useTranslations('common');
  const { toast } = useFeedback();

  const [enabled, setEnabled] = useState(false);
  const [earnPercent, setEarnPercent] = useState('0');
  const [redeemValue, setRedeemValue] = useState('1');
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsErr, setSettingsErr] = useState('');

  const [customers, setCustomers] = useState<LoyaltyCustomer[]>([]);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    const [company, list] = await Promise.all([
      api.get<{
        loyaltyEnabled: boolean;
        loyaltyEarnPercent: number | string;
        loyaltyRedeemValue: number | string;
      }>(`/companies/${companyId}`),
      fetchLoyaltyCustomers(companyId),
    ]);
    setEnabled(company.loyaltyEnabled);
    setEarnPercent(String(company.loyaltyEarnPercent ?? 0));
    setRedeemValue(String(company.loyaltyRedeemValue ?? 1));
    setCustomers(list);
    setLoaded(true);
  }, [companyId]);

  useEffect(() => {
    load().catch(() => setLoaded(true));
  }, [load]);

  const table = useTable(customers, (c) => `${c.name} ${c.phone ?? ''}`);

  async function saveSettings(e: React.FormEvent) {
    e.preventDefault();
    setSettingsErr('');
    setSavingSettings(true);
    try {
      await api.patch(`/companies/${companyId}`, {
        loyaltyEnabled: enabled,
        loyaltyEarnPercent: Number(earnPercent) || 0,
        loyaltyRedeemValue: Number(redeemValue) || 1,
      });
      toast(t('settings.saved'));
    } catch (err) {
      setSettingsErr(err instanceof ApiError ? err.message : tc('somethingWentWrong'));
    } finally {
      setSavingSettings(false);
    }
  }

  async function changePoints(c: LoyaltyCustomer, sign: -1 | 1) {
    const raw = window.prompt(
      sign < 0 ? t('redeemPrompt', { name: c.name, max: c.loyaltyPoints }) : t('giftPrompt', { name: c.name }),
    );
    if (!raw) return;
    const n = Math.round(Number(raw));
    if (!n || n <= 0) return;
    try {
      await api.post(`/companies/${companyId}/loyalty/adjust`, {
        partyId: c.id,
        points: sign * n,
        note: sign < 0 ? 'Redeemed' : 'Manual adjustment',
      });
      await load();
      toast(sign < 0 ? t('redeemed') : t('added'));
    } catch (err) {
      toast(err instanceof ApiError ? err.message : tc('somethingWentWrong'), 'error');
    }
  }

  const totalOutstanding = customers.reduce((s, c) => s + c.loyaltyPoints, 0);

  return (
    <div className="space-y-4">
      {/* Programme settings */}
      {canManage && (
        <Card title={t('settings.title')}>
          <form onSubmit={saveSettings} className="flex flex-wrap items-end gap-5">
            <label className="flex items-center gap-2 pb-1.5 text-sm font-medium text-ink">
              <input
                type="checkbox"
                checked={enabled}
                onChange={(e) => setEnabled(e.target.checked)}
                disabled={!loaded}
                className="h-4 w-4 rounded border-line-strong"
              />
              {t('settings.enable')}
            </label>
            <div>
              <Label>{t('settings.earnPercent')}</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                max="100"
                value={earnPercent}
                onChange={(e) => setEarnPercent(e.target.value)}
                disabled={!loaded || !enabled}
                className="w-28"
              />
            </div>
            <div>
              <Label>{t('settings.redeemValue')}</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={redeemValue}
                onChange={(e) => setRedeemValue(e.target.value)}
                disabled={!loaded || !enabled}
                className="w-28"
              />
            </div>
            <Button type="submit" disabled={savingSettings || !loaded}>
              {savingSettings ? tc('saving') : t('settings.save')}
            </Button>
            <span className="pb-1.5 text-xs text-faint">{t('settings.hint')}</span>
            <ErrorText>{settingsErr}</ErrorText>
          </form>
        </Card>
      )}

      {/* Customers */}
      <Card>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <SearchInput value={table.query} onChange={table.setQuery} placeholder={t('searchPlaceholder')} />
          <span className="text-xs text-muted">
            {t('outstanding')}: <strong className="text-brand-700">{inr(totalOutstanding)} {t('pts')}</strong>
          </span>
        </div>
        {customers.length === 0 ? (
          <EmptyState title={t('empty.title')} body={t('empty.body')} />
        ) : (
          <>
            <div className="overflow-x-auto"><table className="w-full min-w-[600px] text-sm">
              <thead>
                <tr className="border-b border-line bg-subtle text-left text-[11px] font-semibold uppercase tracking-wide text-muted">
                  <th className="py-2">{t('table.customer')}</th>
                  <th className="py-2">{t('table.phone')}</th>
                  <th className="py-2 text-right">{t('table.points')}</th>
                  <th className="py-2 text-right">{tc('actions')}</th>
                </tr>
              </thead>
              <tbody>
                {table.rows.map((c) => (
                  <tr key={c.id} className="border-b border-line last:border-0 hover:bg-subtle">
                    <td className="py-2 font-medium text-ink">{c.name}</td>
                    <td className="py-2 text-muted">{c.phone ?? '—'}</td>
                    <td className="py-2 text-right tabular-nums font-semibold text-brand-700">
                      {inr(c.loyaltyPoints)}
                    </td>
                    <td className="py-2 text-right text-xs whitespace-nowrap">
                      {canManage && (
                        <>
                          <button
                            onClick={() => void changePoints(c, -1)}
                            disabled={c.loyaltyPoints <= 0}
                            className="text-emerald-600 hover:underline disabled:opacity-40"
                          >
                            {t('row.redeem')}
                          </button>
                          <button
                            onClick={() => void changePoints(c, 1)}
                            className="ml-2 text-muted hover:underline"
                          >
                            {t('row.add')}
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table></div>
            <Pagination page={table.page} pageCount={table.pageCount} total={table.total} onPage={table.setPage} />
          </>
        )}
      </Card>
    </div>
  );
}
