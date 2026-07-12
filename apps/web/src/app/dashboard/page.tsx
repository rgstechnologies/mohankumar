'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button, Card, ErrorText, Input, Label, Select } from '@/components/ui';
import { LanguageSwitcher } from '@/components/language-switcher';
import { SecurityDialog } from '@/components/security-dialog';
import { UpgradeDialog } from '@/components/upgrade-dialog';
import { useFeedback } from '@/components/feedback';
import { api, ApiError, isAuthenticated, logout, type Me } from '@/lib/api';
import { fetchBranches, type BranchRow } from '@/lib/accounting';
import { stateNameForCode } from '@bookly/shared';
import {
  fetchGrantedAuditors,
  revokeAuditorAccess,
  type GrantedAuditor,
} from '@/lib/auditor';
import { IconLock } from '@/components/icons';

const INVITE_ROLES = [
  'ADMIN',
  'ACCOUNTANT',
  'CASHIER',
  'EMPLOYEE',
  'AUDITOR',
  'BRANCH_MANAGER',
] as const;

export default function DashboardPage() {
  const t = useTranslations('dashboardPage');
  const tc = useTranslations('common');
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [showSecurity, setShowSecurity] = useState(false);
  const [hasPayslips, setHasPayslips] = useState<boolean | null>(null);

  const load = useCallback(async () => {
    try {
      setMe(await api.get<Me>('/auth/me'));
    } catch {
      router.push('/login');
    }
  }, [router]);

  useEffect(() => {
    api
      .get<unknown[]>('/portal/me')
      .then((rows) => setHasPayslips(rows.length > 0))
      .catch(() => setHasPayslips(false));
  }, []);

  useEffect(() => {
    if (!isAuthenticated()) {
      router.push('/login');
      return;
    }
    void load();
  }, [load, router]);

  // Auditor accounts live in the auditor workspace — they don't run companies.
  const auditorAccount = me?.accountType === 'AUDITOR';
  useEffect(() => {
    if (auditorAccount) router.replace('/auditor');
  }, [auditorAccount, router]);

  // Employee-only accounts live in the portal — the business dashboard
  // (plans, company creation) is owner/staff territory.
  const employeeOnly =
    me !== null && me.memberships.length === 0 && hasPayslips === true;
  useEffect(() => {
    if (employeeOnly) router.replace('/portal');
  }, [employeeOnly, router]);

  if (!me || hasPayslips === null || employeeOnly || auditorAccount) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-subtle text-sm text-muted">
        {tc('loading')}
      </main>
    );
  }

  return (
    <div className="min-h-screen bg-subtle">
      {/* Top navigation */}
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex h-16 w-full max-w-7xl items-center justify-between px-6">
          <Link href="/" className="flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/rgs-logo.jpeg" alt="RGS" className="h-8 w-8 rounded-lg bg-white object-contain" />
            <span className="text-lg font-bold tracking-tight">RGS</span>
          </Link>
          <div className="flex items-center gap-4">
            <div className="hidden text-right sm:block">
              <p className="text-sm font-medium text-ink">{me.name}</p>
              <p className="text-xs text-faint">{me.email}</p>
            </div>
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-100 text-sm font-bold text-brand-700">
              {me.name.charAt(0).toUpperCase()}
            </div>
            {me.isSuperAdmin && (
              <Link
                href="/admin"
                className="rounded-lg border border-brand-200 bg-brand-50 px-3 py-2 text-sm font-medium text-brand-700 hover:bg-brand-100"
              >
                {t('adminConsole')}
              </Link>
            )}
            {hasPayslips && (
              <Link
                href="/portal"
                className="rounded-lg border border-line bg-surface px-3 py-2 text-sm font-medium text-muted hover:bg-subtle"
              >
                {t('myPayslips')}
              </Link>
            )}
            <button
              onClick={() => setShowSecurity(true)}
              className="rounded-lg border border-line bg-surface px-3 py-2 text-sm font-medium text-muted hover:bg-subtle"
            >
              {t('security')}
            </button>
            <LanguageSwitcher />
            <Button
              variant="secondary"
              onClick={async () => {
                await logout();
                router.push('/login');
              }}
            >
              {t('signOut')}
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl px-6 py-10">
        <div className="mb-8 flex items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-ink">{t('title')}</h1>
            <p className="mt-1 text-sm text-muted">{t('subtitle')}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/marketplace"
              className="rounded-full border border-line bg-surface px-4 py-2 text-sm font-semibold text-ink transition-colors hover:border-brand-200 hover:bg-brand-50"
            >
              {t('findAuditor')}
            </Link>
            {/* Auditor workspace is only for auditor accounts — business owners
                run companies, they don't have an auditor workspace. */}
            {auditorAccount && (
              <Link
                href="/auditor"
                className="rounded-full border border-brand-200 bg-brand-50 px-4 py-2 text-sm font-semibold text-brand-700 transition-colors hover:bg-brand-100"
              >
                {t('auditorWorkspace')}
              </Link>
            )}
          </div>
        </div>

        <PlanBanner subscription={me.subscription} onUpgraded={load} />
        {showSecurity && (
          <SecurityDialog
            totpEnabled={me.totpEnabled}
            onClose={() => setShowSecurity(false)}
            onChanged={load}
          />
        )}

        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          {me.memberships.map((m) => (
            <CompanyCard
              key={m.company.id}
              companyId={m.company.id}
              name={m.company.name}
              gstin={m.company.gstin}
              role={m.role}
            />
          ))}
          <CreateCompanyCard onCreated={load} subscription={me.subscription} />
        </div>
      </main>
    </div>
  );
}

