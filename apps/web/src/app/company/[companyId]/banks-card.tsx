'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useFeedback } from '@/components/feedback';
import { Button, Card, ErrorText, Input, Label } from '@/components/ui';
import { fetchBanks, type BankAccountRow } from '@/lib/accounting';
import { api, ApiError } from '@/lib/api';

const EMPTY = { accountName: '', bankName: '', accountNo: '', ifsc: '', branch: '', upiId: '' };

/**
 * Manage multiple company bank accounts. The default account is printed on
 * documents; each account also gets its own ledger so receipts can land in it.
 */
export function BanksCard({ companyId, canManage }: { companyId: string; canManage: boolean }) {
  const t = useTranslations('banks');
  const tc = useTranslations('common');
  const { toast, confirm } = useFeedback();
  const [rows, setRows] = useState<BankAccountRow[]>([]);
  const [form, setForm] = useState({ ...EMPTY });
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    fetchBanks(companyId).then(setRows).catch(() => {});
  }, [companyId]);
  useEffect(() => load(), [load]);

  const set = (k: keyof typeof EMPTY, v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api.post(`/companies/${companyId}/banks`, {
        accountName: form.accountName.trim(),
        bankName: form.bankName || undefined,
        accountNo: form.accountNo || undefined,
        ifsc: form.ifsc ? form.ifsc.toUpperCase() : undefined,
        branch: form.branch || undefined,
        upiId: form.upiId || undefined,
        isDefault: rows.length === 0,
      });
      setForm({ ...EMPTY });
      setShowForm(false);
      load();
      toast(t('added'));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : tc('somethingWentWrong'));
    } finally {
      setBusy(false);
    }
  }

  async function makeDefault(id: string) {
    await api.post(`/companies/${companyId}/banks/${id}/default`, {}).catch(() => {});
    load();
  }

  async function remove(id: string) {
    const ok = await confirm({ title: t('removeTitle'), body: t('removeBody'), danger: true });
    if (!ok) return;
    await api.delete(`/companies/${companyId}/banks/${id}`).catch(() => {});
    load();
  }

  return (
    <Card>
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-ink">{t('title')}</h3>
          <p className="text-xs text-muted">{t('subtitle')}</p>
        </div>
        {canManage && (
          <Button variant={showForm ? 'secondary' : 'primary'} onClick={() => setShowForm((s) => !s)}>
            {showForm ? tc('close') : t('addBank')}
          </Button>
        )}
      </div>

      {showForm && canManage && (
        <form onSubmit={add} className="mb-4 grid grid-cols-1 gap-3 rounded-md border border-line bg-subtle p-3 sm:grid-cols-3">
          <div>
            <Label>{t('accountName')}</Label>
            <Input required value={form.accountName} onChange={(e) => set('accountName', e.target.value)} placeholder="HDFC Current A/c" />
          </div>
          <div>
            <Label>{t('bankName')}</Label>
            <Input value={form.bankName} onChange={(e) => set('bankName', e.target.value)} placeholder="HDFC Bank" />
          </div>
          <div>
            <Label>{t('accountNo')}</Label>
            <Input value={form.accountNo} onChange={(e) => set('accountNo', e.target.value)} placeholder="50100123456789" />
          </div>
          <div>
            <Label>{t('ifsc')}</Label>
            <Input value={form.ifsc} onChange={(e) => set('ifsc', e.target.value.toUpperCase())} placeholder="HDFC0001234" />
          </div>
          <div>
            <Label>{t('branch')}</Label>
            <Input value={form.branch} onChange={(e) => set('branch', e.target.value)} />
          </div>
          <div>
            <Label>{t('upiId')}</Label>
            <Input value={form.upiId} onChange={(e) => set('upiId', e.target.value)} placeholder="shop@okhdfcbank" />
          </div>
          <div className="sm:col-span-3 flex items-center gap-3">
            <Button type="submit" disabled={busy || !form.accountName.trim()}>
              {busy ? tc('saving') : t('saveBank')}
            </Button>
            <ErrorText>{error}</ErrorText>
          </div>
        </form>
      )}

      {rows.length === 0 ? (
        <p className="text-sm text-faint">{t('empty')}</p>
      ) : (
        <div className="overflow-x-auto"><table className="w-full min-w-[600px] text-sm">
          <thead>
            <tr className="border-b border-line bg-subtle text-left text-[11px] font-semibold uppercase tracking-wide text-muted">
              <th className="py-2">{t('accountName')}</th>
              <th className="py-2">{t('accountNo')}</th>
              <th className="py-2">{t('ifsc')}</th>
              {canManage && <th className="py-2 text-right">{tc('actions')}</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((b) => (
              <tr key={b.id} className="border-b border-line last:border-0">
                <td className="py-2 font-medium text-ink">
                  {b.accountName}
                  {b.isDefault && (
                    <span className="ml-2 rounded bg-brand-50 px-1.5 py-0.5 text-[10px] font-semibold text-brand-700">
                      {t('defaultTag')}
                    </span>
                  )}
                  {b.bankName && <span className="ml-1 text-xs text-faint">· {b.bankName}</span>}
                </td>
                <td className="py-2 font-mono text-xs text-muted">{b.accountNo ?? '—'}</td>
                <td className="py-2 font-mono text-xs text-muted">{b.ifsc ?? '—'}</td>
                {canManage && (
                  <td className="py-2 text-right text-xs whitespace-nowrap">
                    {!b.isDefault && (
                      <button onClick={() => void makeDefault(b.id)} className="mr-3 text-brand-600 hover:underline">
                        {t('setDefault')}
                      </button>
                    )}
                    <button onClick={() => void remove(b.id)} className="text-red-500 hover:underline">
                      {tc('delete')}
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table></div>
      )}
    </Card>
  );
}
