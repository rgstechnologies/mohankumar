'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { EmptyState, Pagination, SearchInput, useTable } from '@/components/table';
import { useFeedback } from '@/components/feedback';
import { Button, Card, ErrorText, HelpTip, Input, Label, Select } from '@/components/ui';
import { GST_RATES, inr, ITEM_UNITS, type ItemRow } from '@/lib/accounting';
import { api, ApiError } from '@/lib/api';

interface ItemDraft {
  id?: string;
  name: string;
  hsn: string;
  unit: string;
  gstRate: string;
  salePrice: string;
  purchasePrice: string;
  openingStock: string;
  reorderLevel: string;
  barcode: string;
  trackBatches: boolean;
  customFields: { name: string; value: string }[];
  variants: { variantLabel: string; sku: string; salePrice: string; openingStock: string }[];
}

const EMPTY_VARIANT = { variantLabel: '', sku: '', salePrice: '', openingStock: '' };
const EMPTY_CUSTOM_FIELD = { name: '', value: '' };

const EMPTY_DRAFT: ItemDraft = {
  name: '',
  hsn: '',
  unit: 'PCS',
  gstRate: '0',
  salePrice: '',
  purchasePrice: '',
  openingStock: '',
  reorderLevel: '',
  barcode: '',
  trackBatches: false,
  customFields: [],
  variants: [],
};

