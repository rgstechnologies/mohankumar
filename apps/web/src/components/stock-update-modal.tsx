'use client';

import { useState, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { useFeedback } from '@/components/feedback';
import { Button, ErrorText, Input, Label, Combobox, type ComboOption } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { type ItemRow } from '@/lib/accounting';

interface StockUpdateDraft {
  itemId: string;
  quantity: string;
}

const EMPTY_DRAFT: StockUpdateDraft = {
  itemId: '',
  quantity: '',
};

interface StockUpdateModalProps {
  companyId: string;
  isOpen: boolean;
  initialStockRow?: {
    itemId: string;
    name: string;
    sku: string | null;
    hsnCode: string | null;
    openingStock: number;
  } | null;
  items: ItemRow[];
  onSaved: () => void | Promise<void>;
  onClose: () => void;
}

/**
 * Modal for updating stock quantity for an item.
 * Allows selecting an item by name, code, or HSN, then updating its opening stock.
 */
export function StockUpdateModal({
  companyId,
  isOpen,
  initialStockRow,
  items,
  onSaved,
  onClose,
}: StockUpdateModalProps) {
  const t = useTranslations('stock');
  const tc = useTranslations('common');
  const { toast } = useFeedback();

  const [draft, setDraft] = useState<StockUpdateDraft>(() => {
    if (initialStockRow) {
      return {
        itemId: initialStockRow.itemId,
        quantity: String(initialStockRow.openingStock),
      };
    }
    return EMPTY_DRAFT;
  });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // Convert items to combo options for the dropdown with two-line format
  const itemOptions: ComboOption[] = items.map((item) => {
    const codePart = item.sku ? `Code: ${item.sku}` : '';
    const hsnPart = item.hsnCode ? `HSN: ${item.hsnCode}` : '';
    const hint = [codePart, hsnPart].filter(Boolean).join(' • ');
    return {
      value: item.id,
      label: item.name,
      hint: hint || undefined,
      keywords: [item.name, item.sku ?? '', item.hsnCode ?? ''].join(' '),
    };
  });

  // Initialize draft when modal opens or initialStockRow changes
  useEffect(() => {
    if (isOpen) {
      if (initialStockRow) {
        setDraft({
          itemId: initialStockRow.itemId,
          quantity: String(initialStockRow.openingStock),
        });
      } else {
        setDraft({ ...EMPTY_DRAFT });
      }
      setError('');
    }
  }, [isOpen, initialStockRow]);

  // Handle Esc key
  useEffect(() => {
    if (!isOpen) return;

    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [isOpen, onClose]);

  function handleItemSelect(itemId: string) {
    const item = items.find((i) => i.id === itemId);
    if (item) {
      setDraft({
        itemId,
        quantity: String(item.openingStock),
      });
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (!draft.itemId) {
      setError(t('modal.selectItemError'));
      return;
    }

    if (!draft.quantity) {
      setError(t('modal.quantityError'));
      return;
    }

    setBusy(true);

    try {
      await api.patch(`/companies/${companyId}/items/${draft.itemId}`, {
        openingStock: Number(draft.quantity),
      });
      await onSaved();
      toast(t('modal.toastUpdated'));
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : tc('somethingWentWrong'));
    } finally {
      setBusy(false);
    }
  }

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-4"
      onClick={onClose}
    >
      <form
        onSubmit={onSubmit}
        className="my-4 w-full max-w-lg space-y-4 rounded-2xl bg-surface p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-bold text-ink">{t('modal.title')}</h2>

        <div className="space-y-4">
          <div>
            <Label>{t('modal.selectItem')}</Label>
            <Combobox
              value={draft.itemId}
              onChange={handleItemSelect}
              options={itemOptions}
              placeholder={t('modal.selectItemPlaceholder')}
              searchPlaceholder={t('modal.searchPlaceholder')}
              emptyText={t('modal.noItemsFound')}
              twoLine
              showSearch
            />
          </div>

          {draft.itemId && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>{t('modal.itemCode')}</Label>
                  <Input
                    value={items.find((i) => i.id === draft.itemId)?.sku ?? ''}
                    disabled
                    className="bg-subtle"
                  />
                </div>
                <div>
                  <Label>{t('modal.hsn')}</Label>
                  <Input
                    value={items.find((i) => i.id === draft.itemId)?.hsnCode ?? ''}
                    disabled
                    className="bg-subtle"
                  />
                </div>
              </div>

              <div>
                <Label>{t('modal.quantity')}</Label>
                <Input
                  type="number"
                  step="0.001"
                  min="0"
                  required
                  value={draft.quantity}
                  onChange={(e) => setDraft({ ...draft, quantity: e.target.value })}
                  placeholder="0"
                />
              </div>
            </>
          )}
        </div>

        <ErrorText>{error}</ErrorText>

        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            {tc('cancel')}
          </Button>
          <Button type="submit" disabled={busy || !draft.itemId}>
            {busy ? tc('saving') : t('modal.updateStock')}
          </Button>
        </div>
      </form>
    </div>
  );
}
