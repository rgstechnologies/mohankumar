'use client';

/**
 * RGS super-admin console — platform-wide overview, user management
 * and subscription plan administration. Reachable only by staff accounts
 * (me.isSuperAdmin); everyone else is bounced back to /dashboard.
 */

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Badge, Button, Card, ErrorText, Input, Label, Select } from '@/components/ui';
import { LanguageSwitcher } from '@/components/language-switcher';
import { useFeedback } from '@/components/feedback';
import { api, ApiError, isAuthenticated, type Me } from '@/lib/api';
import {
  createAdminPlan,
  fetchAdminOverview,
  fetchAdminPlans,
  fetchAdminUsers,
  updateAdminPlan,
  updateAdminSubscription,
  updateAdminUser,
  createAdminReferralCode,
  fetchAdminReferralCodes,
  updateAdminReferralCode,
  type AdminOverview,
  type AdminSubscription,
  type AdminUserRow,
  type PlanRow,
  type ReferralCodeRow,
} from '@/lib/admin';
import {
  fetchLeads,
  updateLeadStatus,
  type LeadStatus,
  type SalesLead,
} from '@/lib/leads';

type AdminTab = 'overview' | 'users' | 'plans' | 'referrals' | 'leads';

const LEAD_STATUSES = ['NEW', 'CONTACTED', 'CLOSED'] as const;

const SUB_STATUSES = ['TRIAL', 'ACTIVE', 'EXPIRED', 'CANCELLED'] as const;
const USER_FILTERS = ['TRIAL', 'ACTIVE', 'EXPIRED', 'CANCELLED', 'BLOCKED', 'NONE'] as const;

const fmtDate = (value: string | null | undefined) =>
  value ? new Date(value).toLocaleDateString('en-IN') : '—';

const inr = (n: number) => `₹${n.toLocaleString('en-IN')}`;

const toNum = (s: string) => {
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
};

const tooltipStyle = {
  borderRadius: 8,
  border: '1px solid #e2e8f0',
  fontSize: 12,
  boxShadow: '0 4px 12px rgba(0,0,0,0.06)',
};

const TH_CLASS =
  'px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-faint';
const TD_CLASS = 'px-3 py-2.5 text-sm text-ink';

// ----------------------------------------------------------------
// Page shell
// ----------------------------------------------------------------

export default function AdminPage() {
  const t = useTranslations('admin');
  const tc = useTranslations('common');
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [tab, setTab] = useState<AdminTab>('overview');

  useEffect(() => {
    if (!isAuthenticated()) {
      router.push('/login');
      return;
    }
    api
      .get<Me>('/auth/me')
      .then((user) => {
        if (!user.isSuperAdmin) {
          router.push('/dashboard');
          return;
        }
        setMe(user);
      })
      .catch(() => router.push('/login'));
  }, [router]);

  if (!me) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-subtle text-sm text-muted">
        {tc('loading')}
      </main>
    );
  }

  const tabBtn = (key: AdminTab, label: string) => (
    <button
      key={key}
      onClick={() => setTab(key)}
      className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
        tab === key ? 'bg-brand-600 text-white' : 'text-muted hover:bg-subtle'
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="min-h-screen bg-subtle">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between px-6">
          <div className="flex items-center gap-3">
            <Link href="/" className="flex items-center gap-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/rgs-logo.jpeg" alt="RGS" className="h-8 w-8 rounded-lg bg-white object-contain" />
              <span className="text-lg font-bold tracking-tight">RGS</span>
            </Link>
            <span className="text-slate-300">/</span>
            <h1 className="text-sm font-semibold text-ink">{t('title')}</h1>
          </div>
          <div className="flex items-center gap-4">
            <LanguageSwitcher />
            <Link
              href="/dashboard"
              className="text-sm font-medium text-brand-600 hover:text-brand-700"
            >
              ← {t('backToDashboard')}
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl px-6 py-8">
        <div className="mb-6 inline-flex gap-1 rounded-xl border border-line bg-surface p-1">
          {tabBtn('overview', t('tabs.overview'))}
          {tabBtn('users', t('tabs.users'))}
          {tabBtn('plans', t('tabs.plans'))}
          {tabBtn('referrals', t('tabs.referrals'))}
          {tabBtn('leads', t('tabs.leads'))}
        </div>

        {tab === 'overview' && <OverviewSection />}
        {tab === 'users' && <UsersSection />}
        {tab === 'plans' && <PlansSection />}
        {tab === 'referrals' && <ReferralsSection />}
        {tab === 'leads' && <LeadsSection />}
      </main>
    </div>
  );
}

