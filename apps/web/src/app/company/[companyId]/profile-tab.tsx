'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useFeedback } from '@/components/feedback';
import { Button, Card, ErrorText, Input, Label, Select } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { UpiSettingsCard } from './branches-tab';

/**
 * Business profile (seller identity printed on documents). The print-layout
 * editor lives under its own "Print Settings" tab, so it's not duplicated here.
 */
export function ProfileTab({
  companyId,
  canManage,
}: {
  companyId: string;
  canManage: boolean;
}) {
  return (
    <div className="space-y-4">
      <UpiSettingsCard companyId={companyId} canManage={canManage} />
      <PaymentLinkSettingsCard companyId={companyId} canManage={canManage} />
      <EWayBillSettingsCard companyId={companyId} canManage={canManage} />
      <EInvoiceSettingsCard companyId={companyId} canManage={canManage} />
    </div>
  );
}

/**
 * NIC e-invoice (IRP) API credentials. The business registers for API access on
 * einvoice1.gst.gov.in and maps the GSP, then enters the username/password here;
 * once saved, IRNs are filed under this company's OWN taxpayer login (per GSTIN)
 * instead of failing closed. The password is write-only — the API never returns
 * it, only whether it's set. Mirrors the e-way bill credentials card above.
 */
function EInvoiceSettingsCard({
  companyId,
  canManage,
}: {
  companyId: string;
  canManage: boolean;
}) {
  const t = useTranslations('einvoiceSettings');
  const tc = useTranslations('common');
  const { toast } = useFeedback();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [passwordSet, setPasswordSet] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    api
      .get<{ einvoiceApiUsername?: string | null; einvoiceApiPasswordSet?: boolean }>(
        `/companies/${companyId}`,
      )
      .then((c) => {
        if (!active) return;
        setUsername(c.einvoiceApiUsername ?? '');
        setPasswordSet(!!c.einvoiceApiPasswordSet);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
    return () => {
      active = false;
    };
  }, [companyId]);

  async function save() {
    setBusy(true);
    setError('');
    try {
      await api.patch(`/companies/${companyId}`, {
        einvoiceApiUsername: username.trim() || null,
        // Only send the password when the user typed a new one, so saving the
        // form doesn't wipe an existing password.
        ...(password.trim() ? { einvoiceApiPassword: password.trim() } : {}),
      });
      if (password.trim()) setPasswordSet(true);
      setPassword('');
      toast(t('saved'));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : tc('somethingWentWrong'));
    } finally {
      setBusy(false);
    }
  }

  const live = !!username.trim() && passwordSet;

  return (
    <Card title={t('title')}>
      <p className="mb-1 text-sm text-muted">{t('intro')}</p>
      <p className="mb-4 text-xs text-faint">{t('howTo')}</p>
      <div className="mb-3 inline-flex items-center gap-2 rounded-md bg-subtle px-2.5 py-1 text-xs font-medium">
        <span
          className={`h-2 w-2 rounded-full ${live ? 'bg-emerald-500' : 'bg-amber-500'}`}
        />
        {live ? t('statusLive') : t('statusSimulator')}
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <Label>{t('username')}</Label>
          <Input
            value={username}
            disabled={!canManage || !loaded}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="einv_api_user"
            autoComplete="off"
          />
        </div>
        <div>
          <Label>{t('password')}</Label>
          <Input
            type="password"
            value={password}
            disabled={!canManage || !loaded}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={passwordSet ? t('passwordSetPlaceholder') : ''}
            autoComplete="new-password"
          />
        </div>
      </div>
      {canManage && (
        <div className="mt-4 flex items-center gap-3">
          <Button onClick={save} disabled={busy || !loaded}>
            {busy ? tc('saving') : tc('save')}
          </Button>
          <ErrorText>{error}</ErrorText>
        </div>
      )}
    </Card>
  );
}

/**
 * NIC e-way bill API credentials. The business creates an API username/password
 * on ewaybillgst.gov.in (Registration → For GSP) and enters them here; once
 * saved, e-way bills generate live through the portal instead of the simulator.
 * The password is write-only — the API never returns it, only whether it's set.
 */
