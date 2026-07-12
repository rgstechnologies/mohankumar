'use client';

import { Fragment, useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useFeedback } from '@/components/feedback';
import { ExportButtons } from '@/components/table';
import { Button, Card, ErrorText, Input, Label, Select } from '@/components/ui';
import {
  cancelStockTransfer,
  createStockTransfer,
  fetchStockByBranch,
  fetchStockTransfers,
  inr,
  type BranchRow,
  type BranchStockMatrix,
  type ItemRow,
  type StockRow,
  type StockTransferView,
} from '@/lib/accounting';
import { ApiError } from '@/lib/api';

type View = 'company' | 'byBranch' | 'transfers';

export function StockTab({
  companyId,
  stock,
  items,
  branches,
  canTransfer,
  onChanged,
}: {
  companyId: string;
  stock: StockRow[];
  items: ItemRow[];
  branches: BranchRow[];
  canTransfer: boolean;
  onChanged: () => Promise<void>;
}) {
  const t = useTranslations('stock');
  const [view, setView] = useState<View>('company');
  const [matrix, setMatrix] = useState<BranchStockMatrix | null>(null);
  const [transfers, setTransfers] = useState<StockTransferView[] | null>(null);

  const reloadBranchData = useCallback(async () => {
    const [m, tr] = await Promise.all([
      fetchStockByBranch(companyId),
      fetchStockTransfers(companyId),
    ]);
    setMatrix(m);
    setTransfers(tr);
  }, [companyId]);

  useEffect(() => {
    if (view !== 'company' && matrix === null) void reloadBranchData();
  }, [view, matrix, reloadBranchData]);

  const tabBtn = (key: View, label: string) => (
    <button
      key={key}
      onClick={() => setView(key)}
      className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
        view === key ? 'bg-brand-600 text-white' : 'text-muted hover:bg-subtle'
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1 rounded-xl border border-line bg-surface p-1">
          {tabBtn('company', t('views.company'))}
          {tabBtn('byBranch', t('views.byBranch'))}
          {tabBtn('transfers', t('views.transfers'))}
        </div>
        {view === 'company' && <ExportButtons companyId={companyId} report="stock" />}
      </div>

      {view === 'company' && <CompanyStock companyId={companyId} stock={stock} />}
      {view === 'byBranch' && <BranchMatrix matrix={matrix} />}
      {view === 'transfers' && (
        <TransfersView
          companyId={companyId}
          items={items}
          branches={branches}
          transfers={transfers}
          canTransfer={canTransfer}
          onMutated={async () => {
            await Promise.all([reloadBranchData(), onChanged()]);
          }}
        />
      )}
    </div>
  );
}

// ----------------------------------------------------------------
// Company-wide stock (existing view)
// ----------------------------------------------------------------

