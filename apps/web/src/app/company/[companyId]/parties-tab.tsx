'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { INDIAN_STATES, stateCodeForName } from '@bookly/shared';
import { EmptyState, Pagination, SearchInput, useTable } from '@/components/table';
import { useFeedback } from '@/components/feedback';
import { Badge, Button, Card, Combobox, ErrorText, HelpTip, Input, Label, Select } from '@/components/ui';
import {
  fetchEstimates,
  fetchParty,
  fetchPartyStatement,
  inr,
  resolveGstin,
  type LedgerRow,
  type PartyRow,
  type PartyStatement,
} from '@/lib/accounting';
import { api, ApiError } from '@/lib/api';

interface PartyDraft {
  id?: string;
  type: 'CUSTOMER' | 'VENDOR';
  name: string;
  aliasName: string;
  gstin: string;
  state: string;
  phone: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  pincode: string;
  opening: string;
  /** '' = inherit company default; else the per-party tracked doc type. */
  balanceDocType: '' | 'invoice' | 'estimate' | 'purchase' | 'purchaseEstimate';
  image: string | null;
}

const EMPTY_DRAFT: PartyDraft = {
  type: 'CUSTOMER',
  name: '',
  aliasName: '',
  gstin: '',
  state: '',
  phone: '',
  addressLine1: '',
  addressLine2: '',
  city: '',
  pincode: '',
  opening: '',
  balanceDocType: '',
  image: null,
};

const IMAGE_MAX = 250 * 1024;