function EWayBillSettingsCard({
  companyId,
  canManage,
}: {
  companyId: string;
  canManage: boolean;
}) {
  const t = useTranslations('ewayBillSettings');
  const tc = useTranslations('common');
  const { toast } = useFeedback();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [passwordSet, setPasswordSet] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    api
      .get<{ ewbApiUsername?: string | null; ewbApiPasswordSet?: boolean }>(
        `/companies/${companyId}`,
      )
      .then((c) => {
        if (!active) return;
        setUsername(c.ewbApiUsername ?? '');
        setPasswordSet(!!c.ewbApiPasswordSet);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
    return () => {
      active = false;
    };
  }, [companyId]);

  async function save() {
    setBusy(true);
    setError('');
    try {
      await api.patch(`/companies/${companyId}`, {
        ewbApiUsername: username.trim() || null,
        // Only send the password when the user typed a new one, so saving the
        // form doesn't wipe an existing password.
        ...(password.trim() ? { ewbApiPassword: password.trim() } : {}),
      });
      if (password.trim()) setPasswordSet(true);
      setPassword('');
      toast(t('saved'));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : tc('somethingWentWrong'));
    } finally {
      setBusy(false);
    }
  }

  const live = !!username.trim() && passwordSet;

  return (
    <Card title={t('title')}>
      <p className="mb-1 text-sm text-muted">{t('intro')}</p>
      <p className="mb-4 text-xs text-faint">{t('howTo')}</p>
      <div className="mb-3 inline-flex items-center gap-2 rounded-md bg-subtle px-2.5 py-1 text-xs font-medium">
        <span
          className={`h-2 w-2 rounded-full ${live ? 'bg-emerald-500' : 'bg-amber-500'}`}
        />
        {live ? t('statusLive') : t('statusSimulator')}
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <Label>{t('username')}</Label>
          <Input
            value={username}
            disabled={!canManage || !loaded}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="ewb_api_user"
            autoComplete="off"
          />
        </div>
        <div>
          <Label>{t('password')}</Label>
          <Input
            type="password"
            value={password}
            disabled={!canManage || !loaded}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={passwordSet ? t('passwordSetPlaceholder') : ''}
            autoComplete="new-password"
          />
        </div>
      </div>
      {canManage && (
        <div className="mt-4 flex items-center gap-3">
          <Button onClick={save} disabled={busy || !loaded}>
            {busy ? tc('saving') : tc('save')}
          </Button>
          <ErrorText>{error}</ErrorText>
        </div>
      )}
    </Card>
  );
}

/**
 * Chooses which document the Payment-In / Payment-Out screens reconcile money
 * against: invoices vs estimates (sales), bills vs purchase-estimates (purchase).
 * In "estimate" mode the estimate is treated as the bill for accounts.
 */
function PaymentLinkSettingsCard({
  companyId,
  canManage,
}: {
  companyId: string;
  canManage: boolean;
}) {
  const t = useTranslations('paymentLink');
  const tc = useTranslations('common');
  const { toast } = useFeedback();
  const [sales, setSales] = useState<'invoice' | 'estimate'>('invoice');
  const [purchase, setPurchase] = useState<'purchase' | 'purchaseEstimate'>('purchase');
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    api
      .get<{ salesPaymentLink?: string; purchasePaymentLink?: string }>(
        `/companies/${companyId}`,
      )
      .then((c) => {
        if (!active) return;
        setSales(c.salesPaymentLink === 'estimate' ? 'estimate' : 'invoice');
        setPurchase(
          c.purchasePaymentLink === 'purchaseEstimate' ? 'purchaseEstimate' : 'purchase',
        );
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
    return () => {
      active = false;
    };
  }, [companyId]);

  async function save() {
    setBusy(true);
    setError('');
    try {
      await api.patch(`/companies/${companyId}`, {
        salesPaymentLink: sales,
        purchasePaymentLink: purchase,
      });
      toast(t('saved'));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : tc('somethingWentWrong'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card title={t('title')}>
      <p className="mb-4 text-sm text-muted">{t('intro')}</p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <Label>{t('salesLabel')}</Label>
          <Select
            value={sales}
            disabled={!canManage || !loaded}
            onChange={(e) => setSales(e.target.value as 'invoice' | 'estimate')}
          >
            <option value="invoice">{t('salesInvoice')}</option>
            <option value="estimate">{t('salesEstimate')}</option>
          </Select>
          <p className="mt-1 text-xs text-faint">
            {sales === 'estimate' ? t('salesEstimateHint') : t('salesInvoiceHint')}
          </p>
        </div>
        <div>
          <Label>{t('purchaseLabel')}</Label>
          <Select
            value={purchase}
            disabled={!canManage || !loaded}
            onChange={(e) =>
              setPurchase(e.target.value as 'purchase' | 'purchaseEstimate')
            }
          >
            <option value="purchase">{t('purchaseBill')}</option>
            <option value="purchaseEstimate">{t('purchaseEstimate')}</option>
          </Select>
          <p className="mt-1 text-xs text-faint">
            {purchase === 'purchaseEstimate'
              ? t('purchaseEstimateHint')
              : t('purchaseBillHint')}
          </p>
        </div>
      </div>
      {canManage && (
        <div className="mt-4 flex items-center gap-3">
          <Button onClick={save} disabled={busy || !loaded}>
            {busy ? tc('saving') : tc('save')}
          </Button>
          <ErrorText>{error}</ErrorText>
        </div>
      )}
    </Card>
  );
}
