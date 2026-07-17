'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { INDIAN_STATES, stateCodeForName } from '@bookly/shared';
import { useFeedback } from '@/components/feedback';
import { Button, ErrorText, Input, Label, Select } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { resolveGstin } from '@/lib/accounting';

export interface SavedParty {
  id: string;
  type: 'CUSTOMER' | 'VENDOR';
  name: string;
  aliasName: string | null;
  gstin: string | null;
  stateCode: string | null;
  state: string | null;
  phone: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  pincode: string | null;
}

interface PartyDraft {
  type: 'CUSTOMER' | 'VENDOR';
  name: string;
  aliasName: string;
  phone: string;
  gstin: string;
  state: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  pincode: string;
  opening: string;
}

/**
 * Reusable "add a customer/vendor" dialog used by the parties screen, the
 * payment-in/out pages and the document entry forms. Captures the full party
 * particulars; the state dropdown drives CGST/SGST-vs-IGST automatically.
 */
export function AddPartyModal({
  companyId,
  defaultType = 'CUSTOMER',
  lockType = false,
  showOpening = false,
  onSaved,
  onClose,
}: {
  companyId: string;
  defaultType?: 'CUSTOMER' | 'VENDOR';
  /** When true the customer/vendor toggle is hidden (page is role-specific). */
  lockType?: boolean;
  showOpening?: boolean;
  onSaved: (party: SavedParty) => void | Promise<void>;
  onClose: () => void;
}) {
  const t = useTranslations('parties');
  const tc = useTranslations('common');
  const { toast } = useFeedback();
  const [draft, setDraft] = useState<PartyDraft>({
    type: defaultType,
    name: '',
    aliasName: '',
    phone: '',
    gstin: '',
    state: '',
    addressLine1: '',
    addressLine2: '',
    city: '',
    pincode: '',
    opening: '',
  });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [mirrorAlias, setMirrorAlias] = useState(true);
  const set = (patch: Partial<PartyDraft>) => setDraft((d) => ({ ...d, ...patch }));

  /** Fetch GSTIN details from the government portal and auto-fill the form. */
  async function verifyGstin() {
    if (draft.gstin.length !== 15) return;
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
          // Match the state name to our dropdown list.
          const match = INDIAN_STATES.find(
            (s) => s.name.toLowerCase() === info.address!.state.toLowerCase(),
          );
          if (match) patch.state = match.name;
        }
      }
      set(patch);
      toast(`Verified: ${info.tradeName || info.legalName} (${info.status})`);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'GSTIN verification failed');
    } finally {
      setVerifying(false);
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (draft.type === 'CUSTOMER') {
      if (!draft.name.trim()) {
        setError(t('nameRequired'));
        return;
      }
      if (!draft.gstin.trim()) {
        setError(t('gstinRequired'));
        return;
      }
      if (!draft.phone.trim()) {
        setError(t('phoneRequired'));
        return;
      }
      if (!draft.state) {
        setError(t('stateRequired'));
        return;
      }
      if (!draft.addressLine1.trim()) {
        setError(t('addressLine1Required'));
        return;
      }
      if (!draft.city.trim()) {
        setError(t('cityRequired'));
        return;
      }
      if (!draft.pincode.trim()) {
        setError(t('pincodeRequired'));
        return;
      }
    }

    setBusy(true);
    try {
      const created = await api.post<SavedParty>(`/companies/${companyId}/parties`, {
        type: draft.type,
        name: draft.name.trim(),
        aliasName: draft.aliasName.trim() || undefined,
        phone: draft.phone.trim() || undefined,
        gstin: draft.gstin.trim() || undefined,
        state: draft.state || undefined,
        addressLine1: draft.addressLine1.trim() || undefined,
        addressLine2: draft.addressLine2.trim() || undefined,
        city: draft.city.trim() || undefined,
        pincode: draft.pincode.trim() || undefined,
        openingBalance: showOpening && draft.opening ? Number(draft.opening) : undefined,
      });
      toast(t('toastCreated'));
      await onSaved(created);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : tc('somethingWentWrong'));
    } finally {
      setBusy(false);
    }
  }

  const title = draft.type === 'CUSTOMER' ? t('addCustomerTitle') : t('addVendorTitle');

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4"
      onClick={onClose}
    >
      <form
        onSubmit={onSubmit}
        className="my-8 w-full max-w-lg space-y-3 rounded-2xl bg-surface p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-bold text-ink">{title}</h2>

        {!lockType && (
          <div>
            <Label>{tc('type')}</Label>
            <Select value={draft.type} onChange={(e) => set({ type: e.target.value as PartyDraft['type'] })}>
              <option value="CUSTOMER">{t('type.CUSTOMER')}</option>
              <option value="VENDOR">{t('type.VENDOR')}</option>
            </Select>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <Label>
              {tc('name')}
              {draft.type === 'CUSTOMER' && <span className="text-red-500"> *</span>}
            </Label>
            <Input
              required
              value={draft.name}
              onChange={(e) => {
                const newName = e.target.value;
                setDraft((d) => {
                  const patch: Partial<PartyDraft> = { name: newName };
                  if (mirrorAlias) {
                    patch.aliasName = newName;
                  }
                  return { ...d, ...patch };
                });
              }}
              onBlur={() => setMirrorAlias(false)}
            />
          </div>
          <div>
            <Label>{t('aliasOptional')}</Label>
            <Input
              value={draft.aliasName}
              onChange={(e) => {
                set({ aliasName: e.target.value });
                setMirrorAlias(false);
              }}
            />
          </div>
          <div>
            <Label>
              {draft.type === 'CUSTOMER' ? t('phone') : t('phoneOptional')}
              {draft.type === 'CUSTOMER' && <span className="text-red-500"> *</span>}
            </Label>
            <Input
              required={draft.type === 'CUSTOMER'}
              value={draft.phone}
              onChange={(e) => set({ phone: e.target.value })}
            />
          </div>
          <div>
            <Label>
              {draft.type === 'CUSTOMER' ? t('gstin') : t('gstinOptional')}
              {draft.type === 'CUSTOMER' && <span className="text-red-500"> *</span>}
            </Label>
            <div className="flex gap-2">
              <Input
                className="flex-1"
                required={draft.type === 'CUSTOMER'}
                value={draft.gstin}
                maxLength={15}
                onChange={(e) => set({ gstin: e.target.value.toUpperCase() })}
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
            <Label>
              {t('stateLabel')}
              {draft.type === 'CUSTOMER' && <span className="text-red-500"> *</span>}
            </Label>
            <Select value={draft.state} onChange={(e) => set({ state: e.target.value })}>
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
          <div className="col-span-2">
            <Label>
              {t('addressLine1')}
              {draft.type === 'CUSTOMER' && <span className="text-red-500"> *</span>}
            </Label>
            <Input
              required={draft.type === 'CUSTOMER'}
              value={draft.addressLine1}
              onChange={(e) => set({ addressLine1: e.target.value })}
            />
          </div>
          <div className="col-span-2">
            <Label>{t('addressLine2')}</Label>
            <Input value={draft.addressLine2} onChange={(e) => set({ addressLine2: e.target.value })} />
          </div>
          <div>
            <Label>
              {draft.type === 'CUSTOMER' ? t('city') : t('cityOptional')}
              {draft.type === 'CUSTOMER' && <span className="text-red-500"> *</span>}
            </Label>
            <Input
              required={draft.type === 'CUSTOMER'}
              value={draft.city}
              onChange={(e) => set({ city: e.target.value })}
            />
          </div>
          <div>
            <Label>
              {draft.type === 'CUSTOMER' ? t('pincode') : t('pincodeOptional')}
              {draft.type === 'CUSTOMER' && <span className="text-red-500"> *</span>}
            </Label>
            <Input
              required={draft.type === 'CUSTOMER'}
              value={draft.pincode}
              maxLength={6}
              onChange={(e) => set({ pincode: e.target.value.replace(/\D/g, '') })}
            />
          </div>
          {showOpening && (
            <div className="col-span-2">
              <Label>{t('openingBalance')}</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={draft.opening}
                onChange={(e) => set({ opening: e.target.value })}
              />
              <p className="mt-1 text-xs text-faint">{t('openingHint')}</p>
            </div>
          )}
        </div>

        <ErrorText>{error}</ErrorText>
        <div className="flex gap-3 pt-1">
          <Button type="submit" disabled={busy || !draft.name.trim()}>
            {busy ? tc('saving') : t('saveParty')}
          </Button>
          <Button type="button" variant="secondary" onClick={onClose}>
            {tc('cancel')}
          </Button>
        </div>
      </form>
    </div>
  );
}
