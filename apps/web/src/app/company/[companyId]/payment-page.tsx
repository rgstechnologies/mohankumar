'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useFeedback } from '@/components/feedback';
import { AddPartyModal } from '@/components/party-form-modal';
import { EmptyState } from '@/components/table';
import { Button, Card, Combobox, ErrorText, Input, Label, Select } from '@/components/ui';
import {
  deletePartyPayment,
  fetchBanks,
  fetchEstimates,
  fetchInvoices,
  fetchPartyPayments,
  fetchPurchaseBills,
  inr,
  type BankAccountRow,
  type LedgerRow,
  type PartyPaymentView,
  type PartyRow,
} from '@/lib/accounting';
import { api, ApiError } from '@/lib/api';

const METHODS = ['CASH', 'BANK'] as const;

/** Which document kind a row settles against — drives the payment endpoint. */
type DocKind = 'invoice' | 'bill' | 'estimate';

interface OpenDoc {
  id: string;
  no: string;
  date: string;
  total: number;
  outstanding: number;
  kind: DocKind;
}

interface HistoryDoc {
  no: string;
  date: string;
  total: number;
  paid: number;
  outstanding: number;
  isBill: boolean;
}

/**
 * Payment In (sales, mode='in') / Payment Out (purchase, mode='out'): pick a
 * party (or add one), see their open invoices/bills + transaction history on
 * the right, and allocate a receipt/payment across specific documents — plus
 * any leftover recorded on-account. Reuses the per-document payment endpoints.
 *
 * `docKind` splits Payment-In into the two banking screens the business asked
 * for: "Estimate Banking" settles estimates, "Invoice Banking" settles GST
 * invoices. Each customer is tracked against exactly one of the two (Customers
 * → "Track balance by"), so a customer appears on one screen and never both —
 * which is what stops the same rupee being counted as due twice.
 */
