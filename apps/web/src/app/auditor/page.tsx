'use client';

/* eslint-disable @next/next/no-img-element */

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { INDIAN_STATES } from '@bookly/shared';
import { LanguageSwitcher } from '@/components/language-switcher';
import { useFeedback } from '@/components/feedback';
import { Badge, Button, Card, ErrorText, Input, Label, Select } from '@/components/ui';
import { inr } from '@/lib/accounting';
import { api, isAuthenticated, ApiError, downloadFile, type Me } from '@/lib/api';
import {
  BILLING_TYPES,
  createAuditor,
  createService,
  createTier,
  deleteService,
  deleteTier,
  fetchAuditorAnalytics,
  fetchAuditorClients,
  fetchAuditorQuotations,
  fetchAuditorRequests,
  fetchMyAuditor,
  fetchMyServices,
  sendQuotation,
  setRequestStatus,
  updateAuditor,
  updateService,
  updateTier,
  type AuditorAnalytics,
  type AuditorClient,
  type AuditorProfile,
  type AuditorService,
  type PricingTier,
  type QuotationView,
  type ServiceRequestView,
} from '@/lib/auditor';

const IMAGE_MAX = 300 * 1024;

export default function AuditorPage() {
  const t = useTranslations('auditor');
  const tc = useTranslations('common');
  const router = useRouter();
  const [me, setMe] = useState<AuditorProfile | null | undefined>(undefined);
  const [tab, setTab] = useState<'overview' | 'services' | 'requests' | 'quotations' | 'clients' | 'profile'>('overview');

  useEffect(() => {
    if (!isAuthenticated()) {
      router.push('/login');
      return;
    }
    // The auditor workspace is only for auditor accounts — business accounts
    // are bounced back to their dashboard.
    api
      .get<Me>('/auth/me')
      .then((m) => {
        if (m.accountType !== 'AUDITOR') {
          router.replace('/dashboard');
          return;
        }
        return fetchMyAuditor()
          .then((a) => setMe(a))
          .catch(() => setMe(null));
      })
      .catch(() => router.push('/login'));
  }, [router]);

  if (me === undefined) {
    return <div className="flex min-h-screen items-center justify-center bg-subtle text-sm text-muted">{tc('loading')}</div>;
  }

  return (
    <div className="flex min-h-screen flex-col bg-subtle">
      <header className="sticky top-0 z-10 border-b border-line bg-surface">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between gap-3 px-6">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-brand-500 to-brand-600 text-sm font-black text-white">B</span>
            <span className="text-base font-bold text-brand-900">{t('title')}</span>
          </div>
          <div className="flex items-center gap-3">
            <LanguageSwitcher />
            <Link href="/dashboard" className="rounded-full px-3 py-1.5 text-sm font-medium text-muted hover:bg-subtle">
              {t('backToDashboard')}
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-6">
        {me === null ? (
          <Onboarding onCreated={(a) => setMe(a)} />
        ) : (
          <>
            <div className="mb-5">
              <h1 className="text-xl font-bold text-brand-900">{t('hello', { name: me.displayName })}</h1>
              <p className="text-sm text-muted">{t('subtitle')}</p>
            </div>
            <div className="mb-5 inline-flex rounded-xl border border-line bg-surface p-1">
              {(['overview', 'services', 'requests', 'quotations', 'clients', 'profile'] as const).map((k) => (
                <button
                  key={k}
                  onClick={() => setTab(k)}
                  className={`rounded-lg px-4 py-1.5 text-sm font-semibold transition-colors ${
                    tab === k ? 'bg-brand-600 text-white' : 'text-muted hover:bg-subtle'
                  }`}
                >
                  {t(`tabs.${k}`)}
                </button>
              ))}
            </div>
            {tab === 'overview' && <OverviewTab />}
            {tab === 'services' && <ServicesTab />}
            {tab === 'requests' && <RequestsTab />}
            {tab === 'quotations' && <QuotationsTab />}
            {tab === 'clients' && <ClientsTab />}
            {tab === 'profile' && <ProfileForm profile={me} onSaved={(a) => setMe(a)} />}
          </>
        )}
      </main>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Profile fields (shared by onboarding + profile edit)
// ---------------------------------------------------------------------------

interface ProfileDraft {
  displayName: string;
  firmName: string;
  tagline: string;
  bio: string;
  experienceYrs: string;
  phone: string;
  email: string;
  city: string;
  state: string;
  logo: string | null;
  isPublished: boolean;
}

function emptyDraft(p?: AuditorProfile): ProfileDraft {
  return {
    displayName: p?.displayName ?? '',
    firmName: p?.firmName ?? '',
    tagline: p?.tagline ?? '',
    bio: p?.bio ?? '',
    experienceYrs: p?.experienceYrs != null ? String(p.experienceYrs) : '',
    phone: p?.phone ?? '',
    email: p?.email ?? '',
    city: p?.city ?? '',
    state: p?.state ?? '',
    logo: p?.logo ?? null,
    isPublished: p?.isPublished ?? false,
  };
}

function draftToBody(d: ProfileDraft) {
  return {
    displayName: d.displayName.trim(),
    firmName: d.firmName.trim() || undefined,
    tagline: d.tagline.trim() || undefined,
    bio: d.bio.trim() || undefined,
    experienceYrs: d.experienceYrs ? Number(d.experienceYrs) : undefined,
    phone: d.phone.trim() || undefined,
    email: d.email.trim() || undefined,
    city: d.city.trim() || undefined,
    state: d.state || undefined,
    logo: d.logo,
    isPublished: d.isPublished,
  };
}

function ProfileFields({
  draft,
  set,
}: {
  draft: ProfileDraft;
  set: (patch: Partial<ProfileDraft>) => void;
}) {
  const t = useTranslations('auditor');
  function onLogo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !/^image\/(png|jpe?g|webp)$/.test(file.type) || file.size > IMAGE_MAX) return;
    const reader = new FileReader();
    reader.onload = () => set({ logo: reader.result as string });
    reader.readAsDataURL(file);
  }
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <div className="sm:col-span-2 flex items-center gap-3">
        {draft.logo ? (
          <img src={draft.logo} alt="" className="h-16 w-16 rounded-xl border border-line object-cover" />
        ) : (
          <div className="flex h-16 w-16 items-center justify-center rounded-xl border border-dashed border-line-strong text-[10px] text-faint">{t('logo')}</div>
        )}
        <label className="cursor-pointer rounded-lg border border-line-strong px-3 py-1.5 text-xs font-medium text-muted hover:bg-subtle">
          {t('chooseLogo')}
          <input type="file" accept="image/png,image/jpeg,image/webp" onChange={onLogo} className="hidden" />
        </label>
        {draft.logo && (
          <button type="button" onClick={() => set({ logo: null })} className="text-xs font-medium text-red-500 hover:underline">
            {t('removeLogo')}
          </button>
        )}
      </div>
      <div>
        <Label>{t('fields.displayName')}</Label>
        <Input required value={draft.displayName} onChange={(e) => set({ displayName: e.target.value })} />
      </div>
      <div>
        <Label>{t('fields.firmName')}</Label>
        <Input value={draft.firmName} onChange={(e) => set({ firmName: e.target.value })} />
      </div>
      <div className="sm:col-span-2">
        <Label>{t('fields.tagline')}</Label>
        <Input value={draft.tagline} onChange={(e) => set({ tagline: e.target.value })} />
      </div>
      <div className="sm:col-span-2">
        <Label>{t('fields.bio')}</Label>
        <textarea
          value={draft.bio}
          onChange={(e) => set({ bio: e.target.value })}
          rows={3}
          className="w-full rounded-lg border border-line-strong px-3 py-2 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
        />
      </div>
      <div>
        <Label>{t('fields.experienceYrs')}</Label>
        <Input type="number" min="0" value={draft.experienceYrs} onChange={(e) => set({ experienceYrs: e.target.value })} />
      </div>
      <div>
        <Label>{t('fields.phone')}</Label>
        <Input value={draft.phone} onChange={(e) => set({ phone: e.target.value })} />
      </div>
      <div>
        <Label>{t('fields.email')}</Label>
        <Input value={draft.email} onChange={(e) => set({ email: e.target.value })} />
      </div>
      <div>
        <Label>{t('fields.city')}</Label>
        <Input value={draft.city} onChange={(e) => set({ city: e.target.value })} />
      </div>
      <div>
        <Label>{t('fields.state')}</Label>
        <Select value={draft.state} onChange={(e) => set({ state: e.target.value })}>
          <option value="">{t('selectState')}</option>
          {INDIAN_STATES.map((s) => (
            <option key={s.code} value={s.name}>{s.name}</option>
          ))}
        </Select>
      </div>
    </div>
  );
}

