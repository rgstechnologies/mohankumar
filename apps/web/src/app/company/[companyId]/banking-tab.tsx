'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useFeedback } from '@/components/feedback';
import { Badge, Button, Card, HelpTip, Input, Select } from '@/components/ui';
import {
  createVoucherFromStatementLine,
  fetchRecoSuggestions,
  inr,
  type LedgerRow,
  type RecoSuggestionView,
} from '@/lib/accounting';
import { api, ApiError } from '@/lib/api';
import { AiSparkle } from '@/components/icons';
import { BanksCard } from './banks-card';

interface BankLedger {
  id: string;
  name: string;
  group: { name: string };
}

interface Reconciliation {
  ledger: { id: string; name: string };
  bookBalance: number;
  bookBalanceType: 'DEBIT' | 'CREDIT';
  summary: {
    statementLines: number;
    matched: number;
    unmatchedStatement: number;
    unmatchedBook: number;
  };
  batches: { id: string; fileName: string; lineCount: number; importedAt: string }[];
  statementLines: {
    id: string;
    date: string;
    description: string;
    amount: number;
    direction: 'IN' | 'OUT';
    matched: { voucherLineId: string; voucherNo: string; narration: string | null } | null;
  }[];
  unmatchedBookLines: {
    voucherLineId: string;
    date: string;
    voucherNo: string;
    narration: string | null;
    type: 'DEBIT' | 'CREDIT';
    amount: number;
  }[];
}