export function PaymentPage({
  companyId,
  mode,
  docKind,
  parties,
  ledgers,
  canManage,
  onChanged,
}: {
  companyId: string;
  mode: 'in' | 'out';
  /** Payment-In only: show customers tracked by estimates, or by invoices. */
  docKind?: 'estimate' | 'invoice';
  parties: PartyRow[];
  ledgers: LedgerRow[];
  canManage: boolean;
  onChanged: () => Promise<void>;
}) {
  const t = useTranslations('payments');
  const tc = useTranslations('common');
  const { toast } = useFeedback();
  const isIn = mode === 'in';
  const partyType = isIn ? 'CUSTOMER' : 'VENDOR';

  const people = useMemo(
    () =>
      parties.filter(
        (p) => p.type === partyType,
      ),
    [parties, partyType],
  );
  const cashLedger = useMemo(
    () => ledgers.find((l) => l.group.name === 'Cash-in-Hand'),
    [ledgers],
  );

  const [partyId, setPartyId] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [method, setMethod] = useState<string>('CASH');
  const [ledgerId, setLedgerId] = useState('');
  useEffect(() => {
    if (cashLedger) {
      setLedgerId(cashLedger.id);
    }
  }, [cashLedger]);
  const [reference, setReference] = useState('');
  const [alloc, setAlloc] = useState<Record<string, string>>({});
  const [advance, setAdvance] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // Bank accounts — when method is 'Bank', the user picks which account the
  // money settles into and we post to that bank's ledger.
  const [banks, setBanks] = useState<BankAccountRow[]>([]);
  const [bankAccountId, setBankAccountId] = useState('');
  useEffect(() => {
    fetchBanks(companyId).then(setBanks).catch(() => { });
  }, [companyId]);
  // The ledger actually used: the chosen bank's ledger when paying by Bank.
  const effectiveLedgerId =
    method === 'BANK'
      ? banks.find((b) => b.id === bankAccountId)?.ledgerId ?? ''
      : ledgerId;

  const [openDocs, setOpenDocs] = useState<OpenDoc[]>([]);
  const [history, setHistory] = useState<HistoryDoc[]>([]);
  const [payHistory, setPayHistory] = useState<PartyPaymentView[]>([]);
  /** Screen-specific outstanding: sum of outstanding for this screen's doc type only. */
  const [screenBalance, setScreenBalance] = useState<number | null>(null);
  const [loadingParty, setLoadingParty] = useState(false);

  // Preselect a party when arriving from a customer/vendor row (?party=…).
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const pid = new URLSearchParams(window.location.search).get('party');
    if (pid && people.some((p) => p.id === pid)) setPartyId(pid);
  }, [people]);

  const selectedParty = people.find((p) => p.id === partyId) ?? null;
  // Payment-In: the screen itself fixes the document (Estimate Banking vs
  // Invoice Banking) and only lists customers tracked that way. Payment-Out
  // always settles purchase bills.
  const useEstimate = isIn && docKind === 'estimate';

  const loadParty = useCallback(
    async (pid: string) => {
      if (!pid) {
        setOpenDocs([]);
        setHistory([]);
        setPayHistory([]);
        setScreenBalance(null);
        return;
      }
      setLoadingParty(true);
      try {
        const pays = await fetchPartyPayments(companyId, pid).catch(() => []);
        // Filter payment history to match only this screen's scope:
        // - Estimate Banking: payments where source === 'estimate' or estimateId is set (legacy).
        // - Invoice Banking:  payments where source === 'invoice' or both source and estimateId are null (legacy).
        const screenPays = pays.filter((p) => {
          if (useEstimate) {
            return !!p.estimateId || p.source === 'estimate';
          } else if (isIn) {
            return !p.estimateId && (p.source === 'invoice' || p.source === null);
          }
          // Payment-Out: show all payment-direction entries.
          return p.direction === 'PAYMENT';
        });
        setPayHistory(screenPays);
        // Money paid so far against a specific estimate.
        const paidFor = (docId: string) =>
          pays
            .filter((p) => p.estimateId === docId)
            .reduce((s, p) => s + p.amount, 0);

        if (useEstimate) {
          const ests = (await fetchEstimates(companyId).catch(() => []))
            .filter((e) => e.party.id === pid && e.status !== 'CANCELLED');
          const rows = ests.map((e) => {
            const paid = paidFor(e.id);
            return {
              id: e.id,
              no: e.estimateNo,
              date: e.date,
              total: e.total,
              paid,
              outstanding: Math.max(0, Math.round((e.total - paid) * 100) / 100),
              kind: 'estimate' as const,
            };
          });
          setOpenDocs(rows.filter((r) => r.outstanding > 0));
          const histRows = rows
            .map((r) => ({ no: r.no, date: r.date, total: r.total, paid: r.paid, outstanding: r.outstanding, isBill: false }))
            .sort((a, b) => b.date.localeCompare(a.date));
          setHistory(histRows);
          // Balance = Σ estimate totals (debit) − Σ all estimate-screen payments (credit).
          const totalDebit = rows.reduce((s, r) => s + r.total, 0);
          const totalCredit = screenPays.reduce((s, p) => s + p.amount, 0);
          setScreenBalance(Math.round((totalDebit - totalCredit) * 100) / 100);
        } else if (isIn) {
          const invs = (await fetchInvoices(companyId))
            .filter((i) => i.party.id === pid && i.status !== 'CANCELLED');
          setOpenDocs(
            invs
              .filter((i) => i.outstanding > 0)
              .map((i) => ({ id: i.id, no: i.invoiceNo, date: i.date, total: i.total, outstanding: i.outstanding, kind: 'invoice' as const })),
          );
          const histRows = invs
            .map((i) => ({ no: i.invoiceNo, date: i.date, total: i.total, paid: i.total - i.outstanding, outstanding: i.outstanding, isBill: false }))
            .sort((a, b) => b.date.localeCompare(a.date));
          setHistory(histRows);
          // Balance = Σ invoice outstanding (already net of linked payments) − unlinked advances.
          const totalOutstanding = invs.reduce((s, i) => s + i.outstanding, 0);
          const unlinkedPaid = screenPays.reduce((s, p) => s + p.amount, 0);
          setScreenBalance(Math.round((totalOutstanding - unlinkedPaid) * 100) / 100);
        } else {
          const bills = (await fetchPurchaseBills(companyId))
            .filter((b) => b.party.id === pid && b.status !== 'CANCELLED');
          setOpenDocs(
            bills
              .filter((b) => b.outstanding > 0)
              .map((b) => ({ id: b.id, no: b.billNo, date: b.date, total: b.total, outstanding: b.outstanding, kind: 'bill' as const })),
          );
          const histRows = bills
            .map((b) => ({ no: b.billNo, date: b.date, total: b.total, paid: b.total - b.outstanding, outstanding: b.outstanding, isBill: true }))
            .sort((a, b) => b.date.localeCompare(a.date));
          setHistory(histRows);
          // Balance = Σ bill outstanding (already net of linked payments) − unlinked advances.
          const totalOutstanding = bills.reduce((s, b) => s + b.outstanding, 0);
          const unlinkedPaid = screenPays.reduce((s, p) => s + p.amount, 0);
          setScreenBalance(Math.round((totalOutstanding - unlinkedPaid) * 100) / 100);
        }
      } finally {
        setLoadingParty(false);
      }
    },
    // `useEstimate` decides which document this screen settles — leaving it out
    // would let the callback close over a stale value and load invoices on the
    // estimate screen (or vice-versa).
    [companyId, isIn, useEstimate],
  );

  useEffect(() => {
    setAlloc({});
    setAdvance('');
    void loadParty(partyId);
  }, [partyId, loadParty]);

  const allocTotal = Object.values(alloc).reduce((s, v) => s + (Number(v) || 0), 0);
  const grandTotal = allocTotal + (Number(advance) || 0);

  // Statement reconciliation (estimate / purchase-estimate link mode):
  // total billed − everything received/paid against this party. Using the sum
  // of ALL receipts (not just per-document linked ones) keeps Balance Due in
  // step with the party's ledger balance, so receivable − paid = balance.
  const expectedDir = isIn ? 'RECEIPT' : 'PAYMENT';
  const totalBilled =
    Math.round(history.reduce((sum, h) => sum + h.total, 0) * 100) / 100;
  const totalReceived =
    Math.round(
      payHistory
        .filter((p) => p.direction === expectedDir)
        .reduce((sum, p) => sum + p.amount, 0) * 100,
    ) / 100;
  const amountDue = Math.max(
    0,
    Math.round((totalBilled - totalReceived) * 100) / 100,
  );

  async function removePayment(id: string) {
    if (!partyId) return;
    if (typeof window !== 'undefined' && !window.confirm(t('deleteConfirm'))) {
      return;
    }
    try {
      await deletePartyPayment(companyId, partyId, id);
      toast(t('deleted'));
      await onChanged();
      void loadParty(partyId);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : tc('somethingWentWrong'));
    }
  }

  function autoAllocate() {
    // Fill each open doc with its full outstanding.
    const next: Record<string, string> = {};
    for (const d of openDocs) next[d.id] = String(d.outstanding);
    setAlloc(next);
  }

  // ---- Inline add party (full particulars via the shared modal) ----
  const [showAdd, setShowAdd] = useState(false);

  async function submit() {
    if (!partyId || grandTotal <= 0 || !effectiveLedgerId) return;
    setBusy(true);
    setError('');
    const base = { date, ledgerId: effectiveLedgerId, method, reference: reference || undefined };
    try {
      if (useEstimate) {
        // Aggregate mode: spread the received/paid lump sum across the open
        // estimates / purchase-estimates oldest-first, posting each as a payment
        // linked to that doc so its outstanding reduces next time. Any excess
        // beyond every open doc is recorded on-account (unlinked advance).
        let remaining = Math.round((Number(advance) || 0) * 100) / 100;
        const ordered = [...openDocs].sort((a, b) => a.date.localeCompare(b.date));
        for (const d of ordered) {
          if (remaining <= 0) break;
          const pay = Math.min(remaining, d.outstanding);
          if (pay <= 0) continue;
          await api.post(`/companies/${companyId}/parties/${partyId}/payments`, {
            amount: pay,
            estimateId: d.id,
            source: 'estimate',
            ...base,
          });
          remaining = Math.round((remaining - pay) * 100) / 100;
        }
        if (remaining > 0) {
          await api.post(`/companies/${companyId}/parties/${partyId}/payments`, {
            amount: remaining,
            source: 'estimate',
            ...base,
          });
        }
      } else {
        for (const [docId, amt] of Object.entries(alloc)) {
          const n = Number(amt);
          if (!n) continue;
          const doc = openDocs.find((d) => d.id === docId);
          if (!doc) continue;
          if (doc.kind === 'invoice') {
            await api.post(`/companies/${companyId}/invoices/${docId}/payments`, { amount: n, ...base });
          } else if (doc.kind === 'bill') {
            await api.post(`/companies/${companyId}/purchase-bills/${docId}/payments`, { amount: n, ...base });
          }
        }
        if (Number(advance) > 0) {
          await api.post(`/companies/${companyId}/parties/${partyId}/payments`, {
            amount: Number(advance),
            source: 'invoice',
            ...base,
          });
        }
      }
      toast(t('recorded'));
      setAlloc({});
      setAdvance('');
      setReference('');
      await onChanged();
      void loadParty(partyId);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : tc('somethingWentWrong'));
    } finally {
      setBusy(false);
    }
  }

  if (!canManage) {
    return <EmptyState title={t('noAccess')} body={t('noAccessBody')} />;
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_340px]">
      {/* Left: payment form */}
      <Card>
        <h3 className="mb-3 text-base font-semibold text-ink">
          {isIn ? t('titleIn') : t('titleOut')}
        </h3>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <div className="flex items-center justify-between">
              <Label>{isIn ? tc('customer') : tc('vendor')}</Label>
              <button
                type="button"
                onClick={() => setShowAdd(true)}
                className="text-xs font-medium text-brand-600 hover:underline"
              >
                {t('addNew')}
              </button>
            </div>
            <Combobox
              value={partyId}
              onChange={setPartyId}
              placeholder={isIn ? t('selectCustomer') : t('selectVendor')}
              searchPlaceholder={tc('search')}
              options={people.map((p) => ({
                value: p.id,
                label: `${p.name}${p.gstin ? ` (${p.gstin})` : ''}`,
                // Document-based outstanding for the party's tracked type — must
                // match the docs listed below (estimate-tracked → estimate dues),
                // not the raw ledger balance.
                hint: `₹${inr(p.outstanding)}`,
              }))}
            />
          </div>

          {showAdd && (
            <AddPartyModal
              companyId={companyId}
              defaultType={partyType}
              lockType
              showOpening
              onClose={() => setShowAdd(false)}
              onSaved={async (created) => {
                setShowAdd(false);
                await onChanged();
                setPartyId(created.id);
              }}
            />
          )}

          <div>
            <Label>{tc('date')}</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div>
            <Label>{t('method')}</Label>
            <Select value={method} onChange={(e) => setMethod(e.target.value)}>
              {METHODS.map((m) => (
                <option key={m} value={m}>
                  {t(`methods.${m}`)}
                </option>
              ))}
            </Select>
          </div>
          {method === 'BANK' && (
            <div>
              <Label>{t('bankAccount')}</Label>
              <Select value={bankAccountId} onChange={(e) => setBankAccountId(e.target.value)}>
                <option value="">{t('selectBank')}</option>
                {banks.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.accountName}
                    {b.bankName ? ` · ${b.bankName}` : ''}
                    {b.accountNo ? ` · ${b.accountNo}` : ''}
                  </option>
                ))}
              </Select>
              {banks.length === 0 && (
                <p className="mt-1 text-[11px] text-amber-600">{t('noBanks')}</p>
              )}
            </div>
          )}
          <div>
            <Label>{t('reference')}</Label>
            <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder={t('referencePlaceholder')} />
          </div>
        </div>

        {/* Aggregate statement (estimate / purchase-estimate link mode):
            the whole balance owed, not per-document allocation. */}
        {partyId && useEstimate && (
          <div className="mt-4">
            {loadingParty ? (
              <p className="text-sm text-faint">{tc('loading')}</p>
            ) : (
              <div className="rounded-lg border border-line bg-subtle p-4">
                <div className="flex items-center justify-between text-sm text-muted">
                  <span>{isIn ? t('totalReceivable') : t('totalPayable')}</span>
                  <span className="tabular-nums">₹{inr(totalBilled)}</span>
                </div>
                <div className="mt-1 flex items-center justify-between text-sm text-muted">
                  <span>{isIn ? t('amountReceived') : t('amountPaid')}</span>
                  <span className="tabular-nums text-emerald-600">
                    − ₹{inr(totalReceived)}
                  </span>
                </div>
                <div className="mt-2 flex items-center justify-between border-t border-line pt-2">
                  <span className="text-sm font-semibold text-ink">
                    {t('balanceDue')}
                  </span>
                  <span className="text-xl font-bold tabular-nums text-ink">
                    ₹{inr(amountDue)}
                  </span>
                </div>
                <p className="mt-1 text-[11px] text-muted">{t('aggregateHint')}</p>
                <div className="mt-3 flex flex-wrap items-end gap-3">
                  <label className="text-sm">
                    <span className="mb-1 block font-medium text-muted">
                      {isIn ? t('amountReceived') : t('amountPaid')}
                    </span>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={advance}
                      onChange={(e) => setAdvance(e.target.value)}
                      placeholder="0"
                      className="w-40"
                    />
                  </label>
                  {amountDue > 0 && (
                    <button
                      type="button"
                      onClick={() => setAdvance(String(amountDue))}
                      className="pb-2 text-xs font-medium text-brand-600 hover:underline"
                    >
                      {t('settleAll')}
                    </button>
                  )}
                </div>
              </div>
            )}
            <div className="mt-3 flex items-center gap-3">
              <Button type="button" disabled={busy || grandTotal <= 0 || !effectiveLedgerId} onClick={() => void submit()}>
                {busy ? tc('saving') : isIn ? t('recordIn') : t('recordOut')}
              </Button>
              <ErrorText>{error}</ErrorText>
            </div>
          </div>
        )}

        {/* Per-document allocation (invoice / purchase-bill link mode). */}
        {partyId && !useEstimate && (
          <div className="mt-4">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-semibold text-ink">{t('openDocs')}</span>
              {openDocs.length > 0 && (
                <button type="button" onClick={autoAllocate} className="text-xs font-medium text-brand-600 hover:underline">
                  {t('settleAll')}
                </button>
              )}
            </div>
            {loadingParty ? (
              <p className="text-sm text-faint">{tc('loading')}</p>
            ) : openDocs.length === 0 ? (
              <p className="text-sm text-faint">{t('noOpenDocs')}</p>
            ) : (
              <div className="overflow-x-auto"><table className="w-full min-w-[600px] text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-[11px] font-semibold uppercase tracking-wide text-muted">
                    <th className="py-1.5">{t('docNo')}</th>
                    <th className="py-1.5">{tc('date')}</th>
                    <th className="py-1.5 text-right">{t('outstandingCol')}</th>
                    <th className="py-1.5 text-right">{t('payNow')}</th>
                  </tr>
                </thead>
                <tbody>
                  {openDocs.map((d) => (
                    <tr key={d.id} className="border-b border-line last:border-0">
                      <td className="py-1.5 font-mono text-xs">{d.no}</td>
                      <td className="py-1.5">{new Date(d.date).toLocaleDateString('en-IN')}</td>
                      <td className="py-1.5 text-right tabular-nums">₹{inr(d.outstanding)}</td>
                      <td className="py-1.5 text-right">
                        <Input
                          type="number"
                          min="0"
                          max={d.outstanding}
                          step="0.01"
                          value={alloc[d.id] ?? ''}
                          onChange={(e) => setAlloc((a) => ({ ...a, [d.id]: e.target.value }))}
                          placeholder="0"
                          className="w-28 text-right"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
            )}

            <div className="mt-3 flex flex-wrap items-end justify-between gap-3 border-t border-line pt-3">
              <label className="text-sm">
                <span className="mb-1 block font-medium text-muted">{t('advance')}</span>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={advance}
                  onChange={(e) => setAdvance(e.target.value)}
                  placeholder="0"
                  className="w-32"
                />
              </label>
              <div className="text-right">
                <div className="text-xs text-muted">{t('totalPayment')}</div>
                <div className="text-lg font-semibold text-ink tabular-nums">₹{inr(grandTotal)}</div>
              </div>
            </div>

            <div className="mt-3 flex items-center gap-3">
              <Button type="button" disabled={busy || grandTotal <= 0 || !effectiveLedgerId} onClick={() => void submit()}>
                {busy ? tc('saving') : isIn ? t('recordIn') : t('recordOut')}
              </Button>
              <ErrorText>{error}</ErrorText>
            </div>
          </div>
        )}
      </Card>

      {/* Right: transaction history */}
      <Card>
        <h3 className="mb-2 text-sm font-semibold text-ink">{t('history')}</h3>
        {!partyId ? (
          <p className="text-sm text-faint">{t('pickToSeeHistory')}</p>
        ) : (
          <div className="space-y-3 text-sm">
            {selectedParty && screenBalance !== null && (
              <div className="rounded-md bg-subtle p-2 text-xs text-muted">
                {t('currentBalance')}:{' '}
                <strong className="text-ink">
                  ₹{inr(screenBalance)}
                </strong>
              </div>
            )}
            {history.length === 0 && payHistory.length === 0 ? (
              <p className="text-faint">{t('noHistory')}</p>
            ) : (
              <>
                {history.map((h, i) => (
                  <div key={`d${i}`} className="flex items-center justify-between border-b border-line pb-1.5">
                    <div>
                      <div className="font-mono text-xs text-ink">{h.no}</div>
                      <div className="text-[11px] text-faint">
                        {new Date(h.date).toLocaleDateString('en-IN')}
                        {useEstimate ? ` · ${t('estimateTag')}` : ''}
                      </div>
                    </div>
                    <div className="text-right tabular-nums">
                      <div>₹{inr(h.total)}</div>
                      {h.paid > 0 && (
                        <div className="text-[11px] text-emerald-600">{t('paidSoFar')} ₹{inr(h.paid)}</div>
                      )}
                      {h.outstanding > 0 && (
                        <div className="text-[11px] text-amber-600">{t('due')} ₹{inr(h.outstanding)}</div>
                      )}
                    </div>
                  </div>
                ))}
                {payHistory.map((p) => (
                  <div key={p.id} className="flex items-center justify-between gap-2 border-b border-line pb-1.5">
                    <div className="min-w-0">
                      <div className="text-xs font-medium text-emerald-700">
                        {p.direction === 'RECEIPT' ? t('methods.RECEIPT') : t('methods.PAYMENT')}
                        {p.advanceRef ? ` · ${p.advanceRef}` : ''}
                      </div>
                      <div className="text-[11px] text-faint">
                        {new Date(p.date).toLocaleDateString('en-IN')} · {p.method}
                        {p.reference ? ` · ${p.reference}` : ''}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-right tabular-nums text-emerald-700">₹{inr(p.amount)}</span>
                      <button
                        type="button"
                        onClick={() => void removePayment(p.id)}
                        title={t('deleteEntry')}
                        aria-label={t('deleteEntry')}
                        className="rounded p-1 text-faint transition-colors hover:bg-rose-50 hover:text-rose-600"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                          <line x1="10" y1="11" x2="10" y2="17" />
                          <line x1="14" y1="11" x2="14" y2="17" />
                        </svg>
                      </button>
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}
