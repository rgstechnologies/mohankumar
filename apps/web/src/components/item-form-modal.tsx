'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useFeedback } from '@/components/feedback';
import { Button, ErrorText, Input, Label, Select } from '@/components/ui';
import { GST_RATES, ITEM_UNITS, type ItemRow } from '@/lib/accounting';
import { api, ApiError } from '@/lib/api';

/**
 * Quick "add an item" dialog used inside the document entry forms so a new
 * product can be created without leaving the invoice/estimate/bill being keyed.
 * Captures the essentials; the full item editor (variants, custom columns,
 * batches) lives on the Items tab.
 */
export function AddItemModal({
  companyId,
  onSaved,
  onClose,
}: {
  companyId: string;
  onSaved: (item: ItemRow) => void | Promise<void>;
  onClose: () => void;
}) {
  const t = useTranslations('items');
  const tc = useTranslations('common');
  const { toast } = useFeedback();
  const [name, setName] = useState('');
  const [itemCode, setItemCode] = useState('');
  const [hsn, setHsn] = useState('');
  const [unit, setUnit] = useState('PCS');
  const [gstRate, setGstRate] = useState('0');
  const [salePrice, setSalePrice] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const created = await api.post<ItemRow>(`/companies/${companyId}/items`, {
        name: name.trim(),
        sku: itemCode.trim() || undefined,
        hsnCode: hsn || undefined,
        unit,
        gstRate: Number(gstRate),
        salePrice: salePrice ? Number(salePrice) : undefined,
      });
      toast(t('toast.itemCreated'));
      await onSaved(created);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : tc('somethingWentWrong'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4"
      onClick={onClose}
    >
      <form
        onSubmit={onSubmit}
        className="my-8 w-full max-w-md space-y-3 rounded-2xl bg-surface p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-bold text-ink">{t('newItemTitle')}</h2>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>{t('fields.itemName')}</Label>
            <Input required value={name} onChange={(e) => setName(e.target.value)} placeholder={t('fields.itemName')} />
          </div>
          <div>
            <Label>{t('fields.itemCode')}</Label>
            <Input required value={itemCode} onChange={(e) => setItemCode(e.target.value)} placeholder={t('fields.itemCode')} />
          </div>
          <div>
            <Label>{t('fields.hsnCode')}</Label>
            <Input
              value={hsn}
              maxLength={8}
              onChange={(e) => setHsn(e.target.value.replace(/\D/g, ''))}
              placeholder="5208"
            />
          </div>
          <div>
            <Label>{t('fields.unit')}</Label>
            <Select value={unit} onChange={(e) => setUnit(e.target.value)}>
              {ITEM_UNITS.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>{t('fields.gstRate')}</Label>
            <Select value={gstRate} onChange={(e) => setGstRate(e.target.value)}>
              {GST_RATES.map((r) => (
                <option key={r} value={r}>
                  {r}%
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>{t('fields.salePrice')}</Label>
            <Input
              type="number"
              step="0.01"
              min="0"
              value={salePrice}
              onChange={(e) => setSalePrice(e.target.value)}
              placeholder={t('fields.salePrice')}
            />
          </div>
        </div>
        <ErrorText>{error}</ErrorText>
        <div className="flex gap-3 pt-1">
          <Button type="submit" disabled={busy || !name.trim() || !itemCode.trim()}>
            {busy ? tc('saving') : t('saveItem')}
          </Button>
          <Button type="button" variant="secondary" onClick={onClose}>
            {tc('cancel')}
          </Button>
        </div>
      </form>
    </div>
  );
}