export function PartiesTab({
  companyId,
  parties,
  ledgers,
  canManage,
  onChanged,
}: {
  companyId: string;
  parties: PartyRow[];
  ledgers: LedgerRow[];
  canManage: boolean;
  onChanged: () => Promise<void>;
}) {
  const t = useTranslations('parties');
  const tc = useTranslations('common');
  const table = useTable(
    parties,
    (p) => `${p.name} ${p.gstin ?? ''} ${p.city ?? ''} ${p.type}`,
  );

  const cashBankLedgers = useMemo(
    () => ledgers.filter((l) => ['Cash-in-Hand', 'Bank Accounts'].includes(l.group.name)),
    [ledgers],
  );

  const [draft, setDraft] = useState<PartyDraft | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const editing = Boolean(draft?.id);
  const { toast } = useFeedback();

  /** Fetch GSTIN details from the government portal and auto-fill the form. */
  async function verifyGstin() {
    if (!draft || draft.gstin.length !== 15) return;
    setVerifying(true);
    try {
      const info = await resolveGstin(companyId, draft.gstin);
      const patch: Partial<PartyDraft> = {};
      // The user clicked Verify, so always fill the name from the portal —
      // prefer the trade name, fall back to the legal name.
      const fetchedName = info.tradeName || info.legalName;
      if (fetchedName) patch.name = fetchedName;
      if (info.address) {
        if (info.address.building) patch.addressLine1 = info.address.building;
        if (info.address.street) patch.addressLine2 = info.address.street;
        if (info.address.city) patch.city = info.address.city;
        if (info.address.pincode) patch.pincode = info.address.pincode;
        if (info.address.state) {
          const match = INDIAN_STATES.find(
            (s) => s.name.toLowerCase() === info.address!.state.toLowerCase(),
          );
          if (match) patch.state = match.name;
        }
      }
      setDraft((d) => (d ? { ...d, ...patch } : d));
      toast(`Verified: ${info.tradeName || info.legalName} (${info.status})`);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'GSTIN verification failed');
    } finally {
      setVerifying(false);
    }
  }

  // Party-to-party balance transfer
  const [showTransfer, setShowTransfer] = useState(false);
  const [xfFrom, setXfFrom] = useState('');
  const [xfTo, setXfTo] = useState('');
  const [xfAmount, setXfAmount] = useState('');
  const [xfDate, setXfDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [xfNotes, setXfNotes] = useState('');
  const [xfBusy, setXfBusy] = useState(false);
  const [xfError, setXfError] = useState('');

  async function onTransfer(e: React.FormEvent) {
    e.preventDefault();
    setXfError('');
    if (xfFrom === xfTo) {
      setXfError(t('transfer.samePartyError'));
      return;
    }
    setXfBusy(true);
    try {
      await api.post(`/companies/${companyId}/party-transfers`, {
        fromPartyId: xfFrom,
        toPartyId: xfTo,
        amount: Number(xfAmount),
        date: xfDate,
        notes: xfNotes || undefined,
      });
      setXfFrom('');
      setXfTo('');
      setXfAmount('');
      setXfNotes('');
      setShowTransfer(false);
      await onChanged();
      toast(t('transfer.done'));
    } catch (err) {
      setXfError(err instanceof ApiError ? err.message : tc('somethingWentWrong'));
    } finally {
      setXfBusy(false);
    }
  }

  async function startEdit(party: PartyRow) {
    setError('');
    // Open immediately with what we have; the heavy base64 image is loaded next.
    setDraft({
      id: party.id,
      type: party.type,
      name: party.name,
      aliasName: party.aliasName ?? '',
      gstin: party.gstin ?? '',
      state: party.state ?? '',
      phone: party.phone ?? '',
      addressLine1: party.addressLine1 ?? '',
      addressLine2: party.addressLine2 ?? '',
      city: party.city ?? '',
      pincode: party.pincode ?? '',
      opening: '',
      balanceDocType: party.balanceDocType ?? '',
      image: null,
    });
    try {
      const full = await fetchParty(companyId, party.id);
      setDraft((d) =>
        d && d.id === party.id
          ? {
              ...d,
              image: full.image,
              addressLine1: full.addressLine1 ?? d.addressLine1,
              addressLine2: full.addressLine2 ?? d.addressLine2,
              pincode: full.pincode ?? d.pincode,
            }
          : d,
      );
    } catch {
      /* image is optional — ignore load failures */
    }
  }

  function onImageFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !draft) return;
    if (!/^image\/(png|jpe?g|webp)$/.test(file.type)) {
      setError(t('image.badType'));
      return;
    }
    if (file.size > IMAGE_MAX) {
      setError(t('image.tooBig'));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setDraft((d) => (d ? { ...d, image: reader.result as string } : d));
    reader.readAsDataURL(file);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!draft) return;
    setError('');
    setBusy(true);
    try {
      const common = {
        name: draft.name,
        aliasName: draft.aliasName || undefined,
        gstin: draft.gstin || undefined,
        state: draft.state || undefined,
        phone: draft.phone || undefined,
        addressLine1: draft.addressLine1 || undefined,
        addressLine2: draft.addressLine2 || undefined,
        city: draft.city || undefined,
        pincode: draft.pincode || undefined,
        // null clears the override → inherit the company default.
        balanceDocType: null,
      };
      if (draft.id) {
        await api.patch(`/companies/${companyId}/parties/${draft.id}`, {
          ...common,
          image: draft.image,
        });
      } else {
        await api.post(`/companies/${companyId}/parties`, {
          type: draft.type,
          ...common,
          image: draft.image || undefined,
          openingBalance: draft.opening ? Number(draft.opening) : undefined,
        });
      }
      const savedToast = editing ? t('toastUpdated') : t('toastCreated');
      setDraft(null);
      await onChanged();
      toast(savedToast);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : tc('somethingWentWrong'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SearchInput
          value={table.query}
          onChange={table.setQuery}
          placeholder={t('searchPlaceholder')}
        />
        {canManage && (
          <div className="flex gap-2">
            <Button
              variant="secondary"
              onClick={() => {
                setXfError('');
                setShowTransfer((s) => !s);
              }}
            >
              {showTransfer ? tc('close') : t('transfer.button')}
            </Button>
            <Button
              variant={draft && !editing ? 'secondary' : 'primary'}
              onClick={() => {
                setError('');
                setDraft(draft && !editing ? null : { ...EMPTY_DRAFT });
              }}
            >
              {draft && !editing ? tc('close') : t('newParty')}
            </Button>
          </div>
        )}
      </div>

      {showTransfer && canManage && (
        <Card title={t('transfer.title')} action={<HelpTip text={t('transfer.hint')} />}>
          <form onSubmit={onTransfer} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <Label>{t('transfer.from')}</Label>
                <Combobox
                  value={xfFrom}
                  onChange={setXfFrom}
                  placeholder={t('transfer.selectParty')}
                  searchPlaceholder={tc('search')}
                  options={parties.map((p) => ({
                    value: p.id,
                    label: `${p.name} (${p.type === 'CUSTOMER' ? tc('customer') : tc('vendor')})`,
                  }))}
                />
              </div>
              <div>
                <Label>{t('transfer.to')}</Label>
                <Combobox
                  value={xfTo}
                  onChange={setXfTo}
                  placeholder={t('transfer.selectParty')}
                  searchPlaceholder={tc('search')}
                  options={parties.map((p) => ({
                    value: p.id,
                    label: `${p.name} (${p.type === 'CUSTOMER' ? tc('customer') : tc('vendor')})`,
                  }))}
                />
              </div>
              <div>
                <Label>{t('transfer.amount')}</Label>
                <Input type="number" step="0.01" min="0.01" required value={xfAmount} onChange={(e) => setXfAmount(e.target.value)} placeholder="0.00" />
              </div>
              <div>
                <Label>{tc('date')}</Label>
                <Input type="date" required value={xfDate} onChange={(e) => setXfDate(e.target.value)} />
              </div>
            </div>
            <div>
              <Label>{t('transfer.notes')}</Label>
              <Input value={xfNotes} onChange={(e) => setXfNotes(e.target.value)} />
            </div>
            <p className="text-xs text-muted">{t('transfer.explainer')}</p>
            <div className="flex items-center gap-3">
              <Button type="submit" disabled={xfBusy || !xfFrom || !xfTo}>
                {xfBusy ? tc('saving') : t('transfer.submit')}
              </Button>
              <ErrorText>{xfError}</ErrorText>
            </div>
          </form>
        </Card>
      )}

      {draft && (
        <Card title={editing ? t('editTitle', { name: draft.name || t('partyFallback') }) : t('newPartyTitle')}>
          <form onSubmit={onSubmit} className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {!editing && (
              <div>
                <Label>{tc('type')}</Label>
                <Select
                  value={draft.type}
                  onChange={(e) =>
                    setDraft({ ...draft, type: e.target.value as PartyDraft['type'] })
                  }
                >
                  <option value="CUSTOMER">{t('type.CUSTOMER')}</option>
                  <option value="VENDOR">{t('type.VENDOR')}</option>
                </Select>
              </div>
            )}
            <div className="sm:col-span-2">
              <Label>{tc('name')}</Label>
              <Input
                required
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              />
            </div>
            <div>
              <Label>{t('aliasOptional')}</Label>
              <Input
                value={draft.aliasName}
                onChange={(e) => setDraft({ ...draft, aliasName: e.target.value })}
              />
            </div>
            <div>
              <Label>{t('gstinOptional')} <HelpTip text={t('gstinHelp')} /></Label>
              <div className="flex gap-2">
                <Input
                  className="flex-1"
                  value={draft.gstin}
                  maxLength={15}
                  onChange={(e) => setDraft({ ...draft, gstin: e.target.value.toUpperCase() })}
                  placeholder="33AABCL4567C1ZD"
                />
                {draft.gstin.length === 15 && (
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={verifying}
                    onClick={verifyGstin}
                    className="shrink-0 text-xs"
                  >
                    {verifying ? '…' : 'Verify'}
                  </Button>
                )}
              </div>
            </div>
            <div>
              <Label>{t('phoneOptional')}</Label>
              <Input
                value={draft.phone}
                onChange={(e) => setDraft({ ...draft, phone: e.target.value })}
              />
            </div>
            <div>
              <Label>{t('stateLabel')}</Label>
              <Select
                value={draft.state}
                onChange={(e) => setDraft({ ...draft, state: e.target.value })}
              >
                <option value="">{t('selectState')}</option>
                {INDIAN_STATES.map((s) => (
                  <option key={s.code} value={s.name}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>{tc('stateCode')}</Label>
              <Input
                readOnly
                className="bg-subtle text-muted"
                value={draft.state ? stateCodeForName(draft.state) ?? '' : ''}
                placeholder="—"
              />
            </div>
            <div className="sm:col-span-2">
              <Label>{t('addressLine1')}</Label>
              <Input
                value={draft.addressLine1}
                onChange={(e) => setDraft({ ...draft, addressLine1: e.target.value })}
              />
            </div>
            <div className="sm:col-span-2">
              <Label>{t('addressLine2')}</Label>
              <Input
                value={draft.addressLine2}
                onChange={(e) => setDraft({ ...draft, addressLine2: e.target.value })}
              />
            </div>
            <div>
              <Label>{t('cityOptional')}</Label>
              <Input
                value={draft.city}
                onChange={(e) => setDraft({ ...draft, city: e.target.value })}
              />
            </div>
            <div>
              <Label>{t('pincodeOptional')}</Label>
              <Input
                value={draft.pincode}
                maxLength={6}
                onChange={(e) =>
                  setDraft({ ...draft, pincode: e.target.value.replace(/\D/g, '') })
                }
              />
            </div>
            {!editing && (
              <div>
                <Label>{t('openingBalance')} <HelpTip text={t('openingHelp')} /></Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={draft.opening}
                  onChange={(e) => setDraft({ ...draft, opening: e.target.value })}
                  placeholder="0.00"
                />
                <p className="mt-1 text-[11px] text-faint">
                  {t('openingHint')}
                </p>
              </div>
            )}



            {/* Photo / logo */}
            <div className="sm:col-span-3">
              <Label>{t('image.label')}</Label>
              <div className="flex items-center gap-3">
                {draft.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={draft.image}
                    alt=""
                    className="h-14 w-14 rounded-md border border-line object-cover"
                  />
                ) : (
                  <div className="flex h-14 w-14 items-center justify-center rounded-md border border-dashed border-line-strong text-[10px] text-faint">
                    {t('image.none')}
                  </div>
                )}
                <label className="cursor-pointer rounded-md border border-line-strong px-3 py-1.5 text-xs font-medium text-muted hover:bg-subtle">
                  {t('image.choose')}
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    onChange={onImageFile}
                    className="hidden"
                  />
                </label>
                {draft.image && (
                  <button
                    type="button"
                    onClick={() => setDraft({ ...draft, image: null })}
                    className="text-xs font-medium text-red-500 hover:underline"
                  >
                    {t('image.remove')}
                  </button>
                )}
                <span className="text-[11px] text-faint">{t('image.hint')}</span>
              </div>
            </div>

            <div className="flex items-end gap-3 sm:col-span-3">
              <Button type="submit" disabled={busy}>
                {busy ? tc('saving') : editing ? t('saveChanges') : t('saveParty')}
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
        {parties.length === 0 ? (
          <EmptyState
            title={t('emptyTitle')}
            body={t('emptyBody')}
            action={
              canManage && (
                <Button onClick={() => setDraft({ ...EMPTY_DRAFT })}>{t('addParty')}</Button>
              )
            }
          />
        ) : (
          <>
            <div className="overflow-x-auto"><table className="w-full min-w-[600px] text-sm">
              <thead>
                <tr className="border-b border-line bg-subtle text-left text-[11px] font-semibold uppercase tracking-wide text-muted">
                  <th className="py-2">{tc('name')}</th>
                  <th className="py-2">{tc('type')}</th>
                  <th className="py-2">{t('gstin')}</th>
                  <th className="py-2">{t('city')}</th>
                  <th className="py-2 text-right">{t('outstanding')}</th>
                  {canManage && <th className="py-2 text-right">{tc('actions')}</th>}
                </tr>
              </thead>
              <tbody>
                {table.rows.map((p) => (
                  <PartyRowItem
                    key={p.id}
                    companyId={companyId}
                    party={p}
                    cashBankLedgers={cashBankLedgers}
                    canManage={canManage}
                    onEdit={() => void startEdit(p)}
                    onChanged={onChanged}
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

interface AdvanceOption {
  id: string;
  label: string;
  kind: 'estimate' | 'po' | 'pe';
}

function PartyRowItem({
  companyId,
  party,
  cashBankLedgers,
  canManage,
  onEdit,
  onChanged,
}: {
  companyId: string;
  party: PartyRow;
  cashBankLedgers: LedgerRow[];
  canManage: boolean;
  onEdit: () => void;
  onChanged: () => Promise<void>;
}) {
  const t = useTranslations('parties');
  const tc = useTranslations('common');
  const router = useRouter();
  const { toast } = useFeedback();
  const isCustomer = party.type === 'CUSTOMER';

  // Open the dedicated Payment In/Out page with this party pre-selected.
  const openPaymentPage = () =>
    router.push(
      `/company/${companyId}?tab=payment-${isCustomer ? 'in' : 'out'}&party=${party.id}`,
    );

  const [showPay, setShowPay] = useState(false);
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [ledgerId, setLedgerId] = useState(cashBankLedgers[0]?.id ?? '');
  const [reference, setReference] = useState('');
  const [advanceId, setAdvanceId] = useState('');
  const [advanceOpts, setAdvanceOpts] = useState<AdvanceOption[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [showStmt, setShowStmt] = useState(false);
  const [stmt, setStmt] = useState<PartyStatement | null>(null);
  const [stmtLoading, setStmtLoading] = useState(false);

  async function toggleStmt() {
    if (showStmt) { setShowStmt(false); return; }
    setShowStmt(true);
    if (!stmt) {
      setStmtLoading(true);
      try {
        setStmt(await fetchPartyStatement(companyId, party.id));
      } catch {
        /* surfaced as empty */
      } finally {
        setStmtLoading(false);
      }
    }
  }

  function openPay() {
    setShowPay((s) => !s);
    if (advanceOpts !== null) return;
    // Lazy-load this party's open documents to offer as advance links.
    if (isCustomer) {
      fetchEstimates(companyId)
        .then((rows) =>
          setAdvanceOpts(
            rows
              .filter((e) => e.party.id === party.id && e.status === 'OPEN')
              .map((e) => ({ id: e.id, label: e.estimateNo, kind: 'estimate' as const })),
          ),
        )
        .catch(() => setAdvanceOpts([]));
    } else {
      // Vendors have no advance-linkable document in this build (no purchase
      // orders / vendor quotations) — payments to them settle purchase bills.
      setAdvanceOpts([]);
    }
  }

  async function onRecord(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await api.post(`/companies/${companyId}/parties/${party.id}/payments`, {
        amount: Number(amount),
        date,
        ledgerId,
        reference: reference || undefined,
        ...(() => {
          if (!advanceId) return {};
          const sel = advanceOpts?.find((o) => o.id === advanceId);
          if (sel?.kind === 'po') return { purchaseOrderId: advanceId };
          if (sel?.kind === 'pe') return { purchaseEstimateId: advanceId };
          return { estimateId: advanceId };
        })(),
      });
      setShowPay(false);
      setAmount('');
      setReference('');
      setAdvanceId('');
      await onChanged();
      toast(t('pay.recorded'));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : tc('somethingWentWrong'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <tr className="border-b border-line last:border-0 hover:bg-subtle">
        <td className="py-2.5 font-medium">{party.name}</td>
        <td className="py-2.5">
          <Badge tone={party.type === 'CUSTOMER' ? 'good' : 'warn'}>{t(`type.${party.type}`)}</Badge>
        </td>
        <td className="py-2.5 font-mono text-xs text-muted">{party.gstin ?? '—'}</td>
        <td className="py-2.5 text-muted">{party.city ?? '—'}</td>
        <td className="py-2.5 text-right tabular-nums">
          <div>₹{inr(party.outstanding)}</div>
          <div className="text-[10px] font-medium uppercase tracking-wide text-faint">
            {t(`balanceDocType.${party.docType}`)}
          </div>
        </td>
        {canManage && (
          <td className="py-2.5 text-right whitespace-nowrap">
            <button
              onClick={openPaymentPage}
              className="mr-3 text-xs font-medium text-emerald-600 hover:underline"
            >
              {isCustomer ? t('pay.receive') : t('pay.pay')}
            </button>
            {cashBankLedgers.length > 0 && (
              <button
                onClick={openPay}
                className="mr-3 text-xs font-medium text-muted hover:underline"
              >
                {showPay ? tc('close') : t('pay.quick')}
              </button>
            )}
            <button
              onClick={toggleStmt}
              className="mr-3 text-xs font-medium text-muted hover:underline"
            >
              {showStmt ? tc('close') : t('statement.action')}
            </button>
            <button
              onClick={onEdit}
              className="text-xs font-medium text-brand-600 hover:underline"
            >
              {tc('edit')}
            </button>
          </td>
        )}
      </tr>
      {showStmt && (
        <tr>
          <td colSpan={6} className="bg-subtle px-3 py-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted">
                {t('statement.title')} · {t(`balanceDocType.${party.docType}`)}
              </span>
              <span className="text-sm font-semibold text-ink">
                {t('statement.outstanding')}: ₹{inr(stmt?.outstanding ?? party.outstanding)}
              </span>
            </div>
            {stmtLoading ? (
              <p className="text-sm text-faint">{tc('loading')}</p>
            ) : !stmt || stmt.documents.length === 0 ? (
              <p className="text-sm text-faint">{t('statement.empty')}</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] font-semibold uppercase tracking-wide text-faint">
                    <th className="py-1">{t('statement.doc')}</th>
                    <th className="py-1">{tc('date')}</th>
                    <th className="py-1 text-right">{tc('total')}</th>
                    <th className="py-1 text-right">{t('statement.paid')}</th>
                    <th className="py-1 text-right">{t('outstanding')}</th>
                  </tr>
                </thead>
                <tbody>
                  {stmt.documents.map((d) => (
                    <tr key={d.id} className="border-t border-line">
                      <td className="py-1.5 font-mono text-xs">{d.no}</td>
                      <td className="py-1.5 text-muted">{new Date(d.date).toLocaleDateString('en-IN')}</td>
                      <td className="py-1.5 text-right tabular-nums">₹{inr(d.total)}</td>
                      <td className="py-1.5 text-right tabular-nums text-emerald-600">₹{inr(d.paid)}</td>
                      <td className="py-1.5 text-right tabular-nums font-medium">₹{inr(d.outstanding)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </td>
        </tr>
      )}
      {showPay && canManage && (
        <tr>
          <td colSpan={6} className="bg-subtle px-3 py-3">
            <form onSubmit={onRecord} className="flex flex-wrap items-end gap-2">
              <label className="text-xs text-muted">
                <span className="mb-1 block font-medium">{t('pay.amount')}</span>
                <Input
                  type="number"
                  step="0.01"
                  min="0.01"
                  required
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-32"
                />
              </label>
              <label className="text-xs text-muted">
                <span className="mb-1 block font-medium">{tc('date')}</span>
                <Input type="date" required value={date} onChange={(e) => setDate(e.target.value)} className="w-40" />
              </label>
              <label className="text-xs text-muted">
                <span className="mb-1 block font-medium">{t('pay.ledger')}</span>
                <Select value={ledgerId} onChange={(e) => setLedgerId(e.target.value)} className="w-40">
                  {cashBankLedgers.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                </Select>
              </label>
              <label className="text-xs text-muted">
                <span className="mb-1 block font-medium">{t('pay.reference')}</span>
                <Input value={reference} onChange={(e) => setReference(e.target.value)} className="w-40" />
              </label>
              {advanceOpts && advanceOpts.length > 0 && (
                <label className="text-xs text-muted">
                  <span className="mb-1 block font-medium">{t('pay.advanceAgainst')}</span>
                  <Select value={advanceId} onChange={(e) => setAdvanceId(e.target.value)} className="w-44">
                    <option value="">{t('pay.noAdvance')}</option>
                    {advanceOpts.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.label}
                      </option>
                    ))}
                  </Select>
                </label>
              )}
              <Button type="submit" disabled={busy || !ledgerId}>
                {busy ? '…' : t('pay.submit')}
              </Button>
              <ErrorText>{error}</ErrorText>
            </form>
          </td>
        </tr>
      )}
    </>
  );
}