export function ItemsTab({
  companyId,
  items,
  canManage,
  onChanged,
}: {
  companyId: string;
  items: ItemRow[];
  canManage: boolean;
  onChanged: () => Promise<void>;
}) {
  const t = useTranslations('items');
  const tc = useTranslations('common');
  const table = useTable(items, (i) => `${i.name} ${i.hsnCode ?? ''} ${i.sku ?? ''}`);
  const [draft, setDraft] = useState<ItemDraft | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const editing = Boolean(draft?.id);
  const { toast } = useFeedback();

  function startEdit(item: ItemRow) {
    setError('');
    setDraft({
      id: item.id,
      name: item.name,
      hsn: item.hsnCode ?? '',
      unit: item.unit,
      gstRate: String(item.gstRate),
      salePrice: item.salePrice !== null ? String(item.salePrice) : '',
      purchasePrice: item.purchasePrice !== null ? String(item.purchasePrice) : '',
      openingStock: String(item.openingStock),
      reorderLevel: item.reorderLevel != null ? String(item.reorderLevel) : '',
      barcode: item.barcode ?? '',
      trackBatches: item.trackBatches,
      customFields: (item.customFields ?? []).map((f) => ({
        name: f.name,
        value: f.value,
      })),
      variants: [],
    });
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!draft) return;
    setError('');
    setBusy(true);
    const body = {
      name: draft.name,
      hsnCode: draft.hsn || undefined,
      unit: draft.unit,
      gstRate: Number(draft.gstRate),
      salePrice: draft.salePrice ? Number(draft.salePrice) : undefined,
      purchasePrice: draft.purchasePrice ? Number(draft.purchasePrice) : undefined,
      openingStock: draft.openingStock ? Number(draft.openingStock) : undefined,
      reorderLevel: draft.reorderLevel ? Number(draft.reorderLevel) : undefined,
      barcode: draft.barcode || undefined,
      trackBatches: draft.trackBatches,
      customFields: draft.customFields
        .filter((f) => f.name.trim())
        .map((f) => ({ name: f.name.trim(), value: f.value.trim() })),
      ...(!draft.id && draft.variants.length
        ? {
            variants: draft.variants
              .filter((v) => v.variantLabel.trim())
              .map((v) => ({
                variantLabel: v.variantLabel.trim(),
                sku: v.sku || undefined,
                salePrice: v.salePrice ? Number(v.salePrice) : undefined,
                openingStock: v.openingStock ? Number(v.openingStock) : undefined,
              })),
          }
        : {}),
    };
    try {
      if (draft.id) {
        await api.patch(`/companies/${companyId}/items/${draft.id}`, body);
      } else {
        await api.post(`/companies/${companyId}/items`, body);
      }
      const savedMessage = editing ? t('toast.itemUpdated') : t('toast.itemCreated');
      setDraft(null);
      await onChanged();
      toast(savedMessage);
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
          <Button
            variant={draft && !editing ? 'secondary' : 'primary'}
            onClick={() => {
              setError('');
              setDraft(draft && !editing ? null : { ...EMPTY_DRAFT });
            }}
          >
            {draft && !editing ? tc('close') : t('newItem')}
          </Button>
        )}
      </div>

      {draft && (
        <Card title={editing ? t('editTitle', { name: draft.name || t('itemFallback') }) : t('newItemTitle')}>
          <form onSubmit={onSubmit} className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div className="col-span-2">
              <Label>{t('fields.itemName')}</Label>
              <Input
                required
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              />
            </div>
            <div>
              <Label>{t('fields.hsnCode')} <HelpTip text={t('help.hsn')} /></Label>
              <Input
                value={draft.hsn}
                onChange={(e) => setDraft({ ...draft, hsn: e.target.value.replace(/\D/g, '') })}
                maxLength={8}
                placeholder="5208"
              />
            </div>
            <div>
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
            <div>
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
            <div>
              <Label>{t('fields.salePrice')}</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={draft.salePrice}
                onChange={(e) => setDraft({ ...draft, salePrice: e.target.value })}
              />
            </div>
            <div>
              <Label>{t('fields.purchasePrice')}</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={draft.purchasePrice}
                onChange={(e) => setDraft({ ...draft, purchasePrice: e.target.value })}
              />
            </div>
            <div>
              <Label>{t('fields.openingStock')}</Label>
              <Input
                type="number"
                step="0.001"
                min="0"
                value={draft.openingStock}
                onChange={(e) => setDraft({ ...draft, openingStock: e.target.value })}
              />
            </div>
            <div>
              <Label>{t('fields.reorderLevel')} <HelpTip text={t('help.reorderLevel')} /></Label>
              <Input
                type="number"
                step="0.001"
                min="0"
                value={draft.reorderLevel}
                onChange={(e) => setDraft({ ...draft, reorderLevel: e.target.value })}
                placeholder={t('fields.reorderPlaceholder')}
              />
            </div>
            <div className="col-span-2">
              <Label>{t('fields.barcode')} <HelpTip text={t('help.barcode')} /></Label>
              <Input
                value={draft.barcode}
                onChange={(e) => setDraft({ ...draft, barcode: e.target.value })}
                placeholder="8901234567890"
                maxLength={64}
              />
            </div>
            <label className="col-span-2 flex items-center gap-2 self-end pb-2 text-sm font-medium text-ink">
              <input
                type="checkbox"
                checked={draft.trackBatches}
                onChange={(e) => setDraft({ ...draft, trackBatches: e.target.checked })}
                className="h-4 w-4 rounded border-line-strong text-brand-600 focus:ring-brand-500"
              />
              {t('fields.trackBatches')}
              <HelpTip text={t('help.trackBatches')} />
            </label>
            <div className="col-span-2 sm:col-span-4">
              <div className="mb-1 flex items-center justify-between">
                <Label>{t('customFields.title')} <HelpTip text={t('customFields.hint')} /></Label>
                <button
                  type="button"
                  onClick={() =>
                    setDraft({
                      ...draft,
                      customFields: [...draft.customFields, { ...EMPTY_CUSTOM_FIELD }],
                    })
                  }
                  className="text-xs font-medium text-brand-600 hover:underline"
                >
                  {t('customFields.add')}
                </button>
              </div>
              <div className="space-y-2">
                {draft.customFields.length === 0 && (
                  <p className="text-xs text-faint">{t('customFields.empty')}</p>
                )}
                {draft.customFields.map((f, i) => (
                  <div key={i} className="flex flex-wrap items-center gap-2">
                    <Input
                      value={f.name}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          customFields: draft.customFields.map((x, j) =>
                            j === i ? { ...x, name: e.target.value } : x,
                          ),
                        })
                      }
                      placeholder={t('customFields.namePlaceholder')}
                      maxLength={40}
                      className="w-44"
                    />
                    <Input
                      value={f.value}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          customFields: draft.customFields.map((x, j) =>
                            j === i ? { ...x, value: e.target.value } : x,
                          ),
                        })
                      }
                      placeholder={t('customFields.valuePlaceholder')}
                      maxLength={200}
                      className="min-w-44 flex-1"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setDraft({
                          ...draft,
                          customFields: draft.customFields.filter((_, j) => j !== i),
                        })
                      }
                      className="text-faint hover:text-red-500"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            </div>
            {!editing && (
              <div className="col-span-2 sm:col-span-4">
                <div className="mb-1 flex items-center justify-between">
                  <Label>{t('variants.title')} <HelpTip text={t('variants.hint')} /></Label>
                  <button
                    type="button"
                    onClick={() =>
                      setDraft({ ...draft, variants: [...draft.variants, { ...EMPTY_VARIANT }] })
                    }
                    className="text-xs font-medium text-brand-600 hover:underline"
                  >
                    {t('variants.add')}
                  </button>
                </div>
                <div className="space-y-2">
                  {draft.variants.map((v, i) => (
                    <div key={i} className="flex flex-wrap items-center gap-2">
                      <Input
                        value={v.variantLabel}
                        onChange={(e) =>
                          setDraft({
                            ...draft,
                            variants: draft.variants.map((x, j) =>
                              j === i ? { ...x, variantLabel: e.target.value } : x,
                            ),
                          })
                        }
                        placeholder={t('variants.label')}
                        className="min-w-40 flex-1"
                      />
                      <Input
                        value={v.sku}
                        onChange={(e) =>
                          setDraft({
                            ...draft,
                            variants: draft.variants.map((x, j) =>
                              j === i ? { ...x, sku: e.target.value } : x,
                            ),
                          })
                        }
                        placeholder="SKU"
                        className="w-28"
                      />
                      <Input
                        type="number"
                        value={v.salePrice}
                        onChange={(e) =>
                          setDraft({
                            ...draft,
                            variants: draft.variants.map((x, j) =>
                              j === i ? { ...x, salePrice: e.target.value } : x,
                            ),
                          })
                        }
                        placeholder={t('variants.price')}
                        className="w-28"
                      />
                      <Input
                        type="number"
                        value={v.openingStock}
                        onChange={(e) =>
                          setDraft({
                            ...draft,
                            variants: draft.variants.map((x, j) =>
                              j === i ? { ...x, openingStock: e.target.value } : x,
                            ),
                          })
                        }
                        placeholder={t('variants.stock')}
                        className="w-24"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setDraft({ ...draft, variants: draft.variants.filter((_, j) => j !== i) })
                        }
                        className="text-faint hover:text-red-500"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="col-span-2 flex items-end gap-3 sm:col-span-4">
              <Button type="submit" disabled={busy}>
                {busy ? tc('saving') : editing ? t('saveChanges') : t('saveItem')}
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
        {items.length === 0 ? (
          <EmptyState
            title={t('empty.title')}
            body={t('empty.body')}
            action={
              canManage && (
                <Button onClick={() => setDraft({ ...EMPTY_DRAFT })}>{t('empty.addItem')}</Button>
              )
            }
          />
        ) : (
          <>
            <div className="overflow-x-auto"><table className="w-full min-w-[600px] text-sm">
              <thead>
                <tr className="border-b border-line bg-subtle text-left text-[11px] font-semibold uppercase tracking-wide text-muted">
                  <th className="py-2">{t('table.item')}</th>
                  <th className="py-2">{t('table.hsn')}</th>
                  <th className="py-2">{t('table.unit')}</th>
                  <th className="py-2 text-right">{t('table.gst')}</th>
                  <th className="py-2 text-right">{t('table.saleRupees')}</th>
                  <th className="py-2 text-right">{t('table.purchaseRupees')}</th>
                  <th className="py-2 text-right">{t('table.opening')}</th>
                  {canManage && <th className="py-2 text-right">{tc('actions')}</th>}
                </tr>
              </thead>
              <tbody>
                {table.rows.map((item) => (
                  <tr key={item.id} className="border-b border-line last:border-0 hover:bg-subtle">
                    <td className="py-2.5 font-medium">{item.name}</td>
                    <td className="py-2.5 font-mono text-xs text-muted">
                      {item.hsnCode ?? '—'}
                    </td>
                    <td className="py-2.5 text-muted">{item.unit}</td>
                    <td className="py-2.5 text-right">{item.gstRate}%</td>
                    <td className="py-2.5 text-right tabular-nums">
                      {item.salePrice !== null ? inr(item.salePrice) : '—'}
                    </td>
                    <td className="py-2.5 text-right tabular-nums">
                      {item.purchasePrice !== null ? inr(item.purchasePrice) : '—'}
                    </td>
                    <td className="py-2.5 text-right tabular-nums">{item.openingStock}</td>
                    {canManage && (
                      <td className="py-2.5 text-right">
                        <button
                          onClick={() => startEdit(item)}
                          className="text-xs font-medium text-brand-600 hover:underline"
                        >
                          {tc('edit')}
                        </button>
                      </td>
                    )}
                  </tr>
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