function CompanyCard({
  companyId,
  name,
  gstin,
  role,
}: {
  companyId: string;
  name: string;
  gstin: string | null;
  role: string;
}) {
  const t = useTranslations('dashboardPage');
  const tc = useTranslations('common');
  const canInvite = role === 'OWNER' || role === 'ADMIN';
  const [showInvite, setShowInvite] = useState(false);
  const [email, setEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<string>('ACCOUNTANT');
  const [branches, setBranches] = useState<BranchRow[] | null>(null);
  const [branchId, setBranchId] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // Any member except a company-wide ADMIN can be tied to a branch, so their
  // estimates/bills/purchases map to it.
  const branchAssignable = inviteRole !== 'ADMIN';
  useEffect(() => {
    if (branchAssignable && branches === null) {
      fetchBranches(companyId)
        .then(setBranches)
        .catch(() => setBranches([]));
    }
  }, [branchAssignable, branches, companyId]);

  async function onInvite(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setMessage('');
    setBusy(true);
    try {
      await api.post(`/companies/${companyId}/invites`, {
        email,
        role: inviteRole,
        branchId: branchAssignable && branchId ? branchId : undefined,
      });
      setMessage(t('inviteSent', { email }));
      setEmail('');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : tc('somethingWentWrong'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="flex flex-col">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-50 text-lg font-bold text-brand-700">
            {name.charAt(0).toUpperCase()}
          </div>
          <div>
            <h3 className="font-semibold text-ink">{name}</h3>
            <p className="text-xs text-faint">
              {gstin ? t('gstinValue', { gstin }) : t('unregistered')}
            </p>
          </div>
        </div>
        <span className="rounded-full bg-subtle px-2.5 py-1 text-[10px] font-semibold tracking-wide text-muted">
          {t(`roles.${role}`)}
        </span>
      </div>

      <div className="mt-5 flex gap-2">
        <Link
          href={`/company/${companyId}`}
          className="flex-1 rounded-lg bg-brand-600 px-4 py-2 text-center text-sm font-medium text-white shadow-sm hover:bg-brand-700"
        >
          {t('openBooks')}
        </Link>
        {canInvite && (
          <Button variant="secondary" onClick={() => setShowInvite(!showInvite)}>
            {showInvite ? tc('close') : t('invite')}
          </Button>
        )}
      </div>

      {showInvite && (
        <form onSubmit={onInvite} className="mt-4 space-y-3 border-t border-line pt-4">
          <div>
            <Label>{t('emailLabel')}</Label>
            <Input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t('emailPlaceholder')}
            />
          </div>
          <div className="flex gap-2">
            <Select
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value)}
              className="flex-1"
            >
              {INVITE_ROLES.map((r) => (
                <option key={r} value={r}>
                  {t(`roles.${r}`)}
                </option>
              ))}
            </Select>
            <Button type="submit" disabled={busy}>
              {busy ? '…' : t('send')}
            </Button>
          </div>
          {branchAssignable && (
            <div>
              <Label>{t('branchLabel')}</Label>
              <Select value={branchId} onChange={(e) => setBranchId(e.target.value)}>
                <option value="">{t('branchAll')}</option>
                {(branches ?? [])
                  .filter((b) => b.isActive)
                  .map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
              </Select>
              <p className="mt-1 text-xs text-faint">{t('branchHint')}</p>
            </div>
          )}
          <ErrorText>{error}</ErrorText>
          {message && <p className="text-sm text-emerald-600">{message}</p>}
        </form>
      )}
      {canInvite && <GrantedAuditors companyId={companyId} />}
    </Card>
  );
}

function GrantedAuditors({ companyId }: { companyId: string }) {
  const t = useTranslations('dashboardPage');
  const { toast } = useFeedback();
  const [rows, setRows] = useState<GrantedAuditor[] | null>(null);
  const reload = useCallback(() => {
    fetchGrantedAuditors(companyId).then(setRows).catch(() => setRows([]));
  }, [companyId]);
  useEffect(() => reload(), [reload]);
  if (rows === null || rows.length === 0) return null; // hide until there's at least one
  async function revoke(userId: string) {
    await revokeAuditorAccess(companyId, userId).catch(() => {});
    toast(t('accessRevoked'));
    reload();
  }
  return (
    <div className="mt-4 border-t border-line pt-3">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-faint">{t('grantedAuditors')}</p>
      <div className="space-y-1.5">
        {rows.map((a) => (
          <div key={a.userId} className="flex items-center justify-between text-sm">
            <span className="text-ink">{a.name} <span className="text-faint">· {a.email}</span></span>
            <button onClick={() => void revoke(a.userId)} className="text-xs font-medium text-red-500 hover:underline">
              {t('revokeAccess')}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function PlanBanner({
  subscription,
  onUpgraded,
}: {
  subscription: Me['subscription'];
  onUpgraded: () => Promise<void>;
}) {
  const t = useTranslations('dashboardPage');
  const [showUpgrade, setShowUpgrade] = useState(false);
  // "Choose Business" on the pricing page lands here as ?upgrade=… — open the
  // upgrade dialog once, then clean the param so it doesn't reopen on refresh.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('upgrade')) {
      setShowUpgrade(true);
      params.delete('upgrade');
      const qs = params.toString();
      window.history.replaceState(null, '', window.location.pathname + (qs ? `?${qs}` : ''));
    }
  }, []);
  if (!subscription) return null;
  const expired = subscription.status === 'EXPIRED' || subscription.status === 'CANCELLED';
  const usage =
    subscription.maxCompanies === -1
      ? t('plan.companiesUnlimited', { used: subscription.companiesOwned })
      : t('plan.companiesUsed', {
          used: subscription.companiesOwned,
          max: subscription.maxCompanies,
        });

  return (
    <div
      className={`mb-8 flex flex-wrap items-center justify-between gap-3 rounded-xl border px-5 py-3 text-sm ${
        expired
          ? 'border-red-200 bg-red-50 text-red-700'
          : subscription.status === 'TRIAL'
            ? 'border-amber-200 bg-amber-50 text-amber-800'
            : 'border-emerald-200 bg-emerald-50 text-emerald-800'
      }`}
    >
      <span>
        <strong>{subscription.planName}</strong>
        {' · '}
        {expired
          ? t('plan.expired')
          : subscription.status === 'TRIAL' && subscription.daysLeft !== null
            ? t('plan.trialDaysLeft', { days: subscription.daysLeft })
            : t('plan.active')}
      </span>
      <span className="flex items-center gap-3 text-xs opacity-90">
        <span>{usage}</span>
        <button
          onClick={() => setShowUpgrade(true)}
          className="rounded-lg border border-current px-3 py-1.5 font-medium hover:opacity-80"
        >
          {subscription.status === 'ACTIVE' ? t('plan.renewNow') : t('plan.upgradeNow')}
        </button>
      </span>
      {showUpgrade && (
        <UpgradeDialog
          currentPlanCode={subscription.planCode}
          onClose={() => setShowUpgrade(false)}
          onUpgraded={onUpgraded}
        />
      )}
    </div>
  );
}

function CreateCompanyCard({
  onCreated,
  subscription,
}: {
  onCreated: () => Promise<void>;
  subscription: Me['subscription'];
}) {
  const t = useTranslations('dashboardPage');
  const tc = useTranslations('common');
  const [open, setOpen] = useState(false);
  const EMPTY = {
    name: '',
    printName: '',
    legalName: '',
    gstin: '',
    stateCode: '',
    addressLine1: '',
    addressLine2: '',
    city: '',
    pincode: '',
    phone: '',
    email: '',
  };
  const [form, setForm] = useState({ ...EMPTY });
  const [logo, setLogo] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof EMPTY, v: string) =>
    setForm((s) => ({ ...s, [k]: v }));

  const LOGO_MAX = 250 * 1024;
  function onLogoFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!/^image\/(png|jpe?g|webp)$/.test(file.type)) {
      setError(t('logoBadType'));
      return;
    }
    if (file.size > LOGO_MAX) {
      setError(t('logoTooBig'));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setLogo(reader.result as string);
    reader.readAsDataURL(file);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      // Only send the fields the user actually filled in.
      const payload: Record<string, string> = { name: form.name.trim() };
      (Object.keys(EMPTY) as (keyof typeof EMPTY)[]).forEach((k) => {
        const v = form[k].trim();
        if (k !== 'name' && v) payload[k] = v;
      });
      if (logo) payload.logo = logo;
      await api.post('/companies', payload);
      setForm({ ...EMPTY });
      setLogo(null);
      setOpen(false);
      await onCreated();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : tc('somethingWentWrong'));
    } finally {
      setBusy(false);
    }
  }

  const blocked =
    subscription &&
    (subscription.status === 'EXPIRED' ||
      subscription.status === 'CANCELLED' ||
      (subscription.maxCompanies !== -1 &&
        subscription.companiesOwned >= subscription.maxCompanies));

  if (blocked) {
    return (
      <div className="flex min-h-44 flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-line bg-subtle/50 px-6 text-center text-faint">
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-subtle text-xl">
          <IconLock className="h-5 w-5" />
        </span>
        <span className="text-sm font-medium">{t('plan.limitReached')}</span>
        <span className="text-xs">{t('plan.contactToUpgrade')}</span>
      </div>
    );
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex min-h-44 flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-line-strong text-faint transition-colors hover:border-brand-400 hover:text-brand-600"
      >
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-subtle text-xl">
          +
        </span>
        <span className="text-sm font-medium">{t('createCompany')}</span>
      </button>
    );
  }

  const sectionTitle = (s: string) => (
    <p className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-faint">{s}</p>
  );

  return (
    <Card>
      <h3 className="mb-1 font-semibold text-ink">{t('newCompany')}</h3>
      <p className="mb-3 text-xs text-muted">{t('newCompanyHint')}</p>
      <form onSubmit={onSubmit} className="space-y-3">
        <div className="max-h-[60vh] space-y-3 overflow-y-auto pr-1">
          {/* Business details */}
          {sectionTitle(t('sectionBusiness'))}
          <div>
            <Label>{t('companyNameLabel')}</Label>
            <Input
              required
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              placeholder={t('companyNamePlaceholder')}
            />
          </div>
          <div>
            <Label>{t('printNameLabel')}</Label>
            <Input
              value={form.printName}
              onChange={(e) => set('printName', e.target.value)}
              placeholder={t('printNamePlaceholder')}
            />
          </div>
          <div>
            <Label>{t('legalNameLabel')}</Label>
            <Input
              value={form.legalName}
              onChange={(e) => set('legalName', e.target.value)}
              placeholder={t('legalNamePlaceholder')}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>{t('gstinOptionalLabel')}</Label>
              <Input
                value={form.gstin}
                onChange={(e) => set('gstin', e.target.value.toUpperCase())}
                placeholder="33AAACS1234A1ZB"
                maxLength={15}
              />
            </div>
            <div>
              <Label>{t('stateCodeLabel')}</Label>
              <Input
                readOnly
                className="bg-subtle text-muted"
                value={form.gstin && form.gstin.length >= 2 ? `${form.gstin.slice(0, 2)} — ${stateNameForCode(form.gstin.slice(0, 2)) ?? 'Unknown'}` : ''}
                placeholder="—"
              />
            </div>
          </div>

          {/* Address */}
          {sectionTitle(t('sectionAddress'))}
          <div>
            <Label>{t('addressLine1Label')}</Label>
            <Input
              value={form.addressLine1}
              onChange={(e) => set('addressLine1', e.target.value)}
              placeholder={t('addressLine1Placeholder')}
            />
          </div>
          <div>
            <Label>{t('addressLine2Label')}</Label>
            <Input
              value={form.addressLine2}
              onChange={(e) => set('addressLine2', e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>{t('cityOptionalLabel')}</Label>
              <Input value={form.city} onChange={(e) => set('city', e.target.value)} />
            </div>
            <div>
              <Label>{t('pincodeLabel')}</Label>
              <Input
                value={form.pincode}
                onChange={(e) => set('pincode', e.target.value)}
                placeholder="641001"
                maxLength={6}
              />
            </div>
          </div>

          {/* Contact */}
          {sectionTitle(t('sectionContact'))}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>{t('phoneLabel')}</Label>
              <Input
                value={form.phone}
                onChange={(e) => set('phone', e.target.value)}
                placeholder="+91 98765 43210"
              />
            </div>
            <div>
              <Label>{t('emailLabel')}</Label>
              <Input
                type="email"
                value={form.email}
                onChange={(e) => set('email', e.target.value)}
                placeholder="billing@business.com"
              />
            </div>
          </div>

          {/* Logo */}
          {sectionTitle(t('logoLabel'))}
          <div className="flex items-center gap-3">
            <div className="flex h-14 w-32 items-center justify-center overflow-hidden rounded border border-dashed border-line-strong bg-subtle">
              {logo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logo} alt="logo" className="max-h-12 max-w-[120px] object-contain" />
              ) : (
                <span className="text-[10px] text-faint">{t('logoLabel')}</span>
              )}
            </div>
            <div className="flex flex-col gap-1">
              <label className="cursor-pointer text-xs font-medium text-brand-600 hover:underline">
                {t('uploadLogo')}
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={onLogoFile}
                  className="hidden"
                />
              </label>
              {logo && (
                <button
                  type="button"
                  onClick={() => setLogo(null)}
                  className="text-left text-xs text-red-500 hover:underline"
                >
                  {t('removeLogo')}
                </button>
              )}
              <span className="text-[10px] text-faint">{t('logoHint')}</span>
            </div>
          </div>
        </div>

        <ErrorText>{error}</ErrorText>
        <div className="flex gap-2 border-t border-line pt-3">
          <Button type="submit" disabled={busy} className="flex-1">
            {busy ? t('creating') : t('create')}
          </Button>
          <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
            {tc('cancel')}
          </Button>
        </div>
      </form>
    </Card>
  );
}
