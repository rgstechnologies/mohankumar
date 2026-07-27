'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useFeedback } from '@/components/feedback';
import { Button, ErrorText, Input, Label, Combobox, type ComboOption } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { type ItemRow, type StockRow } from '@/lib/accounting';

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
    onHand: number;
  } | null;
  items: ItemRow[];
  /** Current stock per item — carries both openingStock and computed onHand. */
  stockRows: StockRow[];
  onSaved: () => void | Promise<void>;
  onClose: () => void;
  onDraftCleared?: () => void;
}

function buildDraft(stockRow?: StockUpdateModalProps['initialStockRow']) {
  if (!stockRow) return { ...EMPTY_DRAFT };
  return {
    itemId: stockRow.itemId,
    quantity: String(stockRow.onHand),
  };
}

function draftSourceKey(stockRow?: StockUpdateModalProps['initialStockRow']) {
  return stockRow?.itemId ?? 'new';
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
  stockRows,
  onSaved,
  onClose,
  onDraftCleared,
}: StockUpdateModalProps) {
  const t = useTranslations('stock');
  const tc = useTranslations('common');
  const { toast, confirm } = useFeedback();

  const [draft, setDraft] = useState<StockUpdateDraft>(EMPTY_DRAFT);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [sourceKey, setSourceKey] = useState('');
  const seededDraftRef = useRef<StockUpdateDraft>(EMPTY_DRAFT);
  const wasOpenRef = useRef(false);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const closingRef = useRef(false);

  const isDirty =
    draft.itemId !== seededDraftRef.current.itemId ||
    draft.quantity !== seededDraftRef.current.quantity;

  const clearDraft = useCallback(() => {
    seededDraftRef.current = EMPTY_DRAFT;
    setDraft({ ...EMPTY_DRAFT });
    setSourceKey('');
    setError('');
    onDraftCleared?.();
  }, [onDraftCleared]);

  const requestClose = useCallback(async () => {
    if (busy || closingRef.current) return;
    if (!isDirty) {
      onClose();
      return;
    }

    closingRef.current = true;
    try {
      const discard = await confirm({
        title: t('modal.discardTitle'),
        confirmLabel: t('modal.discardConfirm'),
        cancelLabel: t('modal.discardCancel'),
        danger: true,
        defaultAction: 'cancel',
      });
      if (!discard) return;
      clearDraft();
      onClose();
    } finally {
      closingRef.current = false;
    }
  }, [busy, clearDraft, confirm, isDirty, onClose, t]);

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

  useEffect(() => {
    if (isOpen && !wasOpenRef.current) {
      const active = document.activeElement;
      restoreFocusRef.current = active instanceof HTMLElement ? active : null;
    }

    if (!isOpen && wasOpenRef.current) {
      const target = restoreFocusRef.current;
      requestAnimationFrame(() => target?.focus());
    }

    wasOpenRef.current = isOpen;
  }, [isOpen]);

  // Seed a new draft only when opening against a different source item.
  useEffect(() => {
    if (!isOpen) return;

    const nextSourceKey = draftSourceKey(initialStockRow);
    if (nextSourceKey !== sourceKey) {
      const nextDraft = buildDraft(initialStockRow);
      seededDraftRef.current = nextDraft;
      setDraft(nextDraft);
      setSourceKey(nextSourceKey);
    }
    setError('');
  }, [initialStockRow, isOpen, sourceKey]);

  // Handle Esc key
  useEffect(() => {
    if (!isOpen) return;

    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        void requestClose();
      }
    };

    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [isOpen, requestClose]);

  function handleItemSelect(itemId: string) {
    const item = items.find((i) => i.id === itemId);
    if (item) {
      // Prefill with the item's current on-hand so the field always shows the
      // quantity the user is about to overwrite (same as opening from a row).
      const current = stockRows.find((s) => s.itemId === itemId);
      setDraft((prev) => ({
        ...prev,
        itemId,
        quantity: current ? String(current.onHand) : '',
      }));
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
      // The field holds the desired on-hand, but the API sets openingStock — and
      //   onHand = openingStock + purchased − sold + returnsIn − returnsOut.
      // Writing the target straight into openingStock double-counts those
      // movements (e.g. saving an unchanged value silently drops on-hand by the
      // quantity already sold). Adjust the baseline by the movement so the
      // resulting on-hand equals what the user typed:
      //   newOpening = currentOpening + (target − currentOnHand)
      const target = Number(draft.quantity);
      const current = stockRows.find((s) => s.itemId === draft.itemId);
      const movement = current ? current.onHand - current.openingStock : 0;
      const newOpening = target - movement;

      await api.patch(`/companies/${companyId}/items/${draft.itemId}`, {
        openingStock: newOpening,
      });
      await onSaved();
      clearDraft();
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
      onClick={() => {
        void requestClose();
      }}
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
                  onChange={(e) => setDraft((current) => ({ ...current, quantity: e.target.value }))}
                  placeholder="0"
                />
              </div>
            </>
          )}
        </div>

        <ErrorText>{error}</ErrorText>

        <div className="flex justify-end gap-3 pt-2">
          <Button type="button" variant="secondary" onClick={() => void requestClose()} disabled={busy}>
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
