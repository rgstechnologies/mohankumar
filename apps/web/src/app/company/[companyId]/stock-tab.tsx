'use client';

import { useState, Fragment } from 'react';
import { useTranslations } from 'next-intl';
import { SearchInput, useTable } from '@/components/table';
import { Button, Card } from '@/components/ui';
import { StockUpdateModal } from '@/components/stock-update-modal';
import { inr, type ItemRow, type StockRow } from '@/lib/accounting';

/**
 * Stock on hand, derived from the documents: opening + purchased − sold, with
 * sales returns added back. There is no separate stock ledger to drift out of
 * sync — the numbers are always a function of the bills and invoices that exist.
 *
 * Stock is deliberately NOT scoped to the financial year on screen: closing
 * stock carries across the year boundary, so what you hold today is what you
 * hold regardless of which year's documents you are looking at.
 */
export function StockTab({
  companyId,
  stock,
  items,
  canManage = true,
  onChanged,
}: {
  companyId: string;
  stock: StockRow[];
  items?: ItemRow[];
  canManage?: boolean;
  onChanged?: () => Promise<void>;
}) {
  const t = useTranslations('stock');
  const table = useTable(stock, (s) => `${s.name} ${s.sku ?? ''} ${s.hsnCode ?? ''}`);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingStock, setEditingStock] = useState<StockRow | null>(null);

  function startEdit(stockRow: StockRow) {
    setEditingStock(stockRow);
    setModalOpen(true);
  }

  async function handleModalSaved() {
    setEditingStock(null);
    if (onChanged) await onChanged();
  }

  function handleModalClose() {
    setModalOpen(false);
    setEditingStock(null);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SearchInput
          value={table.query}
          onChange={table.setQuery}
          placeholder={t('searchPlaceholder')}
        />
        <div className="flex items-center gap-3">
          {canManage && (
            <Button
              variant="primary"
              onClick={() => {
                setEditingStock(null);
                setModalOpen(true);
              }}
            >
              {t('updateStockButton')}
            </Button>
          )}
        </div>
      </div>
      <CompanyStock 
        companyId={companyId} 
        stock={table.rows} 
        canManage={canManage}
        onStartEdit={startEdit}
      />
      {modalOpen && (
        <StockUpdateModal
          companyId={companyId}
          isOpen={modalOpen}
          initialStockRow={
            editingStock
              ? {
                  itemId: editingStock.itemId,
                  name: editingStock.name,
                  sku: editingStock.sku,
                  hsnCode: editingStock.hsnCode,
                  openingStock: editingStock.openingStock,
                }
              : null
          }
          items={items ?? []}
          onSaved={handleModalSaved}
          onClose={handleModalClose}
        />
      )}
    </div>
  );
}

// ----------------------------------------------------------------
// Stock on hand
// ----------------------------------------------------------------

function CompanyStock({ 
  companyId, 
  stock, 
  canManage, 
  onStartEdit 
}: { 
  companyId: string; 
  stock: StockRow[];
  canManage?: boolean;
  onStartEdit?: (stockRow: StockRow) => void;
}) {
  const t = useTranslations('stock');
  const tc = useTranslations('common');
  const totalValue = stock.reduce((sum, s) => sum + s.stockValue, 0);
  const lowStockCount = stock.filter((s) => s.lowStock).length;
  void companyId;

  return (
    <>
      <div className="grid grid-cols-2 gap-4">
        <Card>
          <p className="text-xs uppercase tracking-wide text-faint">{t('stockValue')}</p>
          <p className="mt-1 text-2xl font-bold tabular-nums">₹{inr(totalValue)}</p>
        </Card>
        <Card>
          <p className="text-xs uppercase tracking-wide text-faint">{t('lowStockItems')}</p>
          <p
            className={`mt-1 text-2xl font-bold tabular-nums ${lowStockCount > 0 ? 'text-amber-600' : ''}`}
          >
            {lowStockCount}
          </p>
        </Card>
      </div>

      <Card>
        {stock.length === 0 ? (
          <p className="text-sm text-muted">{t('noItems')}</p>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[600px] text-sm">
                <thead>
                  <tr className="border-b border-line bg-subtle text-left text-[11px] font-bold uppercase tracking-wide text-muted">
                    <th className="w-auto px-4 py-3 text-left">{t('table.item')}</th>
                    <th className="w-fit px-3 py-3 text-center">{t('table.itemCode')}</th>
                    <th className="w-fit px-3 py-3 text-center">{t('table.hsn')}</th>
                    <th className="w-fit px-3 py-3 text-right">{t('table.opening')}</th>
                    <th className="w-fit px-3 py-3 text-right">{t('table.onHand')}</th>
                    <th className="w-fit px-3 py-3 text-right">{t('table.value')}</th>
                    {canManage && <th className="w-fit px-4 py-3 text-center">{tc('actions')}</th>}
                  </tr>
                </thead>
                <tbody>
                  {stock.map((row) => (
                    <Fragment key={row.itemId}>
                      <tr className="border-b border-line last:border-0 hover:bg-subtle">
                        <td className="px-4 py-3 font-medium text-left">
                          {row.name}
                          {row.lowStock && (
                            <span className="ml-2 rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
                              {t('lowStockBadge')}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-3 font-mono text-xs text-muted text-center">
                          {row.sku ?? 'N/A'}
                        </td>
                        <td className="px-3 py-3 font-mono text-xs text-muted text-center">
                          {row.hsnCode ?? 'N/A'}
                        </td>
                        <td className="px-3 py-3 text-right tabular-nums">
                          {row.openingStock} {row.unit}
                        </td>
                        <td className="px-3 py-3 text-right font-semibold tabular-nums">
                          {row.onHand} {row.unit}
                        </td>
                        <td className="px-3 py-3 text-right tabular-nums">₹{inr(row.stockValue)}</td>
                        {canManage && (
                          <td className="px-4 py-3 text-center">
                            <Button
                              variant="secondary"
                              onClick={() => onStartEdit?.(row)}
                              className="px-2 py-1 text-xs"
                            >
                              {t('table.update')}
                            </Button>
                          </td>
                        )}
                      </tr>
                      {row.trackBatches && row.batches.length > 0 && (
                        <tr className="border-b border-line hover:bg-subtle">
                          <td colSpan={canManage ? 7 : 6} className="bg-subtle/60 px-4 py-2">
                            <div className="flex flex-wrap gap-2">
                              {row.batches.map((b) => (
                                <span
                                  key={b.batchNo}
                                  className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs ${
                                    b.expired
                                      ? 'border-red-200 bg-red-50 text-red-700'
                                      : b.expiringSoon
                                        ? 'border-amber-200 bg-amber-50 text-amber-700'
                                        : 'border-line bg-surface text-muted'
                                  }`}
                                >
                                  <span className="font-mono font-medium">{b.batchNo}</span>
                                  <span className="tabular-nums">{b.qty} {row.unit}</span>
                                  {b.expiryDate && (
                                    <span>
                                      {t('batch.exp', {
                                        date: new Date(b.expiryDate).toLocaleDateString('en-IN'),
                                      })}
                                      {b.expired
                                        ? ` ${t('batch.expired')}`
                                        : b.expiringSoon
                                          ? ` ${t('batch.soon')}`
                                          : ''}
                                    </span>
                                  )}
                                </span>
                              ))}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Card>
    </>
  );
}

