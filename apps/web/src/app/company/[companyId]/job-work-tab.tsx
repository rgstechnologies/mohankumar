'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useFeedback } from '@/components/feedback';
import { EmptyState, Pagination, SearchInput, useTable } from '@/components/table';
import { Badge, Button, Card, ErrorText, HelpTip, Input, Label, Select } from '@/components/ui';
import type { ItemRow, PartyRow } from '@/lib/accounting';
import { api, ApiError } from '@/lib/api';

export interface JobWorkView {
  id: string;
  jobNo: string;
  process: 'DYEING' | 'PRINTING' | 'WEAVING' | 'KNITTING' | 'STITCHING' | 'WASHING' | 'OTHER';
  status: 'OPEN' | 'PARTIAL' | 'CLOSED' | 'CANCELLED';
  issueDate: string;
  dueDate: string | null;
  notes: string | null;
  party: { id: string; name: string };
  issues: {
    lineNo: number;
    item: { id: string; name: string; unit: string };
    quantity: number;
  }[];
  receipts: {
    id: string;
    date: string;
    item: { id: string; name: string; unit: string };
    quantity: number;
    wastageQty: number;
    notes: string | null;
  }[];
  totals: { issued: number; received: number; wastage: number; pending: number };
}

const PROCESSES: JobWorkView['process'][] = [
  'DYEING',
  'PRINTING',
  'WEAVING',
  'KNITTING',
  'STITCHING',
  'WASHING',
  'OTHER',
];

const STATUS_TONE: Record<JobWorkView['status'], 'neutral' | 'good' | 'warn' | 'bad'> = {
  OPEN: 'neutral',
  PARTIAL: 'warn',
  CLOSED: 'good',
  CANCELLED: 'bad',
};

interface DraftLine {
  itemId: string;
  quantity: string;
}

