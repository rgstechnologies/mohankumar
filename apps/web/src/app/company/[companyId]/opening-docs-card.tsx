'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useFeedback } from '@/components/feedback';
import { Button, Card, ErrorText, HelpTip, Input, Select } from '@/components/ui';
import {
  fetchOpeningDocs,
  inr,
  settleOpeningDoc,
  type LedgerRow,
  type OpeningDocView,
} from '@/lib/accounting';
import { ApiError } from '@/lib/api';

/**
 * Bill-wise opening balances carried over from the previous system. Hidden
 * entirely when the company has none — only migrated books see this.
 */
export function OpeningDocsCard({
  companyId,
  kind,
  ledgers,
  canSettle,
  onChanged,
}: {
  companyId: string;
  kind: 'RECEIVABLE' | 'PAYABLE';
  ledgers: LedgerRow[];
  canSettle: boolean;
  onChanged: () => Promise<void>;
}) {
  const t = useTranslations('openingDocs');
  const tc = useTranslations('common');
  const [docs, setDocs] = useState<OpeningDocView[]>([]);
  const cashBank = useMemo(
    () => ledgers.filter((l) => ['Cash-in-Hand', 'Bank Accounts'].includes(l.group.name)),
    [ledgers],
  );

  const reload = useCallback(
    () =>
      fetchOpeningDocs(companyId, kind)
        .then(setDocs)
        .catch(() => {}),
    [companyId, kind],
  );

  useEffect(() => {
    void reload();
  }, [reload]);

  const open = docs.filter((d) => d.outstanding > 0);
  const totalOutstanding = open.reduce((s, d) => s + d.outstanding, 0);
  if (open.length === 0) return null;

  return (
    <Card>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">
          {t(kind === 'RECEIVABLE' ? 'titleReceivable' : 'titlePayable')}
          <HelpTip text={t('hint')} />
        </h3>
        <span className="text-sm tabular-nums text-muted">
          {t('totalOutstanding')} <span className="font-semibold text-ink">₹{inr(totalOutstanding)}</span>
        </span>
      </div>
      <div className="overflow-x-auto"><table className="w-full min-w-[600px] text-sm">
        <thead>
          <tr className="border-b border-line bg-subtle text-left text-[11px] font-semibold uppercase tracking-wide text-muted">
            <th className="py-2">{t('colRef')}</th>
            <th className="py-2">{tc('date')}</th>
            <th className="py-2">{t('colParty')}</th>
            <th className="py-2 text-right">{tc('amount')}</th>
            <th className="py-2 text-right">{t('colOutstanding')}</th>
            {canSettle && <th className="py-2 text-right">{tc('actions')}</th>}
          </tr>
        </thead>
        <tbody>
          {open.map((doc) => (
            <OpeningDocRow
              key={doc.id}
              companyId={companyId}
              doc={doc}
              kind={kind}
              cashBank={cashBank}
              canSettle={canSettle}
              onSettled={async () => {
                await reload();
                await onChanged();
              }}
            />
          ))}
        </tbody>
      </table></div>
    </Card>
  );
}

function OpeningDocRow({
  companyId,
  doc,
  kind,
  cashBank,
  canSettle,
  onSettled,
}: {
  companyId: string;
  doc: OpeningDocView;
  kind: 'RECEIVABLE' | 'PAYABLE';
  cashBank: LedgerRow[];
  canSettle: boolean;
  onSettled: () => Promise<void>;
}) {
  const t = useTranslations('openingDocs');
  const { toast } = useFeedback();
  const [showForm, setShowForm] = useState(false);
  const [amount, setAmount] = useState('');
  const [ledgerId, setLedgerId] = useState(cashBank[0]?.id ?? '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const result = await settleOpeningDoc(companyId, doc.id, Number(amount), ledgerId);
      setShowForm(false);
      setAmount('');
      toast(t('settledToast', { voucherNo: result.voucherNo }));
      await onSettled();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('settleFailed'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <tr className="border-b border-line last:border-0 hover:bg-subtle">
        <td className="py-2 font-mono text-xs">{doc.refNo}</td>
        <td className="py-2 whitespace-nowrap">
          {new Date(doc.date).toLocaleDateString('en-IN')}
        </td>
        <td className="py-2">{doc.party.name}</td>
        <td className="py-2 text-right tabular-nums">₹{inr(doc.amount)}</td>
        <td className="py-2 text-right font-medium tabular-nums">₹{inr(doc.outstanding)}</td>
        {canSettle && (
          <td className="py-2 text-right">
            <button
              onClick={() => setShowForm(!showForm)}
              className="text-xs text-emerald-600 hover:underline"
            >
              {showForm
                ? t('close')
                : t(kind === 'RECEIVABLE' ? 'collect' : 'pay')}
            </button>
          </td>
        )}
      </tr>
      {showForm && (
        <tr>
          <td colSpan={6} className="bg-subtle px-3 py-2">
            <form onSubmit={onSubmit} className="flex flex-wrap items-center gap-2">
              <Input
                type="number"
                step="0.01"
                min="0.01"
                max={doc.outstanding}
                required
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder={t('amountPlaceholder', { max: inr(doc.outstanding) })}
                className="w-48"
              />
              <Select
                value={ledgerId}
                onChange={(e) => setLedgerId(e.target.value)}
                className="w-44"
              >
                {cashBank.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </Select>
              <Button type="submit" disabled={busy || !ledgerId}>
                {busy ? '…' : t(kind === 'RECEIVABLE' ? 'collect' : 'pay')}
              </Button>
              <ErrorText>{error}</ErrorText>
            </form>
          </td>
        </tr>
      )}
    </>
  );
}
