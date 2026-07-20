'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useFeedback } from '@/components/feedback';
import { AddItemModal } from '@/components/item-form-modal';
import { AddPartyModal } from '@/components/party-form-modal';
import { Button, Combobox, ErrorText, Input, Label, Select } from '@/components/ui';
import {
  fetchBanks,
  fetchBranches,
  fetchItemBatches,
  fetchItems,
  fetchLedgers,
  fetchParties,
  GST_RATES,
  inr,
  type BankAccountRow,
  type BatchStock,
  type BranchRow,
  type ItemRow,
  type LedgerRow,
  type PartyRow,
} from '@/lib/accounting';
import { api, ApiError, isAuthenticated, printFile } from '@/lib/api';
import { INDIAN_STATES } from '@bookly/shared';



/**
 * Which document this full-screen entry page builds. The four sales-side
 * documents share the same party + line-item + totals layout; only the
 * secondary date field, the tax toggle and the API path differ.
 */
export type DocEntryKind =
  | 'invoice'
  | 'estimate'
  | 'salesOrder'
  | 'deliveryChallan'
  | 'proformaInvoice'
  | 'purchaseEstimate'
  | 'purchaseOrder'
  | 'purchaseBill';

export interface DocEntryConfig {
  kind: DocEntryKind;
  /** REST path segment, e.g. 'invoices', 'estimates', 'sales-orders'. */
  apiBase: string;
  /** Tab key to return to on the company page after save/cancel. */
  tab: string;
  /** Whose party this document lists. Defaults to 'customer'. */
  party?: 'customer' | 'vendor';
  /** Optional secondary date field. */
  secondDate?: 'validUntil' | 'expectedDate';
  /** Delivery challan carries a vehicle number. */
  vehicle?: boolean;
  /** Estimate/purchase-estimate: GST is optional, controlled by a toggle. */
  taxToggle?: boolean;
  /** Purchase order: no GST at all (logistics document). */
  noTax?: boolean;
  /** Purchase bill: a supplier's own bill number. */
  supplierBillNo?: boolean;
  /** Purchase bill: prefill a new form from an AI-scanned draft in sessionStorage. */
  aiScanDraft?: boolean;
  /** Freight & other (non-taxed, post-tax) charges in the totals. */
  extraCharges?: boolean;
  /** Invoice: a Credit/Cash toggle (Cash auto-records full payment on save). */
  creditCash?: boolean;
  /** Invoice: a per-document bank picker (which bank prints). */
  bankPicker?: boolean;
  /** A "State of supply" dropdown (overrides placeOfSupply). */
  stateOfSupply?: boolean;
  /** Invoice: loyalty redemption. */
  loyalty?: boolean;
  /** Sales batch picking (pick existing) — invoices. */
  batches?: boolean;
  /** Purchase batch entry (enter new batch + expiry) — purchase bills. */
  purchaseBatch?: boolean;
}

interface DraftLine {
  itemId: string;
  description: string;
  quantity: string;
  rate: string;
  discountPct: string;
  gstRate: string;
  batchNo: string;
  expiryDate: string;
}

const EMPTY: DraftLine = {
  itemId: '',
  description: '',
  quantity: '1',
  rate: '0',
  discountPct: '0',
  gstRate: '0',
  batchNo: '',
  expiryDate: '',
};

interface ExistingDoc {
  party: { id: string };
  branch: { id: string } | null;
  date: string;
  validUntil?: string | null;
  expectedDate?: string | null;
  vehicleNo?: string | null;
  supplierBillNo?: string | null;
  freightCharges?: number;
  otherCharges?: number;
  placeOfSupply?: string | null;
  bankAccountId?: string | null;
  notes?: string | null;
  lines: {
    itemId?: string | null;
    description: string;
    quantity: number;
    rate: number;
    discountPct?: number;
    gstRate: number;
  }[];
}

