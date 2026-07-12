'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { INDIAN_STATES } from '@bookly/shared';
import { LanguageSwitcher } from '@/components/language-switcher';
import { useFeedback } from '@/components/feedback';
import { Badge, Button, Card, ErrorText, Input, Label, Select } from '@/components/ui';
import { inr } from '@/lib/accounting';
import { ApiError, api, downloadFile, isAuthenticated, type Me } from '@/lib/api';
import {
  acceptQuotation,
  browseMarket,
  declineQuotation,
  fetchMyQuotations,
  fetchMyRequests,
  grantQuotationAccess,
  submitReview,
  type MarketFilters,
  type MarketService,
  type QuotationView,
  type ServiceRequestView,
} from '@/lib/auditor';

export default function MarketplacePage() {
  const t = useTranslations('marketplace');
  const tc = useTranslations('common');
  const router = useRouter();
  const [view, setView] = useState<'browse' | 'mine'>('browse');

  useEffect(() => {
    if (!isAuthenticated()) router.push('/login');
  }, [router]);

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
              {tc('close')}
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-6">
        <div className="mb-5 inline-flex rounded-xl border border-line bg-surface p-1">
          {(['browse', 'mine'] as const).map((k) => (
            <button
              key={k}
              onClick={() => setView(k)}
              className={`rounded-lg px-4 py-1.5 text-sm font-semibold transition-colors ${
                view === k ? 'bg-brand-600 text-white' : 'text-muted hover:bg-subtle'
              }`}
            >
              {t(`views.${k}`)}
            </button>
          ))}
        </div>
        {view === 'browse' ? <Browse /> : <MyEngagements />}
      </main>
    </div>
  );
}

const COMPARE_MAX = 4;

