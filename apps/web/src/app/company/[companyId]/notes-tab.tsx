'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useFeedback } from '@/components/feedback';
import { EmptyState, Pagination, SearchInput, useTable } from '@/components/table';
import { Badge, Button, Card, ErrorText, HelpTip, Input, Label, Select } from '@/components/ui';
import {
  inr,
  type InvoiceView,
  type ItemRow,
  type PurchaseBillView,
} from '@/lib/accounting';
import { api, ApiError } from '@/lib/api';

interface NoteView {
  id: string;
  type: 'CREDIT_NOTE' | 'DEBIT_NOTE';
  noteNo: string;
  date: string;
  reason: string | null;
  status: 'ISSUED' | 'CANCELLED';
  party: { name: string };
  against: string | null;
  taxableAmount: number;
  total: number;
}

interface DraftLine {
  itemId: string;
  description: string;
  quantity: string;
  rate: string;
  gstRate: string;
}

export function NotesTab({
  companyId,
  invoices,
  bills,
  items,
  notes,
  canManage,
  onChanged,
}: {
  companyId: string;
  invoices: InvoiceView[];
  bills: PurchaseBillView[];
  items: ItemRow[];
  notes: NoteView[];
  canManage: boolean;
  onChanged: () => Promise<void>;
}) {
  const t = useTranslations('notes');
  const tc = useTranslations('common');
  const { toast, confirm } = useFeedback();
  const table = useTable(
    notes,
    (n) => `${n.noteNo} ${n.party.name} ${n.against ?? ''} ${n.type}`,
  );

  const [showForm, setShowForm] = useState(false);
  const [type, setType] = useState<'CREDIT_NOTE' | 'DEBIT_NOTE'>('CREDIT_NOTE');
  const [sourceId, setSourceId] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [reason, setReason] = useState('');
  const [lines, setLines] = useState<DraftLine[]>([
    { itemId: '', description: '', quantity: '1', rate: '', gstRate: '0' },
  ]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const sources = useMemo(
    () =>
      type === 'CREDIT_NOTE'
        ? invoices
            .filter((i) => i.status === 'ISSUED')
            .map((i) => ({ id: i.id, label: `${i.invoiceNo} · ${i.party.name} · ₹${inr(i.total)}` }))
        : bills
            .filter((b) => b.status === 'ISSUED')
            .map((b) => ({ id: b.id, label: `${b.billNo} · ${b.party.name} · ₹${inr(b.total)}` })),
    [type, invoices, bills],
  );

  function updateLine(index: number, patch: Partial<DraftLine>) {
    setLines((prev) =>
      prev.map((line, i) => {
        if (i !== index) return line;
        const next = { ...line, ...patch };
        if (patch.itemId !== undefined) {
          const item = items.find((it) => it.id === patch.itemId);
          if (item) {
            next.description = '';
            next.gstRate = String(item.gstRate);
            next.rate =
              type === 'CREDIT_NOTE'
                ? item.salePrice !== null
                  ? String(item.salePrice)
                  : next.rate
                : item.purchasePrice !== null
                  ? String(item.purchasePrice)
                  : next.rate;
          }
        }
        return next;
      }),
    );
  }

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await api.post(`/companies/${companyId}/notes`, {
        type,
        invoiceId: type === 'CREDIT_NOTE' ? sourceId : undefined,
        purchaseBillId: type === 'DEBIT_NOTE' ? sourceId : undefined,
        date,
        reason: reason || undefined,
        lines: lines.map((line) => ({
          itemId: line.itemId || undefined,
          description: line.description || undefined,
          quantity: Number(line.quantity),
          rate: Number(line.rate),
          gstRate: line.itemId ? undefined : Number(line.gstRate),
        })),
      });
      setShowForm(false);
      setReason('');
      setLines([{ itemId: '', description: '', quantity: '1', rate: '', gstRate: '0' }]);
      await onChanged();
      toast(type === 'CREDIT_NOTE' ? t('creditNoteIssued') : t('debitNoteIssued'));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : tc('somethingWentWrong'));
    } finally {
      setBusy(false);
    }
  }

  async function cancelNote(noteId: string) {
    const ok = await confirm({
      title: t('confirmCancelTitle'),
      body: t('confirmCancelBody'),
      confirmLabel: t('confirmCancelLabel'),
      danger: true,
    });
    if (!ok) return;
    try {
      await api.post(`/companies/${companyId}/notes/${noteId}/cancel`);
      await onChanged();
      toast(t('noteCancelled'), 'info');
    } catch (err) {
      toast(err instanceof ApiError ? err.message : t('cancelFailed'), 'error');
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SearchInput
          value={table.query}
          onChange={table.setQuery}
          placeholder={t('searchPlaceholder')}
        />
        {canManage && (
          <Button
            variant={showForm ? 'secondary' : 'primary'}
            onClick={() => setShowForm(!showForm)}
          >
            {showForm ? tc('close') : t('newNote')}
          </Button>
        )}
      </div>

      {showForm && (
        <Card
          title={t('issueNoteTitle')}
          action={<HelpTip text={t('issueNoteHelp')} />}
        >
          <form onSubmit={onCreate} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
              <div>
                <Label>{tc('type')}</Label>
                <Select
                  value={type}
                  onChange={(e) => {
                    setType(e.target.value as never);
                    setSourceId('');
                  }}
                >
                  <option value="CREDIT_NOTE">{t('creditNoteOption')}</option>
                  <option value="DEBIT_NOTE">{t('debitNoteOption')}</option>
                </Select>
              </div>
              <div className="sm:col-span-2">
                <Label>{type === 'CREDIT_NOTE' ? t('againstInvoice') : t('againstBill')}</Label>
                <Select required value={sourceId} onChange={(e) => setSourceId(e.target.value)}>
                  <option value="">{t('selectDocument')}</option>
                  {sources.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label>{tc('date')}</Label>
                <Input type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
            </div>

            <div className="space-y-2">
              {lines.map((line, i) => (
                <div key={i} className="flex flex-wrap items-center gap-2">
                  <Select
                    value={line.itemId}
                    onChange={(e) => updateLine(i, { itemId: e.target.value })}
                    className="min-w-44 flex-1"
                  >
                    <option value="">{t('freeTextLine')}</option>
                    {items.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </Select>
                  {!line.itemId && (
                    <Input
                      required
                      value={line.description}
                      onChange={(e) => updateLine(i, { description: e.target.value })}
                      placeholder={t('descriptionPlaceholder')}
                      className="min-w-40 flex-1"
                    />
                  )}
                  <Input
                    type="number"
                    step="0.001"
                    min="0.001"
                    required
                    value={line.quantity}
                    onChange={(e) => updateLine(i, { quantity: e.target.value })}
                    placeholder={tc('quantity')}
                    className="w-24"
                  />
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    value={line.rate}
                    onChange={(e) => updateLine(i, { rate: e.target.value })}
                    placeholder={t('ratePlaceholder')}
                    className="w-28"
                  />
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
              ))}
              <Button
                type="button"
                variant="secondary"
                onClick={() =>
                  setLines((prev) => [
                    ...prev,
                    { itemId: '', description: '', quantity: '1', rate: '', gstRate: '0' },
                  ])
                }
              >
                {t('addLine')}
              </Button>
            </div>

            <div>
              <Label>{t('reason')}</Label>
              <Input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder={t('reasonPlaceholder')}
              />
            </div>

            <div className="flex justify-end">
              <Button type="submit" disabled={busy || !sourceId}>
                {busy ? t('issuing') : t('issueNote')}
              </Button>
            </div>
            <ErrorText>{error}</ErrorText>
          </form>
        </Card>
      )}

      <Card>
        {notes.length === 0 ? (
          <EmptyState
            title={t('emptyTitle')}
            body={t('emptyBody')}
            action={canManage && <Button onClick={() => setShowForm(true)}>{t('emptyAction')}</Button>}
          />
        ) : (
          <>
            <div className="overflow-x-auto"><table className="w-full min-w-[600px] text-sm">
              <thead>
                <tr className="border-b border-line bg-subtle text-left text-[11px] font-semibold uppercase tracking-wide text-muted">
                  <th className="py-2">{t('noteHeader')}</th>
                  <th className="py-2">{tc('type')}</th>
                  <th className="py-2">{tc('date')}</th>
                  <th className="py-2">{t('partyHeader')}</th>
                  <th className="py-2">{t('againstHeader')}</th>
                  <th className="py-2 text-right">{tc('total')}</th>
                  <th className="py-2 text-right">{tc('status')}</th>
                </tr>
              </thead>
              <tbody>
                {table.rows.map((note) => (
                  <tr key={note.id} className="border-b border-line last:border-0 hover:bg-subtle">
                    <td className="py-2 font-mono text-xs">{note.noteNo}</td>
                    <td className="py-2">
                      <Badge tone={note.type === 'CREDIT_NOTE' ? 'warn' : 'neutral'}>
                        {note.type === 'CREDIT_NOTE' ? t('creditBadge') : t('debitBadge')}
                      </Badge>
                    </td>
                    <td className="py-2 whitespace-nowrap">
                      {new Date(note.date).toLocaleDateString('en-IN')}
                    </td>
                    <td className="py-2">{note.party.name}</td>
                    <td className="py-2 font-mono text-xs text-muted">
                      {note.against ?? '—'}
                    </td>
                    <td className="py-2 text-right tabular-nums">₹{inr(note.total)}</td>
                    <td className="py-2 text-right">
                      {note.status === 'CANCELLED' ? (
                        <span className="text-xs text-red-500">{t('statusCancelled')}</span>
                      ) : canManage ? (
                        <button
                          onClick={() => cancelNote(note.id)}
                          className="text-xs text-faint hover:text-red-500"
                        >
                          {t('cancelAction')}
                        </button>
                      ) : (
                        <span className="text-xs text-emerald-600">{t('statusIssued')}</span>
                      )}
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
