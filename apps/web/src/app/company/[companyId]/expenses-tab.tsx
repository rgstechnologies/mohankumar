'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { EmptyState, Pagination, SearchInput, useTable } from '@/components/table';
import { useFeedback } from '@/components/feedback';
import { Button, Card, ErrorText, Input, Label, Select } from '@/components/ui';
import {
  GST_RATES,
  inr,
  type ExpenseEntry,
  type LedgerRow,
  type PartyRow,
} from '@/lib/accounting';
import { api, ApiError } from '@/lib/api';

type Mode = 'EXPENSE' | 'INCOME';

export function ExpensesTab({
  companyId,
  ledgers,
  parties,
  expenses,
  canManage,
  onChanged,
}: {
  companyId: string;
  ledgers: LedgerRow[];
  parties: PartyRow[];
  expenses: ExpenseEntry[];
  canManage: boolean;
  onChanged: () => Promise<void>;
}) {
  const t = useTranslations('expenses');
  const tc = useTranslations('common');
  const { toast, confirm } = useFeedback();

  const expenseLedgers = useMemo(
    () => ledgers.filter((l) => l.group.nature === 'EXPENSE'),
    [ledgers],
  );
  const incomeLedgers = useMemo(
    () => ledgers.filter((l) => l.group.nature === 'INCOME'),
    [ledgers],
  );
  const cashBank = useMemo(
    () => ledgers.filter((l) => ['Cash-in-Hand', 'Bank Accounts'].includes(l.group.name)),
    [ledgers],
  );
  const vendors = useMemo(() => parties.filter((p) => p.type === 'VENDOR'), [parties]);

  const [mode, setMode] = useState<Mode>('EXPENSE');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [categoryLedgerId, setCategoryLedgerId] = useState('');
  const [accountLedgerId, setAccountLedgerId] = useState(cashBank[0]?.id ?? '');
  const [amount, setAmount] = useState('');
  const [gstRate, setGstRate] = useState('0');
  const [isInterState, setIsInterState] = useState(false);
  const [partyId, setPartyId] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const gstPreview = useMemo(() => {
    const base = Number(amount) || 0;
    const rate = Number(gstRate) || 0;
    const tax = Math.round(((base * rate) / 100) * 100) / 100;
    return { tax, total: Math.round((base + tax) * 100) / 100 };
  }, [amount, gstRate]);

  const categoryLedgers = mode === 'EXPENSE' ? expenseLedgers : incomeLedgers;

  const table = useTable(
    expenses,
    (e) => `${e.voucherNo} ${e.category} ${e.account} ${e.narration ?? ''}`,
  );

  function switchMode(next: Mode) {
    setMode(next);
    setCategoryLedgerId('');
    setError('');
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      if (mode === 'EXPENSE') {
        await api.post(`/companies/${companyId}/expenses`, {
          date,
          categoryLedgerId,
          paidFromLedgerId: accountLedgerId,
          amount: Number(amount),
          gstRate: Number(gstRate) > 0 ? Number(gstRate) : undefined,
          isInterState: Number(gstRate) > 0 ? isInterState : undefined,
          partyId: partyId || undefined,
          notes: notes || undefined,
        });
      } else {
        await api.post(`/companies/${companyId}/expenses/other-income`, {
          date,
          categoryLedgerId,
          receivedIntoLedgerId: accountLedgerId,
          amount: Number(amount),
          notes: notes || undefined,
        });
      }
      setAmount('');
      setGstRate('0');
      setIsInterState(false);
      setNotes('');
      setPartyId('');
      setCategoryLedgerId('');
      await onChanged();
      toast(mode === 'EXPENSE' ? t('toast.expenseSaved') : t('toast.incomeSaved'));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : tc('somethingWentWrong'));
    } finally {
      setBusy(false);
    }
  }

  async function cancel(entry: ExpenseEntry) {
    const ok = await confirm({
      title: t('cancelDialog.title'),
      body: t('cancelDialog.body'),
      confirmLabel: t('cancelDialog.confirm'),
      danger: true,
    });
    if (!ok) return;
    try {
      await api.post(`/companies/${companyId}/expenses/${entry.id}/cancel`);
      await onChanged();
      toast(t('toast.cancelled'), 'info');
    } catch (err) {
      toast(err instanceof ApiError ? err.message : tc('somethingWentWrong'), 'error');
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_1.6fr]">
      {/* Entry form */}
      {canManage && (
        <Card>
          <div className="mb-4 inline-flex rounded-md border border-line p-0.5">
            {(['EXPENSE', 'INCOME'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => switchMode(m)}
                className={`rounded px-3 py-1 text-sm font-medium transition-colors ${
                  mode === m ? 'bg-brand-600 text-white' : 'text-muted hover:bg-subtle'
                }`}
              >
                {m === 'EXPENSE' ? t('expense') : t('otherIncome')}
              </button>
            ))}
          </div>

          <form onSubmit={onSubmit} className="space-y-3">
            <div>
              <Label>{tc('date')}</Label>
              <Input type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div>
              <Label>{mode === 'EXPENSE' ? t('form.expenseCategory') : t('form.incomeCategory')}</Label>
              <Select
                required
                value={categoryLedgerId}
                onChange={(e) => setCategoryLedgerId(e.target.value)}
              >
                <option value="">{t('form.selectCategory')}</option>
                {categoryLedgers.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </Select>
              {categoryLedgers.length === 0 && (
                <p className="mt-1 text-xs text-amber-600">{t('form.noCategories')}</p>
              )}
            </div>
            <div>
              <Label>{mode === 'EXPENSE' ? t('form.paidFrom') : t('form.receivedInto')}</Label>
              <Select
                required
                value={accountLedgerId}
                onChange={(e) => setAccountLedgerId(e.target.value)}
              >
                <option value="">{t('form.selectAccount')}</option>
                {cashBank.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>
                {mode === 'EXPENSE' && Number(gstRate) > 0 ? t('form.amountBeforeGst') : t('form.amount')}
              </Label>
              <Input
                type="number"
                step="0.01"
                min="0.01"
                required
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
              />
            </div>
            {mode === 'EXPENSE' && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>{t('form.gst')}</Label>
                  <Select value={gstRate} onChange={(e) => setGstRate(e.target.value)}>
                    <option value="0">{t('form.noGst')}</option>
                    {GST_RATES.filter((r) => r > 0).map((r) => (
                      <option key={r} value={r}>
                        {t('form.gstOption', { rate: r })}
                      </option>
                    ))}
                  </Select>
                </div>
                {Number(gstRate) > 0 && (
                  <label className="flex items-end gap-2 pb-1.5 text-sm text-ink">
                    <input
                      type="checkbox"
                      checked={isInterState}
                      onChange={(e) => setIsInterState(e.target.checked)}
                      className="h-4 w-4 rounded border-line-strong"
                    />
                    {t('form.interState')}
                  </label>
                )}
              </div>
            )}
            {mode === 'EXPENSE' && Number(gstRate) > 0 && (
              <p className="text-xs text-muted">
                {t('form.gstSplit', {
                  tax: inr(gstPreview.tax),
                  kind: isInterState ? 'IGST' : 'CGST+SGST',
                })}{' '}
                <strong className="text-ink">₹{inr(gstPreview.total)}</strong>
              </p>
            )}
            {mode === 'EXPENSE' && vendors.length > 0 && (
              <div>
                <Label>{t('form.party')}</Label>
                <Select value={partyId} onChange={(e) => setPartyId(e.target.value)}>
                  <option value="">{t('form.noParty')}</option>
                  {vendors.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name}
                    </option>
                  ))}
                </Select>
              </div>
            )}
            <div>
              <Label>{t('form.notes')}</Label>
              <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
            <ErrorText>{error}</ErrorText>
            <Button type="submit" disabled={busy || !categoryLedgerId || !accountLedgerId} className="w-full">
              {busy ? t('form.saving') : mode === 'EXPENSE' ? t('form.saveExpense') : t('form.saveIncome')}
            </Button>
          </form>
        </Card>
      )}

      {/* List */}
      <Card>
        <div className="mb-3">
          <SearchInput
            value={table.query}
            onChange={table.setQuery}
            placeholder={t('searchPlaceholder')}
          />
        </div>
        {expenses.length === 0 ? (
          <EmptyState title={t('empty.title')} body={t('empty.body')} />
        ) : (
          <>
            <div className="overflow-x-auto"><table className="w-full min-w-[600px] text-sm">
              <thead>
                <tr className="border-b border-line bg-subtle text-left text-[11px] font-semibold uppercase tracking-wide text-muted">
                  <th className="py-2">{tc('date')}</th>
                  <th className="py-2">{t('table.category')}</th>
                  <th className="py-2">{t('table.account')}</th>
                  <th className="py-2 text-right">{tc('total')}</th>
                  <th className="py-2 text-right">{tc('actions')}</th>
                </tr>
              </thead>
              <tbody>
                {table.rows.map((e) => (
                  <tr
                    key={e.id}
                    className={`border-b border-line last:border-0 hover:bg-subtle ${
                      e.status === 'CANCELLED' ? 'opacity-50' : ''
                    }`}
                  >
                    <td className="py-2 whitespace-nowrap">
                      {new Date(e.date).toLocaleDateString('en-IN')}
                    </td>
                    <td className="py-2">
                      <span
                        className={`mr-1.5 rounded-sm px-1 py-0.5 text-[10px] font-semibold ${
                          e.kind === 'EXPENSE'
                            ? 'bg-red-50 text-red-600'
                            : 'bg-emerald-50 text-emerald-700'
                        }`}
                      >
                        {e.kind === 'EXPENSE' ? t('expense') : t('income')}
                      </span>
                      {e.category}
                      {e.narration && (
                        <span className="ml-1 text-xs text-faint">· {e.narration}</span>
                      )}
                    </td>
                    <td className="py-2 text-muted">{e.account}</td>
                    <td
                      className={`py-2 text-right tabular-nums ${
                        e.kind === 'EXPENSE' ? 'text-red-600' : 'text-emerald-700'
                      }`}
                    >
                      {e.kind === 'EXPENSE' ? '−' : '+'}₹{inr(e.amount)}
                    </td>
                    <td className="py-2 text-right text-xs whitespace-nowrap">
                      {canManage && e.status === 'ACTIVE' ? (
                        <button
                          onClick={() => void cancel(e)}
                          className="text-red-500 hover:underline"
                        >
                          {tc('cancel')}
                        </button>
                      ) : e.status === 'CANCELLED' ? (
                        <span className="text-faint">{t('cancelledTag')}</span>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table></div>
            <Pagination
              page={table.page}
              pageCount={table.pageCount}
              total={table.total}
              onPage={table.setPage}
            />
          </>
        )}
      </Card>
    </div>
  );
}
