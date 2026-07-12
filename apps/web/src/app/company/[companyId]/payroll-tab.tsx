'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useFeedback } from '@/components/feedback';
import { EmptyState, Pagination, SearchInput, useTable } from '@/components/table';
import { Badge, Button, Card, ErrorText, HelpTip, Input, Label, Select } from '@/components/ui';
import {
  cancelPayRun,
  createEmployee,
  createPayRun,
  fetchEmployees,
  fetchPayRuns,
  inr,
  payPayRun,
  postPayRun,
  updateEmployee,
  updatePayLine,
  type BranchRow,
  type EmployeeRow,
  type LedgerRow,
  type PayLineView,
  type PayRunView,
} from '@/lib/accounting';
import { ApiError, downloadFile, printFile } from '@/lib/api';

type View = 'employees' | 'runs';

const today = () => new Date().toISOString().slice(0, 10);

export function PayrollTab({
  companyId,
  branches,
  ledgers,
  onChanged,
}: {
  companyId: string;
  branches: BranchRow[];
  ledgers: LedgerRow[];
  onChanged: () => Promise<void>;
}) {
  const t = useTranslations('payroll');
  const [view, setView] = useState<View>('employees');
  const [employees, setEmployees] = useState<EmployeeRow[] | null>(null);
  const [runs, setRuns] = useState<PayRunView[] | null>(null);

  const reload = useCallback(async () => {
    const [emp, r] = await Promise.all([fetchEmployees(companyId), fetchPayRuns(companyId)]);
    setEmployees(emp);
    setRuns(r);
  }, [companyId]);

  useEffect(() => {
    void reload();
  }, [reload]);

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
          {tabBtn('employees', t('views.employees'))}
          {tabBtn('runs', t('views.runs'))}
        </div>
      </div>

      {view === 'employees' && (
        <EmployeesView
          companyId={companyId}
          employees={employees}
          branches={branches}
          onMutated={reload}
        />
      )}
      {view === 'runs' && (
        <RunsView
          companyId={companyId}
          runs={runs}
          ledgers={ledgers}
          onMutated={reload}
          onBooksChanged={async () => {
            await Promise.all([reload(), onChanged()]);
          }}
        />
      )}
    </div>
  );
}

// ----------------------------------------------------------------
// Employees
// ----------------------------------------------------------------

interface EmployeeDraft {
  id?: string;
  code: string;
  name: string;
  designation: string;
  joinDate: string;
  branchId: string;
  email: string;
  phone: string;
  pan: string;
  uan: string;
  esiNo: string;
  bankName: string;
  bankAccountNo: string;
  bankIfsc: string;
  basic: string;
  hra: string;
  conveyance: string;
  otherAllowances: string;
  pfEnabled: boolean;
  esiEnabled: boolean;
  ptMonthly: string;
  tdsMonthly: string;
  isActive: boolean;
}

const emptyEmployeeDraft = (): EmployeeDraft => ({
  code: '',
  name: '',
  designation: '',
  joinDate: today(),
  branchId: '',
  email: '',
  phone: '',
  pan: '',
  uan: '',
  esiNo: '',
  bankName: '',
  bankAccountNo: '',
  bankIfsc: '',
  basic: '',
  hra: '',
  conveyance: '',
  otherAllowances: '',
  pfEnabled: true,
  esiEnabled: true,
  ptMonthly: '',
  tdsMonthly: '',
  isActive: true,
});

