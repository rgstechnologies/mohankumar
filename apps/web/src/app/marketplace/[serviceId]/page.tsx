'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { LanguageSwitcher } from '@/components/language-switcher';
import { useFeedback } from '@/components/feedback';
import { Badge, Button, Card, ErrorText, Label, Select } from '@/components/ui';
import { inr } from '@/lib/accounting';
import { ApiError, isAuthenticated } from '@/lib/api';
import {
  fetchMarketService,
  fetchReviews,
  sendRequest,
  type MarketService,
  type RequestKind,
  type ReviewView,
} from '@/lib/auditor';

export default function ServiceDetailPage() {
  const t = useTranslations('marketplace');
  const tc = useTranslations('common');
  const router = useRouter();
  const params = useParams<{ serviceId: string }>();
  const [svc, setSvc] = useState<MarketService | null | undefined>(undefined);
  const [action, setAction] = useState<RequestKind | null>(null);
  const [reviews, setReviews] = useState<ReviewView[]>([]);

  useEffect(() => {
    if (!isAuthenticated()) {
      router.push('/login');
      return;
    }
    fetchMarketService(params.serviceId)
      .then((s) => {
        setSvc(s);
        if (s) fetchReviews(s.auditor.id).then(setReviews).catch(() => {});
      })
      .catch(() => setSvc(null));
  }, [params.serviceId, router]);

  if (svc === undefined) return <div className="flex min-h-screen items-center justify-center bg-subtle text-sm text-muted">{tc('loading')}</div>;
  if (svc === null) return <div className="flex min-h-screen items-center justify-center bg-subtle text-sm text-muted">{t('notFound')}</div>;

  // Union of feature labels for the comparison grid.
  const labels: string[] = [];
  for (const tier of svc.tiers) {
    for (const f of tier.features) if (!labels.includes(f.label)) labels.push(f.label);
  }
  const has = (tierIdx: number, label: string) =>
    svc.tiers[tierIdx].features.some((f) => f.label === label && f.included);

  return (
    <div className="flex min-h-screen flex-col bg-subtle">
      <header className="sticky top-0 z-10 border-b border-line bg-surface">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between gap-3 px-6">
          <Link href="/marketplace" className="text-sm font-medium text-brand-600 hover:underline">← {t('backToMarketplace')}</Link>
          <LanguageSwitcher />
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 space-y-5 px-6 py-6">
        <Card>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-brand-900">{svc.name}</h1>
              <p className="mt-1 text-sm font-medium text-ink">{svc.auditor.displayName}{svc.auditor.firmName ? ` · ${svc.auditor.firmName}` : ''}</p>
              <p className="text-xs text-faint">
                {[svc.category, [svc.auditor.city, svc.auditor.state].filter(Boolean).join(', '), svc.auditor.experienceYrs ? t('yearsExp', { n: svc.auditor.experienceYrs }) : null].filter(Boolean).join(' · ')}
              </p>
              {svc.deliveryTime && <p className="mt-1 text-xs text-muted">{t('delivery')}: {svc.deliveryTime}</p>}
            </div>
            {svc.auditor.ratingCount > 0 && <Badge tone="warn">★ {svc.auditor.ratingAvg.toFixed(1)} ({svc.auditor.ratingCount})</Badge>}
          </div>
          {svc.detailDesc && <p className="mt-3 whitespace-pre-line text-sm text-muted">{svc.detailDesc}</p>}
          <div className="mt-4 flex flex-wrap gap-2">
            <Button onClick={() => setAction('SERVICE')}>{t('requestService')}</Button>
            <Button variant="secondary" onClick={() => setAction('CUSTOM_QUOTE')}>{t('requestQuote')}</Button>
            <Button variant="secondary" onClick={() => setAction('ENQUIRY')}>{t('enquire')}</Button>
          </div>
        </Card>

        {/* Tier comparison grid */}
        {svc.tiers.length > 0 && (
          <Card title={t('comparePlans')}>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead>
                  <tr className="border-b border-line">
                    <th className="py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-muted">{t('features')}</th>
                    {svc.tiers.map((tier) => (
                      <th key={tier.id} className="px-3 py-2 text-center">
                        <div className="font-bold text-brand-900">{tier.name}</div>
                        <div className="text-base font-bold tabular-nums text-brand-700">₹{inr(tier.price)}</div>
                        {tier.gstApplicable && <div className="text-[10px] font-normal text-faint">+{tier.gstPercent}% GST</div>}
                        <div className="text-[10px] font-normal text-faint">{t(`billing.${tier.billingType}`)}</div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {labels.map((label) => (
                    <tr key={label} className="border-b border-line last:border-0">
                      <td className="py-2 text-ink">{label}</td>
                      {svc.tiers.map((tier, i) => (
                        <td key={tier.id} className="px-3 py-2 text-center">
                          {has(i, label) ? <span className="font-bold text-emerald-600">✓</span> : <span className="text-slate-300">✕</span>}
                        </td>
                      ))}
                    </tr>
                  ))}
                  <tr>
                    <td className="py-2 text-[11px] font-semibold uppercase tracking-wide text-muted">{t('extras')}</td>
                    {svc.tiers.map((tier) => (
                      <td key={tier.id} className="px-3 py-2 text-center text-[11px] text-muted">
                        {tier.deliveryTimeline && <div>{tier.deliveryTimeline}</div>}
                        {tier.revisions != null && <div>{t('revisionsN', { n: tier.revisions })}</div>}
                        {tier.prioritySupport && <div className="text-emerald-600">{t('priority')}</div>}
                        {tier.dedicatedConsultant && <div className="text-emerald-600">{t('dedicated')}</div>}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          </Card>
        )}

        {reviews.length > 0 && (
          <Card title={t('reviews')}>
            <div className="space-y-3">
              {reviews.map((rv) => (
                <div key={rv.id} className="border-b border-line pb-3 last:border-0 last:pb-0">
                  <div className="flex items-center gap-2">
                    <span className="text-amber-500">{'★'.repeat(rv.rating)}<span className="text-slate-200">{'★'.repeat(5 - rv.rating)}</span></span>
                    <span className="text-sm font-semibold text-ink">{rv.clientName}</span>
                  </div>
                  {rv.comment && <p className="mt-1 text-sm text-muted">{rv.comment}</p>}
                </div>
              ))}
            </div>
          </Card>
        )}
      </main>

      {action && (
        <RequestModal
          kind={action}
          service={svc}
          onClose={() => setAction(null)}
        />
      )}
    </div>
  );
}

function RequestModal({
  kind,
  service,
  onClose,
}: {
  kind: RequestKind;
  service: MarketService;
  onClose: () => void;
}) {
  const t = useTranslations('marketplace');
  const tc = useTranslations('common');
  const { toast } = useFeedback();
  const [tierId, setTierId] = useState(service.tiers[0]?.id ?? '');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const titleKey = kind === 'SERVICE' ? 'requestService' : kind === 'CUSTOM_QUOTE' ? 'requestQuote' : 'enquire';

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await sendRequest(service.id, {
        kind,
        tierId: kind === 'SERVICE' && tierId ? tierId : undefined,
        message: message.trim() || undefined,
      });
      toast(t('requestSent'));
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
        <h2 className="text-lg font-bold text-ink">{t(titleKey)}</h2>
        <p className="text-sm text-muted">{service.name} · {service.auditor.displayName}</p>
        {kind === 'SERVICE' && service.tiers.length > 0 && (
          <div>
            <Label>{t('chooseTier')}</Label>
            <Select value={tierId} onChange={(e) => setTierId(e.target.value)}>
              {service.tiers.map((tr) => (
                <option key={tr.id} value={tr.id}>{tr.name} — ₹{inr(tr.price)}</option>
              ))}
            </Select>
          </div>
        )}
        <div>
          <Label>{kind === 'CUSTOM_QUOTE' ? t('requirement') : t('message')}</Label>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={4}
            required={kind === 'CUSTOM_QUOTE'}
            className="w-full rounded-lg border border-line-strong px-3 py-2 text-sm focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
          />
        </div>
        <ErrorText>{error}</ErrorText>
        <div className="flex gap-3">
          <Button type="submit" disabled={busy}>{busy ? tc('saving') : t('send')}</Button>
          <Button type="button" variant="secondary" onClick={onClose}>{tc('cancel')}</Button>
        </div>
      </form>
    </div>
  );
}