function Browse() {
  const t = useTranslations('marketplace');
  const [filters, setFilters] = useState<MarketFilters>({});
  const [services, setServices] = useState<MarketService[] | null>(null);
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [showCompare, setShowCompare] = useState(false);
  const set = (patch: Partial<MarketFilters>) => setFilters((f) => ({ ...f, ...patch }));

  const search = useCallback(async () => {
    const list = await browseMarket(filters).catch(() => []);
    setServices(list);
    // drop selections no longer present in the result set
    setCompareIds((ids) => ids.filter((id) => list.some((s) => s.id === id)));
  }, [filters]);
  useEffect(() => {
    void search();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleCompare = (id: string) =>
    setCompareIds((ids) =>
      ids.includes(id)
        ? ids.filter((x) => x !== id)
        : ids.length >= COMPARE_MAX
          ? ids
          : [...ids, id],
    );

  const selected = (services ?? []).filter((s) => compareIds.includes(s.id));

  return (
    <div className="space-y-4 pb-20">
      <Card>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="col-span-2">
            <Label>{t('filters.search')}</Label>
            <Input value={filters.q ?? ''} onChange={(e) => set({ q: e.target.value })} placeholder={t('filters.searchPlaceholder')} />
          </div>
          <div>
            <Label>{t('filters.category')}</Label>
            <Input value={filters.category ?? ''} onChange={(e) => set({ category: e.target.value })} />
          </div>
          <div>
            <Label>{t('filters.state')}</Label>
            <Select value={filters.state ?? ''} onChange={(e) => set({ state: e.target.value })}>
              <option value="">{t('filters.any')}</option>
              {INDIAN_STATES.map((s) => (
                <option key={s.code} value={s.name}>{s.name}</option>
              ))}
            </Select>
          </div>
          <div>
            <Label>{t('filters.minPrice')}</Label>
            <Input type="number" value={filters.minPrice ?? ''} onChange={(e) => set({ minPrice: e.target.value })} />
          </div>
          <div>
            <Label>{t('filters.maxPrice')}</Label>
            <Input type="number" value={filters.maxPrice ?? ''} onChange={(e) => set({ maxPrice: e.target.value })} />
          </div>
          <div>
            <Label>{t('filters.minExperience')}</Label>
            <Input type="number" value={filters.minExperience ?? ''} onChange={(e) => set({ minExperience: e.target.value })} />
          </div>
          <div>
            <Label>{t('filters.minRating')}</Label>
            <Input type="number" min="0" max="5" step="0.5" value={filters.minRating ?? ''} onChange={(e) => set({ minRating: e.target.value })} />
          </div>
        </div>
        <div className="mt-3">
          <Button onClick={() => void search()}>{t('filters.apply')}</Button>
        </div>
      </Card>

      {services === null ? (
        <p className="text-sm text-faint">…</p>
      ) : services.length === 0 ? (
        <Card><p className="text-sm text-muted">{t('noResults')}</p></Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {services.map((s) => {
            const checked = compareIds.includes(s.id);
            const atMax = compareIds.length >= COMPARE_MAX && !checked;
            return (
              <div key={s.id} className="relative">
                <label
                  className={`absolute right-3 top-3 z-10 flex cursor-pointer items-center gap-1.5 rounded-full border px-2 py-1 text-xs font-semibold shadow-sm transition-colors ${
                    checked
                      ? 'border-brand-600 bg-brand-600 text-white'
                      : atMax
                        ? 'cursor-not-allowed border-line bg-surface text-faint'
                        : 'border-line bg-surface text-muted hover:border-brand-400'
                  }`}
                  title={atMax ? t('compare.max', { n: COMPARE_MAX }) : t('compare.add')}
                  onClick={(e) => e.stopPropagation()}
                >
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={checked}
                    disabled={atMax}
                    onChange={() => toggleCompare(s.id)}
                  />
                  {checked ? '✓' : '+'} {t('compare.add')}
                </label>
                <Link href={`/marketplace/${s.id}`}>
                  <Card className={`h-full transition-shadow hover:shadow-md ${checked ? 'ring-2 ring-brand-500' : ''}`}>
                    <div className="flex items-start justify-between gap-2 pr-24">
                      <h3 className="font-bold text-brand-900">{s.name}</h3>
                      {s.auditor.ratingCount > 0 && (
                        <Badge tone="warn">★ {s.auditor.ratingAvg.toFixed(1)}</Badge>
                      )}
                    </div>
                    <p className="mt-0.5 text-sm font-medium text-muted">{s.auditor.displayName}</p>
                    <p className="text-xs text-faint">
                      {[s.category, [s.auditor.city, s.auditor.state].filter(Boolean).join(', ')].filter(Boolean).join(' · ')}
                    </p>
                    {s.shortDesc && <p className="mt-2 line-clamp-2 text-sm text-muted">{s.shortDesc}</p>}
                    <div className="mt-3 text-sm font-bold text-brand-700">
                      {s.startingFrom != null ? t('startingFrom', { amount: `₹${inr(s.startingFrom)}` }) : '—'}
                    </div>
                  </Card>
                </Link>
              </div>
            );
          })}
        </div>
      )}

      {compareIds.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface/95 backdrop-blur">
          <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-6 py-3">
            <span className="text-sm font-medium text-muted">
              {t('compare.button', { n: compareIds.length })}
            </span>
            <div className="flex items-center gap-2">
              <Button variant="secondary" onClick={() => setCompareIds([])}>
                {t('compare.clear')}
              </Button>
              <Button disabled={compareIds.length < 2} onClick={() => setShowCompare(true)}>
                {t('compare.title')}
              </Button>
            </div>
          </div>
        </div>
      )}

      {showCompare && selected.length >= 2 && (
        <CompareModal services={selected} onClose={() => setShowCompare(false)} />
      )}
    </div>
  );
}

function CompareModal({
  services,
  onClose,
}: {
  services: MarketService[];
  onClose: () => void;
}) {
  const t = useTranslations('marketplace');
  const tc = useTranslations('common');

  const rows: { label: string; render: (s: MarketService) => React.ReactNode }[] = [
    {
      label: t('compare.auditor'),
      render: (s) => <span className="font-semibold text-brand-900">{s.auditor.displayName}</span>,
    },
    { label: t('compare.firm'), render: (s) => s.auditor.firmName || '—' },
    {
      label: t('compare.rating'),
      render: (s) =>
        s.auditor.ratingCount > 0
          ? `★ ${s.auditor.ratingAvg.toFixed(1)} (${s.auditor.ratingCount})`
          : t('compare.noRating'),
    },
    {
      label: t('compare.experience'),
      render: (s) => (s.auditor.experienceYrs != null ? t('yearsExp', { n: s.auditor.experienceYrs }) : '—'),
    },
    {
      label: t('compare.location'),
      render: (s) => [s.auditor.city, s.auditor.state].filter(Boolean).join(', ') || '—',
    },
    { label: t('compare.category'), render: (s) => s.category || '—' },
    { label: t('compare.delivery'), render: (s) => s.deliveryTime || '—' },
    {
      label: t('compare.startingPrice'),
      render: (s) => (
        <span className="font-bold text-brand-700">
          {s.startingFrom != null ? `₹${inr(s.startingFrom)}` : '—'}
        </span>
      ),
    },
    {
      label: t('compare.plans'),
      render: (s) =>
        s.tiers.length === 0 ? (
          '—'
        ) : (
          <div className="space-y-1.5">
            {s.tiers.map((tier) => (
              <div key={tier.id} className="rounded-lg border border-line p-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-ink">{tier.name}</span>
                  <span className="text-xs font-bold tabular-nums text-brand-700">₹{inr(tier.price)}</span>
                </div>
                <div className="mt-1 flex flex-wrap gap-1">
                  {tier.prioritySupport && <Badge tone="good">{t('priority')}</Badge>}
                  {tier.dedicatedConsultant && <Badge tone="good">{t('dedicated')}</Badge>}
                  {tier.revisions != null && <Badge>{t('revisionsN', { n: tier.revisions })}</Badge>}
                  {tier.deliveryTimeline && <Badge>{tier.deliveryTimeline}</Badge>}
                </div>
              </div>
            ))}
          </div>
        ),
    },
  ];

  const gridCols = { gridTemplateColumns: `150px repeat(${services.length}, minmax(180px, 1fr))` };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4" onClick={onClose}>
      <div className="my-8 w-full max-w-5xl rounded-2xl bg-surface p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-ink">{t('compare.title')}</h2>
          <button onClick={onClose} className="text-muted hover:text-ink">✕</button>
        </div>

        <div className="overflow-x-auto">
          <div className="min-w-full">
            {/* Header row: service names + view links */}
            <div className="grid items-stretch gap-px border-b border-line-strong" style={gridCols}>
              <div className="bg-subtle p-2 text-[11px] font-semibold uppercase tracking-wide text-faint" />
              {services.map((s) => (
                <div key={s.id} className="p-2">
                  <p className="font-bold text-brand-900">{s.name}</p>
                  <Link href={`/marketplace/${s.id}`} className="text-xs font-semibold text-brand-600 hover:underline">
                    {t('compare.view')} ›
                  </Link>
                </div>
              ))}
            </div>

            {rows.map((row, i) => (
              <div
                key={row.label}
                className={`grid items-start gap-px ${i % 2 ? 'bg-subtle/40' : ''}`}
                style={gridCols}
              >
                <div className="p-2 text-xs font-semibold text-muted">{row.label}</div>
                {services.map((s) => (
                  <div key={s.id} className="p-2 text-sm text-ink">{row.render(s)}</div>
                ))}
              </div>
            ))}
          </div>
        </div>

        <div className="mt-5 flex justify-end">
          <Button variant="secondary" onClick={onClose}>{tc('close')}</Button>
        </div>
      </div>
    </div>
  );
}