function EmployeesView({
  companyId,
  employees,
  branches,
  onMutated,
}: {
  companyId: string;
  employees: EmployeeRow[] | null;
  branches: BranchRow[];
  onMutated: () => Promise<void>;
}) {
  const t = useTranslations('payroll');
  const tc = useTranslations('common');
  const { toast } = useFeedback();
  const table = useTable(
    employees ?? [],
    (e) => `${e.code} ${e.name} ${e.designation ?? ''}`,
  );

  const [draft, setDraft] = useState<EmployeeDraft | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const editing = Boolean(draft?.id);
  const activeBranches = branches.filter((b) => b.isActive);

  function startEdit(e: EmployeeRow) {
    setError('');
    setDraft({
      id: e.id,
      code: e.code,
      name: e.name,
      designation: e.designation ?? '',
      joinDate: e.joinDate.slice(0, 10),
      branchId: e.branchId ?? e.branch?.id ?? '',
      email: e.email ?? '',
      phone: e.phone ?? '',
      pan: e.pan ?? '',
      uan: e.uan ?? '',
      esiNo: e.esiNo ?? '',
      bankName: e.bankName ?? '',
      bankAccountNo: e.bankAccountNo ?? '',
      bankIfsc: e.bankIfsc ?? '',
      basic: String(e.basic),
      hra: e.hra ? String(e.hra) : '',
      conveyance: e.conveyance ? String(e.conveyance) : '',
      otherAllowances: e.otherAllowances ? String(e.otherAllowances) : '',
      pfEnabled: e.pfEnabled,
      esiEnabled: e.esiEnabled,
      ptMonthly: e.ptMonthly ? String(e.ptMonthly) : '',
      tdsMonthly: e.tdsMonthly ? String(e.tdsMonthly) : '',
      isActive: e.isActive,
    });
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!draft) return;
    setError('');
    setBusy(true);
    const text = (v: string) => {
      const trimmed = v.trim();
      return trimmed ? trimmed : editing ? null : undefined;
    };
    const payload: Record<string, unknown> = {
      code: draft.code.trim(),
      name: draft.name.trim(),
      designation: text(draft.designation),
      joinDate: draft.joinDate,
      branchId: draft.branchId ? draft.branchId : editing ? null : undefined,
      email: text(draft.email),
      phone: text(draft.phone),
      pan: text(draft.pan),
      uan: text(draft.uan),
      esiNo: text(draft.esiNo),
      bankName: text(draft.bankName),
      bankAccountNo: text(draft.bankAccountNo),
      bankIfsc: text(draft.bankIfsc),
      basic: Number(draft.basic),
      hra: draft.hra ? Number(draft.hra) : 0,
      conveyance: draft.conveyance ? Number(draft.conveyance) : 0,
      otherAllowances: draft.otherAllowances ? Number(draft.otherAllowances) : 0,
      pfEnabled: draft.pfEnabled,
      esiEnabled: draft.esiEnabled,
      ptMonthly: draft.ptMonthly ? Number(draft.ptMonthly) : 0,
      tdsMonthly: draft.tdsMonthly ? Number(draft.tdsMonthly) : 0,
    };
    try {
      if (draft.id) {
        await updateEmployee(companyId, draft.id, { ...payload, isActive: draft.isActive });
      } else {
        await createEmployee(companyId, payload);
      }
      const savedToast = editing ? t('toastEmployeeUpdated') : t('toastEmployeeCreated');
      setDraft(null);
      await onMutated();
      toast(savedToast);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : tc('somethingWentWrong'));
    } finally {
      setBusy(false);
    }
  }

  const field = (
    label: React.ReactNode,
    key: keyof Pick<
      EmployeeDraft,
      | 'designation' | 'email' | 'phone' | 'pan' | 'uan' | 'esiNo'
      | 'bankName' | 'bankAccountNo' | 'bankIfsc'
    >,
    extra?: Partial<React.InputHTMLAttributes<HTMLInputElement>>,
  ) =>
    draft && (
      <div>
        <Label>{label}</Label>
        <Input
          value={draft[key]}
          onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
          {...extra}
        />
      </div>
    );

  const moneyField = (
    label: React.ReactNode,
    key: keyof Pick<EmployeeDraft, 'basic' | 'hra' | 'conveyance' | 'otherAllowances' | 'ptMonthly' | 'tdsMonthly'>,
    required = false,
  ) =>
    draft && (
      <div>
        <Label>{label}</Label>
        <Input
          type="number"
          step="0.01"
          min="0"
          required={required}
          value={draft[key]}
          onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
          placeholder="0.00"
        />
      </div>
    );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SearchInput
          value={table.query}
          onChange={table.setQuery}
          placeholder={t('searchPlaceholder')}
        />
        <Button
          variant={draft && !editing ? 'secondary' : 'primary'}
          onClick={() => {
            setError('');
            setDraft(draft && !editing ? null : emptyEmployeeDraft());
          }}
        >
          {draft && !editing ? tc('close') : t('newEmployee')}
        </Button>
      </div>

      {draft && (
        <Card
          title={
            editing
              ? t('editTitle', { name: draft.name || draft.code })
              : t('newEmployeeTitle')
          }
        >
          <form onSubmit={onSubmit} className="space-y-5">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <Label>{t('codeLabel')}</Label>
                <Input
                  required
                  value={draft.code}
                  onChange={(e) => setDraft({ ...draft, code: e.target.value })}
                  placeholder="EMP-001"
                />
              </div>
              <div>
                <Label>{tc('name')}</Label>
                <Input
                  required
                  value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                />
              </div>
              {field(t('designationLabel'), 'designation')}
              <div>
                <Label>{t('joinDateLabel')}</Label>
                <Input
                  type="date"
                  required
                  value={draft.joinDate}
                  onChange={(e) => setDraft({ ...draft, joinDate: e.target.value })}
                />
              </div>
              <div>
                <Label>{t('branchLabel')}</Label>
                <Select
                  value={draft.branchId}
                  onChange={(e) => setDraft({ ...draft, branchId: e.target.value })}
                >
                  <option value="">{t('noBranch')}</option>
                  {activeBranches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </Select>
              </div>
              {field(t('emailLabel'), 'email', { type: 'email' })}
              {field(t('phoneLabel'), 'phone')}
              {field(t('panLabel'), 'pan', { maxLength: 10, placeholder: 'ABCDE1234F' })}
              {field(t('uanLabel'), 'uan')}
              {field(t('esiNoLabel'), 'esiNo')}
              {field(t('bankNameLabel'), 'bankName')}
              {field(t('bankAccountLabel'), 'bankAccountNo')}
              {field(t('ifscLabel'), 'bankIfsc', { maxLength: 11, placeholder: 'HDFC0001234' })}
            </div>

            <div>
              <h4 className="mb-3 text-sm font-semibold uppercase tracking-wide text-faint">
                {t('salaryStructure')}
              </h4>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                {moneyField(t('basicLabel'), 'basic', true)}
                {moneyField(t('hraLabel'), 'hra')}
                {moneyField(t('conveyanceLabel'), 'conveyance')}
                {moneyField(t('otherAllowancesLabel'), 'otherAllowances')}
                <div>
                  <Label>
                    {t('ptLabel')} <HelpTip text={t('ptHelp')} />
                  </Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={draft.ptMonthly}
                    onChange={(e) => setDraft({ ...draft, ptMonthly: e.target.value })}
                    placeholder="0.00"
                  />
                </div>
                {moneyField(t('tdsLabel'), 'tdsMonthly')}
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-6">
                <label className="flex items-center gap-2 text-sm font-medium text-ink">
                  <input
                    type="checkbox"
                    checked={draft.pfEnabled}
                    onChange={(e) => setDraft({ ...draft, pfEnabled: e.target.checked })}
                    className="h-4 w-4 rounded border-line-strong accent-brand-600"
                  />
                  {t('pfEnabledLabel')} <HelpTip text={t('pfHelp')} />
                </label>
                <label className="flex items-center gap-2 text-sm font-medium text-ink">
                  <input
                    type="checkbox"
                    checked={draft.esiEnabled}
                    onChange={(e) => setDraft({ ...draft, esiEnabled: e.target.checked })}
                    className="h-4 w-4 rounded border-line-strong accent-brand-600"
                  />
                  {t('esiEnabledLabel')} <HelpTip text={t('esiHelp')} />
                </label>
                {editing && (
                  <label className="flex items-center gap-2 text-sm font-medium text-ink">
                    <input
                      type="checkbox"
                      checked={draft.isActive}
                      onChange={(e) => setDraft({ ...draft, isActive: e.target.checked })}
                      className="h-4 w-4 rounded border-line-strong accent-brand-600"
                    />
                    {t('activeLabel')}
                  </label>
                )}
              </div>
            </div>

            <div className="flex items-center gap-3 border-t border-line pt-3">
              <Button type="submit" disabled={busy}>
                {busy ? tc('saving') : editing ? t('saveChanges') : t('saveEmployee')}
              </Button>
              <Button type="button" variant="secondary" onClick={() => setDraft(null)}>
                {tc('cancel')}
              </Button>
              <ErrorText>{error}</ErrorText>
            </div>
          </form>
        </Card>
      )}

      <Card>
        {employees === null ? (
          <p className="text-sm text-muted">{tc('loading')}</p>
        ) : employees.length === 0 ? (
          <EmptyState
            title={t('emptyEmployeesTitle')}
            body={t('emptyEmployeesBody')}
            action={
              <Button onClick={() => setDraft(emptyEmployeeDraft())}>{t('newEmployee')}</Button>
            }
          />
        ) : (
          <>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line bg-subtle text-left text-[11px] font-semibold uppercase tracking-wide text-muted">
                  <th className="py-2">{t('colCode')}</th>
                  <th className="py-2">{tc('name')}</th>
                  <th className="py-2">{t('colDesignation')}</th>
                  <th className="py-2">{t('colBranch')}</th>
                  <th className="py-2 text-right">{t('colGross')}</th>
                  <th className="py-2">{t('colStatutory')}</th>
                  <th className="py-2">{tc('status')}</th>
                  <th className="py-2 text-right">{tc('actions')}</th>
                </tr>
              </thead>
              <tbody>
                {table.rows.map((e) => (
                  <tr
                    key={e.id}
                    className="border-b border-line last:border-0 hover:bg-subtle"
                  >
                    <td className="py-2.5 font-mono text-xs">{e.code}</td>
                    <td className="py-2.5 font-medium">{e.name}</td>
                    <td className="py-2.5 text-muted">{e.designation ?? '—'}</td>
                    <td className="py-2.5 text-muted">{e.branch?.name ?? '—'}</td>
                    <td className="py-2.5 text-right tabular-nums">₹{inr(e.monthlyGross)}</td>
                    <td className="py-2.5">
                      <span className="inline-flex gap-1">
                        {e.pfEnabled && <Badge tone="neutral">{t('pfBadge')}</Badge>}
                        {e.esiEnabled && <Badge tone="neutral">{t('esiBadge')}</Badge>}
                      </span>
                    </td>
                    <td className="py-2.5">
                      <Badge tone={e.isActive ? 'good' : 'bad'}>
                        {e.isActive ? tc('active') : t('inactive')}
                      </Badge>
                    </td>
                    <td className="py-2.5 text-right">
                      <button
                        onClick={() => startEdit(e)}
                        className="text-xs font-medium text-brand-600 hover:underline"
                      >
                        {tc('edit')}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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

// ----------------------------------------------------------------
// Pay runs
// ----------------------------------------------------------------

function RunsView({
  companyId,
  runs,
  ledgers,
  onMutated,
  onBooksChanged,
}: {
  companyId: string;
  runs: PayRunView[] | null;
  ledgers: LedgerRow[];
  onMutated: () => Promise<void>;
  onBooksChanged: () => Promise<void>;
}) {
  const t = useTranslations('payroll');
  const tc = useTranslations('common');
  const { toast } = useFeedback();
  const [month, setMonth] = useState(() => today().slice(0, 7));
  const [busy, setBusy] = useState(false);

  const sorted = useMemo(
    () => (runs ? [...runs].sort((a, b) => b.year - a.year || b.month - a.month) : null),
    [runs],
  );

  async function onRun() {
    const [y, m] = month.split('-').map(Number);
    if (!y || !m) return;
    setBusy(true);
    try {
      const run = await createPayRun(companyId, y, m);
      await onMutated();
      toast(t('toastRunCreated', { period: run.period }));
    } catch (err) {
      toast(err instanceof ApiError ? err.message : tc('somethingWentWrong'), 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <Label>{t('monthLabel')}</Label>
            <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
          </div>
          <Button onClick={onRun} disabled={busy || !month}>
            {busy ? t('running') : t('runPayroll')}
          </Button>
        </div>
      </Card>

      {sorted === null ? (
        <Card>
          <p className="text-sm text-muted">{tc('loading')}</p>
        </Card>
      ) : sorted.length === 0 ? (
        <Card>
          <p className="text-sm text-muted">{t('noRuns')}</p>
        </Card>
      ) : (
        sorted.map((run) => (
          <RunCard
            key={run.id}
            companyId={companyId}
            run={run}
            ledgers={ledgers}
            onMutated={onMutated}
            onBooksChanged={onBooksChanged}
          />
        ))
      )}
    </div>
  );
}

const STATUS_TONE: Record<PayRunView['status'], 'neutral' | 'good' | 'warn' | 'bad'> = {
  DRAFT: 'warn',
  POSTED: 'good',
  PAID: 'good',
  CANCELLED: 'bad',
};

function RunCard({
  companyId,
  run,
  ledgers,
  onMutated,
  onBooksChanged,
}: {
  companyId: string;
  run: PayRunView;
  ledgers: LedgerRow[];
  onMutated: () => Promise<void>;
  onBooksChanged: () => Promise<void>;
}) {
  const t = useTranslations('payroll');
  const tc = useTranslations('common');
  const { toast, confirm } = useFeedback();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [showPayForm, setShowPayForm] = useState(false);
  const [payDate, setPayDate] = useState(today);
  const [payLedgerId, setPayLedgerId] = useState('');
  const [payError, setPayError] = useState('');

  const cashBankLedgers = useMemo(() => {
    const filtered = ledgers.filter((l) => /cash|bank/i.test(l.group.name));
    return filtered.length > 0 ? filtered : ledgers;
  }, [ledgers]);

  async function onPost() {
    const ok = await confirm({
      title: t('postTitle'),
      body: t('postBody', { period: run.period }),
      confirmLabel: t('postConfirm'),
    });
    if (!ok) return;
    setBusy(true);
    try {
      await postPayRun(companyId, run.id);
      await onBooksChanged();
      toast(t('toastPosted'));
    } catch (err) {
      toast(err instanceof ApiError ? err.message : tc('somethingWentWrong'), 'error');
    } finally {
      setBusy(false);
    }
  }

  async function onDeleteDraft() {
    const ok = await confirm({
      title: t('deleteTitle'),
      body: t('deleteBody', { period: run.period }),
      confirmLabel: tc('delete'),
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      await cancelPayRun(companyId, run.id);
      await onMutated();
      toast(t('toastDeleted'), 'info');
    } catch (err) {
      toast(err instanceof ApiError ? err.message : tc('somethingWentWrong'), 'error');
    } finally {
      setBusy(false);
    }
  }

  async function onCancelRun() {
    const ok = await confirm({
      title: t('cancelTitle'),
      body: t('cancelBody', { period: run.period }),
      confirmLabel: t('cancelConfirm'),
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      await cancelPayRun(companyId, run.id);
      await onBooksChanged();
      toast(t('toastCancelled'), 'info');
    } catch (err) {
      toast(err instanceof ApiError ? err.message : tc('somethingWentWrong'), 'error');
    } finally {
      setBusy(false);
    }
  }

  async function onPay(e: React.FormEvent) {
    e.preventDefault();
    if (!payLedgerId) return;
    setPayError('');
    setBusy(true);
    try {
      await payPayRun(companyId, run.id, { date: payDate, ledgerId: payLedgerId });
      setShowPayForm(false);
      await onBooksChanged();
      toast(t('toastPaid'));
    } catch (err) {
      setPayError(err instanceof ApiError ? err.message : tc('somethingWentWrong'));
    } finally {
      setBusy(false);
    }
  }

  async function onDownloadPayslip(lineId: string) {
    try {
      await downloadFile(
        `/companies/${companyId}/payroll/runs/${run.id}/payslips/${lineId}/pdf`,
      );
    } catch (err) {
      toast(err instanceof ApiError ? err.message : tc('somethingWentWrong'), 'error');
    }
  }

  async function onPrintPayslip(lineId: string) {
    try {
      await printFile(
        `/companies/${companyId}/payroll/runs/${run.id}/payslips/${lineId}/pdf`,
      );
    } catch (err) {
      toast(err instanceof ApiError ? err.message : tc('somethingWentWrong'), 'error');
    }
  }

  async function onExport(kind: 'bank-advice' | 'register') {
    try {
      await downloadFile(`/companies/${companyId}/payroll/runs/${run.id}/${kind}`);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : tc('somethingWentWrong'), 'error');
    }
  }

  const totalsCell = (label: string, value: number, strong = false) => (
    <div>
      <p className="text-xs uppercase tracking-wide text-faint">{label}</p>
      <p className={`mt-0.5 tabular-nums ${strong ? 'text-lg font-bold' : 'text-sm font-semibold'}`}>
        ₹{inr(value)}
      </p>
    </div>
  );

  return (
    <Card>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full flex-wrap items-center justify-between gap-3 text-left"
      >
        <div className="flex items-center gap-3">
          <span
            className={`text-xs text-faint transition-transform ${open ? 'rotate-90' : ''}`}
            aria-hidden
          >
            ▶
          </span>
          <span className="text-base font-semibold text-ink">{run.period}</span>
          <Badge tone={STATUS_TONE[run.status]}>{t(`status.${run.status}`)}</Badge>
          <span className="text-xs text-faint">
            {t('employeeCount', { count: run.employeeCount })}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-x-8 gap-y-2 sm:grid-cols-4">
          {totalsCell(t('grossLabel'), run.totals.gross)}
          {totalsCell(t('deductionsLabel'), run.totals.deductions)}
          {totalsCell(t('netPayLabel'), run.totals.netPay, true)}
          {totalsCell(t('employerCostLabel'), run.totals.employerCost)}
        </div>
      </button>

      {open && (
        <div className="mt-4 overflow-x-auto border-t border-line pt-4">
          {run.status === 'DRAFT' && (
            <p className="mb-2 text-xs text-faint">{t('lopHint')}</p>
          )}
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line bg-subtle text-left text-[11px] font-semibold uppercase tracking-wide text-muted">
                <th className="py-2">{t('colEmployee')}</th>
                <th className="py-2 text-right">{t('colWorkingDays')}</th>
                <th className="py-2 text-right">{t('colLop')}</th>
                <th className="py-2 text-right">{t('grossLabel')}</th>
                <th className="py-2 text-right">{t('pfBadge')}</th>
                <th className="py-2 text-right">{t('esiBadge')}</th>
                <th className="py-2 text-right">{t('ptBadge')}</th>
                <th className="py-2 text-right">{t('tdsBadge')}</th>
                <th className="py-2 text-right">{t('colNetPay')}</th>
                <th className="py-2 text-right">{t('colPayslip')}</th>
              </tr>
            </thead>
            <tbody>
              {run.lines.map((line) => (
                <tr key={line.id} className="border-b border-line last:border-0 hover:bg-subtle">
                  <td className="py-2">
                    <span className="font-mono text-xs text-faint">{line.employee.code}</span>{' '}
                    <span className="font-medium">{line.employee.name}</span>
                  </td>
                  <td className="py-2 text-right tabular-nums">{line.workingDays}</td>
                  <td className="py-2 text-right">
                    <LopCell
                      companyId={companyId}
                      runId={run.id}
                      line={line}
                      editable={run.status === 'DRAFT'}
                      onSaved={onMutated}
                    />
                  </td>
                  <td className="py-2 text-right tabular-nums">₹{inr(line.gross)}</td>
                  <td className="py-2 text-right tabular-nums">₹{inr(line.pfEmployee)}</td>
                  <td className="py-2 text-right tabular-nums">₹{inr(line.esiEmployee)}</td>
                  <td className="py-2 text-right tabular-nums">₹{inr(line.pt)}</td>
                  <td className="py-2 text-right tabular-nums">₹{inr(line.tds)}</td>
                  <td className="py-2 text-right font-semibold tabular-nums">
                    ₹{inr(line.netPay)}
                  </td>
                  <td className="py-2 text-right">
                    {run.status !== 'DRAFT' ? (
                      <>
                        <button
                          onClick={() => onDownloadPayslip(line.id)}
                          className="text-xs font-medium text-brand-600 hover:underline"
                          title={t('downloadPayslip')}
                        >
                          {t('payslipPdf')}
                        </button>
                        <button
                          onClick={() => onPrintPayslip(line.id)}
                          className="ml-2 text-xs font-medium text-brand-600 hover:underline"
                        >
                          {tc('print')}
                        </button>
                      </>
                    ) : (
                      <span className="text-xs text-slate-300">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {run.status !== 'PAID' && run.status !== 'CANCELLED' && (
        <div className="mt-4 space-y-3 border-t border-line pt-3">
          <div className="flex flex-wrap items-center gap-3">
            {run.status === 'DRAFT' && (
              <>
                <Button onClick={onPost} disabled={busy}>
                  {t('postAction')}
                </Button>
                <Button variant="danger" onClick={onDeleteDraft} disabled={busy}>
                  {t('deleteDraftAction')}
                </Button>
              </>
            )}
            {run.status === 'POSTED' && (
              <>
                <Button
                  variant={showPayForm ? 'secondary' : 'primary'}
                  onClick={() => {
                    setPayError('');
                    setShowPayForm(!showPayForm);
                  }}
                  disabled={busy}
                >
                  {showPayForm ? tc('close') : t('payAction')}
                </Button>
                <Button variant="danger" onClick={onCancelRun} disabled={busy}>
                  {t('cancelRunAction')}
                </Button>
              </>
            )}
          </div>

          {run.status === 'POSTED' && showPayForm && (
            <form onSubmit={onPay} className="flex flex-wrap items-end gap-3">
              <div>
                <Label>{tc('date')}</Label>
                <Input
                  type="date"
                  required
                  value={payDate}
                  onChange={(e) => setPayDate(e.target.value)}
                />
              </div>
              <div className="min-w-56">
                <Label>{t('payFromLabel')}</Label>
                <Select
                  required
                  value={payLedgerId}
                  onChange={(e) => setPayLedgerId(e.target.value)}
                >
                  <option value="">{t('selectLedger')}</option>
                  {cashBankLedgers.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                </Select>
              </div>
              <Button type="submit" disabled={busy || !payLedgerId}>
                {busy ? t('paying') : t('recordPayment')}
              </Button>
              <ErrorText>{payError}</ErrorText>
            </form>
          )}
        </div>
      )}

      {(run.status === 'POSTED' || run.status === 'PAID') && (
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3">
          <span className="mr-1 text-[11px] font-semibold uppercase tracking-wide text-faint">
            {t('exportsLabel')}
          </span>
          <Button variant="secondary" onClick={() => onExport('bank-advice')}>
            {t('bankAdvice')}
          </Button>
          <Button variant="secondary" onClick={() => onExport('register')}>
            {t('salaryRegister')}
          </Button>
        </div>
      )}
    </Card>
  );
}

// ----------------------------------------------------------------
// Inline-editable LOP days cell
// ----------------------------------------------------------------

function LopCell({
  companyId,
  runId,
  line,
  editable,
  onSaved,
}: {
  companyId: string;
  runId: string;
  line: PayLineView;
  editable: boolean;
  onSaved: () => Promise<void>;
}) {
  const t = useTranslations('payroll');
  const tc = useTranslations('common');
  const { toast } = useFeedback();
  const [value, setValue] = useState(() => String(line.lopDays));

  useEffect(() => {
    setValue(String(line.lopDays));
  }, [line.lopDays]);

  async function commit() {
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0 || n === line.lopDays) {
      setValue(String(line.lopDays));
      return;
    }
    try {
      await updatePayLine(companyId, runId, line.id, { lopDays: n });
      await onSaved();
      toast(t('toastLineUpdated'));
    } catch (err) {
      setValue(String(line.lopDays));
      toast(err instanceof ApiError ? err.message : tc('somethingWentWrong'), 'error');
    }
  }

  if (!editable) {
    return <span className="tabular-nums">{line.lopDays}</span>;
  }

  return (
    <Input
      type="number"
      min="0"
      step="0.5"
      max={line.workingDays}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => void commit()}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          (e.target as HTMLInputElement).blur();
        }
      }}
      className="inline-block w-20 text-right"
      aria-label={t('colLop')}
    />
  );
}