function Onboarding({ onCreated }: { onCreated: (a: AuditorProfile) => void }) {
  const t = useTranslations('auditor');
  const tc = useTranslations('common');
  const { toast } = useFeedback();
  const [draft, setDraft] = useState<ProfileDraft>(emptyDraft());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (patch: Partial<ProfileDraft>) => setDraft((d) => ({ ...d, ...patch }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const created = await createAuditor(draftToBody(draft));
      toast(t('profileCreated'));
      onCreated(created);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : tc('somethingWentWrong'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title={t('onboardingTitle')}>
      <p className="mb-4 text-sm text-muted">{t('onboardingIntro')}</p>
      <form onSubmit={submit} className="space-y-4">
        <ProfileFields draft={draft} set={set} />
        <div className="flex items-center gap-3 border-t border-line pt-4">
          <Button type="submit" disabled={busy || !draft.displayName.trim()}>
            {busy ? tc('saving') : t('createProfile')}
          </Button>
          <ErrorText>{error}</ErrorText>
        </div>
      </form>
    </Card>
  );
}

function ProfileForm({ profile, onSaved }: { profile: AuditorProfile; onSaved: (a: AuditorProfile) => void }) {
  const t = useTranslations('auditor');
  const tc = useTranslations('common');
  const { toast } = useFeedback();
  const [draft, setDraft] = useState<ProfileDraft>(emptyDraft(profile));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (patch: Partial<ProfileDraft>) => setDraft((d) => ({ ...d, ...patch }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const saved = await updateAuditor(draftToBody(draft));
      toast(t('profileSaved'));
      onSaved(saved);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : tc('somethingWentWrong'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title={t('tabs.profile')}>
      <form onSubmit={submit} className="space-y-4">
        <ProfileFields draft={draft} set={set} />
        <label className="flex items-center gap-2 text-sm font-medium text-ink">
          <input type="checkbox" checked={draft.isPublished} onChange={(e) => set({ isPublished: e.target.checked })} className="h-4 w-4 rounded border-line-strong" />
          {t('publishToMarketplace')}
          <span className="font-normal text-faint">{t('publishHint')}</span>
        </label>
        <div className="flex items-center gap-3 border-t border-line pt-4">
          <Button type="submit" disabled={busy || !draft.displayName.trim()}>
            {busy ? tc('saving') : tc('save')}
          </Button>
          <ErrorText>{error}</ErrorText>
        </div>
      </form>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Services
// ---------------------------------------------------------------------------

function ServicesTab() {
  const t = useTranslations('auditor');
  const [services, setServices] = useState<AuditorService[] | null>(null);
  const [editing, setEditing] = useState<AuditorService | 'new' | null>(null);

  const reload = useCallback(async () => {
    setServices(await fetchMyServices().catch(() => []));
  }, []);
  useEffect(() => {
    void reload();
  }, [reload]);

  if (editing) {
    return (
      <ServiceEditor
        service={editing === 'new' ? null : editing}
        onClose={() => setEditing(null)}
        onChanged={reload}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-ink">{t('yourServices')}</h2>
        <Button onClick={() => setEditing('new')}>{t('newService')}</Button>
      </div>
      {services === null ? (
        <p className="text-sm text-faint">…</p>
      ) : services.length === 0 ? (
        <Card><p className="text-sm text-muted">{t('noServices')}</p></Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {services.map((s) => (
            <button key={s.id} onClick={() => setEditing(s)} className="text-left">
              <Card className="h-full transition-shadow hover:shadow-md">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-bold text-brand-900">{s.name}</h3>
                  <Badge tone={s.isActive ? 'good' : 'neutral'}>{s.isActive ? t('active') : t('inactive')}</Badge>
                </div>
                {s.category && <p className="mt-0.5 text-xs text-faint">{s.category}</p>}
                {s.shortDesc && <p className="mt-2 line-clamp-2 text-sm text-muted">{s.shortDesc}</p>}
                <div className="mt-3 flex items-center justify-between text-sm">
                  <span className="text-muted">{t('tiersCount', { count: s.tiers.length })}</span>
                  <span className="font-bold text-brand-700">
                    {s.startingFrom != null ? t('startingFrom', { amount: `₹${inr(s.startingFrom)}` }) : '—'}
                  </span>
                </div>
              </Card>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

interface ServiceDraft {
  name: string;
  category: string;
  shortDesc: string;
  detailDesc: string;
  deliveryTime: string;
  isActive: boolean;
}

function ServiceEditor({
  service,
  onClose,
  onChanged,
}: {
  service: AuditorService | null;
  onClose: () => void;
  onChanged: () => Promise<void>;
}) {
  const t = useTranslations('auditor');
  const tc = useTranslations('common');
  const { toast } = useFeedback();
  const [id, setId] = useState<string | null>(service?.id ?? null);
  const [tiers, setTiers] = useState<PricingTier[]>(service?.tiers ?? []);
  const [draft, setDraft] = useState<ServiceDraft>({
    name: service?.name ?? '',
    category: service?.category ?? '',
    shortDesc: service?.shortDesc ?? '',
    detailDesc: service?.detailDesc ?? '',
    deliveryTime: service?.deliveryTime ?? '',
    isActive: service?.isActive ?? true,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (patch: Partial<ServiceDraft>) => setDraft((d) => ({ ...d, ...patch }));

  async function saveService(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const body = {
      name: draft.name.trim(),
      category: draft.category.trim() || undefined,
      shortDesc: draft.shortDesc.trim() || undefined,
      detailDesc: draft.detailDesc.trim() || undefined,
      deliveryTime: draft.deliveryTime.trim() || undefined,
      isActive: draft.isActive,
    };
    try {
      if (id) {
        await updateService(id, body);
      } else {
        const created = await createService(body);
        setId(created.id);
        setTiers(created.tiers);
      }
      toast(t('serviceSaved'));
      await onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : tc('somethingWentWrong'));
    } finally {
      setBusy(false);
    }
  }

  async function reloadTiers() {
    const all = await fetchMyServices().catch(() => [] as AuditorService[]);
    const mine = all.find((s) => s.id === id);
    if (mine) setTiers(mine.tiers);
    await onChanged();
  }

  return (
    <div className="space-y-5">
      <button onClick={onClose} className="text-sm font-medium text-brand-600 hover:underline">← {t('backToServices')}</button>

      <Card title={service ? t('editService') : t('newService')}>
        <form onSubmit={saveService} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label>{t('fields.serviceName')}</Label>
            <Input required value={draft.name} onChange={(e) => set({ name: e.target.value })} />
          </div>
          <div>
            <Label>{t('fields.category')}</Label>
            <Input value={draft.category} onChange={(e) => set({ category: e.target.value })} placeholder="GST" />
          </div>
          <div>
            <Label>{t('fields.deliveryTime')}</Label>
            <Input value={draft.deliveryTime} onChange={(e) => set({ deliveryTime: e.target.value })} placeholder="3-5 days" />
          </div>
          <div className="sm:col-span-2">
            <Label>{t('fields.shortDesc')}</Label>
            <Input value={draft.shortDesc} onChange={(e) => set({ shortDesc: e.target.value })} />
          </div>
          <div className="sm:col-span-2">
            <Label>{t('fields.detailDesc')}</Label>
            <textarea value={draft.detailDesc} onChange={(e) => set({ detailDesc: e.target.value })} rows={3} className="w-full rounded-lg border border-line-strong px-3 py-2 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100" />
          </div>
          <label className="flex items-center gap-2 text-sm font-medium text-ink">
            <input type="checkbox" checked={draft.isActive} onChange={(e) => set({ isActive: e.target.checked })} className="h-4 w-4 rounded border-line-strong" />
            {t('serviceActive')}
          </label>
          <div className="sm:col-span-2 flex items-center gap-3 border-t border-line pt-4">
            <Button type="submit" disabled={busy || !draft.name.trim()}>{busy ? tc('saving') : t('saveService')}</Button>
            <ErrorText>{error}</ErrorText>
          </div>
        </form>
      </Card>

      {id ? (
        <TiersManager serviceId={id} tiers={tiers} onChanged={reloadTiers} />
      ) : (
        <Card><p className="text-sm text-faint">{t('saveServiceFirst')}</p></Card>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pricing tiers + feature builder
// ---------------------------------------------------------------------------

function TiersManager({
  serviceId,
  tiers,
  onChanged,
}: {
  serviceId: string;
  tiers: PricingTier[];
  onChanged: () => Promise<void>;
}) {
  const t = useTranslations('auditor');
  const [adding, setAdding] = useState(false);
  return (
    <Card title={t('pricingTiers')}>
      <p className="mb-3 text-xs text-faint">{t('pricingTiersHint')}</p>
      <div className="space-y-4">
        {tiers.map((tier) => (
          <TierCard key={tier.id} serviceId={serviceId} tier={tier} onChanged={onChanged} />
        ))}
        {adding && <TierCard serviceId={serviceId} tier={null} onChanged={onChanged} onDone={() => setAdding(false)} />}
      </div>
      {!adding && (
        <Button variant="secondary" className="mt-4" onClick={() => setAdding(true)}>{t('addTier')}</Button>
      )}
    </Card>
  );
}

interface TierDraft {
  name: string;
  price: string;
  gstApplicable: boolean;
  gstPercent: string;
  description: string;
  deliveryTimeline: string;
  revisions: string;
  prioritySupport: boolean;
  dedicatedConsultant: boolean;
  billingType: string;
  isActive: boolean;
  features: { label: string; included: boolean }[];
}

function TierCard({
  serviceId,
  tier,
  onChanged,
  onDone,
}: {
  serviceId: string;
  tier: PricingTier | null;
  onChanged: () => Promise<void>;
  onDone?: () => void;
}) {
  const t = useTranslations('auditor');
  const tc = useTranslations('common');
  const { toast } = useFeedback();
  const [draft, setDraft] = useState<TierDraft>({
    name: tier?.name ?? '',
    price: tier != null ? String(tier.price) : '',
    gstApplicable: tier?.gstApplicable ?? false,
    gstPercent: tier?.gstPercent != null ? String(tier.gstPercent) : '18',
    description: tier?.description ?? '',
    deliveryTimeline: tier?.deliveryTimeline ?? '',
    revisions: tier?.revisions != null ? String(tier.revisions) : '',
    prioritySupport: tier?.prioritySupport ?? false,
    dedicatedConsultant: tier?.dedicatedConsultant ?? false,
    billingType: tier?.billingType ?? 'one_time',
    isActive: tier?.isActive ?? true,
    features: tier?.features.map((f) => ({ label: f.label, included: f.included })) ?? [],
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (patch: Partial<TierDraft>) => setDraft((d) => ({ ...d, ...patch }));

  async function save() {
    setBusy(true);
    setError('');
    const body = {
      name: draft.name.trim(),
      price: Number(draft.price) || 0,
      gstApplicable: draft.gstApplicable,
      gstPercent: draft.gstApplicable ? Number(draft.gstPercent) || 0 : 0,
      description: draft.description.trim() || undefined,
      deliveryTimeline: draft.deliveryTimeline.trim() || undefined,
      revisions: draft.revisions ? Number(draft.revisions) : undefined,
      prioritySupport: draft.prioritySupport,
      dedicatedConsultant: draft.dedicatedConsultant,
      billingType: draft.billingType,
      isActive: draft.isActive,
      features: draft.features
        .filter((f) => f.label.trim())
        .map((f, i) => ({ label: f.label.trim(), included: f.included, sortOrder: i })),
    };
    try {
      if (tier) await updateTier(serviceId, tier.id, body);
      else await createTier(serviceId, body);
      toast(t('tierSaved'));
      await onChanged();
      onDone?.();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : tc('somethingWentWrong'));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!tier) return onDone?.();
    setBusy(true);
    try {
      await deleteTier(serviceId, tier.id);
      toast(t('tierDeleted'));
      await onChanged();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border border-line bg-subtle/60 p-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div>
          <Label>{t('fields.tierName')}</Label>
          <Input value={draft.name} onChange={(e) => set({ name: e.target.value })} placeholder="Basic" />
        </div>
        <div>
          <Label>{t('fields.price')}</Label>
          <Input type="number" min="0" step="0.01" value={draft.price} onChange={(e) => set({ price: e.target.value })} />
        </div>
        <div>
          <Label>{t('fields.billingType')}</Label>
          <Select value={draft.billingType} onChange={(e) => set({ billingType: e.target.value })}>
            {BILLING_TYPES.map((b) => (
              <option key={b} value={b}>{t(`billing.${b}`)}</option>
            ))}
          </Select>
        </div>
        <div>
          <Label>{t('fields.deliveryTimeline')}</Label>
          <Input value={draft.deliveryTimeline} onChange={(e) => set({ deliveryTimeline: e.target.value })} placeholder="3 days" />
        </div>
        <div>
          <Label>{t('fields.revisions')}</Label>
          <Input type="number" min="0" value={draft.revisions} onChange={(e) => set({ revisions: e.target.value })} placeholder={t('unlimited')} />
        </div>
        <div className="flex items-end gap-2 pb-2">
          <label className="flex items-center gap-1.5 text-xs font-medium text-ink">
            <input type="checkbox" checked={draft.gstApplicable} onChange={(e) => set({ gstApplicable: e.target.checked })} className="h-4 w-4 rounded border-line-strong" />
            {t('fields.gst')}
          </label>
          {draft.gstApplicable && (
            <Input type="number" min="0" value={draft.gstPercent} onChange={(e) => set({ gstPercent: e.target.value })} className="w-16" />
          )}
        </div>
        <label className="flex items-end gap-1.5 pb-2 text-xs font-medium text-ink">
          <input type="checkbox" checked={draft.prioritySupport} onChange={(e) => set({ prioritySupport: e.target.checked })} className="h-4 w-4 rounded border-line-strong" />
          {t('fields.prioritySupport')}
        </label>
        <label className="flex items-end gap-1.5 pb-2 text-xs font-medium text-ink">
          <input type="checkbox" checked={draft.dedicatedConsultant} onChange={(e) => set({ dedicatedConsultant: e.target.checked })} className="h-4 w-4 rounded border-line-strong" />
          {t('fields.dedicatedConsultant')}
        </label>
      </div>

      <div className="mt-3">
        <Label>{t('fields.tierDescription')}</Label>
        <Input value={draft.description} onChange={(e) => set({ description: e.target.value })} />
      </div>

      {/* Feature builder */}
      <div className="mt-3">
        <div className="mb-1 flex items-center justify-between">
          <Label>{t('features')}</Label>
          <button type="button" onClick={() => set({ features: [...draft.features, { label: '', included: true }] })} className="text-xs font-medium text-brand-600 hover:underline">
            {t('addFeature')}
          </button>
        </div>
        <div className="space-y-2">
          {draft.features.length === 0 && <p className="text-xs text-faint">{t('noFeatures')}</p>}
          {draft.features.map((f, i) => (
            <div key={i} className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => set({ features: draft.features.map((x, j) => (j === i ? { ...x, included: !x.included } : x)) })}
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-sm font-bold ${f.included ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-200 text-faint'}`}
                title={f.included ? t('included') : t('excluded')}
              >
                {f.included ? '✓' : '✕'}
              </button>
              <Input value={f.label} onChange={(e) => set({ features: draft.features.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })} placeholder={t('featurePlaceholder')} className="flex-1" />
              <button type="button" onClick={() => set({ features: draft.features.filter((_, j) => j !== i) })} className="text-faint hover:text-red-500">✕</button>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-4 flex items-center gap-3 border-t border-line pt-3">
        <label className="flex items-center gap-1.5 text-xs font-medium text-ink">
          <input type="checkbox" checked={draft.isActive} onChange={(e) => set({ isActive: e.target.checked })} className="h-4 w-4 rounded border-line-strong" />
          {t('tierActive')}
        </label>
        <div className="flex-1" />
        <Button onClick={save} disabled={busy || !draft.name.trim()}>{busy ? tc('saving') : tc('save')}</Button>
        <Button variant="danger" onClick={remove} disabled={busy}>{tier ? tc('delete') : tc('cancel')}</Button>
      </div>
      <ErrorText>{error}</ErrorText>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Requests inbox + quotations (auditor side)
// ---------------------------------------------------------------------------

function RequestsTab() {
  const t = useTranslations('auditor');
  const { toast } = useFeedback();
  const [requests, setRequests] = useState<ServiceRequestView[] | null>(null);
  const [quoteFor, setQuoteFor] = useState<ServiceRequestView | null>(null);

  const reload = useCallback(async () => {
    setRequests(await fetchAuditorRequests().catch(() => []));
  }, []);
  useEffect(() => {
    void reload();
  }, [reload]);

  async function mark(id: string, status: string) {
    await setRequestStatus(id, status).catch(() => {});
    toast(t('requestUpdated'));
    await reload();
  }

  if (requests === null) return <p className="text-sm text-faint">…</p>;

  return (
    <div className="space-y-3">
      {requests.length === 0 ? (
        <Card><p className="text-sm text-muted">{t('noRequests')}</p></Card>
      ) : (
        requests.map((r) => (
          <Card key={r.id}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <Badge tone={r.kind === 'CUSTOM_QUOTE' ? 'warn' : 'neutral'}>{t(`reqKind.${r.kind}`)}</Badge>
                  <Badge>{t(`reqStatus.${r.status}`)}</Badge>
                </div>
                <p className="mt-1.5 font-semibold text-brand-900">{r.client.name} <span className="font-normal text-faint">· {r.client.email}</span></p>
                <p className="text-xs text-muted">{r.service?.name ?? '—'}{r.tier ? ` · ${r.tier.name} (₹${inr(r.tier.price)})` : ''}</p>
                {r.message && <p className="mt-2 max-w-prose text-sm text-muted">{r.message}</p>}
              </div>
              <div className="flex flex-col gap-2">
                {r.status !== 'QUOTED' && r.status !== 'ACCEPTED' && (
                  <Button onClick={() => setQuoteFor(r)}>{t('sendQuote')}</Button>
                )}
                {r.status === 'NEW' && (
                  <Button variant="secondary" onClick={() => void mark(r.id, 'REVIEWING')}>{t('markReviewing')}</Button>
                )}
                {r.status !== 'CLOSED' && r.status !== 'ACCEPTED' && (
                  <Button variant="secondary" onClick={() => void mark(r.id, 'CLOSED')}>{t('closeRequest')}</Button>
                )}
              </div>
            </div>
            {r.quotations.length > 0 && (
              <p className="mt-2 text-xs text-faint">{t('quotesSent', { list: r.quotations.map((q) => q.quoteNo).join(', ') })}</p>
            )}
          </Card>
        ))
      )}
      {quoteFor && <QuoteModal request={quoteFor} onClose={() => setQuoteFor(null)} onSent={reload} />}
    </div>
  );
}

function QuoteModal({
  request,
  onClose,
  onSent,
}: {
  request: ServiceRequestView;
  onClose: () => void;
  onSent: () => Promise<void>;
}) {
  const t = useTranslations('auditor');
  const tc = useTranslations('common');
  const { toast } = useFeedback();
  const [description, setDescription] = useState(request.service?.name ?? '');
  const [amount, setAmount] = useState(request.tier ? String(request.tier.price) : '');
  const [gstApplicable, setGst] = useState(false);
  const [gstPercent, setGstPercent] = useState('18');
  const [billingType, setBillingType] = useState('one_time');
  const [dueDate, setDueDate] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await sendQuotation(request.id, {
        description: description.trim(),
        amount: Number(amount) || 0,
        gstApplicable,
        gstPercent: gstApplicable ? Number(gstPercent) || 0 : 0,
        billingType,
        dueDate: dueDate || undefined,
        notes: notes.trim() || undefined,
      });
      toast(t('quoteSent'));
      await onSent();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : tc('somethingWentWrong'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4" onClick={onClose}>
      <form onSubmit={submit} className="my-8 w-full max-w-md space-y-3 rounded-2xl bg-surface p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-bold text-ink">{t('newQuotation')}</h2>
        <p className="text-sm text-muted">{t('forClient', { name: request.client.name })}</p>
        <div>
          <Label>{t('quoteDescription')}</Label>
          <Input value={description} onChange={(e) => setDescription(e.target.value)} required />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>{t('quoteAmount')}</Label>
            <Input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} required />
          </div>
          <div>
            <Label>{t('dueDate')}</Label>
            <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </div>
          <div className="col-span-2">
            <Label>{t('fields.billingType')}</Label>
            <Select value={billingType} onChange={(e) => setBillingType(e.target.value)}>
              {BILLING_TYPES.map((b) => (
                <option key={b} value={b}>{t(`billing.${b}`)}</option>
              ))}
            </Select>
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm font-medium text-ink">
          <input type="checkbox" checked={gstApplicable} onChange={(e) => setGst(e.target.checked)} className="h-4 w-4 rounded border-line-strong" />
          {t('fields.gst')}
          {gstApplicable && (
            <Input type="number" value={gstPercent} onChange={(e) => setGstPercent(e.target.value)} className="ml-2 w-16" />
          )}
        </label>
        <div>
          <Label>{t('quoteNotes')}</Label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="w-full rounded-lg border border-line-strong px-3 py-2 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100" />
        </div>
        <ErrorText>{error}</ErrorText>
        <div className="flex gap-3">
          <Button type="submit" disabled={busy || !description.trim() || !amount}>{busy ? tc('saving') : t('sendQuote')}</Button>
          <Button type="button" variant="secondary" onClick={onClose}>{tc('cancel')}</Button>
        </div>
      </form>
    </div>
  );
}

function QuotationsTab() {
  const t = useTranslations('auditor');
  const [quotations, setQuotations] = useState<QuotationView[] | null>(null);
  useEffect(() => {
    fetchAuditorQuotations().then(setQuotations).catch(() => setQuotations([]));
  }, []);
  if (quotations === null) return <p className="text-sm text-faint">…</p>;
  return (
    <Card title={t('tabs.quotations')}>
      {quotations.length === 0 ? (
        <p className="text-sm text-muted">{t('noQuotations')}</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-[11px] font-semibold uppercase tracking-wide text-muted">
              <th className="py-2">{t('quoteNo')}</th>
              <th className="py-2">{t('client')}</th>
              <th className="py-2 text-right">{t('quoteTotal')}</th>
              <th className="py-2">{t('quoteStatusCol')}</th>
              <th className="py-2">{t('invoiceNo')}</th>
              <th className="py-2 text-right">{t('pdf')}</th>
            </tr>
          </thead>
          <tbody>
            {quotations.map((q) => (
              <tr key={q.id} className="border-b border-line last:border-0">
                <td className="py-2.5 font-mono text-xs">{q.quoteNo}</td>
                <td className="py-2.5 font-medium">{q.client.name}</td>
                <td className="py-2.5 text-right tabular-nums">₹{inr(q.total)}</td>
                <td className="py-2.5"><Badge tone={q.status === 'ACCEPTED' ? 'good' : q.status === 'DECLINED' ? 'bad' : 'neutral'}>{t(`quoteStatus.${q.status}`)}</Badge></td>
                <td className="py-2.5 font-mono text-xs text-emerald-700">{q.invoiceNo ?? '—'}</td>
                <td className="py-2.5 text-right">
                  <button onClick={() => void downloadFile(`/auditors/me/quotations/${q.id}/pdf`)} className="text-xs font-medium text-brand-600 hover:underline">
                    {t('pdf')}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Overview / analytics
// ---------------------------------------------------------------------------

function OverviewTab() {
  const t = useTranslations('auditor');
  const [a, setA] = useState<AuditorAnalytics | null>(null);
  useEffect(() => {
    fetchAuditorAnalytics().then(setA).catch(() => setA(null));
  }, []);
  if (!a) return <p className="text-sm text-faint">…</p>;

  const kpis: { label: string; value: string }[] = [
    { label: t('an.totalServices'), value: String(a.totalServices) },
    { label: t('an.revenue'), value: `₹${inr(a.revenue)}` },
    { label: t('an.purchases'), value: String(a.purchases) },
    { label: t('an.conversion'), value: `${a.conversionRate}%` },
    { label: t('an.enquiries'), value: String(a.enquiries) },
    { label: t('an.quotationsSent'), value: String(a.quotationsSent) },
    { label: t('an.quotationsAccepted'), value: String(a.quotationsAccepted) },
    { label: t('an.mostPurchased'), value: a.mostPurchased ?? '—' },
  ];
  const maxRev = Math.max(1, ...a.revenuePerService.map((r) => r.revenue));

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {kpis.map((k) => (
          <div key={k.label} className="rounded-xl border border-line bg-surface p-5 shadow-sm shadow-slate-200/50">
            <p className="text-xs font-semibold uppercase tracking-wide text-faint">{k.label}</p>
            <p className="mt-1 truncate text-2xl font-bold text-brand-900" title={k.value}>{k.value}</p>
          </div>
        ))}
      </div>

      <Card title={t('an.revenuePerService')}>
        {a.revenuePerService.length === 0 ? (
          <p className="text-sm text-muted">{t('an.noRevenue')}</p>
        ) : (
          <div className="space-y-3">
            {a.revenuePerService.map((r) => (
              <div key={r.name}>
                <div className="mb-1 flex items-center justify-between text-sm">
                  <span className="font-medium text-ink">{r.name} <span className="text-faint">· {t('an.timesSold', { n: r.count })}</span></span>
                  <span className="font-bold tabular-nums text-brand-700">₹{inr(r.revenue)}</span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-subtle">
                  <div className="h-full rounded-full bg-brand-600" style={{ width: `${(r.revenue / maxRev) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Clients — companies that granted this auditor read-only access
// ---------------------------------------------------------------------------

function ClientsTab() {
  const t = useTranslations('auditor');
  const [clients, setClients] = useState<AuditorClient[] | null>(null);
  useEffect(() => {
    fetchAuditorClients().then(setClients).catch(() => setClients([]));
  }, []);
  if (clients === null) return <p className="text-sm text-faint">…</p>;
  return (
    <Card title={t('tabs.clients')}>
      {clients.length === 0 ? (
        <p className="text-sm text-muted">{t('noClients')}</p>
      ) : (
        <div className="divide-y divide-line">
          {clients.map((c) => (
            <Link
              key={c.companyId}
              href={`/company/${c.companyId}`}
              className="flex items-center justify-between py-3 hover:bg-subtle"
            >
              <div>
                <p className="font-semibold text-brand-900">{c.name}</p>
                {c.gstin && <p className="text-xs text-faint">{c.gstin}</p>}
              </div>
              <span className="text-sm font-medium text-brand-600">{t('openBooks')} →</span>
            </Link>
          ))}
        </div>
      )}
    </Card>
  );
}
