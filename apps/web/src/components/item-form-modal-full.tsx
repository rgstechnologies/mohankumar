'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { useFeedback } from '@/components/feedback';
import { Button, ErrorText, HelpTip, Input, Label, Select } from '@/components/ui';
import { GST_RATES, ITEM_UNITS, type ItemRow } from '@/lib/accounting';
import { api, ApiError } from '@/lib/api';

interface ItemDraft {
  id?: string;
  name: string;
  itemCode: string;
  hsn: string;
  unit: string;
  gstRate: string;
  salePrice: string;
  openingStock: string;
}

const EMPTY_DRAFT: ItemDraft = {
  name: '',
  itemCode: '',
  hsn: '',
  unit: 'PCS',
  gstRate: '0',
  salePrice: '',
  openingStock: '',
};

interface ItemFormModalProps {
  companyId: string;
  isOpen: boolean;
  initialItem?: ItemRow | null;
  onSaved: () => void | Promise<void>;
  onClose: () => void;
}

/**
 * Full item form modal with create/edit support and draft preservation.
 * Used by the Items tab to replace the inline form.
 */
export function ItemFormModal({
  companyId,
  isOpen,
  initialItem,
  onSaved,
  onClose,
}: ItemFormModalProps) {
  const t = useTranslations('items');
  const tc = useTranslations('common');
  const { toast } = useFeedback();
  
  // Preserved draft state for new items (not edits)
  const [preservedDraft, setPreservedDraft] = useState<ItemDraft | null>(null);
  
  // Current form state
  const [draft, setDraft] = useState<ItemDraft>(EMPTY_DRAFT);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const editing = Boolean(draft?.id);
  const nameInputRef = useRef<HTMLInputElement>(null);

  // Initialize draft when modal opens or initialItem changes
  useEffect(() => {
    if (isOpen) {
      if (initialItem) {
        // Edit mode: populate from existing item
        setDraft({
          id: initialItem.id,
          name: initialItem.name,
          itemCode: initialItem.sku ?? '',
          hsn: initialItem.hsnCode ?? '',
          unit: initialItem.unit,
          gstRate: String(initialItem.gstRate),
          salePrice: initialItem.salePrice !== null ? String(initialItem.salePrice) : '',
          openingStock: String(initialItem.openingStock),
        });
      } else {
        // Create mode: restore preserved draft or use empty
        setDraft(preservedDraft ? { ...preservedDraft } : { ...EMPTY_DRAFT });
      }
      setError('');
      // Auto-focus name input
      setTimeout(() => nameInputRef.current?.focus(), 50);
    }
  }, [isOpen, initialItem, preservedDraft]);

  const handleClose = useCallback(() => {
    if (!editing && draft) {
      // Preserve draft for new items
      setPreservedDraft({ ...draft });
    } else {
      // Clear preserved draft for edits or when explicitly closing
      setPreservedDraft(null);
    }
    onClose();
  }, [editing, draft, onClose]);

  // Handle Esc key
  useEffect(() => {
    if (!isOpen) return;
    
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleClose();
      }
    };
    
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [isOpen, draft, editing, handleClose]);

  function handleReset() {
    setDraft({ ...EMPTY_DRAFT });
    setPreservedDraft(null);
    setError('');
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    
    const body = {
      name: draft.name,
      sku: draft.itemCode || undefined,
      hsnCode: draft.hsn || undefined,
      unit: draft.unit,
      gstRate: Number(draft.gstRate),
      salePrice: draft.salePrice ? Number(draft.salePrice) : undefined,
      openingStock: draft.openingStock ? Number(draft.openingStock) : undefined,
    };
    
    try {
      if (draft.id) {
        await api.patch(`/companies/${companyId}/items/${draft.id}`, body);
      } else {
        await api.post(`/companies/${companyId}/items`, body);
      }
      const savedMessage = editing ? t('toast.itemUpdated') : t('toast.itemCreated');
      setPreservedDraft(null); // Clear draft after successful save
      await onSaved();
      toast(savedMessage);
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : tc('somethingWentWrong'));
    } finally {
      setBusy(false);
    }
  }

  if (!isOpen) return null;

  const title = editing ? t('editTitle', { name: draft.name || t('itemFallback') }) : t('newItemTitle');

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4"
      onClick={handleClose}
    >
      <form
        onSubmit={onSubmit}
        className="my-4 w-full max-w-3xl space-y-4 rounded-2xl bg-surface p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-bold text-ink">{title}</h2>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="col-span-1 sm:col-span-2 lg:col-span-2">
            <span className="mb-1 block text-xs font-semibold text-muted">{t('fields.itemName')} *</span>
            <input
              ref={nameInputRef}
              required
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              placeholder={t('fields.itemName')}
              className="w-full rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm text-ink outline-none transition-colors placeholder:text-faint focus:border-brand-600 focus:ring-2 focus:ring-brand-100 disabled:bg-subtle disabled:text-faint"
            />
          </div>
          <div className="col-span-1 sm:col-span-1">
            <Label>{t('fields.itemCode')} *</Label>
            <Input
              required
              value={draft.itemCode?.toUpperCase()}
              onChange={(e) => setDraft({ ...draft, itemCode: e.target.value })}
              placeholder={t('fields.itemCode')}
            />
          </div>
          <div className="col-span-1 sm:col-span-1">
            <Label>{t('fields.hsnCode')} <HelpTip text={t('help.hsn')} /></Label>
            <Input
              value={draft.hsn}
              onChange={(e) => setDraft({ ...draft, hsn: e.target.value.replace(/\D/g, '') })}
              maxLength={8}
              placeholder="5208"
            />
          </div>
          <div className="col-span-1 sm:col-span-1">
            <Label>{t('fields.unit')}</Label>
            <Select
              value={draft.unit}
              onChange={(e) => setDraft({ ...draft, unit: e.target.value })}
            >
              {ITEM_UNITS.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </Select>
          </div>
          <div className="col-span-1 sm:col-span-1">
            <Label>{t('fields.gstRate')} <HelpTip text={t('help.gstRate')} /></Label>
            <Select
              value={draft.gstRate}
              onChange={(e) => setDraft({ ...draft, gstRate: e.target.value })}
            >
              {GST_RATES.map((r) => (
                <option key={r} value={r}>
                  {r}%
                </option>
              ))}
            </Select>
          </div>
          <div className="col-span-1 sm:col-span-1">
            <Label>{t('fields.salePrice')}</Label>
            <Input
              type="number"
              step="0.01"
              min="0"
              value={draft.salePrice}
              onChange={(e) => setDraft({ ...draft, salePrice: e.target.value })}
              placeholder={t('fields.salePrice')}
            />
          </div>
          <div className="col-span-1 sm:col-span-1">
            <Label>{t('fields.openingStock')}</Label>
            <Input
              type="number"
              step="0.001"
              min="0"
              value={draft.openingStock}
              onChange={(e) => setDraft({ ...draft, openingStock: e.target.value })}
            />
          </div>
        </div>

        <ErrorText>{error}</ErrorText>

        <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-end">
          {!editing && (
            <Button type="button" variant="secondary" onClick={handleReset}>
              {tc('reset')}
            </Button>
          )}
          <Button type="button" variant="secondary" onClick={handleClose}>
            {tc('cancel')}
          </Button>
          <Button type="submit" disabled={busy}>
            {busy ? tc('saving') : editing ? t('saveChanges') : t('saveItem')}
          </Button>
        </div>
      </form>
    </div>
  );
}
