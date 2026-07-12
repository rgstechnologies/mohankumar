'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useFeedback } from '@/components/feedback';
import { EmptyState } from '@/components/table';
import { Badge, Button, Card, ErrorText, HelpTip, Input, Label } from '@/components/ui';
import { inr } from '@/lib/accounting';
import { api, ApiError, openPdfPost, previewPdfBlob } from '@/lib/api';
import { stateNameForCode } from '@bookly/shared';

export interface BranchRow {
  id: string;
  name: string;
  city: string | null;
  isActive: boolean;
}

interface BranchPerf {
  branchId: string | null;
  name: string;
  sales: number;
  invoiceCount: number;
  outstanding: number;
  purchases: number;
  billCount: number;
}

export function BranchesTab({
  companyId,
  branches,
  canManage,
  onChanged,
}: {
  companyId: string;
  branches: BranchRow[];
  canManage: boolean;
  onChanged: () => Promise<void>;
}) {
  const t = useTranslations('branches');
  const tc = useTranslations('common');
  const { toast } = useFeedback();
  const [perf, setPerf] = useState<BranchPerf[]>([]);
  const [draft, setDraft] = useState<{ id?: string; name: string; city: string } | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api
      .get<BranchPerf[]>(`/companies/${companyId}/branches/performance`)
      .then(setPerf)
      .catch(() => {});
  }, [companyId, branches]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!draft) return;
    setError('');
    setBusy(true);
    try {
      if (draft.id) {
        await api.patch(`/companies/${companyId}/branches/${draft.id}`, {
          name: draft.name,
          city: draft.city || undefined,
        });
      } else {
        await api.post(`/companies/${companyId}/branches`, {
          name: draft.name,
          city: draft.city || undefined,
        });
      }
      const savedToast = draft.id ? t('toastUpdated') : t('toastCreated');
      setDraft(null);
      await onChanged();
      toast(savedToast);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : tc('somethingWentWrong'));
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(branch: BranchRow) {
    await api.patch(`/companies/${companyId}/branches/${branch.id}`, {
      isActive: !branch.isActive,
    });
    await onChanged();
    toast(branch.isActive ? t('toastDeactivated') : t('toastReactivated'), 'info');
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="flex items-center text-sm text-muted">
          {t('intro')}
          <HelpTip text={t('introHelp')} />
        </p>
        {canManage && (
          <Button
            variant={draft && !draft.id ? 'secondary' : 'primary'}
            onClick={() => setDraft(draft && !draft.id ? null : { name: '', city: '' })}
          >
            {draft && !draft.id ? tc('close') : t('newBranch')}
          </Button>
        )}
      </div>

      {draft && (
        <Card title={draft.id ? t('editTitle', { name: draft.name || t('branchFallback') }) : t('newBranchTitle')}>
          <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-4">
            <div className="min-w-56 flex-1">
              <Label>{t('branchName')}</Label>
              <Input
                required
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                placeholder={t('branchNamePlaceholder')}
              />
            </div>
            <div className="min-w-44">
              <Label>{t('cityOptional')}</Label>
              <Input
                value={draft.city}
                onChange={(e) => setDraft({ ...draft, city: e.target.value })}
              />
            </div>
            <div className="flex gap-2">
              <Button type="submit" disabled={busy}>
                {busy ? tc('saving') : draft.id ? t('saveChanges') : t('createBranch')}
              </Button>
              <Button type="button" variant="secondary" onClick={() => setDraft(null)}>
                {tc('cancel')}
              </Button>
            </div>
            <div className="w-full">
              <ErrorText>{error}</ErrorText>
            </div>
          </form>
        </Card>
      )}

      <Card title={t('cardTitle')}>
        {branches.length === 0 ? (
          <EmptyState
            title={t('emptyTitle')}
            body={t('emptyBody')}
            action={
              canManage && (
                <Button onClick={() => setDraft({ name: '', city: '' })}>{t('addBranch')}</Button>
              )
            }
          />
        ) : (
          <div className="overflow-x-auto"><table className="w-full min-w-[600px] text-sm">
            <thead>
              <tr className="border-b border-line bg-subtle text-left text-[11px] font-semibold uppercase tracking-wide text-muted">
                <th className="py-2">{t('branch')}</th>
                <th className="py-2">{t('city')}</th>
                <th className="py-2 text-center">{tc('status')}</th>
                {canManage && <th className="py-2 text-right">{tc('actions')}</th>}
              </tr>
            </thead>
            <tbody>
              {branches.map((branch) => (
                <tr key={branch.id} className="border-b border-line last:border-0 hover:bg-subtle">
                  <td className="py-2.5 font-medium">{branch.name}</td>
                  <td className="py-2.5 text-muted">{branch.city ?? '—'}</td>
                  <td className="py-2.5 text-center">
                    <Badge tone={branch.isActive ? 'good' : 'neutral'}>
                      {branch.isActive ? t('statusActive') : t('statusInactive')}
                    </Badge>
                  </td>
                  {canManage && (
                    <td className="py-2.5 text-right text-xs">
                      <button
                        onClick={() =>
                          setDraft({ id: branch.id, name: branch.name, city: branch.city ?? '' })
                        }
                        className="font-medium text-brand-600 hover:underline"
                      >
                        {tc('edit')}
                      </button>
                      <button
                        onClick={() => toggleActive(branch)}
                        className="ml-3 text-faint hover:text-ink"
                      >
                        {branch.isActive ? t('deactivate') : t('reactivate')}
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
      </Card>

      {perf.length > 0 && (
        <Card title={t('perfTitle')}>
          <div className="overflow-x-auto"><table className="w-full min-w-[600px] text-sm">
            <thead>
              <tr className="border-b border-line bg-subtle text-left text-[11px] font-semibold uppercase tracking-wide text-muted">
                <th className="py-2">{t('branch')}</th>
                <th className="py-2 text-right">{t('sales')}</th>
                <th className="py-2 text-right">{t('invoices')}</th>
                <th className="py-2 text-right">{t('outstanding')}</th>
                <th className="py-2 text-right">{t('purchases')}</th>
                <th className="py-2 text-right">{t('bills')}</th>
              </tr>
            </thead>
            <tbody>
              {perf.map((row) => (
                <tr
                  key={row.branchId ?? 'unassigned'}
                  className="border-b border-line last:border-0 hover:bg-subtle"
                >
                  <td className="py-2.5 font-medium">
                    {row.name}
                    {row.branchId === null && (
                      <span className="ml-2 text-xs text-faint">{t('noBranchTag')}</span>
                    )}
                  </td>
                  <td className="py-2.5 text-right tabular-nums">₹{inr(row.sales)}</td>
                  <td className="py-2.5 text-right tabular-nums">{row.invoiceCount}</td>
                  <td className="py-2.5 text-right tabular-nums">₹{inr(row.outstanding)}</td>
                  <td className="py-2.5 text-right tabular-nums">₹{inr(row.purchases)}</td>
                  <td className="py-2.5 text-right tabular-nums">{row.billCount}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        </Card>
      )}
    </div>
  );
}


/** One-field payment settings: the UPI ID printed as a pay QR on invoices. */
type CompanyProfile = {
  name: string;
  printName: string;
  legalName: string;
  gstin: string;
  stateCode: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  pincode: string;
  upiId: string;
  phone: string;
  email: string;
  bankName: string;
  bankAccountName: string;
  bankAccountNo: string;
  bankIfsc: string;
  bankBranch: string;
};

const EMPTY_PROFILE: CompanyProfile = {
  name: '',
  printName: '',
  legalName: '',
  gstin: '',
  stateCode: '',
  addressLine1: '',
  addressLine2: '',
  city: '',
  pincode: '',
  upiId: '',
  phone: '',
  email: '',
  bankName: '',
  bankAccountName: '',
  bankAccountNo: '',
  bankIfsc: '',
  bankBranch: '',
};

/** OWNER/ADMIN editor for the seller details printed on invoices/estimates. */
export function UpiSettingsCard({
  companyId,
  canManage,
}: {
  companyId: string;
  canManage: boolean;
}) {
  const t = useTranslations('companyProfile');
  const { toast } = useFeedback();
  const [form, setForm] = useState<CompanyProfile>(EMPTY_PROFILE);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api
      .get<Partial<Record<keyof CompanyProfile, string | null>>>(
        `/companies/${companyId}`,
      )
      .then((c) => {
        setForm({
          name: c.name ?? '',
          printName: c.printName ?? '',
          legalName: c.legalName ?? '',
          gstin: c.gstin ?? '',
          stateCode: c.stateCode ?? '',
          addressLine1: c.addressLine1 ?? '',
          addressLine2: c.addressLine2 ?? '',
          city: c.city ?? '',
          pincode: c.pincode ?? '',
          upiId: c.upiId ?? '',
          phone: c.phone ?? '',
          email: c.email ?? '',
          bankName: c.bankName ?? '',
          bankAccountName: c.bankAccountName ?? '',
          bankAccountNo: c.bankAccountNo ?? '',
          bankIfsc: c.bankIfsc ?? '',
          bankBranch: c.bankBranch ?? '',
        });
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, [companyId]);

  if (!canManage) return null;

  const set = (k: keyof CompanyProfile) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  // Empty strings clear the field (null) so we don't trip the format validators.
  const clean = (v: string) => (v.trim() === '' ? null : v.trim());

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await api.patch(`/companies/${companyId}`, {
        name: form.name.trim() || undefined,
        printName: clean(form.printName),
        legalName: clean(form.legalName),
        gstin: clean(form.gstin)?.toUpperCase(),
        stateCode: clean(form.stateCode),
        addressLine1: clean(form.addressLine1),
        addressLine2: clean(form.addressLine2),
        city: clean(form.city),
        pincode: clean(form.pincode),
        upiId: clean(form.upiId),
        phone: clean(form.phone),
        email: clean(form.email),
      });
      toast(t('saved'));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('failed'));
    } finally {
      setBusy(false);
    }
  }

  const field = (
    k: keyof CompanyProfile,
    label: string,
    placeholder?: string,
  ) => (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-muted">{label}</span>
      <Input
        value={form[k]}
        onChange={set(k)}
        placeholder={placeholder}
        disabled={!loaded}
        className="w-full"
      />
    </label>
  );

  return (
    <Card>
      <h3 className="mb-1 text-sm font-semibold">
        {t('title')} <HelpTip text={t('hint')} />
      </h3>
      <p className="mb-4 text-xs text-muted">{t('body')}</p>
      <form onSubmit={onSave} className="space-y-5">
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-faint">
            {t('identitySection')}
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            {field('name', t('name'), 'Sharma Textiles')}
            {field('printName', t('printName'), 'SHARMA TEXTILES')}
            {field('legalName', t('legalName'), 'Sharma Textiles Pvt Ltd')}
            {field('gstin', t('gstin'), '33AAACS1234A1ZB')}
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-muted">{t('stateCode')}</span>
              <Input
                readOnly
                className="w-full bg-subtle text-muted"
                value={form.gstin && form.gstin.length >= 2 ? `${form.gstin.slice(0, 2)} — ${stateNameForCode(form.gstin.slice(0, 2)) ?? 'Unknown'}` : ''}
                placeholder="—"
                disabled={!loaded}
              />
            </label>
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {field('addressLine1', t('addressLine1'), 'No. 12, Main Road')}
            {field('addressLine2', t('addressLine2'), 'Near Bus Stand')}
            {field('city', t('city'), 'Coimbatore')}
            {field('pincode', t('pincode'), '641001')}
          </div>
        </div>

        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-faint">
            {t('contactSection')}
          </p>
          <div className="grid gap-3 sm:grid-cols-3">
            {field('phone', t('phone'), '+91 98765 43210')}
            {field('email', t('email'), 'billing@business.com')}
            {field('upiId', t('upiId'), 'shop@okhdfcbank')}
          </div>
        </div>

        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-faint">
            {t('bankSection')}
          </p>
          <p className="text-xs text-muted">{t('bankMovedHint')}</p>
        </div>

        <div className="flex items-center gap-3">
          <Button type="submit" disabled={busy || !loaded}>
            {busy ? '…' : t('save')}
          </Button>
          <ErrorText>{error}</ErrorText>
        </div>
      </form>
    </Card>
  );
}

type TemplateId = 'tally' | 'classic' | 'modern' | 'minimal' | 'professional' | 'elegant';

type Tpl = {
  templateId: TemplateId;
  format: 'tax' | 'simple';
  paperSize: 'A4' | 'A5';
  accentColor: string;
  showInfoQr: boolean;
  showBank: boolean;
  showUpiQr: boolean;
  showSignature: boolean;
  showHsn: boolean;
  showGstColumns: boolean;
  showTotalQty: boolean;
  showReceived: boolean;
  showBalance: boolean;
  showAmountInWords: boolean;
  amountWordsFormat: 'indian' | 'international';
  thermalWidth: '2in' | '3in' | '4in';
  signatureLabel: string;
  title: string;
  terms: string;
  footerText: string;
  printName: boolean;
  printAddress: boolean;
  printPhone: boolean;
  printEmail: boolean;
  printGstin: boolean;
  headerNameOverride: string;
};

const DEFAULT_TPL: Tpl = {
  templateId: 'tally',
  format: 'tax',
  paperSize: 'A4',
  accentColor: '#673de6',
  showInfoQr: true,
  showBank: true,
  showUpiQr: true,
  showSignature: true,
  showHsn: true,
  showGstColumns: true,
  showTotalQty: true,
  showReceived: false,
  showBalance: false,
  showAmountInWords: true,
  amountWordsFormat: 'indian',
  thermalWidth: '3in',
  signatureLabel: '',
  title: '',
  terms: '',
  footerText: '',
  printName: true,
  printAddress: true,
  printPhone: true,
  printEmail: true,
  printGstin: true,
  headerNameOverride: '',
};

/** The selectable designs, with the structural cues for the mini preview. */
const TEMPLATES: {
  id: TemplateId;
  header: 'plain' | 'band' | 'sidebar' | 'centered';
  table: 'lines' | 'grid' | 'zebra';
  /** The black-and-white Tally-style full-grid layout (no accent colour). */
  regular?: boolean;
}[] = [
  { id: 'tally', header: 'plain', table: 'grid', regular: true },
  { id: 'classic', header: 'plain', table: 'lines' },
  { id: 'modern', header: 'band', table: 'grid' },
  { id: 'minimal', header: 'plain', table: 'lines' },
  { id: 'professional', header: 'sidebar', table: 'zebra' },
  { id: 'elegant', header: 'centered', table: 'grid' },
];

/** Curated accent presets shown as quick-pick swatches. */
const ACCENT_PRESETS = [
  '#673de6', '#7c3aed', '#0ea5e9', '#0d9488',
  '#16a34a', '#ca8a04', '#ea580c', '#dc2626',
  '#db2777', '#475569',
];

/** A tiny CSS thumbnail of an invoice in the chosen style, for the gallery. */
function TemplateThumb({
  header,
  table,
  accent,
  regular,
}: {
  header: 'plain' | 'band' | 'sidebar' | 'centered';
  table: 'lines' | 'grid' | 'zebra';
  accent: string;
  regular?: boolean;
}) {
  const rows = [0, 1, 2];
  // Regular = the black-and-white Tally grid: full borders, no colour.
  if (regular) {
    return (
      <div className="pointer-events-none aspect-[3/4] w-full overflow-hidden rounded bg-surface p-1.5 shadow-inner ring-1 ring-slate-200">
        <div className="flex h-full flex-col border border-slate-800">
          <div className="border-b border-slate-800 px-1 py-0.5 text-center text-[6px] font-bold text-ink">
            TAX INVOICE
          </div>
          <div className="flex border-b border-slate-800">
            <div className="flex-1 border-r border-slate-800 p-1">
              <div className="h-1 w-8 bg-slate-800" />
              <div className="mt-0.5 h-0.5 w-10 bg-slate-300" />
            </div>
            <div className="flex-1 p-1">
              <div className="h-0.5 w-6 bg-slate-300" />
              <div className="mt-0.5 h-0.5 w-5 bg-slate-300" />
            </div>
          </div>
          <div className="grid flex-1 grid-cols-4">
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="border-b border-r border-line-strong" />
            ))}
          </div>
          <div className="border-t border-slate-800 px-1 py-0.5 text-right text-[6px] font-bold text-ink">
            TOTAL
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="pointer-events-none aspect-[3/4] w-full overflow-hidden rounded bg-surface p-2 shadow-inner ring-1 ring-slate-200">
      {/* header */}
      {header === 'band' ? (
        <div className="mb-1.5 flex items-center justify-between rounded-sm px-1.5 py-1" style={{ background: accent }}>
          <div className="h-1.5 w-8 rounded-full bg-surface/90" />
          <div className="h-3 w-3 rounded-sm bg-surface/80" />
        </div>
      ) : header === 'sidebar' ? (
        <div className="mb-1.5 flex items-stretch gap-1">
          <div className="w-1 rounded-full" style={{ background: accent }} />
          <div className="flex-1">
            <div className="h-1.5 w-10 rounded-full bg-slate-700" />
            <div className="mt-1 h-1 w-7 rounded-full bg-slate-300" />
          </div>
          <div className="h-3 w-3 rounded-sm bg-slate-200" />
        </div>
      ) : header === 'centered' ? (
        <div className="mb-1.5 flex flex-col items-center">
          <div className="h-1.5 w-10 rounded-full bg-slate-700" />
          <div className="mt-1 h-1 w-6 rounded-full bg-slate-300" />
        </div>
      ) : (
        <div className="mb-1.5 flex items-start justify-between">
          <div>
            <div className="h-1.5 w-10 rounded-full bg-slate-700" />
            <div className="mt-1 h-1 w-7 rounded-full bg-slate-300" />
          </div>
          <div className="h-3 w-3 rounded-sm bg-slate-200" />
        </div>
      )}
      {/* title rule */}
      <div className="mb-1 h-0.5 w-full rounded" style={{ background: accent }} />
      {/* table head */}
      <div
        className="mb-0.5 h-1.5 w-full rounded-sm"
        style={{ background: table === 'lines' ? '#e2e8f0' : accent, opacity: table === 'lines' ? 1 : 0.85 }}
      />
      {/* rows */}
      {rows.map((r) => (
        <div
          key={r}
          className="mb-0.5 flex h-1.5 items-center gap-0.5 px-0.5"
          style={{ background: table === 'zebra' && r % 2 === 1 ? '#f1f5f9' : 'transparent' }}
        >
          <div className="h-1 flex-1 rounded-full bg-slate-200" />
          <div className="h-1 w-3 rounded-full bg-slate-200" />
          <div className="h-1 w-3 rounded-full bg-slate-200" />
        </div>
      ))}
      {/* total */}
      <div className="mt-1 flex justify-end">
        <div className="h-2 w-10 rounded-sm" style={{ background: accent }} />
      </div>
    </div>
  );
}

const LOGO_MAX_BYTES = 250 * 1024;

/** OWNER/ADMIN editor for the invoice/estimate layout (logo, colour, blocks). */
export function InvoiceTemplateCard({
  companyId,
  canManage,
  docKind = 'invoice',
}: {
  companyId: string;
  canManage: boolean;
  /** Which document type's print layout this editor manages. */
  docKind?: string;
}) {
  const t = useTranslations('invoiceTemplate');
  const { toast } = useFeedback();
  const [tpl, setTpl] = useState<Tpl>(DEFAULT_TPL);
  const [logo, setLogo] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [printer, setPrinter] = useState<'regular' | 'thermal'>('regular');
  const [section, setSection] = useState<'design' | 'branding' | 'blocks' | 'wording'>('design');
  const [layoutTab, setLayoutTab] = useState<'layout' | 'colors'>('layout');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewBusy, setPreviewBusy] = useState(false);

  useEffect(() => {
    setLoaded(false);
    api
      .get<{
        logo: string | null;
        invoiceTemplate: Partial<Tpl> | null;
        documentTemplates: Record<string, Partial<Tpl>> | null;
      }>(`/companies/${companyId}`)
      .then((c) => {
        setLogo(c.logo ?? null);
        // Prefer this form's saved layout; fall back to the shared one.
        const perForm = c.documentTemplates?.[docKind];
        const saved = (perForm ?? c.invoiceTemplate) ?? {};
        // Drop null/undefined so the DEFAULT_TPL ('' for text fields) wins —
        // saved string fields persist as null and would otherwise land as
        // `value={null}` on the controlled inputs.
        const cleaned = Object.fromEntries(
          Object.entries(saved).filter(([, v]) => v !== null && v !== undefined),
        );
        setTpl({ ...DEFAULT_TPL, ...cleaned });
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, [companyId, docKind]);

  // Strip empty-string overrides to null so the server keeps its defaults.
  const buildTemplate = useCallback(
    () => ({
      templateId: tpl.templateId,
      format: tpl.format,
      paperSize: tpl.paperSize,
      accentColor: tpl.accentColor,
      showInfoQr: tpl.showInfoQr,
      showBank: tpl.showBank,
      showUpiQr: tpl.showUpiQr,
      showSignature: tpl.showSignature,
      showHsn: tpl.showHsn,
      showGstColumns: tpl.showGstColumns,
      showTotalQty: tpl.showTotalQty,
      showReceived: tpl.showReceived,
      showBalance: tpl.showBalance,
      showAmountInWords: tpl.showAmountInWords,
      amountWordsFormat: tpl.amountWordsFormat,
      thermalWidth: tpl.thermalWidth,
      signatureLabel: tpl.signatureLabel.trim() || null,
      title: tpl.title.trim() || null,
      terms: tpl.terms.trim() || null,
      footerText: tpl.footerText.trim() || null,
      printName: tpl.printName,
      printAddress: tpl.printAddress,
      printPhone: tpl.printPhone,
      printEmail: tpl.printEmail,
      printGstin: tpl.printGstin,
      headerNameOverride: tpl.headerNameOverride.trim() || null,
    }),
    [tpl],
  );

  // Inline live preview — re-render a sample PDF shortly after any change.
  const previewRef = useRef<string | null>(null);
  useEffect(() => {
    if (!loaded || !canManage) return;
    let cancelled = false;
    const id = setTimeout(async () => {
      setPreviewBusy(true);
      try {
        const url = await previewPdfBlob(
          `/companies/${companyId}/invoices/template-preview`,
          {
            template: buildTemplate(),
            logo: logo ?? undefined,
            thermal: printer === 'thermal',
            docKind,
          },
        );
        if (cancelled) return URL.revokeObjectURL(url);
        if (previewRef.current) URL.revokeObjectURL(previewRef.current);
        previewRef.current = url;
        setPreviewUrl(url);
      } catch {
        /* keep the last good preview on error */
      } finally {
        if (!cancelled) setPreviewBusy(false);
      }
    }, 500);
    return () => {
      cancelled = true;
      clearTimeout(id);
    };
  }, [buildTemplate, logo, loaded, canManage, companyId, printer, docKind]);
  useEffect(
    () => () => {
      if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    },
    [],
  );

  if (!canManage) return null;

  const upd = <K extends keyof Tpl>(k: K, v: Tpl[K]) =>
    setTpl((s) => ({ ...s, [k]: v }));

  function onLogoFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!/^image\/(png|jpe?g|webp)$/.test(file.type)) {
      toast(t('logoBadType'), 'error');
      return;
    }
    if (file.size > LOGO_MAX_BYTES) {
      toast(t('logoTooBig'), 'error');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setLogo(reader.result as string);
    reader.readAsDataURL(file);
  }

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      // Logo is company-wide; the layout is saved per document type.
      await api.patch(`/companies/${companyId}`, { logo: logo ?? null });
      await api.patch(
        `/companies/${companyId}/document-templates/${docKind}`,
        buildTemplate(),
      );
      toast(t('saved'));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('failed'));
    } finally {
      setBusy(false);
    }
  }

  async function onPreview() {
    try {
      await openPdfPost(`/companies/${companyId}/invoices/template-preview`, {
        template: buildTemplate(),
        logo: logo ?? undefined,
        docKind,
      });
    } catch {
      toast(t('previewFailed'), 'error');
    }
  }

  const toggleRow = (k: keyof Tpl, label: string, desc: string) => (
    <label className="flex cursor-pointer items-start gap-3 rounded-md border border-line p-3 hover:bg-subtle">
      <input
        type="checkbox"
        checked={tpl[k] as boolean}
        onChange={(e) => upd(k, e.target.checked as never)}
        disabled={!loaded}
        className="mt-0.5 h-4 w-4 rounded border-line-strong"
      />
      <span>
        <span className="block text-sm font-medium text-ink">{label}</span>
        <span className="block text-xs text-muted">{desc}</span>
      </span>
    </label>
  );

  const SECTIONS = [
    { key: 'design' as const, label: t('tabs.design') },
    { key: 'branding' as const, label: t('tabs.branding') },
    { key: 'blocks' as const, label: t('tabs.blocks') },
    { key: 'wording' as const, label: t('tabs.wording') },
  ];

  const groupLabel = (s: string) => (
    <p className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-faint">{s}</p>
  );

  return (
    <Card>
      <h3 className="mb-1 text-sm font-semibold">
        {t('title')} <HelpTip text={t('hint')} />
      </h3>
      <p className="mb-4 text-xs text-muted">{t('body')}</p>

      {/* Printer top-tabs (Regular A4/A5 vs Thermal receipt) */}
      <div className="mb-5 flex gap-1 border-b border-line">
        {(['regular', 'thermal'] as const).map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setPrinter(p)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-semibold uppercase tracking-wide transition-colors ${
              printer === p
                ? 'border-brand-600 text-brand-700'
                : 'border-transparent text-faint hover:text-muted'
            }`}
          >
            {t(`printer.${p}`)}
          </button>
        ))}
      </div>

      {printer === 'regular' ? (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,400px)]">
          {/* LEFT — controls */}
          <form onSubmit={onSave} className="min-w-0 space-y-5">
            <div className="flex flex-wrap gap-1 border-b border-line">
              {SECTIONS.map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setSection(tab.key)}
                  className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
                    section === tab.key
                      ? 'border-brand-600 text-brand-700'
                      : 'border-transparent text-muted hover:text-ink'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* ---- Design: CHANGE LAYOUT / CHANGE COLORS ---- */}
            {section === 'design' && (
              <div className="space-y-5">
                <div className="inline-flex rounded-md border border-line-strong p-0.5">
                  {(['layout', 'colors'] as const).map((lt) => (
                    <button
                      key={lt}
                      type="button"
                      onClick={() => setLayoutTab(lt)}
                      className={`rounded px-3 py-1.5 text-xs font-semibold uppercase tracking-wide transition-colors ${
                        layoutTab === lt ? 'bg-brand-600 text-white' : 'text-muted hover:bg-subtle'
                      }`}
                    >
                      {t(`layoutTab.${lt}`)}
                    </button>
                  ))}
                </div>

                {layoutTab === 'layout' && (
                  <div className="space-y-5">
                    <div>
                      <span className="mb-2 block text-xs font-medium text-muted">{t('chooseTemplate')}</span>
                      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                        {TEMPLATES.map((tt) => {
                          const active = tpl.templateId === tt.id;
                          return (
                            <button
                              key={tt.id}
                              type="button"
                              onClick={() => upd('templateId', tt.id)}
                              disabled={!loaded}
                              className={`group rounded-lg border-2 p-2 text-left transition-colors ${
                                active ? 'border-brand-600 bg-brand-50/40' : 'border-line hover:border-line-strong'
                              }`}
                            >
                              <TemplateThumb header={tt.header} table={tt.table} accent={tpl.accentColor} regular={tt.regular} />
                              <div className="mt-1.5 flex items-center justify-between">
                                <span className={`text-xs font-medium ${active ? 'text-brand-700' : 'text-ink'}`}>
                                  {t(`templates.${tt.id}`)}
                                </span>
                                {active && <span className="text-brand-600" aria-hidden>✓</span>}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-8">
                      <div>
                        <span className="mb-1.5 block text-xs font-medium text-muted">{t('format.label')}</span>
                        <div className="inline-flex rounded-md border border-line-strong p-0.5">
                          {(['tax', 'simple'] as const).map((f) => (
                            <button
                              key={f}
                              type="button"
                              onClick={() => upd('format', f)}
                              disabled={!loaded}
                              className={`rounded px-3 py-1.5 text-sm font-medium transition-colors ${
                                tpl.format === f ? 'bg-brand-600 text-white' : 'text-muted hover:bg-subtle'
                              }`}
                            >
                              {t(`format.${f}`)}
                            </button>
                          ))}
                        </div>
                        <p className="mt-1 text-[10px] text-faint">{t(`format.${tpl.format}Hint`)}</p>
                      </div>
                      <div>
                        <span className="mb-1.5 block text-xs font-medium text-muted">{t('paper.label')}</span>
                        <div className="inline-flex rounded-md border border-line-strong p-0.5">
                          {(['A4', 'A5'] as const).map((p) => (
                            <button
                              key={p}
                              type="button"
                              onClick={() => upd('paperSize', p)}
                              disabled={!loaded}
                              className={`rounded px-3 py-1.5 text-sm font-medium transition-colors ${
                                tpl.paperSize === p ? 'bg-brand-600 text-white' : 'text-muted hover:bg-subtle'
                              }`}
                            >
                              {p}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {layoutTab === 'colors' && (
                  <div>
                    <span className="mb-1.5 block text-xs font-medium text-muted">{t('themeColor')}</span>
                    <div className="flex flex-wrap items-center gap-2">
                      {ACCENT_PRESETS.map((hex) => (
                        <button
                          key={hex}
                          type="button"
                          onClick={() => upd('accentColor', hex)}
                          disabled={!loaded}
                          title={hex}
                          className={`h-7 w-7 rounded-full ring-2 ring-offset-2 transition ${
                            tpl.accentColor.toLowerCase() === hex.toLowerCase() ? 'ring-slate-700' : 'ring-transparent hover:ring-slate-300'
                          }`}
                          style={{ background: hex }}
                        />
                      ))}
                      <span className="mx-1 h-5 w-px bg-slate-200" />
                      <input
                        type="color"
                        value={tpl.accentColor}
                        onChange={(e) => upd('accentColor', e.target.value)}
                        disabled={!loaded}
                        className="h-7 w-9 cursor-pointer rounded border border-line-strong"
                        title={t('custom')}
                      />
                      <Input
                        value={tpl.accentColor}
                        onChange={(e) => upd('accentColor', e.target.value)}
                        disabled={!loaded}
                        className="w-28 font-mono"
                      />
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ---- Branding: logo + document title ---- */}
            {section === 'branding' && (
              <div className="flex flex-wrap items-start gap-6">
                <div>
                  <span className="mb-1 block text-xs font-medium text-muted">{t('logo')}</span>
                  <div className="flex items-center gap-3">
                    <div className="flex h-14 w-32 items-center justify-center overflow-hidden rounded border border-dashed border-line-strong bg-subtle">
                      {logo ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={logo} alt="logo" className="max-h-12 max-w-[120px] object-contain" />
                      ) : (
                        <span className="text-[10px] text-faint">{t('logo')}</span>
                      )}
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="cursor-pointer text-xs font-medium text-brand-600 hover:underline">
                        {t('uploadLogo')}
                        <input type="file" accept="image/png,image/jpeg,image/webp" onChange={onLogoFile} className="hidden" />
                      </label>
                      {logo && (
                        <button type="button" onClick={() => setLogo(null)} className="text-left text-xs text-red-500 hover:underline">
                          {t('removeLogo')}
                        </button>
                      )}
                    </div>
                  </div>
                  <p className="mt-1 text-[10px] text-faint">{t('logoHint')}</p>
                </div>
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-muted">{t('docTitle')}</span>
                  <Input
                    value={tpl.title}
                    onChange={(e) => upd('title', e.target.value)}
                    placeholder={t('docTitlePlaceholder')}
                    disabled={!loaded}
                    className="w-56"
                  />
                </label>
              </div>
            )}

            {/* ---- Show on invoice: grouped toggles ---- */}
            {section === 'blocks' && (
              <div className="space-y-4">
                {groupLabel(t('groups.header'))}
                <div className="grid gap-2 sm:grid-cols-2">
                  {toggleRow('showInfoQr', t('showInfoQr'), t('showInfoQrDesc'))}
                  {toggleRow('showBank', t('showBank'), t('showBankDesc'))}
                  {toggleRow('showUpiQr', t('showUpiQr'), t('showUpiQrDesc'))}
                  {toggleRow('showSignature', t('showSignature'), t('showSignatureDesc'))}
                </div>
                {groupLabel(t('groups.items'))}
                <div className="grid gap-2 sm:grid-cols-2">
                  {toggleRow('showHsn', t('showHsn'), t('showHsnDesc'))}
                  {tpl.format === 'tax' && toggleRow('showGstColumns', t('showGstColumns'), t('showGstColumnsDesc'))}
                </div>
                {groupLabel(t('groups.totals'))}
                <div className="grid gap-2 sm:grid-cols-2">
                  {toggleRow('showTotalQty', t('showTotalQty'), t('showTotalQtyDesc'))}
                  {toggleRow('showAmountInWords', t('showAmountInWords'), t('showAmountInWordsDesc'))}
                  {toggleRow('showReceived', t('showReceived'), t('showReceivedDesc'))}
                  {toggleRow('showBalance', t('showBalance'), t('showBalanceDesc'))}
                </div>
                {tpl.showAmountInWords && (
                  <div>
                    <span className="mb-1.5 block text-xs font-medium text-muted">{t('amountWords.label')}</span>
                    <div className="inline-flex rounded-md border border-line-strong p-0.5">
                      {(['indian', 'international'] as const).map((fmt) => (
                        <button
                          key={fmt}
                          type="button"
                          onClick={() => upd('amountWordsFormat', fmt)}
                          disabled={!loaded}
                          className={`rounded px-3 py-1.5 text-sm font-medium transition-colors ${
                            tpl.amountWordsFormat === fmt ? 'bg-brand-600 text-white' : 'text-muted hover:bg-subtle'
                          }`}
                        >
                          {t(`amountWords.${fmt}`)}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ---- Wording ---- */}
            {section === 'wording' && (
              <div className="space-y-4">
                {(docKind === 'estimate' || docKind === 'purchaseEstimate') && (
                  <div className="rounded-md border border-line p-3">
                    <p className="mb-2 text-xs font-semibold text-ink">{t('header.title')}</p>
                    <div className="grid grid-cols-2 gap-2">
                      {(
                        [
                          ['printName', 'header.name'],
                          ['printAddress', 'header.address'],
                          ['printPhone', 'header.phone'],
                          ['printEmail', 'header.email'],
                          ['printGstin', 'header.gstin'],
                        ] as const
                      ).map(([k, label]) => (
                        <label key={k} className="flex items-center gap-2 text-sm text-ink">
                          <input
                            type="checkbox"
                            checked={tpl[k] as boolean}
                            onChange={(e) => upd(k, e.target.checked as never)}
                            disabled={!loaded}
                            className="h-4 w-4 rounded border-line-strong"
                          />
                          {t(label)}
                        </label>
                      ))}
                    </div>
                    {!tpl.printName && (
                      <label className="mt-3 block">
                        <span className="mb-1 block text-xs font-medium text-muted">{t('header.override')}</span>
                        <Input
                          value={tpl.headerNameOverride}
                          onChange={(e) => upd('headerNameOverride', e.target.value)}
                          placeholder={t('header.overridePlaceholder')}
                          disabled={!loaded}
                          className="w-full"
                        />
                      </label>
                    )}
                  </div>
                )}
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-muted">{t('signatureLabel')}</span>
                  <Input
                    value={tpl.signatureLabel}
                    onChange={(e) => upd('signatureLabel', e.target.value)}
                    placeholder={t('signaturePlaceholder')}
                    disabled={!loaded}
                    className="w-72"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-muted">{t('terms')}</span>
                  <textarea
                    value={tpl.terms}
                    onChange={(e) => upd('terms', e.target.value)}
                    rows={3}
                    disabled={!loaded}
                    className="w-full rounded border border-line-strong px-3 py-2 text-sm focus:border-brand-600 focus:outline-none"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-muted">{t('footer')}</span>
                  <Input value={tpl.footerText} onChange={(e) => upd('footerText', e.target.value)} disabled={!loaded} className="w-full" />
                </label>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-3 border-t border-line pt-4">
              <Button type="submit" disabled={busy || !loaded}>
                {busy ? '…' : t('save')}
              </Button>
              <Button type="button" variant="secondary" onClick={onPreview} disabled={!loaded}>
                {t('openInNewTab')}
              </Button>
              <ErrorText>{error}</ErrorText>
            </div>
          </form>

          {/* RIGHT — inline live preview */}
          <div className="lg:sticky lg:top-4 lg:self-start">
            <div className="mb-1 flex items-center justify-between">
              <span className="text-xs font-medium text-muted">{t('livePreview')}</span>
              {previewBusy && <span className="text-[10px] text-faint">{t('updating')}</span>}
            </div>
            {previewUrl ? (
              <iframe
                title={t('livePreview')}
                src={`${previewUrl}#toolbar=0&navpanes=0`}
                className="h-[70vh] w-full rounded-lg border border-line bg-surface shadow-inner"
              />
            ) : (
              <div className="flex h-[70vh] items-center justify-center rounded-lg border border-dashed border-line text-xs text-faint">
                {t('preparingPreview')}
              </div>
            )}
          </div>
        </div>
      ) : (
        /* ---- THERMAL printer ---- */
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,320px)]">
          <form onSubmit={onSave} className="min-w-0 space-y-5">
            <p className="text-xs text-muted">{t('thermal.body')}</p>
          <div>
            <span className="mb-1.5 block text-xs font-medium text-muted">{t('thermal.width')}</span>
            <div className="inline-flex rounded-md border border-line-strong p-0.5">
              {(['2in', '3in', '4in'] as const).map((w) => (
                <button
                  key={w}
                  type="button"
                  onClick={() => upd('thermalWidth', w)}
                  disabled={!loaded}
                  className={`rounded px-3 py-1.5 text-sm font-medium transition-colors ${
                    tpl.thermalWidth === w ? 'bg-brand-600 text-white' : 'text-muted hover:bg-subtle'
                  }`}
                >
                  {t(`thermal.${w}`)}
                </button>
              ))}
            </div>
          </div>
          {groupLabel(t('groups.header'))}
          <div className="grid gap-2 sm:grid-cols-2">
            {toggleRow('showBank', t('showBank'), t('showBankDesc'))}
            {toggleRow('showUpiQr', t('showUpiQr'), t('showUpiQrDesc'))}
            {toggleRow('showTotalQty', t('showTotalQty'), t('showTotalQtyDesc'))}
          </div>
            <div className="flex items-center gap-3 border-t border-line pt-4">
              <Button type="submit" disabled={busy || !loaded}>
                {busy ? '…' : t('save')}
              </Button>
              <ErrorText>{error}</ErrorText>
            </div>
          </form>

          {/* Thermal live preview (narrow receipt) */}
          <div className="lg:sticky lg:top-4 lg:self-start">
            <div className="mb-1 flex items-center justify-between">
              <span className="text-xs font-medium text-muted">{t('livePreview')}</span>
              {previewBusy && <span className="text-[10px] text-faint">{t('updating')}</span>}
            </div>
            {previewUrl ? (
              <iframe
                title={t('livePreview')}
                src={`${previewUrl}#toolbar=0&navpanes=0`}
                className="mx-auto h-[70vh] w-[260px] rounded-lg border border-line bg-surface shadow-inner"
              />
            ) : (
              <div className="flex h-[70vh] items-center justify-center rounded-lg border border-dashed border-line text-xs text-faint">
                {t('preparingPreview')}
              </div>
            )}
            <p className="mt-1 text-center text-[10px] text-faint">{t('thermal.previewNote')}</p>
          </div>
        </div>
      )}
    </Card>
  );
}