// ----------------------------------------------------------------
// Shared bits
// ----------------------------------------------------------------

function PlanStatusBadge({ subscription }: { subscription: AdminSubscription | null }) {
  const t = useTranslations('admin');
  if (!subscription?.status) return <Badge tone="neutral">{t('noPlan')}</Badge>;
  const tone: 'good' | 'warn' | 'bad' =
    subscription.status === 'ACTIVE' ? 'good' : subscription.status === 'TRIAL' ? 'warn' : 'bad';
  return <Badge tone={tone}>{t(`status.${subscription.status}`)}</Badge>;
}

// ----------------------------------------------------------------
// 1. Overview
// ----------------------------------------------------------------

function Kpi({ label, value, tone }: { label: string; value: number; tone?: 'good' | 'warn' | 'bad' }) {
  const color =
    tone === 'good'
      ? 'text-emerald-600'
      : tone === 'warn'
        ? 'text-amber-600'
        : tone === 'bad'
          ? 'text-red-600'
          : 'text-ink';
  return (
    <Card className="!p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-faint">{label}</p>
      <p className={`mt-1 text-2xl font-bold tabular-nums ${color}`}>
        {value.toLocaleString('en-IN')}
      </p>
    </Card>
  );
}

function OverviewSection() {
  const t = useTranslations('admin');
  const tc = useTranslations('common');
  const [data, setData] = useState<AdminOverview | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchAdminOverview()
      .then(setData)
      .catch((err) =>
        setError(err instanceof ApiError ? err.message : tc('somethingWentWrong')),
      );
  }, [tc]);

  if (error) return <ErrorText>{error}</ErrorText>;
  if (!data) return <p className="text-sm text-muted">{tc('loading')}</p>;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4 xl:grid-cols-7">
        <Kpi label={t('overview.totalUsers')} value={data.totalUsers} />
        <Kpi label={t('overview.newUsers30d')} value={data.newUsers30d} tone="good" />
        <Kpi label={t('overview.trialUsers')} value={data.trialUsers} tone="warn" />
        <Kpi label={t('overview.paidUsers')} value={data.paidUsers} tone="good" />
        <Kpi label={t('overview.expiredUsers')} value={data.expiredUsers} tone="bad" />
        <Kpi label={t('overview.blockedUsers')} value={data.blockedUsers} tone="bad" />
        <Kpi label={t('overview.totalCompanies')} value={data.totalCompanies} />
      </div>

      <div className="grid gap-6 xl:grid-cols-5">
        <Card className="xl:col-span-2" title={t('overview.planDistribution')}>
          <div className="h-64">
            <ResponsiveContainer width="100%" height={256} minWidth={0}>
              <BarChart data={data.planDistribution}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 12, fill: '#94a3b8' }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fontSize: 11, fill: '#94a3b8' }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  contentStyle={tooltipStyle}
                  formatter={(value) => [String(value), t('overview.chartUsers')]}
                />
                <Bar dataKey="users" fill="#673de6" radius={[4, 4, 0, 0]} maxBarSize={48} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="xl:col-span-3" title={t('overview.recentSignups')}>
          {data.recentUsers.length === 0 ? (
            <p className="text-sm text-muted">{t('overview.noRecent')}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-line">
                    <th className={TH_CLASS}>{tc('name')}</th>
                    <th className={TH_CLASS}>{t('overview.colEmail')}</th>
                    <th className={TH_CLASS}>{t('overview.colPlan')}</th>
                    <th className={TH_CLASS}>{t('overview.colSignedUp')}</th>
                    <th className={TH_CLASS}>{t('overview.colLastLogin')}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recentUsers.map((u) => (
                    <tr key={u.id} className="border-b border-line last:border-0 hover:bg-subtle">
                      <td className={`${TD_CLASS} font-medium text-ink`}>{u.name}</td>
                      <td className={`${TD_CLASS} text-muted`}>{u.email}</td>
                      <td className={TD_CLASS}>
                        <PlanStatusBadge subscription={u.subscription} />
                      </td>
                      <td className={`${TD_CLASS} tabular-nums`}>{fmtDate(u.createdAt)}</td>
                      <td className={`${TD_CLASS} tabular-nums`}>{fmtDate(u.lastLoginAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------
// 2. Users
// ----------------------------------------------------------------

function UsersSection() {
  const t = useTranslations('admin');
  const tc = useTranslations('common');
  const { toast, confirm } = useFeedback();
  const [users, setUsers] = useState<AdminUserRow[] | null>(null);
  const [plans, setPlans] = useState<PlanRow[]>([]);
  const [q, setQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQ(q.trim()), 300);
    return () => clearTimeout(timer);
  }, [q]);

  const load = useCallback(async () => {
    setError('');
    try {
      setUsers(await fetchAdminUsers(debouncedQ || undefined, statusFilter || undefined));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : tc('somethingWentWrong'));
    }
  }, [debouncedQ, statusFilter, tc]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    fetchAdminPlans()
      .then(setPlans)
      .catch(() => {});
  }, []);

  async function toggleBlock(u: AdminUserRow) {
    const ok = await confirm({
      title: t(u.isBlocked ? 'users.unblockTitle' : 'users.blockTitle', { name: u.name }),
      body: t(u.isBlocked ? 'users.unblockBody' : 'users.blockBody'),
      confirmLabel: t(u.isBlocked ? 'users.unblock' : 'users.block'),
      danger: !u.isBlocked,
    });
    if (!ok) return;
    try {
      await updateAdminUser(u.id, { isBlocked: !u.isBlocked });
      toast(t(u.isBlocked ? 'users.toastUnblocked' : 'users.toastBlocked'));
      await load();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : tc('somethingWentWrong'), 'error');
    }
  }

  async function toggleAdmin(u: AdminUserRow) {
    const ok = await confirm({
      title: t(u.isSuperAdmin ? 'users.revokeAdminTitle' : 'users.makeAdminTitle', {
        name: u.name,
      }),
      body: t(u.isSuperAdmin ? 'users.revokeAdminBody' : 'users.makeAdminBody'),
      confirmLabel: t(u.isSuperAdmin ? 'users.revokeAdmin' : 'users.makeAdmin'),
      danger: u.isSuperAdmin,
    });
    if (!ok) return;
    try {
      await updateAdminUser(u.id, { isSuperAdmin: !u.isSuperAdmin });
      toast(t(u.isSuperAdmin ? 'users.toastAdminRevoked' : 'users.toastAdminGranted'));
      await load();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : tc('somethingWentWrong'), 'error');
    }
  }

  const actionBtn = (label: string, onClick: () => void, danger = false) => (
    <button
      onClick={onClick}
      className={`text-xs font-medium ${
        danger ? 'text-red-600 hover:text-red-700' : 'text-brand-600 hover:text-brand-700'
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t('users.searchPlaceholder')}
          className="max-w-xs"
          aria-label={tc('search')}
        />
        <Select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="max-w-48"
          aria-label={tc('status')}
        >
          <option value="">{t('users.filterAll')}</option>
          {USER_FILTERS.map((s) => (
            <option key={s} value={s}>
              {s === 'BLOCKED'
                ? t('users.filterBlocked')
                : s === 'NONE'
                  ? t('noPlan')
                  : t(`status.${s}`)}
            </option>
          ))}
        </Select>
      </div>

      <ErrorText>{error}</ErrorText>

      <Card className="!p-0">
        {users === null ? (
          <p className="p-6 text-sm text-muted">{tc('loading')}</p>
        ) : users.length === 0 ? (
          <p className="p-6 text-sm text-muted">{t('users.noUsers')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-line">
                  <th className={TH_CLASS}>{t('users.colUser')}</th>
                  <th className={TH_CLASS}>{t('users.colPlan')}</th>
                  <th className={TH_CLASS}>{t('users.colExpires')}</th>
                  <th className={TH_CLASS}>{t('users.colOwns')}</th>
                  <th className={TH_CLASS}>{t('users.colMemberOf')}</th>
                  <th className={TH_CLASS}>{t('users.colLastLogin')}</th>
                  <th className={TH_CLASS}>{t('users.colJoined')}</th>
                  <th className={TH_CLASS}>{tc('actions')}</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <UserRow
                    key={u.id}
                    user={u}
                    plans={plans}
                    editing={editingId === u.id}
                    onEdit={() => setEditingId(editingId === u.id ? null : u.id)}
                    onCloseEditor={() => setEditingId(null)}
                    onSaved={async () => {
                      setEditingId(null);
                      await load();
                    }}
                    onToggleBlock={() => void toggleBlock(u)}
                    onToggleAdmin={() => void toggleAdmin(u)}
                    actionBtn={actionBtn}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function UserRow({
  user,
  plans,
  editing,
  onEdit,
  onCloseEditor,
  onSaved,
  onToggleBlock,
  onToggleAdmin,
  actionBtn,
}: {
  user: AdminUserRow;
  plans: PlanRow[];
  editing: boolean;
  onEdit: () => void;
  onCloseEditor: () => void;
  onSaved: () => Promise<void>;
  onToggleBlock: () => void;
  onToggleAdmin: () => void;
  actionBtn: (label: string, onClick: () => void, danger?: boolean) => React.ReactNode;
}) {
  const t = useTranslations('admin');

  return (
    <>
      <tr className="border-b border-line last:border-0 hover:bg-subtle">
        <td className={TD_CLASS}>
          <div className="flex items-center gap-2">
            <span className="font-medium text-ink">{user.name}</span>
            {user.isSuperAdmin && (
              <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[10px] font-semibold text-brand-700">
                {t('users.adminBadge')}
              </span>
            )}
            {user.isBlocked && (
              <span className="rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-semibold text-red-600">
                {t('users.blockedBadge')}
              </span>
            )}
          </div>
          <p className="text-xs text-faint">{user.email}</p>
        </td>
        <td className={TD_CLASS}>
          <div className="flex items-center gap-2">
            <PlanStatusBadge subscription={user.subscription} />
            {user.subscription && (
              <span className="text-xs text-muted">{user.subscription.planName}</span>
            )}
          </div>
        </td>
        <td className={`${TD_CLASS} tabular-nums`}>{fmtDate(user.subscription?.expiresAt)}</td>
        <td className={TD_CLASS}>
          <span className="font-medium tabular-nums">{user.ownedCompanies.length}</span>
          {user.ownedCompanies.length > 0 && (
            <div className="mt-0.5 flex max-w-44 flex-col gap-0.5">
              {user.ownedCompanies.slice(0, 3).map((c) => (
                <Link
                  key={c.id}
                  href={`/company/${c.id}`}
                  title={t('users.viewCompany')}
                  className="truncate text-xs font-medium text-brand-600 hover:underline"
                >
                  {c.name}
                </Link>
              ))}
            </div>
          )}
        </td>
        <td className={`${TD_CLASS} tabular-nums`}>{user.membershipCount}</td>
        <td className={`${TD_CLASS} tabular-nums`}>{fmtDate(user.lastLoginAt)}</td>
        <td className={`${TD_CLASS} tabular-nums`}>{fmtDate(user.createdAt)}</td>
        <td className={TD_CLASS}>
          <div className="flex items-center gap-3 whitespace-nowrap">
            {actionBtn(t('users.managePlan'), onEdit)}
            {actionBtn(
              user.isBlocked ? t('users.unblock') : t('users.block'),
              onToggleBlock,
              !user.isBlocked,
            )}
            {actionBtn(
              user.isSuperAdmin ? t('users.revokeAdmin') : t('users.makeAdmin'),
              onToggleAdmin,
              user.isSuperAdmin,
            )}
          </div>
        </td>
      </tr>
      {editing && (
        <tr className="border-b border-line hover:bg-subtle">
          <td colSpan={8} className="bg-subtle px-3 py-4">
            <SubscriptionEditor user={user} plans={plans} onSaved={onSaved} onClose={onCloseEditor} />
          </td>
        </tr>
      )}
    </>
  );
}

function SubscriptionEditor({
  user,
  plans,
  onSaved,
  onClose,
}: {
  user: AdminUserRow;
  plans: PlanRow[];
  onSaved: () => Promise<void>;
  onClose: () => void;
}) {
  const t = useTranslations('admin');
  const tc = useTranslations('common');
  const { toast } = useFeedback();
  const activePlans = plans.filter((p) => p.isActive);
  const currentCode = user.subscription?.planCode ?? '';
  const planOptions =
    currentCode && !activePlans.some((p) => p.code === currentCode)
      ? [{ code: currentCode, name: user.subscription?.planName ?? currentCode }, ...activePlans]
      : activePlans;

  const [planCode, setPlanCode] = useState(currentCode || activePlans[0]?.code || '');
  const [status, setStatus] = useState<string>(user.subscription?.status ?? 'TRIAL');
  const [expiry, setExpiry] = useState(user.subscription?.expiresAt?.slice(0, 10) ?? '');
  const [notes, setNotes] = useState(user.subscription?.notes ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await updateAdminSubscription(user.id, {
        planCode,
        status,
        expiresAt: expiry ? new Date(`${expiry}T00:00:00`).toISOString() : null,
        notes: notes || undefined,
      });
      toast(t('users.toastSubscription'));
      await onSaved();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : tc('somethingWentWrong'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSave} className="space-y-3">
      <p className="text-sm font-semibold text-ink">
        {t('users.editorTitle', { name: user.name })}
      </p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <Label>{t('users.planLabel')}</Label>
          <Select value={planCode} onChange={(e) => setPlanCode(e.target.value)}>
            {planOptions.map((p) => (
              <option key={p.code} value={p.code}>
                {p.name} ({p.code})
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label>{tc('status')}</Label>
          <Select value={status} onChange={(e) => setStatus(e.target.value)}>
            {SUB_STATUSES.map((s) => (
              <option key={s} value={s}>
                {t(`status.${s}`)}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label>{t('users.expiryLabel')}</Label>
          <Input type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)} />
          <p className="mt-1 text-xs text-faint">{t('users.expiryHint')}</p>
        </div>
        <div>
          <Label>{t('users.notesLabel')}</Label>
          <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
      </div>
      <ErrorText>{error}</ErrorText>
      <div className="flex gap-2">
        <Button type="submit" disabled={busy || !planCode}>
          {busy ? tc('saving') : tc('save')}
        </Button>
        <Button type="button" variant="secondary" onClick={onClose}>
          {tc('cancel')}
        </Button>
      </div>
    </form>
  );
}

// ----------------------------------------------------------------
// 3. Plans
// ----------------------------------------------------------------

function PlansSection() {
  const t = useTranslations('admin');
  const tc = useTranslations('common');
  const { toast } = useFeedback();
  const [plans, setPlans] = useState<PlanRow[] | null>(null);
  const [editing, setEditing] = useState<PlanRow | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      setPlans(await fetchAdminPlans());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : tc('somethingWentWrong'));
    }
  }, [tc]);

  useEffect(() => {
    void load();
  }, [load]);

  async function toggleActive(p: PlanRow) {
    try {
      await updateAdminPlan(p.id, { isActive: !p.isActive });
      toast(t('plans.toastUpdated'));
      await load();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : tc('somethingWentWrong'), 'error');
    }
  }

  const limit = (n: number) =>
    n === -1 ? t('plans.unlimited') : n.toLocaleString('en-IN');

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end">
        <Button
          onClick={() => {
            setEditing(null);
            setShowForm(true);
          }}
        >
          + {t('plans.newPlan')}
        </Button>
      </div>

      <ErrorText>{error}</ErrorText>

      {showForm && (
        <PlanForm
          key={editing?.id ?? 'new'}
          plan={editing}
          onDone={async () => {
            setShowForm(false);
            setEditing(null);
            await load();
          }}
          onCancel={() => {
            setShowForm(false);
            setEditing(null);
          }}
        />
      )}

      <Card className="!p-0">
        {plans === null ? (
          <p className="p-6 text-sm text-muted">{tc('loading')}</p>
        ) : plans.length === 0 ? (
          <p className="p-6 text-sm text-muted">{t('plans.noPlans')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-line">
                  <th className={TH_CLASS}>{t('plans.colCode')}</th>
                  <th className={TH_CLASS}>{tc('name')}</th>
                  <th className={`${TH_CLASS} text-right`}>{t('plans.colMonthly')}</th>
                  <th className={`${TH_CLASS} text-right`}>{t('plans.colCompanies')}</th>
                  <th className={`${TH_CLASS} text-right`}>{t('plans.colBranches')}</th>
                  <th className={`${TH_CLASS} text-right`}>{t('plans.colMembers')}</th>
                  <th className={`${TH_CLASS} text-right`}>{t('plans.colTrialDays')}</th>
                  <th className={`${TH_CLASS} text-center`}>{t('plans.colPayroll')}</th>
                  <th className={`${TH_CLASS} text-right`}>{t('plans.colSubscribers')}</th>
                  <th className={`${TH_CLASS} text-center`}>{tc('active')}</th>
                  <th className={TH_CLASS} />
                </tr>
              </thead>
              <tbody>
                {plans.map((p) => (
                  <tr key={p.id} className="border-b border-line last:border-0 hover:bg-subtle">
                    <td className={`${TD_CLASS} font-mono text-xs font-semibold text-ink`}>
                      {p.code}
                    </td>
                    <td className={`${TD_CLASS} font-medium text-ink`}>{p.name}</td>
                    <td className={`${TD_CLASS} text-right tabular-nums`}>
                      {inr(p.priceMonthly)}
                    </td>
                    <td className={`${TD_CLASS} text-right tabular-nums`}>
                      {limit(p.maxCompanies)}
                    </td>
                    <td className={`${TD_CLASS} text-right tabular-nums`}>
                      {limit(p.maxBranches)}
                    </td>
                    <td className={`${TD_CLASS} text-right tabular-nums`}>
                      {limit(p.maxMembers)}
                    </td>
                    <td className={`${TD_CLASS} text-right tabular-nums`}>{p.trialDays}</td>
                    <td className={`${TD_CLASS} text-center`}>
                      {p.features.payroll !== false ? (
                        <span className="text-emerald-600">✓</span>
                      ) : (
                        <span className="text-slate-300">✕</span>
                      )}
                    </td>
                    <td className={`${TD_CLASS} text-right tabular-nums`}>{p.subscribers}</td>
                    <td className={`${TD_CLASS} text-center`}>
                      <button
                        onClick={() => void toggleActive(p)}
                        aria-label={tc('active')}
                        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                          p.isActive ? 'bg-brand-600' : 'bg-slate-300'
                        }`}
                      >
                        <span
                          className={`inline-block h-4 w-4 transform rounded-full bg-surface shadow transition-transform ${
                            p.isActive ? 'translate-x-[18px]' : 'translate-x-0.5'
                          }`}
                        />
                      </button>
                    </td>
                    <td className={TD_CLASS}>
                      <button
                        onClick={() => {
                          setEditing(p);
                          setShowForm(true);
                        }}
                        className="text-xs font-medium text-brand-600 hover:text-brand-700"
                      >
                        {tc('edit')}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function PlanForm({
  plan,
  onDone,
  onCancel,
}: {
  plan: PlanRow | null;
  onDone: () => Promise<void>;
  onCancel: () => void;
}) {
  const t = useTranslations('admin');
  const tc = useTranslations('common');
  const { toast } = useFeedback();
  const [code, setCode] = useState(plan?.code ?? '');
  const [name, setName] = useState(plan?.name ?? '');
  const [price, setPrice] = useState(String(plan?.priceMonthly ?? 0));
  const [maxCompanies, setMaxCompanies] = useState(String(plan?.maxCompanies ?? 1));
  const [maxBranches, setMaxBranches] = useState(String(plan?.maxBranches ?? 1));
  const [maxMembers, setMaxMembers] = useState(String(plan?.maxMembers ?? 3));
  const [trialDays, setTrialDays] = useState(String(plan?.trialDays ?? 14));
  const [sortOrder, setSortOrder] = useState(String(plan?.sortOrder ?? 0));
  const [payroll, setPayroll] = useState(plan ? plan.features.payroll !== false : true);
  const [isActive, setIsActive] = useState(plan?.isActive ?? true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const payload: Partial<PlanRow> = {
        code: code.trim().toUpperCase(),
        name: name.trim(),
        priceMonthly: toNum(price),
        maxCompanies: toNum(maxCompanies),
        maxBranches: toNum(maxBranches),
        maxMembers: toNum(maxMembers),
        trialDays: toNum(trialDays),
        sortOrder: toNum(sortOrder),
        features: { payroll },
        isActive,
      };
      if (plan) {
        await updateAdminPlan(plan.id, payload);
        toast(t('plans.toastUpdated'));
      } else {
        await createAdminPlan(payload);
        toast(t('plans.toastCreated'));
      }
      await onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : tc('somethingWentWrong'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title={plan ? t('plans.formTitleEdit') : t('plans.newPlan')}>
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <Label>{t('plans.codeLabel')}</Label>
            <Input
              required
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="PRO"
            />
          </div>
          <div>
            <Label>{tc('name')}</Label>
            <Input required value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <Label>{t('plans.priceLabel')}</Label>
            <Input
              type="number"
              min={0}
              required
              value={price}
              onChange={(e) => setPrice(e.target.value)}
            />
          </div>
          <div>
            <Label>{t('plans.trialDaysLabel')}</Label>
            <Input
              type="number"
              min={0}
              value={trialDays}
              onChange={(e) => setTrialDays(e.target.value)}
            />
          </div>
          <div>
            <Label>{t('plans.maxCompaniesLabel')}</Label>
            <Input
              type="number"
              min={-1}
              value={maxCompanies}
              onChange={(e) => setMaxCompanies(e.target.value)}
            />
            <p className="mt-1 text-xs text-faint">{t('plans.unlimitedHint')}</p>
          </div>
          <div>
            <Label>{t('plans.maxBranchesLabel')}</Label>
            <Input
              type="number"
              min={-1}
              value={maxBranches}
              onChange={(e) => setMaxBranches(e.target.value)}
            />
            <p className="mt-1 text-xs text-faint">{t('plans.unlimitedHint')}</p>
          </div>
          <div>
            <Label>{t('plans.maxMembersLabel')}</Label>
            <Input
              type="number"
              min={-1}
              value={maxMembers}
              onChange={(e) => setMaxMembers(e.target.value)}
            />
            <p className="mt-1 text-xs text-faint">{t('plans.unlimitedHint')}</p>
          </div>
          <div>
            <Label>{t('plans.sortOrderLabel')}</Label>
            <Input
              type="number"
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value)}
            />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-6">
          <label className="flex items-center gap-2 text-sm text-ink">
            <input
              type="checkbox"
              checked={payroll}
              onChange={(e) => setPayroll(e.target.checked)}
              className="h-4 w-4 rounded border-line-strong text-brand-600 focus:ring-brand-500"
            />
            {t('plans.payrollLabel')}
          </label>
          <label className="flex items-center gap-2 text-sm text-ink">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="h-4 w-4 rounded border-line-strong text-brand-600 focus:ring-brand-500"
            />
            {tc('active')}
          </label>
        </div>
        <ErrorText>{error}</ErrorText>
        <div className="flex gap-2">
          <Button type="submit" disabled={busy}>
            {busy ? tc('saving') : tc('save')}
          </Button>
          <Button type="button" variant="secondary" onClick={onCancel}>
            {tc('cancel')}
          </Button>
        </div>
      </form>
    </Card>
  );
}

function ReferralsSection() {
  const t = useTranslations('admin.referrals');
  const tc = useTranslations('common');
  const { toast } = useFeedback();
  const [rows, setRows] = useState<ReferralCodeRow[] | null>(null);
  const [code, setCode] = useState('');
  const [description, setDescription] = useState('');
  const [discountType, setDiscountType] = useState<'PERCENT' | 'FLAT'>('PERCENT');
  const [discountValue, setDiscountValue] = useState('');
  const [maxUses, setMaxUses] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    fetchAdminReferralCodes().then(setRows).catch(() => setRows([]));
  }, []);
  useEffect(() => load(), [load]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await createAdminReferralCode({
        code: code.trim().toUpperCase(),
        description: description || undefined,
        discountType,
        discountValue: Number(discountValue),
        maxUses: maxUses ? Number(maxUses) : undefined,
        expiresAt: expiresAt || undefined,
      });
      setCode('');
      setDescription('');
      setDiscountValue('');
      setMaxUses('');
      setExpiresAt('');
      load();
      toast(t('created'));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : tc('somethingWentWrong'));
    } finally {
      setBusy(false);
    }
  }

  async function toggle(r: ReferralCodeRow) {
    await updateAdminReferralCode(r.id, { isActive: !r.isActive }).catch(() => {});
    load();
  }

  return (
    <div className="space-y-4">
      <Card title={t('newTitle')}>
        <form onSubmit={create} className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <Label>{t('code')}</Label>
            <Input required value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="WELCOME20" />
          </div>
          <div>
            <Label>{t('type')}</Label>
            <Select value={discountType} onChange={(e) => setDiscountType(e.target.value as 'PERCENT' | 'FLAT')}>
              <option value="PERCENT">{t('percent')}</option>
              <option value="FLAT">{t('flat')}</option>
            </Select>
          </div>
          <div>
            <Label>{discountType === 'PERCENT' ? t('valuePercent') : t('valueFlat')}</Label>
            <Input required type="number" min="0" step="0.01" value={discountValue} onChange={(e) => setDiscountValue(e.target.value)} />
          </div>
          <div>
            <Label>{t('maxUses')}</Label>
            <Input type="number" min="1" value={maxUses} onChange={(e) => setMaxUses(e.target.value)} placeholder={t('unlimited')} />
          </div>
          <div>
            <Label>{t('expiresAt')}</Label>
            <Input type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
          </div>
          <div className="sm:col-span-3">
            <Label>{t('description')}</Label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder={t('descriptionPlaceholder')} />
          </div>
          <div className="flex items-center gap-3 sm:col-span-3">
            <Button type="submit" disabled={busy || !code.trim() || !discountValue}>
              {busy ? tc('saving') : t('create')}
            </Button>
            <ErrorText>{error}</ErrorText>
          </div>
        </form>
      </Card>

      <Card title={t('listTitle')}>
        {rows === null ? (
          <p className="text-sm text-faint">{tc('loading')}</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-faint">{t('empty')}</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line bg-subtle text-left text-[11px] font-semibold uppercase tracking-wide text-muted">
                <th className="py-2">{t('code')}</th>
                <th className="py-2">{t('discount')}</th>
                <th className="py-2 text-right">{t('uses')}</th>
                <th className="py-2">{t('expiresAt')}</th>
                <th className="py-2 text-center">{tc('status')}</th>
                <th className="py-2 text-right">{tc('actions')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-line last:border-0">
                  <td className="py-2 font-mono font-medium text-ink">{r.code}</td>
                  <td className="py-2 text-muted">
                    {r.discountType === 'PERCENT' ? `${r.discountValue}%` : `₹${r.discountValue}`}
                  </td>
                  <td className="py-2 text-right tabular-nums">
                    {r.usesCount}
                    {r.maxUses != null ? ` / ${r.maxUses}` : ''}
                  </td>
                  <td className="py-2 text-muted">
                    {r.expiresAt ? new Date(r.expiresAt).toLocaleDateString('en-IN') : '—'}
                  </td>
                  <td className="py-2 text-center">
                    <Badge tone={r.isActive ? 'good' : 'neutral'}>
                      {r.isActive ? t('active') : t('inactive')}
                    </Badge>
                  </td>
                  <td className="py-2 text-right">
                    <button onClick={() => void toggle(r)} className="text-xs font-medium text-brand-600 hover:underline">
                      {r.isActive ? t('deactivate') : t('activate')}
                    </button>
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

const LEAD_TONE: Record<LeadStatus, 'warn' | 'good' | 'neutral'> = {
  NEW: 'warn',
  CONTACTED: 'good',
  CLOSED: 'neutral',
};

function LeadsSection() {
  const t = useTranslations('admin.leads');
  const tc = useTranslations('common');
  const { toast } = useFeedback();
  const [rows, setRows] = useState<SalesLead[] | null>(null);
  const [statusFilter, setStatusFilter] = useState<'' | LeadStatus>('');

  const load = useCallback(() => {
    fetchLeads(statusFilter || undefined)
      .then(setRows)
      .catch(() => setRows([]));
  }, [statusFilter]);
  useEffect(() => load(), [load]);

  async function changeStatus(lead: SalesLead, status: LeadStatus) {
    setRows((prev) =>
      prev ? prev.map((r) => (r.id === lead.id ? { ...r, status } : r)) : prev,
    );
    try {
      await updateLeadStatus(lead.id, status);
      toast(t('statusUpdated'));
    } catch {
      load();
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted">{t('subtitle')}</p>
        <div className="w-44">
          <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as '' | LeadStatus)}>
            <option value="">{t('filterAll')}</option>
            {LEAD_STATUSES.map((s) => (
              <option key={s} value={s}>
                {t(`status.${s}`)}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <Card title={t('title')}>
        {rows === null ? (
          <p className="p-6 text-sm text-muted">{tc('loading')}</p>
        ) : rows.length === 0 ? (
          <p className="p-6 text-sm text-muted">{t('empty')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-line">
                  <th className={TH_CLASS}>{t('colCompany')}</th>
                  <th className={TH_CLASS}>{t('colContact')}</th>
                  <th className={TH_CLASS}>{t('colRequirements')}</th>
                  <th className={TH_CLASS}>{t('colReceived')}</th>
                  <th className={TH_CLASS}>{t('colStatus')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-b border-line/60 align-top">
                    <td className={`${TD_CLASS} font-medium text-ink`}>{r.companyName}</td>
                    <td className={TD_CLASS}>
                      <div className="text-ink">{r.name}</div>
                      <div className="text-xs text-muted">
                        <a href={`mailto:${r.email}`} className="hover:text-brand-600">
                          {r.email}
                        </a>
                      </div>
                      <div className="text-xs text-muted">
                        <a href={`tel:${r.phone}`} className="hover:text-brand-600">
                          {r.phone}
                        </a>
                      </div>
                    </td>
                    <td className={`${TD_CLASS} max-w-xs whitespace-pre-wrap text-muted`}>
                      {r.requirements || '—'}
                    </td>
                    <td className={`${TD_CLASS} whitespace-nowrap text-muted`}>{fmtDate(r.createdAt)}</td>
                    <td className={TD_CLASS}>
                      <div className="flex flex-col gap-1.5">
                        <Badge tone={LEAD_TONE[r.status]}>{t(`status.${r.status}`)}</Badge>
                        <div className="w-32">
                          <Select
                            value={r.status}
                            onChange={(e) => changeStatus(r, e.target.value as LeadStatus)}
                          >
                            {LEAD_STATUSES.map((s) => (
                              <option key={s} value={s}>
                                {t(`status.${s}`)}
                              </option>
                            ))}
                          </Select>
                        </div>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