function MyEngagements() {
  const t = useTranslations('marketplace');
  const tc = useTranslations('common');
  const { toast } = useFeedback();
  const [requests, setRequests] = useState<ServiceRequestView[]>([]);
  const [quotations, setQuotations] = useState<QuotationView[]>([]);
  const [busy, setBusy] = useState('');
  const [reviewFor, setReviewFor] = useState<QuotationView | null>(null);
  const [grantFor, setGrantFor] = useState<QuotationView | null>(null);
  const [myCompanies, setMyCompanies] = useState<{ id: string; name: string }[]>([]);
  useEffect(() => {
    api
      .get<Me>('/auth/me')
      .then((me) =>
        setMyCompanies(
          me.memberships
            .filter((m) => m.role === 'OWNER' || m.role === 'ADMIN')
            .map((m) => ({ id: m.company.id, name: m.company.name })),
        ),
      )
      .catch(() => {});
  }, []);

  const reload = useCallback(async () => {
    const [r, q] = await Promise.all([
      fetchMyRequests().catch(() => []),
      fetchMyQuotations().catch(() => []),
    ]);
    setRequests(r);
    setQuotations(q);
  }, []);
  useEffect(() => {
    void reload();
  }, [reload]);

  async function respond(id: string, accept: boolean) {
    setBusy(id);
    try {
      await (accept ? acceptQuotation(id) : declineQuotation(id));
      toast(accept ? t('quoteAccepted') : t('quoteDeclined'));
      await reload();
    } finally {
      setBusy('');
    }
  }

  return (
    <div className="space-y-5">
      <Card title={t('myQuotations')}>
        {quotations.length === 0 ? (
          <p className="text-sm text-muted">{t('noQuotations')}</p>
        ) : (
          <div className="space-y-3">
            {quotations.map((q) => (
              <div key={q.id} className="rounded-xl border border-line p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-mono text-xs text-muted">{q.quoteNo}</p>
                    <p className="font-semibold text-brand-900">{q.auditor.displayName}</p>
                    <p className="mt-1 text-sm text-muted">{q.description}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-bold tabular-nums text-ink">₹{inr(q.total)}</p>
                    {q.gstApplicable && <p className="text-[11px] text-faint">{t('inclGst', { pct: q.gstPercent })}</p>}
                    {q.billingType !== 'one_time' && (
                      <p className="text-[11px] font-medium text-brand-600">{t(`billing.${q.billingType}`)}</p>
                    )}
                  </div>
                </div>
                <div className="mt-3 flex items-center justify-between">
                  <Badge tone={q.status === 'ACCEPTED' ? 'good' : q.status === 'DECLINED' ? 'bad' : 'neutral'}>
                    {t(`quoteStatus.${q.status}`)}
                  </Badge>
                  {q.status === 'ACCEPTED' && q.invoiceNo ? (
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-semibold text-emerald-700">{t('invoice')}: {q.invoiceNo}</span>
                      <Button variant="secondary" onClick={() => void downloadFile(`/marketplace/quotations/${q.id}/pdf`)}>{t('pdf')}</Button>
                      {myCompanies.length > 0 && (
                        <Button onClick={() => setGrantFor(q)}>{t('grantAccess')}</Button>
                      )}
                      <Button variant="secondary" onClick={() => setReviewFor(q)}>{t('leaveReview')}</Button>
                    </div>
                  ) : q.status === 'PENDING' ? (
                    <div className="flex gap-2">
                      <Button onClick={() => void respond(q.id, true)} disabled={busy === q.id}>{t('accept')}</Button>
                      <Button variant="secondary" onClick={() => void respond(q.id, false)} disabled={busy === q.id}>{t('decline')}</Button>
                      <Button variant="secondary" onClick={() => void downloadFile(`/marketplace/quotations/${q.id}/pdf`)}>{t('pdf')}</Button>
                    </div>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card title={t('myRequests')}>
        {requests.length === 0 ? (
          <p className="text-sm text-muted">{t('noRequests')}</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-[11px] font-semibold uppercase tracking-wide text-muted">
                <th className="py-2">{t('cols.auditor')}</th>
                <th className="py-2">{t('cols.service')}</th>
                <th className="py-2">{t('cols.kind')}</th>
                <th className="py-2">{tc('status')}</th>
              </tr>
            </thead>
            <tbody>
              {requests.map((r) => (
                <tr key={r.id} className="border-b border-line last:border-0">
                  <td className="py-2.5 font-medium">{r.auditor.displayName}</td>
                  <td className="py-2.5 text-muted">{r.service?.name ?? '—'}</td>
                  <td className="py-2.5 text-muted">{t(`kind.${r.kind}`)}</td>
                  <td className="py-2.5"><Badge>{t(`reqStatus.${r.status}`)}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {reviewFor && (
        <ReviewModal
          quotation={reviewFor}
          onClose={() => setReviewFor(null)}
          onDone={() => { setReviewFor(null); toast(t('reviewThanks')); }}
        />
      )}
      {grantFor && (
        <GrantAccessModal
          quotation={grantFor}
          companies={myCompanies}
          onClose={() => setGrantFor(null)}
          onDone={() => { setGrantFor(null); toast(t('accessGranted')); }}
        />
      )}
    </div>
  );
}

function GrantAccessModal({
  quotation,
  companies,
  onClose,
  onDone,
}: {
  quotation: QuotationView;
  companies: { id: string; name: string }[];
  onClose: () => void;
  onDone: () => void;
}) {
  const t = useTranslations('marketplace');
  const tc = useTranslations('common');
  const [companyId, setCompanyId] = useState(companies[0]?.id ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await grantQuotationAccess(quotation.id, companyId);
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : tc('somethingWentWrong'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4" onClick={onClose}>
      <form onSubmit={submit} className="my-8 w-full max-w-md space-y-3 rounded-2xl bg-surface p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-bold text-ink">{t('grantAccessTitle')}</h2>
        <p className="text-sm text-muted">{t('grantAccessIntro', { name: quotation.auditor.displayName })}</p>
        <div>
          <Label>{t('selectCompany')}</Label>
          <Select value={companyId} onChange={(e) => setCompanyId(e.target.value)}>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </Select>
        </div>
        <ErrorText>{error}</ErrorText>
        <div className="flex gap-3">
          <Button type="submit" disabled={busy || !companyId}>{busy ? tc('saving') : t('grantAccess')}</Button>
          <Button type="button" variant="secondary" onClick={onClose}>{tc('cancel')}</Button>
        </div>
      </form>
    </div>
  );
}

function ReviewModal({
  quotation,
  onClose,
  onDone,
}: {
  quotation: QuotationView;
  onClose: () => void;
  onDone: () => void;
}) {
  const t = useTranslations('marketplace');
  const tc = useTranslations('common');
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await submitReview(quotation.auditor.id, { rating, comment: comment.trim() || undefined });
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : tc('somethingWentWrong'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4" onClick={onClose}>
      <form onSubmit={submit} className="my-8 w-full max-w-md space-y-3 rounded-2xl bg-surface p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-bold text-ink">{t('reviewTitle')}</h2>
        <p className="text-sm text-muted">{quotation.auditor.displayName}</p>
        <div className="flex gap-1 text-2xl">
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} type="button" onClick={() => setRating(n)} className={n <= rating ? 'text-amber-500' : 'text-slate-300'}>★</button>
          ))}
        </div>
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          rows={3}
          placeholder={t('reviewPlaceholder')}
          className="w-full rounded-lg border border-line-strong px-3 py-2 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
        />
        <ErrorText>{error}</ErrorText>
        <div className="flex gap-3">
          <Button type="submit" disabled={busy}>{busy ? tc('saving') : t('submitReview')}</Button>
          <Button type="button" variant="secondary" onClick={onClose}>{tc('cancel')}</Button>
        </div>
      </form>
    </div>
  );
}