export function DocEntryForm({
  companyId,
  config,
  editId,
}: {
  companyId: string;
  config: DocEntryConfig;
  editId?: string;
}) {
  const t = useTranslations('docEntry');
  const tc = useTranslations('common');
  const router = useRouter();
  const { toast } = useFeedback();

  const docName = t(`doc.${config.kind}`);
  const returnHref = `/company/${companyId}?tab=${config.tab}`;
  const partyType = config.party === 'vendor' ? 'VENDOR' : 'CUSTOMER';

  // ---- Loaded reference data ----
  const [customers, setCustomers] = useState<PartyRow[]>([]);
  const [items, setItems] = useState<ItemRow[]>([]);
  const [branches, setBranches] = useState<BranchRow[]>([]);
  const [loyaltyCfg, setLoyaltyCfg] = useState({ enabled: false, redeemValue: 1 });
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState('');

  // ---- Form state ----
  const [partyId, setPartyId] = useState('');
  const [branchId, setBranchId] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [secondDate, setSecondDate] = useState('');
  const [vehicleNo, setVehicleNo] = useState('');
  const [supplierBillNo, setSupplierBillNo] = useState('');
  const [notes, setNotes] = useState('');
  const [showDescr, setShowDescr] = useState(false);
  const [freight, setFreight] = useState('');
  const [otherCharges, setOtherCharges] = useState('');
  const [applyTax, setApplyTax] = useState(true);
  const [cashSale, setCashSale] = useState(false);
  const [placeOfSupply, setPlaceOfSupply] = useState('');
  const [bankAccountId, setBankAccountId] = useState('');
  const [banks, setBanks] = useState<BankAccountRow[]>([]);
  const [cashBankLedgers, setCashBankLedgers] = useState<LedgerRow[]>([]);
  const [lines, setLines] = useState<DraftLine[]>([{ ...EMPTY }]);
  const [redeemPoints, setRedeemPoints] = useState('');
  const [batchOptions, setBatchOptions] = useState<Record<string, BatchStock[]>>({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  // Inline "add new" popups: party + item (item add targets a specific line).
  const [showAddParty, setShowAddParty] = useState(false);
  const [addItemForLine, setAddItemForLine] = useState<number | null>(null);

  const loadBatches = useCallback(
    (itemId: string) => {
      setBatchOptions((prev) => {
        if (prev[itemId]) return prev;
        fetchItemBatches(companyId, itemId)
          .then((b) => setBatchOptions((p) => ({ ...p, [itemId]: b })))
          .catch(() => {});
        return prev;
      });
    },
    [companyId],
  );

  // Bootstrap: auth, reference data, and (when editing) the existing document.
  useEffect(() => {
    if (!isAuthenticated()) {
      router.push('/login');
      return;
    }
    let alive = true;
    (async () => {
      try {
        const [parties, itemList, branchList] = await Promise.all([
          fetchParties(companyId),
          fetchItems(companyId),
          fetchBranches(companyId).catch(() => [] as BranchRow[]),
        ]);
        if (!alive) return;
        setCustomers(parties.filter((p) => p.type === partyType));
        setItems(itemList);
        setBranches(branchList);

        if (config.bankPicker) {
          await fetchBanks(companyId)
            .then((bs) => {
              if (!alive) return;
              setBanks(bs);
              const def = bs.find((b) => b.isDefault) ?? bs[0];
              if (def && !editId) setBankAccountId(def.id);
            })
            .catch(() => {});
        }
        if (config.creditCash) {
          await fetchLedgers(companyId)
            .then((ls) => {
              if (alive)
                setCashBankLedgers(
                  ls.filter((l) => ['Cash-in-Hand', 'Bank Accounts'].includes(l.group.name)),
                );
            })
            .catch(() => {});
        }

        if (config.loyalty) {
          await api
            .get<{ loyaltyEnabled: boolean; loyaltyRedeemValue: number | string }>(
              `/companies/${companyId}`,
            )
            .then((c) => {
              if (alive)
                setLoyaltyCfg({
                  enabled: c.loyaltyEnabled,
                  redeemValue: Number(c.loyaltyRedeemValue) || 1,
                });
            })
            .catch(() => {});
        }

        // AI-scanned bill: prefill a NEW form from the draft stashed by the tab.
        if (config.aiScanDraft && !editId && typeof window !== 'undefined') {
          const key = `purchase-bill-draft:${companyId}`;
          const raw = window.sessionStorage.getItem(key);
          if (raw) {
            window.sessionStorage.removeItem(key);
            try {
              const d = JSON.parse(raw) as {
                vendor?: { partyId?: string | null };
                supplierBillNo?: string;
                date?: string;
                lines?: {
                  itemId?: string | null;
                  description?: string;
                  quantity?: number;
                  rate?: number;
                  gstRate?: number | null;
                }[];
              };
              if (d.vendor?.partyId && parties.some((p) => p.id === d.vendor!.partyId))
                setPartyId(d.vendor.partyId);
              if (d.supplierBillNo) setSupplierBillNo(d.supplierBillNo);
              if (d.date) setDate(d.date.slice(0, 10));
              if (Array.isArray(d.lines) && d.lines.length > 0) {
                setLines(
                  d.lines.map((l) => ({
                    itemId: l.itemId ?? '',
                    description: l.itemId ? '' : l.description ?? '',
                    quantity: l.quantity != null ? String(l.quantity) : '1',
                    rate: l.rate != null ? String(l.rate) : '',
                    discountPct: '0',
                    gstRate: l.gstRate != null ? String(l.gstRate) : '0',
                    batchNo: '',
                    expiryDate: '',
                  })),
                );
              }
            } catch {
              /* malformed draft — start blank */
            }
          }
        }

        if (editId) {
          const doc = await api.get<ExistingDoc>(
            `/companies/${companyId}/${config.apiBase}/${editId}`,
          );
          if (!alive) return;
          setPartyId(doc.party.id);
          setBranchId(doc.branch?.id ?? '');
          setDate(doc.date.slice(0, 10));
          if (config.secondDate === 'validUntil')
            setSecondDate(doc.validUntil ? doc.validUntil.slice(0, 10) : '');
          if (config.secondDate === 'expectedDate')
            setSecondDate(doc.expectedDate ? doc.expectedDate.slice(0, 10) : '');
          if (config.vehicle) setVehicleNo(doc.vehicleNo ?? '');
          if (config.supplierBillNo) setSupplierBillNo(doc.supplierBillNo ?? '');
          {
            // Terms now live in Print Settings; keep only the per-document note.
            // Older docs may have folded terms into notes — strip that marker.
            const saved = doc.notes ?? '';
            const marker = '\n\nTerms & Conditions:\n';
            const at = saved.indexOf(marker);
            const descr = at >= 0 ? saved.slice(0, at) : saved;
            setNotes(descr);
            setShowDescr(!!descr);
          }
          if (config.extraCharges) {
            setFreight(doc.freightCharges ? String(doc.freightCharges) : '');
            setOtherCharges(doc.otherCharges ? String(doc.otherCharges) : '');
          }
          if (config.stateOfSupply) setPlaceOfSupply(doc.placeOfSupply ?? '');
          if (config.bankPicker && doc.bankAccountId) setBankAccountId(doc.bankAccountId);
          const hasTax = doc.lines.some((l) => Number(l.gstRate) > 0);
          if (config.taxToggle) setApplyTax(hasTax);
          setLines(
            doc.lines.map((l) => ({
              itemId: l.itemId ?? '',
              description: l.itemId ? '' : l.description,
              quantity: String(l.quantity),
              rate: String(l.rate),
              discountPct: l.discountPct ? String(l.discountPct) : '0',
              gstRate: String(l.gstRate),
              batchNo: '',
              expiryDate: '',
            })),
          );
        }
        if (alive) setLoaded(true);
      } catch (err) {
        if (alive)
          setLoadError(err instanceof ApiError ? err.message : tc('somethingWentWrong'));
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, editId]);

  const selectedCustomer = useMemo(
    () => customers.find((c) => c.id === partyId) ?? null,
    [customers, partyId],
  );

  const taxedLines = config.noTax ? false : config.taxToggle && !applyTax ? false : true;

  const isFreeTextRemoved = config.kind === 'estimate' || config.kind === 'invoice';

  const itemOptions = useMemo(() => {
    const options = items.map((it) => {
      const metaParts = [
        it.sku ? t('itemOptionCode', { code: it.sku }) : '',
        it.hsnCode ? t('itemOptionHsn', { hsn: it.hsnCode }) : '',
      ].filter(Boolean);

      return {
        value: it.id,
        label: it.name,
        hint: metaParts.join(' • ') || undefined,
        keywords: [it.name, it.sku ?? '', it.hsnCode ?? ''].join(' '),
      };
    });

    if (isFreeTextRemoved) {
      return options;
    }
    return [
      { value: '', label: t('freeText') },
      ...options,
    ];
  }, [items, t, isFreeTextRemoved]);

  function updateLine(index: number, patch: Partial<DraftLine>) {
    setLines((prev) =>
      prev.map((line, i) => {
        if (i !== index) return line;
        const next = { ...line, ...patch };
        if (patch.itemId !== undefined) {
          const item = items.find((it) => it.id === patch.itemId);
          next.batchNo = '';
          if (item) {
            next.description = '';
            next.rate = item.salePrice !== null ? String(item.salePrice) : next.rate;
            next.gstRate = String(item.gstRate);
            if (config.batches && item.trackBatches) loadBatches(item.id);
          }
        }
        return next;
      }),
    );
  }


  /** Per-line math (prices are entered tax-exclusive, like Vyapar default). */
  const lineCalc = useCallback(
    (line: DraftLine) => {
      const qty = Number(line.quantity) || 0;
      const rateExcl = Number(line.rate) || 0;
      const gst = taxedLines ? Number(line.gstRate) || 0 : 0;
      const gross = qty * rateExcl;
      const disc = (gross * (Number(line.discountPct) || 0)) / 100;
      const taxable = gross - disc;
      const tax = (taxable * gst) / 100;
      return { rateExcl, gross, disc, taxable, tax, amount: taxable + tax };
    },
    [taxedLines],
  );

  const totals = useMemo(() => {
    let taxable = 0;
    let tax = 0;
    let discount = 0;
    for (const line of lines) {
      const c = lineCalc(line);
      taxable += c.taxable;
      tax += c.tax;
      discount += c.disc;
    }
    const extraNow = (Number(freight) || 0) + (Number(otherCharges) || 0);
    return { taxable, tax, discount, total: Math.round(taxable + tax + extraNow) };
  }, [lines, lineCalc, freight, otherCharges]);

  async function submit(thenPrint: boolean) {
    setError('');
    setBusy(true);
    // Terms & Conditions are configured in Print Settings (per document type),
    // so the entry form only carries the per-document note.
    const combinedNotes = notes.trim() || undefined;
    const body: Record<string, unknown> = {
      partyId,
      branchId: branchId || undefined,
      date,
      notes: combinedNotes,
      ...(config.kind === 'invoice' ? { isOnline: cashSale } : {}),
      lines: lines.map((line) => {
        const { rateExcl } = lineCalc(line);
        const payload: Record<string, unknown> = {
          itemId: line.itemId || undefined,
          description: line.description || undefined,
          quantity: Number(line.quantity),
          rate: line.rate ? Math.round(rateExcl * 100) / 100 : undefined,
          batchNo: line.batchNo || undefined,
          expiryDate: line.expiryDate || undefined,
          discountPct: Number(line.discountPct) || 0,
          // When "Apply tax" is off (or it is a tax-less document), force 0 on EVERY line
          // (incl. item lines — otherwise the server falls back to the item's own GST rate).
          gstRate: taxedLines ? (line.itemId ? undefined : Number(line.gstRate)) : 0,
        };
        return payload;
      }),
    };
    if (config.secondDate) body[config.secondDate] = secondDate || undefined;
    if (config.vehicle) body.vehicleNo = vehicleNo || undefined;
    if (config.extraCharges) {
      body.freightCharges = Number(freight) || 0;
      body.otherCharges = Number(otherCharges) || 0;
    }
    if (config.supplierBillNo) body.supplierBillNo = supplierBillNo || undefined;
    if (config.stateOfSupply && placeOfSupply) body.placeOfSupply = placeOfSupply;
    if (config.bankPicker && bankAccountId) body.bankAccountId = bankAccountId;
    if (config.loyalty && !editId && Number(redeemPoints) > 0)
      body.redeemPoints = Number(redeemPoints);

    try {
      let id = editId;
      if (editId) {
        await api.patch(`/companies/${companyId}/${config.apiBase}/${editId}`, body);
      } else {
        const created = await api.post<{ id: string }>(
          `/companies/${companyId}/${config.apiBase}`,
          body,
        );
        id = created.id;
        // Cash sale: settle the full amount immediately against the first bank/cash ledger.
        if (config.creditCash && cashSale && cashBankLedgers[0]) {
          await api
            .post(`/companies/${companyId}/${config.apiBase}/${id}/payments`, {
              amount: totals.total,
              date,
              ledgerId: cashBankLedgers[0].id,
              method: 'CASH',
            })
            .catch(() => {});
        }
      }
      toast(editId ? t('toast.updated', { doc: docName }) : t('toast.created', { doc: docName }));
      if (thenPrint && id) {
        await printFile(`/companies/${companyId}/${config.apiBase}/${id}/pdf`).catch(() => {});
      }
      router.push(returnHref);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : tc('somethingWentWrong'));
      setBusy(false);
    }
  }

  if (loadError) {
    return (
      <div className="mx-auto max-w-2xl p-8">
        <ErrorText>{loadError}</ErrorText>
        <Link href={returnHref} className="text-sm text-brand-700 hover:underline">
          ← {t('back')}
        </Link>
      </div>
    );
  }

  if (!loaded) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-faint">
        {tc('loading')}
      </div>
    );
  }

  const canSave =
    !!partyId &&
    lines.some(
      (l) =>
        Number(l.quantity) > 0 &&
        (l.itemId || (isFreeTextRemoved ? l.description !== '' : !!l.description)),
    );

  return (
    <div className="min-h-screen bg-subtle">
      {/* Sticky header with title + actions */}
      <header className="sticky top-0 z-20 border-b border-line bg-surface">
        <div className="flex w-full items-center justify-between gap-3 px-6 py-3">
          <div className="flex items-center gap-3">
            <Link
              href={returnHref}
              className="rounded-md p-1.5 text-muted hover:bg-subtle"
              aria-label={t('back')}
            >
              ←
            </Link>
            <h1 className="text-lg font-semibold text-ink">
              {editId ? t('titleEdit', { doc: docName }) : t('titleNew', { doc: docName })}
            </h1>
            {config.creditCash && !editId && (
              <div className="ml-2 inline-flex rounded-md border border-line p-0.5 text-xs font-medium">
                {(['offline', 'online'] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setCashSale(m === 'online')}
                    className={`rounded px-2.5 py-1 ${
                      (m === 'online') === cashSale
                        ? 'bg-brand-600 text-white'
                        : 'text-muted hover:bg-subtle'
                    }`}
                  >
                    {m === 'online' ? 'Online' : 'Offline'}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Link
              href={returnHref}
              className="rounded-md px-3 py-1.5 text-sm font-medium text-muted hover:bg-subtle"
            >
              {tc('cancel')}
            </Link>
            {!editId && (
              <Button
                type="button"
                variant="secondary"
                disabled={busy || !canSave}
                onClick={() => void submit(true)}
              >
                {t('saveAndPrint')}
              </Button>
            )}
            <Button type="button" disabled={busy || !canSave} onClick={() => void submit(false)}>
              {busy ? tc('saving') : editId ? t('save') : t('create', { doc: docName })}
            </Button>
          </div>
        </div>
      </header>

      <main className="w-full space-y-5 px-6 py-6">
        {/* Party + dates */}
        <section className="rounded-xl border border-line bg-surface p-5 shadow-sm shadow-slate-200/50">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="sm:col-span-2">
              <div className="flex items-center justify-between">
                <Label>{config.party === 'vendor' ? tc('vendor') : tc('customer')}</Label>
                <button
                  type="button"
                  onClick={() => setShowAddParty(true)}
                  className="text-xs font-medium text-brand-600 hover:underline"
                >
                  {config.party === 'vendor' ? t('addVendor') : t('addCustomer')}
                </button>
              </div>
              <Combobox
                value={partyId}
                onChange={setPartyId}
                placeholder={config.party === 'vendor' ? t('selectVendor') : t('selectCustomer')}
                searchPlaceholder={tc('search')}
                options={customers.map((c) => ({
                  value: c.id,
                  label: `${c.name}${c.gstin ? ` (${c.gstin})` : ''}`,
                }))}
              />
            </div>
            <div>
              <Label>{tc('date')}</Label>
              <Input type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            {config.secondDate === 'validUntil' && (
              <div>
                <Label>{t('validUntil')}</Label>
                <Input
                  type="date"
                  value={secondDate}
                  onChange={(e) => setSecondDate(e.target.value)}
                />
              </div>
            )}
            {config.secondDate === 'expectedDate' && (
              <div>
                <Label>{t('expectedDate')}</Label>
                <Input
                  type="date"
                  value={secondDate}
                  onChange={(e) => setSecondDate(e.target.value)}
                />
              </div>
            )}
            {config.vehicle && (
              <div>
                <Label>{t('vehicleNo')}</Label>
                <Input
                  value={vehicleNo}
                  onChange={(e) => setVehicleNo(e.target.value)}
                  placeholder="TN01AB1234"
                />
              </div>
            )}
            {config.supplierBillNo && (
              <div>
                <Label>{t('supplierBillNo')}</Label>
                <Input
                  value={supplierBillNo}
                  onChange={(e) => setSupplierBillNo(e.target.value)}
                  placeholder={t('supplierBillNoPlaceholder')}
                />
              </div>
            )}
            {branches.some((b) => b.isActive) && (
              <div>
                <Label>{t('branch')}</Label>
                <Select value={branchId} onChange={(e) => setBranchId(e.target.value)}>
                  <option value="">{t('noBranch')}</option>
                  {branches
                    .filter((b) => b.isActive)
                    .map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                </Select>
              </div>
            )}
            {config.stateOfSupply && (
              <div>
                <Label>{t('stateOfSupply')}</Label>
                <Select value={placeOfSupply} onChange={(e) => setPlaceOfSupply(e.target.value)}>
                  <option value="">{t('stateAuto')}</option>
                  {INDIAN_STATES.map((s) => (
                    <option key={s.code} value={s.code}>
                      {s.code} — {s.name}
                    </option>
                  ))}
                </Select>
              </div>
            )}
            {config.bankPicker && banks.length > 0 && (
              <div>
                <Label>{t('bank')}</Label>
                <Select value={bankAccountId} onChange={(e) => setBankAccountId(e.target.value)}>
                  <option value="">{t('bankDefault')}</option>
                  {banks.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.accountName}
                      {b.accountNo ? ` ·••${b.accountNo.slice(-4)}` : ''}
                    </option>
                  ))}
                </Select>
              </div>
            )}
          </div>

          {/* Selected party's full details */}
          {selectedCustomer && <PartyDetailsCard party={selectedCustomer} />}
        </section>


        {/* Line items */}
        <section className="rounded-xl border border-line bg-surface p-5 shadow-sm shadow-slate-200/50">
          <div className="mb-2 text-sm font-semibold text-ink">{t('items')}</div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[500px] text-sm">
              <thead>
                <tr className="border-b border-line text-left text-[11px] font-semibold uppercase tracking-wide text-muted">
                  <th className="w-6 py-2">#</th>
                  <th className="py-2 w-70">{t('colItem')}</th>
                  <th className="w-30 py-2 pl-8 text-left">{t('qty')}</th>
                  <th className="w-20 py-2 pl-8">{t('colUnit')}</th>
                  <th className="w-30 py-2 pl-8 text-left">
                    {t('colPrice')}
                    <span className="block text-[9px] font-normal normal-case text-faint">{t('withoutTax')}</span>
                  </th>
                  <th className="w-25 py-2 text-left pl-8">{t('colDisc')}</th>
                  {taxedLines && <th className="w-20 py-2 text-left pl-8">{t('colTax')}</th>}
                  <th className="w-24 py-2 text-left pl-8">{t('colAmount')}</th>
                  <th className="w-6 py-2" />
                </tr>
              </thead>
              <tbody>
                {lines.map((line, i) => {
                  const item = items.find((it) => it.id === line.itemId);
                  const c = lineCalc(line);
                  return (
                    <tr key={i} className="border-b border-line align-top">
                      <td className="py-1.5 text-faint">{i + 1}</td>
                      <td className="py-1.5 pr-2">
                        <Combobox
                          value={line.itemId}
                          onChange={(v) => updateLine(i, { itemId: v })}
                          placeholder={isFreeTextRemoved ? t('selectItem') : t('freeText')}
                          searchPlaceholder={t('itemSearchPlaceholder')}
                          emptyText={t('noItemsFound')}
                          className="w-full"
                          options={itemOptions}
                          twoLine
                        />
                        <button
                          type="button"
                          onClick={() => setAddItemForLine(i)}
                          className="mt-1 text-[11px] font-medium text-brand-600 hover:underline"
                        >
                          {t('addItem')}
                        </button>
                        {(!isFreeTextRemoved || line.description !== '') && !line.itemId && (
                          <Input
                            required
                            value={line.description}
                            onChange={(e) => updateLine(i, { description: e.target.value })}
                            placeholder={t('description')}
                            className="mt-1 w-full"
                          />
                        )}
                        {config.batches && item?.trackBatches && (
                          <Select
                            required
                            value={line.batchNo}
                            onChange={(e) => updateLine(i, { batchNo: e.target.value })}
                            className="mt-1 w-full"
                          >
                            <option value="">{t('selectBatch')}</option>
                            {(batchOptions[line.itemId] ?? [])
                              .filter((b) => b.qty > 0 && !b.expired)
                              .map((b) => (
                                <option key={b.id} value={b.batchNo}>
                                  {b.batchNo} · {t('batchLeft', { qty: b.qty })}
                                </option>
                              ))}
                          </Select>
                        )}
                        {config.purchaseBatch && item?.trackBatches && (
                          <div className="mt-1 flex gap-1">
                            <Input
                              value={line.batchNo}
                              onChange={(e) => updateLine(i, { batchNo: e.target.value })}
                              placeholder={t('batchNo')}
                              className="w-1/2"
                            />
                            <Input
                              type="date"
                              value={line.expiryDate}
                              onChange={(e) => updateLine(i, { expiryDate: e.target.value })}
                              title={t('expiryDate')}
                              className="w-1/2"
                            />
                          </div>
                        )}
                      </td>
                      <td className="py-1.5 pr-2 pl-8">
                        <Input
                          type="number"
                          step="0.001"
                          min="0.001"
                          required
                          value={line.quantity}
                          onChange={(e) => updateLine(i, { quantity: e.target.value })}
                          className="w-full text-left"
                        />
                      </td>
                      <td className="py-1.5 pr-2 text-xs text-muted pl-8">{item?.unit ?? '—'}</td>
                      <td className="py-1.5 pr-2 pl-8">
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          required={!line.itemId}
                          value={line.rate}
                          onChange={(e) => updateLine(i, { rate: e.target.value })}
                          className="w-full text-left"
                        />
                      </td>
                      <td className="py-1.5 pr-2 pl-8">
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          max="100"
                          value={line.discountPct}
                          onChange={(e) => updateLine(i, { discountPct: e.target.value })}
                          placeholder="0"
                          className="w-full text-left"
                        />
                      </td>
                      {taxedLines && (
                        <td className="py-1.5 pr-2 pl-8">
                          {line.itemId ? (
                            <span className="block text-right text-xs text-muted">
                              {item ? Number(item.gstRate) : 0}%
                            </span>
                          ) : (
                            <Select
                              value={line.gstRate}
                              onChange={(e) => updateLine(i, { gstRate: e.target.value })}
                              className="w-full"
                            >
                              {GST_RATES.map((r) => (
                                <option key={r} value={r}>{t('gstOption', { rate: r })}</option>
                              ))}
                            </Select>
                          )}
                        </td>
                      )}
                      <td className="py-1.5 pl-8 text-left font-medium tabular-nums text-ink">
                        ₹{inr(c.amount)}
                      </td>
                      <td className="py-1.5 text-left">
                        {lines.length > 1 && (
                          <button
                            type="button"
                            onClick={() => setLines((prev) => prev.filter((_, j) => j !== i))}
                            className="text-faint hover:text-red-500"
                            aria-label={t('removeLine')}
                          >
                            ✕
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <Button
            type="button"
            variant="secondary"
            className="mt-3"
            onClick={() => setLines((prev) => [...prev, { ...EMPTY }])}
          >
            {t('addLine')}
          </Button>
        </section>

        {/* Loyalty redemption (invoice) */}
        {config.loyalty && !editId && loyaltyCfg.enabled && selectedCustomer &&
          selectedCustomer.loyaltyPoints > 0 && (
            <section className="flex flex-wrap items-center gap-3 rounded-lg border border-amber-200 bg-amber-50/60 p-4 text-sm">
              <span className="font-medium text-amber-800">
                {t('loyaltyAvailable', { points: selectedCustomer.loyaltyPoints })}
              </span>
              <label className="flex items-center gap-2">
                <span className="text-muted">{t('redeemPoints')}</span>
                <Input
                  type="number"
                  min="0"
                  max={selectedCustomer.loyaltyPoints}
                  value={redeemPoints}
                  onChange={(e) => setRedeemPoints(e.target.value)}
                  className="w-24"
                />
              </label>
              <button
                type="button"
                onClick={() => setRedeemPoints(String(selectedCustomer.loyaltyPoints))}
                className="text-xs font-medium text-amber-700 hover:underline"
              >
                {t('redeemMax')}
              </button>
              {Number(redeemPoints) > 0 && (
                <span className="text-xs text-muted">
                  {t('redeemWorth', {
                    amount: inr(
                      Math.min(Number(redeemPoints), selectedCustomer.loyaltyPoints) *
                        loyaltyCfg.redeemValue,
                    ),
                  })}
                </span>
              )}
            </section>
          )}

        {/* Footer (Vyapar-style add-ons) + totals */}
        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setShowDescr((s) => !s)}
                className="rounded-md border border-line px-3 py-1.5 text-xs font-medium text-muted hover:bg-subtle"
              >
                ＋ {t('addDescription')}
              </button>
            </div>
            {showDescr && (
              <div>
                <Label>{t('description')}</Label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  className="w-full rounded-md border border-line-strong px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                />
              </div>
            )}
            <p className="text-[11px] text-faint">{t('termsInPrintSettings')}</p>
          </div>
          <div className="rounded-xl border border-line bg-surface p-5 shadow-sm shadow-slate-200/50 text-sm">
            {totals.discount > 0 && (
              <div className="flex justify-between py-1 text-muted">
                <span>{t('discount')}</span>
                <span className="tabular-nums">− ₹{inr(totals.discount)}</span>
              </div>
            )}
            {taxedLines && (
              <>
                <div className="flex justify-between py-1 text-muted">
                  <span>{t('taxable')}</span>
                  <span className="tabular-nums">₹{inr(totals.taxable)}</span>
                </div>
                <div className="flex justify-between py-1 text-muted">
                  <span>{t('tax')}</span>
                  <span className="tabular-nums">₹{inr(totals.tax)}</span>
                </div>
              </>
            )}
            {config.extraCharges && (
              <div className="mt-1 space-y-1 border-t border-line pt-1">
                <label className="flex items-center justify-between gap-2 py-0.5 text-muted">
                  <span>{t('freight')}</span>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={freight}
                    onChange={(e) => setFreight(e.target.value)}
                    placeholder="0"
                    className="w-28 text-right"
                  />
                </label>
                <label className="flex items-center justify-between gap-2 py-0.5 text-muted">
                  <span>{t('otherCharges')}</span>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={otherCharges}
                    onChange={(e) => setOtherCharges(e.target.value)}
                    placeholder="0"
                    className="w-28 text-right"
                  />
                </label>
                <p className="text-[10px] text-faint">{t('extraChargesHint')}</p>
              </div>
            )}
            <div className="mt-1 flex justify-between border-t border-line pt-2 text-base font-semibold text-ink">
              <span>{t('total')}</span>
              <span className="tabular-nums">₹{inr(totals.total)}</span>
            </div>
            <p className="mt-2 text-[11px] text-faint">{t('serverNote')}</p>
          </div>
        </section>

        <ErrorText>{error}</ErrorText>
      </main>

      {showAddParty && (
        <AddPartyModal
          companyId={companyId}
          defaultType={partyType}
          lockType
          onClose={() => setShowAddParty(false)}
          onSaved={async (created) => {
            setShowAddParty(false);
            const updated = await fetchParties(companyId).catch(() => null);
            if (updated) setCustomers(updated.filter((p) => p.type === partyType));
            setPartyId(created.id);
          }}
        />
      )}

      {addItemForLine !== null && (
        <AddItemModal
          companyId={companyId}
          onClose={() => setAddItemForLine(null)}
          onSaved={async (created) => {
            const lineIdx = addItemForLine;
            setAddItemForLine(null);
            const updated = await fetchItems(companyId).catch(() => null);
            if (updated) setItems(updated);
            if (lineIdx !== null) updateLine(lineIdx, { itemId: created.id });
          }}
        />
      )}
    </div>
  );
}

/** Read-only block showing the picked customer's contact + tax details. */
function PartyDetailsCard({ party }: { party: PartyRow }) {
  const t = useTranslations('docEntry');
  const tp = useTranslations('parties');
  const address = [party.addressLine1, party.addressLine2, [party.city, party.pincode].filter(Boolean).join(' ')]
    .filter(Boolean)
    .join(', ');
  return (
    <div className="mt-4 grid grid-cols-1 gap-x-6 gap-y-1 rounded-md bg-subtle p-3 text-sm sm:grid-cols-2">
      <Detail label={t('partyPhone')} value={party.phone} />
      <Detail label={t('partyGstin')} value={party.gstin} />
      <Detail label={t('partyAddress')} value={address || null} wide />
      {/* Document-based outstanding for the party's tracked type only — never
          mixes estimates with invoices (or purchase-estimates with bills). */}
      <Detail
        label={tp('outstanding')}
        value={`₹${inr(party.outstanding)} · ${tp(`balanceDocType.${party.docType}`)}`}
      />
    </div>
  );
}

function Detail({
  label,
  value,
  wide,
}: {
  label: string;
  value: string | null;
  wide?: boolean;
}) {
  return (
    <div className={wide ? 'sm:col-span-2' : ''}>
      <span className="text-faint">{label}: </span>
      <span className="font-medium text-ink">{value || '—'}</span>
    </div>
  );
}