function CompanyStock({ companyId, stock }: { companyId: string; stock: StockRow[] }) {
  const t = useTranslations('stock');
  const totalValue = stock.reduce((sum, s) => sum + s.stockValue, 0);
  const lowStockCount = stock.filter((s) => s.lowStock).length;
  void companyId;

  return (
    <>
      <div className="grid grid-cols-2 gap-4">
        <Card>
          <p className="text-xs uppercase tracking-wide text-faint">{t('stockValue')}</p>
          <p className="mt-1 text-2xl font-bold tabular-nums">₹{inr(totalValue)}</p>
        </Card>
        <Card>
          <p className="text-xs uppercase tracking-wide text-faint">{t('lowStockItems')}</p>
          <p
            className={`mt-1 text-2xl font-bold tabular-nums ${lowStockCount > 0 ? 'text-amber-600' : ''}`}
          >
            {lowStockCount}
          </p>
        </Card>
      </div>

      <Card>
        {stock.length === 0 ? (
          <p className="text-sm text-muted">{t('noItems')}</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line bg-subtle text-left text-[11px] font-semibold uppercase tracking-wide text-muted">
                <th className="py-2">{t('table.item')}</th>
                <th className="py-2 text-right">{t('table.opening')}</th>
                <th className="py-2 text-right">{t('table.in')}</th>
                <th className="py-2 text-right">{t('table.out')}</th>
                <th className="py-2 text-right">{t('table.onHand')}</th>
                <th className="py-2 text-right">{t('table.avgRate')}</th>
                <th className="py-2 text-right">{t('table.value')}</th>
              </tr>
            </thead>
            <tbody>
              {stock.map((row) => (
                <Fragment key={row.itemId}>
                <tr className="border-b border-line last:border-0 hover:bg-subtle">
                  <td className="py-2 font-medium">
                    {row.name}
                    {row.lowStock && (
                      <span className="ml-2 rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
                        {t('lowStockBadge')}
                      </span>
                    )}
                  </td>
                  <td className="py-2 text-right tabular-nums">
                    {row.openingStock} {row.unit}
                  </td>
                  <td className="py-2 text-right tabular-nums text-emerald-600">
                    +{row.purchasedQty}
                  </td>
                  <td className="py-2 text-right tabular-nums text-red-500">
                    −{row.soldQty}
                  </td>
                  <td className="py-2 text-right font-semibold tabular-nums">
                    {row.onHand} {row.unit}
                  </td>
                  <td className="py-2 text-right tabular-nums">₹{inr(row.avgRate)}</td>
                  <td className="py-2 text-right tabular-nums">₹{inr(row.stockValue)}</td>
                </tr>
                {row.trackBatches && row.batches.length > 0 && (
                  <tr className="border-b border-line hover:bg-subtle">
                    <td colSpan={7} className="bg-subtle/60 px-4 py-2">
                      <div className="flex flex-wrap gap-2">
                        {row.batches.map((b) => (
                          <span
                            key={b.batchNo}
                            className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs ${
                              b.expired
                                ? 'border-red-200 bg-red-50 text-red-700'
                                : b.expiringSoon
                                  ? 'border-amber-200 bg-amber-50 text-amber-700'
                                  : 'border-line bg-surface text-muted'
                            }`}
                          >
                            <span className="font-mono font-medium">{b.batchNo}</span>
                            <span className="tabular-nums">{b.qty} {row.unit}</span>
                            {b.expiryDate && (
                              <span>
                                {t('batch.exp', {
                                  date: new Date(b.expiryDate).toLocaleDateString('en-IN'),
                                })}
                                {b.expired
                                  ? ` ${t('batch.expired')}`
                                  : b.expiringSoon
                                    ? ` ${t('batch.soon')}`
                                    : ''}
                              </span>
                            )}
                          </span>
                        ))}
                      </div>
                    </td>
                  </tr>
                )}
                </Fragment>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </>
  );
}

// ----------------------------------------------------------------
// Branch-wise matrix
// ----------------------------------------------------------------

function BranchMatrix({ matrix }: { matrix: BranchStockMatrix | null }) {
  const t = useTranslations('stock');
  const tc = useTranslations('common');

  if (!matrix) {
    return <Card><p className="text-sm text-muted">{tc('loading')}</p></Card>;
  }
  const locations = matrix.locations.map((l) => ({
    ...l,
    name: l.id === '' ? t('headOffice') : l.name,
  }));
  return (
    <Card>
      {matrix.rows.length === 0 ? (
        <p className="text-sm text-muted">{t('noItems')}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line bg-subtle text-left text-[11px] font-semibold uppercase tracking-wide text-muted">
                <th className="py-2">{t('table.item')}</th>
                {locations.map((l) => (
                  <th key={l.id || 'ho'} className="pb-2 text-right">
                    {l.name}
                  </th>
                ))}
                <th className="py-2 text-right">{tc('total')}</th>
              </tr>
            </thead>
            <tbody>
              {matrix.rows.map((row) => (
                <tr key={row.itemId} className="border-b border-line last:border-0 hover:bg-subtle">
                  <td className="py-2 font-medium">{row.name}</td>
                  {locations.map((l) => {
                    const qty = row.quantities[l.id] ?? 0;
                    return (
                      <td
                        key={l.id || 'ho'}
                        className={`py-2 text-right tabular-nums ${
                          qty < 0 ? 'text-red-500' : qty === 0 ? 'text-slate-300' : ''
                        }`}
                      >
                        {qty} {qty !== 0 ? row.unit : ''}
                      </td>
                    );
                  })}
                  <td className="py-2 text-right font-semibold tabular-nums">
                    {row.total} {row.unit}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-3 text-xs text-faint">{t('matrixHint')}</p>
    </Card>
  );
}

// ----------------------------------------------------------------
// Transfers
// ----------------------------------------------------------------

interface DraftLine {
  itemId: string;
  quantity: string;
  batchNo: string;
}

const EMPTY_LINE: DraftLine = { itemId: '', quantity: '', batchNo: '' };

function TransfersView({
  companyId,
  items,
  branches,
  transfers,
  canTransfer,
  onMutated,
}: {
  companyId: string;
  items: ItemRow[];
  branches: BranchRow[];
  transfers: StockTransferView[] | null;
  canTransfer: boolean;
  onMutated: () => Promise<void>;
}) {
  const t = useTranslations('stock');
  const tc = useTranslations('common');
  const { toast, confirm } = useFeedback();
  const [showForm, setShowForm] = useState(false);
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [fromBranchId, setFromBranchId] = useState('');
  const [toBranchId, setToBranchId] = useState('');
  const [narration, setNarration] = useState('');
  const [lines, setLines] = useState<DraftLine[]>([{ ...EMPTY_LINE }]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const itemById = new Map(items.map((i) => [i.id, i]));
  const activeBranches = branches.filter((b) => b.isActive);

  function updateLine(index: number, patch: Partial<DraftLine>) {
    setLines((prev) => prev.map((l, i) => (i === index ? { ...l, ...patch } : l)));
  }

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await createStockTransfer(companyId, {
        date,
        fromBranchId: fromBranchId || undefined,
        toBranchId: toBranchId || undefined,
        narration: narration || undefined,
        lines: lines.map((l) => ({
          itemId: l.itemId,
          quantity: Number(l.quantity),
          batchNo: l.batchNo.trim() || undefined,
        })),
      });
      setLines([{ ...EMPTY_LINE }]);
      setNarration('');
      setShowForm(false);
      await onMutated();
      toast(t('transferPosted'));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : tc('somethingWentWrong'));
    } finally {
      setBusy(false);
    }
  }

  async function onCancel(transfer: StockTransferView) {
    const ok = await confirm({
      title: t('cancelTitle'),
      body: t('cancelBody'),
      confirmLabel: t('cancelConfirm'),
      danger: true,
    });
    if (!ok) return;
    try {
      await cancelStockTransfer(companyId, transfer.id);
      await onMutated();
      toast(t('transferCancelled'), 'info');
    } catch (err) {
      toast(err instanceof ApiError ? err.message : tc('somethingWentWrong'), 'error');
    }
  }

  const locationName = (b: { name: string } | null) => (b ? b.name : t('headOffice'));

  return (
    <div className="space-y-4">
      {canTransfer && (
        <div className="flex justify-end">
          <Button
            variant={showForm ? 'secondary' : 'primary'}
            onClick={() => setShowForm(!showForm)}
          >
            {showForm ? tc('close') : t('newTransfer')}
          </Button>
        </div>
      )}

      {showForm && (
        <Card>
          <form onSubmit={onCreate} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
              <div>
                <Label>{tc('date')}</Label>
                <Input type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
              <div>
                <Label>{t('fromLabel')}</Label>
                <Select value={fromBranchId} onChange={(e) => setFromBranchId(e.target.value)}>
                  <option value="">{t('headOffice')}</option>
                  {activeBranches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label>{t('toLabel')}</Label>
                <Select value={toBranchId} onChange={(e) => setToBranchId(e.target.value)}>
                  <option value="">{t('headOffice')}</option>
                  {activeBranches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label>{t('narrationLabel')}</Label>
                <Input
                  value={narration}
                  onChange={(e) => setNarration(e.target.value)}
                  placeholder={t('narrationPlaceholder')}
                />
              </div>
            </div>

            <div className="space-y-2">
              {lines.map((line, i) => {
                const item = itemById.get(line.itemId);
                return (
                  <div key={i} className="flex flex-wrap items-center gap-2">
                    <Select
                      required
                      value={line.itemId}
                      onChange={(e) => updateLine(i, { itemId: e.target.value, batchNo: '' })}
                      className="min-w-48 flex-1"
                    >
                      <option value="">{t('selectItem')}</option>
                      {items.map((it) => (
                        <option key={it.id} value={it.id}>
                          {it.name}
                        </option>
                      ))}
                    </Select>
                    <Input
                      type="number"
                      step="0.001"
                      min="0.001"
                      required
                      value={line.quantity}
                      onChange={(e) => updateLine(i, { quantity: e.target.value })}
                      placeholder={tc('quantity')}
                      className="w-28"
                    />
                    {item?.trackBatches && (
                      <Input
                        required
                        value={line.batchNo}
                        onChange={(e) => updateLine(i, { batchNo: e.target.value })}
                        placeholder={t('batchPlaceholder')}
                        className="w-36"
                      />
                    )}
                    {lines.length > 1 && (
                      <button
                        type="button"
                        onClick={() => setLines((prev) => prev.filter((_, j) => j !== i))}
                        className="text-faint hover:text-red-500"
                        aria-label={t('removeLine')}
                      >
                        ✕
                      </button>
                    )}
                  </div>
                );
              })}
              <Button
                type="button"
                variant="secondary"
                onClick={() => setLines((prev) => [...prev, { ...EMPTY_LINE }])}
              >
                {t('addLine')}
              </Button>
            </div>

            <div className="flex items-center justify-between border-t border-line pt-3">
              <ErrorText>{error}</ErrorText>
              <Button type="submit" disabled={busy}>
                {busy ? t('transferring') : t('postTransfer')}
              </Button>
            </div>
          </form>
        </Card>
      )}

      <Card>
        {transfers === null ? (
          <p className="text-sm text-muted">{tc('loading')}</p>
        ) : transfers.length === 0 ? (
          <p className="text-sm text-muted">{t('noTransfers')}</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line bg-subtle text-left text-[11px] font-semibold uppercase tracking-wide text-muted">
                <th className="py-2">{t('colNo')}</th>
                <th className="py-2">{tc('date')}</th>
                <th className="py-2">{t('colRoute')}</th>
                <th className="py-2">{t('colItems')}</th>
                <th className="py-2 text-right">{tc('status')}</th>
              </tr>
            </thead>
            <tbody>
              {transfers.map((tr) => (
                <tr key={tr.id} className="border-b border-line align-top last:border-0 hover:bg-subtle">
                  <td className="py-2 font-mono text-xs">{tr.transferNo}</td>
                  <td className="py-2 whitespace-nowrap">
                    {new Date(tr.date).toLocaleDateString('en-IN')}
                  </td>
                  <td className="py-2">
                    {locationName(tr.fromBranch)} → {locationName(tr.toBranch)}
                    {tr.narration && (
                      <p className="text-xs italic text-faint">{tr.narration}</p>
                    )}
                  </td>
                  <td className="py-2">
                    {tr.lines.map((l) => (
                      <div key={l.lineNo} className="text-xs">
                        {l.itemName}{' '}
                        <span className="tabular-nums text-muted">
                          {l.quantity} {l.unit}
                        </span>
                        {l.batchNo && (
                          <span className="ml-1 font-mono text-faint">[{l.batchNo}]</span>
                        )}
                      </div>
                    ))}
                  </td>
                  <td className="py-2 text-right">
                    {tr.status === 'CANCELLED' ? (
                      <span className="text-xs text-red-500">{tc('cancelled')}</span>
                    ) : canTransfer ? (
                      <button
                        onClick={() => onCancel(tr)}
                        className="text-xs text-faint hover:text-red-500"
                      >
                        {t('cancelAction')}
                      </button>
                    ) : (
                      <span className="text-xs text-emerald-600">{tc('active')}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
