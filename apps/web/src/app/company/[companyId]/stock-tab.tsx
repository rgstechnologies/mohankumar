'use client';

import { Fragment } from 'react';import { useTranslations } from 'next-intl';
import { ExportButtons } from '@/components/table';
import { Card } from '@/components/ui';
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
}: {
  companyId: string;
  stock: StockRow[];
  items?: ItemRow[];
  canManage?: boolean;
  onChanged?: () => Promise<void>;
}) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-end gap-3">
        <ExportButtons companyId={companyId} report="stock" />
      </div>
      <CompanyStock companyId={companyId} stock={stock} />
    </div>
  );
}

// ----------------------------------------------------------------
// Stock on hand
// ----------------------------------------------------------------

function CompanyStock({ companyId, stock }: { companyId: string; stock: StockRow[] }) {
  const t = useTranslations('stock');
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
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line bg-subtle text-left text-[11px] font-semibold uppercase tracking-wide text-muted">
                <th className="py-2">{t('table.item')}</th>
                <th className="py-2 text-right">{t('table.opening')}</th>
                <th className="py-2 text-right">{t('table.in')}</th>
                <th className="py-2 text-right">{t('table.out')}</th>
                <th className="py-2 text-right">{t('table.onHand')}</th>
                <th className="py-2 text-right">{t('table.avgRate')}</th>
                <th className="py-2 text-right">{t('table.value')}</th>
              </tr>
            </thead>
            <tbody>
              {stock.map((row) => (
                <Fragment key={row.itemId}>
                <tr className="border-b border-line last:border-0 hover:bg-subtle">
                  <td className="py-2 font-medium">
                    {row.name}
                    {row.lowStock && (
                      <span className="ml-2 rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
                        {t('lowStockBadge')}
                      </span>
                    )}
                  </td>
                  <td className="py-2 text-right tabular-nums">
                    {row.openingStock} {row.unit}
                  </td>
                  <td className="py-2 text-right tabular-nums text-emerald-600">
                    +{row.purchasedQty}
                  </td>
                  <td className="py-2 text-right tabular-nums text-red-500">
                    −{row.soldQty}
                  </td>
                  <td className="py-2 text-right font-semibold tabular-nums">
                    {row.onHand} {row.unit}
                  </td>
                  <td className="py-2 text-right tabular-nums">₹{inr(row.avgRate)}</td>
                  <td className="py-2 text-right tabular-nums">₹{inr(row.stockValue)}</td>
                </tr>
                {row.trackBatches && row.batches.length > 0 && (
                  <tr className="border-b border-line hover:bg-subtle">
                    <td colSpan={7} className="bg-subtle/60 px-4 py-2">
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
        )}
      </Card>
    </>
  );
}