export function BankingTab({
  companyId,
  canManage,
  ledgers,
}: {
  companyId: string;
  canManage: boolean;
  ledgers: LedgerRow[];
}) {
  const t = useTranslations('banking');
  const tc = useTranslations('common');
  const { toast } = useFeedback();
  const [bankLedgers, setBankLedgers] = useState<BankLedger[]>([]);
  const [ledgerId, setLedgerId] = useState('');
  const [rec, setRec] = useState<Reconciliation | null>(null);
  const [importing, setImporting] = useState(false);
  const [suggestions, setSuggestions] = useState<RecoSuggestionView[] | null>(null);
  const [suggesting, setSuggesting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api
      .get<BankLedger[]>(`/companies/${companyId}/banking/ledgers`)
      .then((ledgers) => {
        setBankLedgers(ledgers);
        const bank = ledgers.find((l) => l.group.name === 'Bank Accounts') ?? ledgers[0];
        if (bank) setLedgerId(bank.id);
      })
      .catch(() => {});
  }, [companyId]);

  const reload = useCallback(async () => {
    if (!ledgerId) return;
    setRec(
      await api.get<Reconciliation>(
        `/companies/${companyId}/banking/${ledgerId}/reconciliation`,
      ),
    );
  }, [companyId, ledgerId]);

  useEffect(() => {
    void reload().catch(() => {});
  }, [reload]);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !ledgerId) return;
    setImporting(true);
    try {
      const csv = await file.text();
      const result = await api.post<{ imported: number; autoMatched: number }>(
        `/companies/${companyId}/banking/${ledgerId}/import`,
        { fileName: file.name, csv },
      );
      toast(
        t('toast.imported', {
          imported: result.imported,
          autoMatched: result.autoMatched,
        }),
      );
      await reload();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : t('toast.importFailed'), 'error');
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function manualMatch(lineId: string, voucherLineId: string) {
    try {
      await api.post(`/companies/${companyId}/banking/lines/${lineId}/match`, {
        voucherLineId,
      });
      toast(t('toast.matched'));
      await reload();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : t('toast.matchFailed'), 'error');
    }
  }

  async function unmatch(lineId: string) {
    await api.post(`/companies/${companyId}/banking/lines/${lineId}/unmatch`);
    toast(t('toast.matchRemoved'), 'info');
    await reload();
  }

  async function suggest() {
    setSuggesting(true);
    try {
      const result = await fetchRecoSuggestions(companyId, ledgerId);
      setSuggestions(result.suggestions);
      if (result.suggestions.length === 0) toast(t('ai.empty'), 'info');
    } catch (err) {
      toast(err instanceof ApiError ? err.message : t('toast.matchFailed'), 'error');
    } finally {
      setSuggesting(false);
    }
  }

  function dropSuggestion(statementLineId: string) {
    setSuggestions((prev) =>
      prev ? prev.filter((s) => s.statementLineId !== statementLineId) : prev,
    );
  }

  async function acceptMatch(s: RecoSuggestionView) {
    if (!s.match) return;
    await manualMatch(s.statementLineId, s.match.voucherLineId);
    dropSuggestion(s.statementLineId);
  }

  async function acceptCreate(
    s: RecoSuggestionView,
    counterLedgerId: string,
    narration: string,
  ) {
    try {
      await createVoucherFromStatementLine(
        companyId,
        s.statementLineId,
        counterLedgerId,
        narration || undefined,
      );
      toast(t('ai.created'));
      dropSuggestion(s.statementLineId);
      await reload();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : t('toast.matchFailed'), 'error');
    }
  }

  if (bankLedgers.length === 0) {
    return (
      <Card>
        <p className="text-sm text-muted">{t('noLedgers')}</p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Manage the company's bank accounts (printed on documents) */}
      <BanksCard companyId={companyId} canManage={canManage} />

      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Select
            value={ledgerId}
            onChange={(e) => setLedgerId(e.target.value)}
            className="w-56"
          >
            {bankLedgers.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </Select>
          <HelpTip text={t('helpTip')} />
        </div>
        {canManage && (
          <div className="flex items-center gap-2">
            {rec && rec.summary.unmatchedStatement > 0 && (
              <Button variant="secondary" onClick={() => void suggest()} disabled={suggesting}>
                <AiSparkle className="h-4 w-4" /> {suggesting ? t('ai.suggesting') : t('ai.suggest')}
              </Button>
            )}
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={onFile}
            />
            <Button onClick={() => fileRef.current?.click()} disabled={importing || !ledgerId}>
              {importing ? t('importing') : t('importCsv')}
            </Button>
          </div>
        )}
      </div>

      {suggestions && suggestions.length > 0 && rec && (
        <div className="rounded-md border border-line bg-surface shadow-sm">
          <div className="space-y-3 rounded-md bg-surface p-4">
            <div className="flex items-center gap-2 text-sm font-medium text-ink">
              <AiSparkle className="h-4 w-4 text-brand-600" />
              {t('ai.title')}
              <HelpTip text={t('ai.hint')} />
            </div>
            {suggestions.map((s) => (
              <SuggestionRow
                key={s.statementLineId}
                suggestion={s}
                statementLine={rec.statementLines.find((l) => l.id === s.statementLineId)}
                ledgers={ledgers}
                bankLedgerId={ledgerId}
                onAcceptMatch={() => void acceptMatch(s)}
                onAcceptCreate={(counterLedgerId, narration) =>
                  void acceptCreate(s, counterLedgerId, narration)
                }
                onDismiss={() => dropSuggestion(s.statementLineId)}
              />
            ))}
          </div>
        </div>
      )}

      {rec && (
        <>
          {/* Summary */}
          <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
            <Card>
              <p className="text-xs font-medium uppercase tracking-wide text-faint">
                {t('summary.bookBalance')}
              </p>
              <p className="mt-1 text-2xl font-bold tabular-nums">
                ₹{inr(rec.bookBalance)}{' '}
                <span className="text-sm font-medium text-faint">
                  {rec.bookBalanceType === 'DEBIT' ? tc('dr') : tc('cr')}
                </span>
              </p>
            </Card>
            <Card>
              <p className="text-xs font-medium uppercase tracking-wide text-faint">
                {t('summary.statementLines')}
              </p>
              <p className="mt-1 text-2xl font-bold tabular-nums">
                {rec.summary.statementLines}
              </p>
            </Card>
            <Card>
              <p className="text-xs font-medium uppercase tracking-wide text-faint">
                {t('summary.matched')}
              </p>
              <p className="mt-1 text-2xl font-bold tabular-nums text-emerald-600">
                {rec.summary.matched}
              </p>
            </Card>
            <Card>
              <p className="text-xs font-medium uppercase tracking-wide text-faint">
                {t('summary.needsAttention')}
              </p>
              <p
                className={`mt-1 text-2xl font-bold tabular-nums ${
                  rec.summary.unmatchedStatement + rec.summary.unmatchedBook > 0
                    ? 'text-amber-600'
                    : 'text-emerald-600'
                }`}
              >
                {rec.summary.unmatchedStatement + rec.summary.unmatchedBook}
              </p>
            </Card>
          </div>

          {/* Statement lines */}
          <Card title={t('statementTitle', { name: rec.ledger.name })}>
            {rec.statementLines.length === 0 ? (
              <p className="text-sm text-muted">{t('noStatement')}</p>
            ) : (
              <div className="overflow-x-auto"><table className="w-full min-w-[600px] text-sm">
                <thead>
                  <tr className="border-b border-line bg-subtle text-left text-[11px] font-semibold uppercase tracking-wide text-muted">
                    <th className="py-2">{tc('date')}</th>
                    <th className="py-2">{t('table.description')}</th>
                    <th className="py-2 text-center">{t('table.inOut')}</th>
                    <th className="py-2 text-right">{tc('amount')}</th>
                    <th className="py-2">{t('table.matchedBookEntry')}</th>
                    {canManage && <th className="py-2 text-right">{tc('actions')}</th>}
                  </tr>
                </thead>
                <tbody>
                  {rec.statementLines.map((line) => (
                    <tr key={line.id} className="border-b border-line last:border-0 hover:bg-subtle">
                      <td className="py-2 whitespace-nowrap">
                        {new Date(line.date).toLocaleDateString('en-IN')}
                      </td>
                      <td className="py-2 text-muted">{line.description}</td>
                      <td className="py-2 text-center">
                        <Badge tone={line.direction === 'IN' ? 'good' : 'warn'}>
                          {t(`direction.${line.direction}`)}
                        </Badge>
                      </td>
                      <td className="py-2 text-right tabular-nums">₹{inr(line.amount)}</td>
                      <td className="py-2">
                        {line.matched ? (
                          <span className="font-mono text-xs text-emerald-700">
                            ✓ {line.matched.voucherNo}
                          </span>
                        ) : canManage && rec.unmatchedBookLines.length > 0 ? (
                          <Select
                            defaultValue=""
                            onChange={(e) => {
                              if (e.target.value) void manualMatch(line.id, e.target.value);
                            }}
                            className="max-w-64 text-xs"
                          >
                            <option value="">{t('matchManually')}</option>
                            {rec.unmatchedBookLines
                              .filter(
                                (b) =>
                                  (line.direction === 'IN') === (b.type === 'DEBIT'),
                              )
                              .map((b) => (
                                <option key={b.voucherLineId} value={b.voucherLineId}>
                                  {b.voucherNo} · ₹{inr(b.amount)} ·{' '}
                                  {new Date(b.date).toLocaleDateString('en-IN')}
                                </option>
                              ))}
                          </Select>
                        ) : (
                          <Badge tone="neutral">{t('unmatchedBadge')}</Badge>
                        )}
                      </td>
                      {canManage && (
                        <td className="py-2 text-right">
                          {line.matched && (
                            <button
                              onClick={() => unmatch(line.id)}
                              className="text-xs text-faint hover:text-red-500"
                            >
                              {t('unmatch')}
                            </button>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table></div>
            )}
          </Card>

          {/* Unmatched book entries */}
          {rec.unmatchedBookLines.length > 0 && (
            <Card title={t('booksNotOnStatement')}>
              <div className="overflow-x-auto"><table className="w-full min-w-[600px] text-sm">
                <thead>
                  <tr className="border-b border-line bg-subtle text-left text-[11px] font-semibold uppercase tracking-wide text-muted">
                    <th className="py-2">{tc('date')}</th>
                    <th className="py-2">{t('table.voucher')}</th>
                    <th className="py-2">{t('table.narration')}</th>
                    <th className="py-2 text-center">{t('table.drCr')}</th>
                    <th className="py-2 text-right">{tc('amount')}</th>
                  </tr>
                </thead>
                <tbody>
                  {rec.unmatchedBookLines.map((line) => (
                    <tr key={line.voucherLineId} className="border-b border-line last:border-0 hover:bg-subtle">
                      <td className="py-2 whitespace-nowrap">
                        {new Date(line.date).toLocaleDateString('en-IN')}
                      </td>
                      <td className="py-2 font-mono text-xs">{line.voucherNo}</td>
                      <td className="py-2 text-muted">{line.narration ?? '—'}</td>
                      <td className="py-2 text-center text-xs">
                        {line.type === 'DEBIT' ? tc('dr') : tc('cr')}
                      </td>
                      <td className="py-2 text-right tabular-nums">₹{inr(line.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
              <p className="mt-3 text-xs text-faint">{t('booksNote')}</p>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

function SuggestionRow({
  suggestion,
  statementLine,
  ledgers,
  bankLedgerId,
  onAcceptMatch,
  onAcceptCreate,
  onDismiss,
}: {
  suggestion: RecoSuggestionView;
  statementLine?: {
    date: string;
    description: string;
    amount: number;
    direction: 'IN' | 'OUT';
  };
  ledgers: LedgerRow[];
  bankLedgerId: string;
  onAcceptMatch: () => void;
  onAcceptCreate: (counterLedgerId: string, narration: string) => void;
  onDismiss: () => void;
}) {
  const t = useTranslations('banking');
  const [counterLedgerId, setCounterLedgerId] = useState(
    suggestion.create?.counterLedgerId ?? '',
  );
  const [narration, setNarration] = useState(suggestion.create?.narration ?? '');
  if (!statementLine) return null;

  return (
    <div className="space-y-2 rounded-xl border border-line bg-subtle/60 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <span>
          <Badge tone={statementLine.direction === 'IN' ? 'good' : 'warn'}>
            {t(`direction.${statementLine.direction}`)}
          </Badge>{' '}
          <span className="font-medium">₹{inr(statementLine.amount)}</span>{' '}
          <span className="text-muted">{statementLine.description}</span>{' '}
          <span className="text-xs text-faint">
            {new Date(statementLine.date).toLocaleDateString('en-IN')}
          </span>
        </span>
        <span className="text-xs text-faint">
          {t('ai.confidence', { pct: Math.round(suggestion.confidence * 100) })}
        </span>
      </div>
      <p className="text-xs text-muted">{suggestion.reason}</p>

      {suggestion.kind === 'MATCH' && suggestion.match ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-sm">
            {t('ai.matchWith')}{' '}
            <span className="font-mono text-xs">{suggestion.match.voucherNo}</span> · ₹
            {inr(suggestion.match.amount)} ·{' '}
            {new Date(suggestion.match.date).toLocaleDateString('en-IN')}
            {suggestion.match.narration && (
              <span className="text-faint"> — {suggestion.match.narration}</span>
            )}
          </span>
          <span className="flex gap-2">
            <Button onClick={onAcceptMatch}>{t('ai.accept')}</Button>
            <Button variant="secondary" onClick={onDismiss}>
              {t('ai.dismiss')}
            </Button>
          </span>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm">{t('ai.createAs')}</span>
          <Select
            value={counterLedgerId}
            onChange={(e) => setCounterLedgerId(e.target.value)}
            className="w-56 text-xs"
          >
            <option value="">
              {suggestion.create?.counterLedgerId
                ? t('ai.pickLedger')
                : t('ai.missingLedger', {
                    name: suggestion.create?.counterLedgerName ?? '',
                  })}
            </option>
            {ledgers
              .filter((l) => l.id !== bankLedgerId)
              .map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
          </Select>
          <Input
            value={narration}
            onChange={(e) => setNarration(e.target.value)}
            placeholder={t('ai.narrationPlaceholder')}
            maxLength={300}
            className="w-64 text-xs"
          />
          <Button
            disabled={!counterLedgerId}
            onClick={() => onAcceptCreate(counterLedgerId, narration)}
          >
            {t('ai.bookVoucher')}
          </Button>
          <Button variant="secondary" onClick={onDismiss}>
            {t('ai.dismiss')}
          </Button>
        </div>
      )}
    </div>
  );
}
