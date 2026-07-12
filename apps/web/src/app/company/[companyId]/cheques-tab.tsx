'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { EmptyState, Pagination, SearchInput, useTable } from '@/components/table';
import { useFeedback } from '@/components/feedback';
import { Button, Card, ErrorText, Input, Label, Select } from '@/components/ui';
import { inr, type ChequeView, type PartyRow } from '@/lib/accounting';
import { api, ApiError } from '@/lib/api';

type Direction = 'RECEIVED' | 'ISSUED';

const STATUS_STYLE: Record<string, string> = {
  PENDING: 'bg-amber-50 text-amber-700',
  CLEARED: 'bg-emerald-50 text-emerald-700',
  BOUNCED: 'bg-red-50 text-red-600',
  CANCELLED: 'bg-subtle text-muted',
};

export function ChequesTab({
  companyId,
  parties,
  cheques,
  canManage,
  onChanged,
}: {
  companyId: string;
  parties: PartyRow[];
  cheques: ChequeView[];
  canManage: boolean;
  onChanged: () => Promise<void>;
}) {
  const t = useTranslations('cheques');
  const tc = useTranslations('common');
  const { toast } = useFeedback();

  const [direction, setDirection] = useState<Direction>('RECEIVED');
  const [partyId, setPartyId] = useState('');
  const [chequeNo, setChequeNo] = useState('');
  const [bankName, setBankName] = useState('');
  const [amount, setAmount] = useState('');
  const [chequeDate, setChequeDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const candidates = useMemo(
    () => parties.filter((p) => p.type === (direction === 'RECEIVED' ? 'CUSTOMER' : 'VENDOR')),
    [parties, direction],
  );

  const table = useTable(
    cheques,
    (c) => `${c.chequeNo} ${c.partyName} ${c.bankName ?? ''} ${c.status} ${c.direction}`,
  );

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await api.post(`/companies/${companyId}/cheques`, {
        direction,
        partyId: partyId || undefined,
        chequeNo,
        bankName: bankName || undefined,
        amount: Number(amount),
        chequeDate,
        notes: notes || undefined,
      });
      setChequeNo('');
      setBankName('');
      setAmount('');
      setNotes('');
      setPartyId('');
      await onChanged();
      toast(t('toast.added'));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : tc('somethingWentWrong'));
    } finally {
      setBusy(false);
    }
  }

  async function setStatus(c: ChequeView, status: ChequeView['status']) {
    try {
      await api.patch(`/companies/${companyId}/cheques/${c.id}/status`, { status });
      await onChanged();
      toast(t('toast.statusChanged'));
    } catch (err) {
      toast(err instanceof ApiError ? err.message : tc('somethingWentWrong'), 'error');
    }
  }

  // Summary of pending cheque value, split by direction.
  const pending = useMemo(() => {
    let recv = 0;
    let issued = 0;
    for (const c of cheques) {
      if (c.status !== 'PENDING') continue;
      if (c.direction === 'RECEIVED') recv += c.amount;
      else issued += c.amount;
    }
    return { recv, issued };
  }, [cheques]);

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_1.7fr]">
      {/* Entry form */}
      {canManage && (
        <Card>
          <div className="mb-4 inline-flex rounded-md border border-line p-0.5">
            {(['RECEIVED', 'ISSUED'] as const).map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => {
                  setDirection(d);
                  setPartyId('');
                }}
                className={`rounded px-3 py-1 text-sm font-medium transition-colors ${
                  direction === d ? 'bg-brand-600 text-white' : 'text-muted hover:bg-subtle'
                }`}
              >
                {d === 'RECEIVED' ? t('received') : t('issued')}
              </button>
            ))}
          </div>
          <form onSubmit={onCreate} className="space-y-3">
            <div>
              <Label>{direction === 'RECEIVED' ? t('form.fromParty') : t('form.toParty')}</Label>
              <Select value={partyId} onChange={(e) => setPartyId(e.target.value)}>
                <option value="">{t('form.selectParty')}</option>
                {candidates.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>{t('form.chequeNo')}</Label>
                <Input required value={chequeNo} onChange={(e) => setChequeNo(e.target.value)} placeholder="004521" />
              </div>
              <div>
                <Label>{t('form.amount')}</Label>
                <Input type="number" step="0.01" min="0.01" required value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
              </div>
              <div>
                <Label>{t('form.bank')}</Label>
                <Input value={bankName} onChange={(e) => setBankName(e.target.value)} placeholder="HDFC Bank" />
              </div>
              <div>
                <Label>{t('form.chequeDate')}</Label>
                <Input type="date" required value={chequeDate} onChange={(e) => setChequeDate(e.target.value)} />
              </div>
            </div>
            <div>
              <Label>{t('form.notes')}</Label>
              <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
            <ErrorText>{error}</ErrorText>
            <Button type="submit" disabled={busy} className="w-full">
              {busy ? t('form.saving') : t('form.add')}
            </Button>
          </form>
        </Card>
      )}

      {/* Register */}
      <Card>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <SearchInput value={table.query} onChange={table.setQuery} placeholder={t('searchPlaceholder')} />
          <div className="flex gap-4 text-xs">
            <span className="text-muted">
              {t('pendingIn')}: <strong className="text-emerald-700">₹{inr(pending.recv)}</strong>
            </span>
            <span className="text-muted">
              {t('pendingOut')}: <strong className="text-red-600">₹{inr(pending.issued)}</strong>
            </span>
          </div>
        </div>
        {cheques.length === 0 ? (
          <EmptyState title={t('empty.title')} body={t('empty.body')} />
        ) : (
          <>
            <div className="overflow-x-auto"><table className="w-full min-w-[600px] text-sm">
              <thead>
                <tr className="border-b border-line bg-subtle text-left text-[11px] font-semibold uppercase tracking-wide text-muted">
                  <th className="py-2">{t('table.chequeNo')}</th>
                  <th className="py-2">{t('table.party')}</th>
                  <th className="py-2">{t('table.bank')}</th>
                  <th className="py-2">{t('table.date')}</th>
                  <th className="py-2 text-right">{tc('total')}</th>
                  <th className="py-2 text-center">{tc('status')}</th>
                  <th className="py-2 text-right">{tc('actions')}</th>
                </tr>
              </thead>
              <tbody>
                {table.rows.map((c) => (
                  <tr key={c.id} className="border-b border-line last:border-0 hover:bg-subtle">
                    <td className="py-2">
                      <span className="font-mono text-xs">{c.chequeNo}</span>
                      <span
                        className={`ml-1.5 rounded-sm px-1 py-0.5 text-[10px] font-semibold ${
                          c.direction === 'RECEIVED' ? 'bg-emerald-50 text-emerald-700' : 'bg-sky-50 text-sky-700'
                        }`}
                      >
                        {c.direction === 'RECEIVED' ? t('in') : t('out')}
                      </span>
                    </td>
                    <td className="py-2">{c.partyName}</td>
                    <td className="py-2 text-muted">{c.bankName ?? '—'}</td>
                    <td className="py-2 whitespace-nowrap text-xs">
                      {new Date(c.chequeDate).toLocaleDateString('en-IN')}
                      {c.isOverdue && (
                        <span className="ml-1 rounded bg-amber-50 px-1 py-0.5 text-[10px] text-amber-700">
                          {t('overdue')}
                        </span>
                      )}
                    </td>
                    <td className="py-2 text-right tabular-nums">₹{inr(c.amount)}</td>
                    <td className="py-2 text-center">
                      <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${STATUS_STYLE[c.status]}`}>
                        {t(`status.${c.status}`)}
                      </span>
                    </td>
                    <td className="py-2 text-right text-xs whitespace-nowrap">
                      {canManage && c.status === 'PENDING' && (
                        <>
                          <button onClick={() => void setStatus(c, 'CLEARED')} className="text-emerald-600 hover:underline">
                            {t('row.clear')}
                          </button>
                          <button onClick={() => void setStatus(c, 'BOUNCED')} className="ml-2 text-red-500 hover:underline">
                            {t('row.bounce')}
                          </button>
                          <button onClick={() => void setStatus(c, 'CANCELLED')} className="ml-2 text-faint hover:underline">
                            {tc('cancel')}
                          </button>
                        </>
                      )}
                      {canManage && c.status !== 'PENDING' && (
                        <button onClick={() => void setStatus(c, 'PENDING')} className="text-brand-600 hover:underline">
                          {t('row.reopen')}
                        </button>
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