function fmtQty(value: number): string {
  return value.toLocaleString('en-IN', { maximumFractionDigits: 3 });
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function JobWorkTab({
  companyId,
  parties,
  items,
  canManage,
  onChanged,
}: {
  companyId: string;
  parties: PartyRow[];
  items: ItemRow[];
  canManage: boolean;
  onChanged: () => Promise<void>;
}) {
  const t = useTranslations('jobWork');
  const tc = useTranslations('common');
  const { toast } = useFeedback();
  const workers = useMemo(() => parties.filter((p) => p.type === 'VENDOR'), [parties]);

  const [jobs, setJobs] = useState<JobWorkView[] | null>(null);

  const reload = useCallback(async () => {
    const list = await api.get<JobWorkView[]>(`/companies/${companyId}/job-works`);
    setJobs(list);
  }, [companyId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const afterMutation = useCallback(async () => {
    await Promise.all([reload(), onChanged()]);
  }, [reload, onChanged]);

  const table = useTable(
    jobs ?? [],
    (jw) => `${jw.jobNo} ${jw.party.name} ${jw.process}`,
  );

  // ---- Create form state ----
  const [showForm, setShowForm] = useState(false);
  const [partyId, setPartyId] = useState('');
  const [process, setProcess] = useState<JobWorkView['process']>('DYEING');
  const [issueDate, setIssueDate] = useState(today);
  const [dueDate, setDueDate] = useState('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<DraftLine[]>([{ itemId: '', quantity: '1' }]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  function resetForm() {
    setPartyId('');
    setProcess('DYEING');
    setIssueDate(today());
    setDueDate('');
    setNotes('');
    setLines([{ itemId: '', quantity: '1' }]);
    setError('');
  }

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await api.post(`/companies/${companyId}/job-works`, {
        partyId,
        process,
        issueDate,
        dueDate: dueDate || undefined,
        notes: notes.trim() || undefined,
        lines: lines.map((line) => ({
          itemId: line.itemId,
          quantity: Number(line.quantity),
        })),
      });
      setShowForm(false);
      resetForm();
      await afterMutation();
      toast(t('toast.created'));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : tc('somethingWentWrong'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          <SearchInput
            value={table.query}
            onChange={table.setQuery}
            placeholder={t('searchPlaceholder')}
          />
          <HelpTip text={t('hint')} />
        </div>
        {canManage && (
          <Button
            variant={showForm ? 'secondary' : 'primary'}
            onClick={() => setShowForm(!showForm)}
          >
            {showForm ? tc('close') : t('newJob')}
          </Button>
        )}
      </div>

      {showForm && (
        <Card title={t('newJob')} action={<HelpTip text={t('hint')} />}>
          <form onSubmit={onCreate} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
              <div className="sm:col-span-2">
                <Label>{t('form.worker')}</Label>
                <Select required value={partyId} onChange={(e) => setPartyId(e.target.value)}>
                  <option value="">{t('form.selectWorker')}</option>
                  {workers.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="sm:col-span-2">
                <Label>{t('form.process')}</Label>
                <Select
                  value={process}
                  onChange={(e) => setProcess(e.target.value as JobWorkView['process'])}
                >
                  {PROCESSES.map((p) => (
                    <option key={p} value={p}>
                      {t(`processes.${p}`)}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label>{t('form.issueDate')}</Label>
                <Input
                  type="date"
                  required
                  value={issueDate}
                  onChange={(e) => setIssueDate(e.target.value)}
                />
              </div>
              <div>
                <Label>{t('form.dueDate')}</Label>
                <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
              </div>
              <div className="sm:col-span-2">
                <Label>{t('form.notes')}</Label>
                <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
              </div>
            </div>

            <div className="space-y-2">
              {lines.map((line, i) => (
                <div key={i} className="flex flex-wrap items-center gap-2">
                  <Select
                    required
                    value={line.itemId}
                    onChange={(e) =>
                      setLines((prev) =>
                        prev.map((l, j) => (j === i ? { ...l, itemId: e.target.value } : l)),
                      )
                    }
                    className="min-w-44 flex-1"
                  >
                    <option value="">{t('form.selectItem')}</option>
                    {items.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </Select>
                  <Input
                    type="number"
                    step="0.001"
                    min="0.001"
                    required
                    value={line.quantity}
                    onChange={(e) =>
                      setLines((prev) =>
                        prev.map((l, j) => (j === i ? { ...l, quantity: e.target.value } : l)),
                      )
                    }
                    placeholder={t('form.qty')}
                    className="w-28"
                  />
                  {lines.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setLines((prev) => prev.filter((_, j) => j !== i))}
                      className="text-faint transition-colors hover:text-red-500"
                      aria-label={t('form.removeLine')}
                    >
                      ✕
                    </button>
                  )}
                </div>
              ))}
              <Button
                type="button"
                variant="secondary"
                onClick={() => setLines((prev) => [...prev, { itemId: '', quantity: '1' }])}
              >
                {t('form.addLine')}
              </Button>
            </div>

            <div className="flex justify-end">
              <Button type="submit" disabled={busy || !partyId}>
                {busy ? t('form.creating') : t('form.create')}
              </Button>
            </div>
            <ErrorText>{error}</ErrorText>
          </form>
        </Card>
      )}

      <Card>
        {jobs === null ? (
          <p className="text-sm text-muted">{tc('loading')}</p>
        ) : jobs.length === 0 ? (
          <EmptyState
            title={t('empty.title')}
            body={t('empty.body')}
            action={canManage && <Button onClick={() => setShowForm(true)}>{t('newJob')}</Button>}
          />
        ) : (
          <>
            <div className="overflow-x-auto"><table className="w-full min-w-[600px] text-sm">
              <thead>
                <tr className="border-b border-line bg-subtle text-left text-[11px] font-semibold uppercase tracking-wide text-muted">
                  <th className="py-2">{t('table.job')}</th>
                  <th className="py-2">{tc('date')}</th>
                  <th className="py-2">{t('table.worker')}</th>
                  <th className="py-2">{t('table.process')}</th>
                  <th className="py-2 text-right">{t('table.issued')}</th>
                  <th className="py-2 text-right">{t('table.received')}</th>
                  <th className="py-2 text-right">{t('table.wastage')}</th>
                  <th className="py-2 text-right">{t('table.pending')}</th>
                  <th className="py-2 text-center">{tc('status')}</th>
                  <th className="py-2 text-right">{tc('actions')}</th>
                </tr>
              </thead>
              <tbody>
                {table.rows.map((jw) => (
                  <JobRow
                    key={jw.id}
                    companyId={companyId}
                    job={jw}
                    canManage={canManage}
                    onMutated={afterMutation}
                  />
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

function JobRow({
  companyId,
  job,
  canManage,
  onMutated,
}: {
  companyId: string;
  job: JobWorkView;
  canManage: boolean;
  onMutated: () => Promise<void>;
}) {
  const t = useTranslations('jobWork');
  const tc = useTranslations('common');
  const { toast, confirm } = useFeedback();
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState(false);

  // ---- Inline receive form state ----
  const [rcvDate, setRcvDate] = useState(today);
  const [rcvItemId, setRcvItemId] = useState(() => job.issues[0]?.item.id ?? '');
  const [rcvQty, setRcvQty] = useState('');
  const [rcvWastage, setRcvWastage] = useState('');
  const [rcvNotes, setRcvNotes] = useState('');
  const [rcvError, setRcvError] = useState('');

  const active = job.status === 'OPEN' || job.status === 'PARTIAL';

  const issuedItems = useMemo(() => {
    const seen = new Map<string, { id: string; name: string; unit: string }>();
    for (const line of job.issues) {
      if (!seen.has(line.item.id)) seen.set(line.item.id, line.item);
    }
    return [...seen.values()];
  }, [job.issues]);

  async function onReceive(e: React.FormEvent) {
    e.preventDefault();
    setRcvError('');
    setBusy(true);
    try {
      await api.post(`/companies/${companyId}/job-works/${job.id}/receipts`, {
        date: rcvDate,
        itemId: rcvItemId,
        quantity: Number(rcvQty),
        wastageQty: rcvWastage ? Number(rcvWastage) : undefined,
        notes: rcvNotes.trim() || undefined,
      });
      setRcvQty('');
      setRcvWastage('');
      setRcvNotes('');
      await onMutated();
      toast(t('toast.received'));
    } catch (err) {
      setRcvError(err instanceof ApiError ? err.message : tc('somethingWentWrong'));
    } finally {
      setBusy(false);
    }
  }

  async function onClose() {
    const ok = await confirm({
      title: t('confirmClose.title'),
      body: t('confirmClose.body'),
      confirmLabel: t('confirmClose.confirm'),
    });
    if (!ok) return;
    setBusy(true);
    try {
      await api.post(`/companies/${companyId}/job-works/${job.id}/close`);
      await onMutated();
      toast(t('toast.closed'));
    } catch (err) {
      toast(err instanceof ApiError ? err.message : tc('somethingWentWrong'), 'error');
    } finally {
      setBusy(false);
    }
  }

  async function onCancel() {
    const ok = await confirm({
      title: t('confirmCancel.title'),
      body: t('confirmCancel.body'),
      confirmLabel: t('confirmCancel.confirm'),
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      await api.post(`/companies/${companyId}/job-works/${job.id}/cancel`);
      await onMutated();
      toast(t('toast.cancelled'), 'info');
    } catch (err) {
      toast(err instanceof ApiError ? err.message : tc('somethingWentWrong'), 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <tr
        onClick={() => setExpanded(!expanded)}
        className="cursor-pointer border-b border-slate-50 transition-colors last:border-0 hover:bg-subtle"
      >
        <td className="py-2 font-mono text-xs">{job.jobNo}</td>
        <td className="py-2 whitespace-nowrap">
          {new Date(job.issueDate).toLocaleDateString('en-IN')}
        </td>
        <td className="py-2">{job.party.name}</td>
        <td className="py-2">
          <Badge tone="neutral">{t(`processes.${job.process}`)}</Badge>
        </td>
        <td className="py-2 text-right tabular-nums">{fmtQty(job.totals.issued)}</td>
        <td className="py-2 text-right tabular-nums">{fmtQty(job.totals.received)}</td>
        <td className="py-2 text-right tabular-nums">{fmtQty(job.totals.wastage)}</td>
        <td
          className={`py-2 text-right tabular-nums ${
            job.totals.pending > 0 && active ? 'font-medium text-amber-600' : 'text-muted'
          }`}
        >
          {fmtQty(job.totals.pending)}
        </td>
        <td className="py-2 text-center">
          <Badge tone={STATUS_TONE[job.status]}>{t(`status.${job.status}`)}</Badge>
        </td>
        <td className="py-2 text-right">
          <span
            aria-hidden
            className={`inline-block text-xs text-faint transition-transform ${
              expanded ? 'rotate-90' : ''
            }`}
          >
            ▸
          </span>
        </td>
      </tr>

      {expanded && (
        <tr>
          <td colSpan={10} className="bg-subtle px-4 py-4">
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <div>
                <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-faint">
                  {t('detail.issueLines')}
                </h4>
                <div className="overflow-x-auto"><table className="w-full min-w-[600px] text-sm">
                  <tbody>
                    {job.issues.map((line) => (
                      <tr key={line.lineNo} className="border-b border-line last:border-0 hover:bg-subtle">
                        <td className="py-1.5 pr-2 text-xs text-faint">{line.lineNo}</td>
                        <td className="py-1.5">{line.item.name}</td>
                        <td className="py-1.5 text-right tabular-nums">
                          {fmtQty(line.quantity)}{' '}
                          <span className="text-xs text-faint">{line.item.unit}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table></div>
                {job.dueDate && (
                  <p className="mt-2 text-xs text-muted">
                    {t('form.dueDate')}: {new Date(job.dueDate).toLocaleDateString('en-IN')}
                  </p>
                )}
                {job.notes && <p className="mt-1 text-xs italic text-muted">{job.notes}</p>}
              </div>

              <div>
                <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-faint">
                  {t('detail.receipts')}
                </h4>
                {job.receipts.length === 0 ? (
                  <p className="text-sm text-faint">{t('detail.noReceipts')}</p>
                ) : (
                  <div className="overflow-x-auto"><table className="w-full min-w-[600px] text-sm">
                    <thead>
                      <tr className="border-b border-line bg-subtle text-left text-[11px] font-semibold uppercase tracking-wide text-muted">
                        <th className="py-1.5">{tc('date')}</th>
                        <th className="py-1.5">{t('receive.item')}</th>
                        <th className="py-1.5 text-right">{t('receive.qty')}</th>
                        <th className="py-1.5 text-right">{t('receive.wastage')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {job.receipts.map((r) => (
                        <tr key={r.id} className="border-b border-line last:border-0 hover:bg-subtle">
                          <td className="py-1.5 whitespace-nowrap">
                            {new Date(r.date).toLocaleDateString('en-IN')}
                          </td>
                          <td className="py-1.5">
                            {r.item.name}
                            {r.notes && (
                              <span className="ml-1 text-xs italic text-faint">{r.notes}</span>
                            )}
                          </td>
                          <td className="py-1.5 text-right tabular-nums">
                            {fmtQty(r.quantity)}{' '}
                            <span className="text-xs text-faint">{r.item.unit}</span>
                          </td>
                          <td className="py-1.5 text-right tabular-nums text-red-600">
                            {r.wastageQty > 0 ? fmtQty(r.wastageQty) : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table></div>
                )}
              </div>
            </div>

            {canManage && active && (
              <div className="mt-4 border-t border-line pt-4">
                <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-faint">
                  {t('receive.title')}
                </h4>
                <form onSubmit={onReceive} className="space-y-3">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-5">
                    <div>
                      <Label>{t('receive.date')}</Label>
                      <Input
                        type="date"
                        required
                        value={rcvDate}
                        onChange={(e) => setRcvDate(e.target.value)}
                      />
                    </div>
                    <div>
                      <Label>{t('receive.item')}</Label>
                      <Select
                        required
                        value={rcvItemId}
                        onChange={(e) => setRcvItemId(e.target.value)}
                      >
                        {issuedItems.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.name}
                          </option>
                        ))}
                      </Select>
                    </div>
                    <div>
                      <Label>{t('receive.qty')}</Label>
                      <Input
                        type="number"
                        step="0.001"
                        min="0.001"
                        required
                        value={rcvQty}
                        onChange={(e) => setRcvQty(e.target.value)}
                      />
                    </div>
                    <div>
                      <Label>{t('receive.wastage')}</Label>
                      <Input
                        type="number"
                        step="0.001"
                        min="0"
                        value={rcvWastage}
                        onChange={(e) => setRcvWastage(e.target.value)}
                      />
                    </div>
                    <div>
                      <Label>{t('receive.notes')}</Label>
                      <Input value={rcvNotes} onChange={(e) => setRcvNotes(e.target.value)} />
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    {job.receipts.length === 0 && (
                      <Button type="button" variant="danger" disabled={busy} onClick={onCancel}>
                        {t('actions.cancel')}
                      </Button>
                    )}
                    <Button type="button" variant="secondary" disabled={busy} onClick={onClose}>
                      {t('actions.close')}
                    </Button>
                    <Button type="submit" disabled={busy || !rcvItemId}>
                      {busy ? '…' : t('receive.submit')}
                    </Button>
                  </div>
                  <ErrorText>{rcvError}</ErrorText>
                </form>
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  );
}
