'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useFeedback } from '@/components/feedback';
import { Button, Input, Select } from '@/components/ui';
import { inr } from '@/lib/accounting';
import { ApiError } from '@/lib/api';
import {
  createBillingOrder,
  fetchBillingPlans,
  loadRazorpay,
  previewReferral,
  verifyBillingPayment,
  type BillingPlan,
  type ReferralPreview,
} from '@/lib/billing';

const MONTH_OPTIONS = [1, 3, 6, 12];

/** Plan picker + Razorpay checkout. Payment is verified server-side. */
export function UpgradeDialog({
  currentPlanCode,
  onClose,
  onUpgraded,
}: {
  currentPlanCode: string;
  onClose: () => void;
  onUpgraded: () => Promise<void>;
}) {
  const t = useTranslations('billing');
  const { toast } = useFeedback();
  const [plans, setPlans] = useState<BillingPlan[]>([]);
  const [months, setMonths] = useState(12);
  const [busyPlan, setBusyPlan] = useState('');
  const [refInput, setRefInput] = useState('');
  const [referral, setReferral] = useState<ReferralPreview | null>(null);
  const [refBusy, setRefBusy] = useState(false);
  const [refError, setRefError] = useState('');

  useEffect(() => {
    fetchBillingPlans().then(setPlans).catch(() => {});
  }, []);

  async function applyReferral() {
    if (!refInput.trim() || plans.length === 0) return;
    setRefBusy(true);
    setRefError('');
    try {
      // Validate against the first purchasable plan; the code applies to any.
      const preview = await previewReferral(plans[0].code, months, refInput.trim());
      setReferral(preview);
    } catch (err) {
      setReferral(null);
      setRefError(err instanceof ApiError ? err.message : t('referral.invalid'));
    } finally {
      setRefBusy(false);
    }
  }

  function clearReferral() {
    setReferral(null);
    setRefInput('');
    setRefError('');
  }

  async function pay(plan: BillingPlan) {
    setBusyPlan(plan.code);
    try {
      const ready = await loadRazorpay();
      if (!ready || !window.Razorpay) {
        toast(t('checkoutBlocked'), 'error');
        return;
      }
      const order = await createBillingOrder(plan.code, months, referral?.code);
      const checkout = new window.Razorpay({
        key: order.keyId,
        order_id: order.orderId,
        amount: order.amountPaise,
        currency: order.currency,
        name: 'RGS ERP',
        description: t('checkoutDescription', {
          plan: order.planName,
          months: order.months,
        }),
        prefill: order.prefill,
        theme: { color: '#673de6' },
        handler: (response) => {
          void (async () => {
            try {
              const result = await verifyBillingPayment(
                response.razorpay_order_id,
                response.razorpay_payment_id,
                response.razorpay_signature,
              );
              toast(t('activated', { plan: result.planName }));
              await onUpgraded();
              onClose();
            } catch (err) {
              toast(err instanceof ApiError ? err.message : t('verifyFailed'), 'error');
            }
          })();
        },
        modal: { ondismiss: () => setBusyPlan('') },
      });
      checkout.open();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : t('orderFailed'), 'error');
    } finally {
      setBusyPlan('');
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-3xl rounded-2xl bg-surface p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-bold text-ink">{t('title')}</h2>
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted">{t('billFor')}</span>
            <Select
              value={String(months)}
              onChange={(e) => setMonths(Number(e.target.value))}
              className="w-36"
            >
              {MONTH_OPTIONS.map((m) => (
                <option key={m} value={m}>
                  {t('months', { count: m })}
                </option>
              ))}
            </Select>
          </div>
        </div>

        {/* Referral / promo code */}
        <div className="mb-4 rounded-lg border border-line bg-subtle p-3">
          {referral ? (
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium text-emerald-700">
                ✓ {t('referral.applied', { code: referral.code })}
                {referral.grossPaise > 0 && (
                  <span className="ml-1 text-muted">
                    (− ₹{inr(referral.discountPaise / 100)})
                  </span>
                )}
              </span>
              <button
                type="button"
                onClick={clearReferral}
                className="text-xs font-medium text-muted hover:underline"
              >
                {t('referral.remove')}
              </button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium text-muted">{t('referral.label')}</span>
              <Input
                value={refInput}
                onChange={(e) => setRefInput(e.target.value.toUpperCase())}
                placeholder={t('referral.placeholder')}
                className="w-40"
              />
              <Button
                variant="secondary"
                disabled={refBusy || !refInput.trim()}
                onClick={() => void applyReferral()}
              >
                {refBusy ? '…' : t('referral.apply')}
              </Button>
              {refError && <span className="text-xs text-red-500">{refError}</span>}
            </div>
          )}
        </div>

        {plans.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted">{t('loading')}</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-3">
            {plans.map((plan) => {
              const unlimited = (n: number) => n === -1;
              const isCurrent = plan.code === currentPlanCode;
              return (
                <div
                  key={plan.code}
                  className={`flex flex-col rounded-xl border p-4 ${
                    isCurrent ? 'border-brand-300 bg-brand-50/40' : 'border-line'
                  }`}
                >
                  <p className="text-sm font-semibold text-ink">{plan.name}</p>
                  <p className="mt-1 text-2xl font-bold tabular-nums text-ink">
                    ₹{inr(plan.priceMonthly)}
                    <span className="text-xs font-normal text-faint">
                      {t('perMonth')}
                    </span>
                  </p>
                  <ul className="mt-3 flex-1 space-y-1 text-xs text-muted">
                    <li>
                      {unlimited(plan.maxCompanies)
                        ? t('limits.companiesUnlimited')
                        : t('limits.companies', { count: plan.maxCompanies })}
                    </li>
                    <li>
                      {unlimited(plan.maxBranches)
                        ? t('limits.branchesUnlimited')
                        : t('limits.branches', { count: plan.maxBranches })}
                    </li>
                    <li>
                      {unlimited(plan.maxMembers)
                        ? t('limits.membersUnlimited')
                        : t('limits.members', { count: plan.maxMembers })}
                    </li>
                    <li>
                      {plan.features.payroll === false
                        ? t('limits.noPayroll')
                        : t('limits.payroll')}
                    </li>
                    <li>
                      {plan.features.ai === false ? t('limits.noAi') : t('limits.ai')}
                    </li>
                  </ul>
                  <p className="mt-3 text-xs text-muted">
                    {t('total')}{' '}
                    <span className="font-semibold tabular-nums text-ink">
                      ₹{inr(plan.priceMonthly * months)}
                    </span>
                  </p>
                  <Button
                    className="mt-2"
                    disabled={busyPlan !== ''}
                    onClick={() => void pay(plan)}
                  >
                    {busyPlan === plan.code
                      ? t('opening')
                      : isCurrent
                        ? t('renew')
                        : t('choose')}
                  </Button>
                </div>
              );
            })}
          </div>
        )}

        <p className="mt-4 text-xs text-faint">{t('note')}</p>
      </div>
    </div>
  );
}
