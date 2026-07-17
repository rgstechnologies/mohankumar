'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { EmptyState, Pagination, SearchInput, useTable } from '@/components/table';
import { Button, Card } from '@/components/ui';
import { ItemFormModal } from '@/components/item-form-modal-full';
import { inr, type ItemRow } from '@/lib/accounting';

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
  const [modalOpen, setModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<ItemRow | null>(null);

  function startEdit(item: ItemRow) {
    setEditingItem(item);
    setModalOpen(true);
  }

  async function handleModalSaved() {
    setEditingItem(null);
    await onChanged();
  }

  function handleModalClose() {
    setModalOpen(false);
    setEditingItem(null);
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
            variant="primary"
            onClick={() => {
              setEditingItem(null);
              setModalOpen(true);
            }}
          >
            {t('newItem')}
          </Button>
        )}
      </div>


      <Card>
        {items.length === 0 ? (
          <EmptyState
            title={t('empty.title')}
            body={t('empty.body')}
            action={
              canManage && (
                <Button onClick={() => {
                  setEditingItem(null);
                  setModalOpen(true);
                }}>{t('empty.addItem')}</Button>
              )
            }
          />
        ) : (
          <>
            <div className="overflow-x-auto"><table className="w-full min-w-[600px] text-sm">
              <thead>
                <tr className="border-b border-line bg-subtle text-left text-[11px] font-bold uppercase tracking-wide text-muted">
                  <th className="w-auto px-4 py-3 text-left">{t('table.item')}</th>
                  <th className="w-fit px-3 py-3 text-center">{t('table.itemCode')}</th>
                  <th className="w-fit px-3 py-3 text-center">{t('table.hsn')}</th>
                  <th className="w-fit px-3 py-3 text-center">{t('table.gst')}</th>
                  <th className="w-fit px-3 py-3 text-right">{t('table.saleRupees')}</th>
                  <th className="w-fit px-3 py-3 text-right">{t('table.opening')}</th>
                  {canManage && <th className="w-fit px-4 py-3 text-center">{tc('actions')}</th>}
                </tr>
              </thead>
              <tbody>
                {table.rows.map((item) => (
                  <tr key={item.id} className="border-b border-line last:border-0 hover:bg-subtle">
                    <td className="px-4 py-3 font-medium text-left">{item.name}</td>
                    <td className="px-3 py-3 font-mono text-xs text-muted text-center">
                      {item.sku ?? 'N/A'}
                    </td>
                    <td className="px-3 py-3 font-mono text-xs text-muted text-center">
                      {item.hsnCode ?? 'N/A'}
                    </td>
                    <td className="px-3 py-3 text-center">{item.gstRate}%</td>
                    <td className="px-3 py-3 text-right tabular-nums">
                      {item.salePrice !== null ? `₹${inr(item.salePrice)}` : '₹0.00'}
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums">{item.openingStock}</td>
                    {canManage && (
                      <td className="px-4 py-3 text-center">
                        <Button
                          variant="secondary"
                          onClick={() => startEdit(item)}
                          className="px-2 py-1 text-xs"
                        >
                          {tc('edit')}
                        </Button>
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

      <ItemFormModal
        companyId={companyId}
        isOpen={modalOpen}
        initialItem={editingItem}
        onSaved={handleModalSaved}
        onClose={handleModalClose}
      />
    </div>
  );
}
