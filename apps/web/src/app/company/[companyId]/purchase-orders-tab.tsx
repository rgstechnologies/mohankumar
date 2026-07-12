'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useFeedback } from '@/components/feedback';
import { RowActions } from '@/components/row-actions';
import { useDeleteDocument } from '@/components/use-delete-document';
import { EmptyState, Pagination, SearchInput, useTable } from '@/components/table';
import { Badge, Button, Card, Input } from '@/components/ui';
import { inr, type ItemRow, type PartyRow } from '@/lib/accounting';
import { api, ApiError, downloadFile, printFile } from '@/lib/api';

export interface PoView {
  id: string;
  poNo: string;
  date: string;
  expectedDate: string | null;
  status: 'OPEN' | 'PARTIAL' | 'RECEIVED' | 'CLOSED' | 'CANCELLED';
  party: { id: string; name: string };
  branch?: { id: string; name: string } | null;
  value: number;
  receivedPct: number;
  lines: {
    id: string;
    itemId?: string | null;
    description: string;
    unit: string;
    quantity: number;
    rate: number;
    receivedQty: number;
    remainingQty: number;
  }[];
  grns: { id: string; grnNo: string; date: string; totalQty: number }[];
}

const STATUS_TONE: Record<PoView['status'], 'neutral' | 'good' | 'warn' | 'bad'> = {
  OPEN: 'neutral',
  PARTIAL: 'warn',
  RECEIVED: 'good',
  CLOSED: 'good',
  CANCELLED: 'bad',
};

export function PurchaseOrdersTab({
  companyId,
  parties: _parties,
  items: _items,
  branches: _branches,
  orders,
  canManage,
  onChanged,
}: {
  companyId: string;
  parties: PartyRow[];
  items: ItemRow[];
  branches: { id: string; name: string; isActive: boolean }[];
  orders: PoView[];
  canManage: boolean;
  onChanged: () => Promise<void>;
}) {
  const t = useTranslations('purchaseOrders');
  const tc = useTranslations('common');
  const { toast, confirm } = useFeedback();
  const router = useRouter();
  const table = useTable(orders, (po) => `${po.poNo} ${po.party.name} ${po.status}`);

  async function cancelPo(poId: string) {
    const ok = await confirm({
      title: t('confirmCancel.title'),
      body: t('confirmCancel.body'),
      confirmLabel: t('confirmCancel.confirmLabel'),
      danger: true,
    });
    if (!ok) return;
    try {
      await api.post(`/companies/${companyId}/purchase-orders/${poId}/cancel`);
      await onChanged();
      toast(t('toast.cancelled'), 'info');
    } catch (err) {
      toast(err instanceof ApiError ? err.message : t('toast.failed'), 'error');
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
            variant="primary"
            onClick={() => router.push(`/company/${companyId}/purchase-orders/new`)}
          >
            {t('newPo')}
          </Button>
        )}
      </div>

      <Card>
        {orders.length === 0 ? (
          <EmptyState
            title={t('empty.title')}
            body={t('empty.body')}
            action={
              canManage && (
                <Button onClick={() => router.push(`/company/${companyId}/purchase-orders/new`)}>
                  {t('empty.action')}
                </Button>
              )
            }
          />
        ) : (
          <>
            <div className="overflow-x-auto"><table className="w-full min-w-[600px] text-sm">
              <thead>
                <tr className="border-b border-line bg-subtle text-left text-[11px] font-semibold uppercase tracking-wide text-muted">
                  <th className="py-2">{t('table.po')}</th>
                  <th className="py-2">{tc('date')}</th>
                  <th className="py-2">{t('vendor')}</th>
                  <th className="py-2 text-right">{t('table.value')}</th>
                  <th className="py-2">{t('table.received')}</th>
                  <th className="py-2 text-center">{tc('status')}</th>
                  <th className="py-2 text-right">{tc('actions')}</th>
                </tr>
              </thead>
              <tbody>
                {table.rows.map((po) => (
                  <PoRow
                    key={po.id}
                    companyId={companyId}
                    po={po}
                    canManage={canManage}
                    onChanged={onChanged}
                    onCancel={() => cancelPo(po.id)}
                    onEdit={() => router.push(`/company/${companyId}/purchase-orders/${po.id}/edit`)}
                  />
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

function PoRow({
  companyId,
  po,
  canManage,
  onChanged,
  onCancel,
  onEdit,
}: {
  companyId: string;
  po: PoView;
  canManage: boolean;
  onChanged: () => Promise<void>;
  onCancel: () => void;
  onEdit: () => void;
}) {
  const t = useTranslations('purchaseOrders');
  const tc = useTranslations('common');
  const { toast } = useFeedback();
  const del = useDeleteDocument(onChanged);
  const [showReceive, setShowReceive] = useState(false);
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const receivable = po.status === 'OPEN' || po.status === 'PARTIAL';
  const convertible = po.status === 'PARTIAL' || po.status === 'RECEIVED';

  async function withPdf(fn: (p: string) => Promise<void>) {
    try {
      await fn(`/companies/${companyId}/purchase-orders/${po.id}/pdf`);
    } catch {
      toast(t('toast.failed'), 'error');
    }
  }

  async function onReceive(e: React.FormEvent) {
    e.preventDefault();
    const lines = po.lines
      .filter((l) => Number(quantities[l.id]) > 0)
      .map((l) => ({ poLineId: l.id, quantity: Number(quantities[l.id]) }));
    if (lines.length === 0) return;
    setBusy(true);
    try {
      await api.post(`/companies/${companyId}/purchase-orders/${po.id}/grns`, {
        date: new Date().toISOString().slice(0, 10),
        lines,
      });
      setShowReceive(false);
      setQuantities({});
      await onChanged();
      toast(t('toast.grnRecorded'));
    } catch (err) {
      toast(err instanceof ApiError ? err.message : t('toast.failed'), 'error');
    } finally {
      setBusy(false);
    }
  }

  async function onConvert() {
    setBusy(true);
    try {
      await api.post(`/companies/${companyId}/purchase-orders/${po.id}/convert-to-bill`, {
        date: new Date().toISOString().slice(0, 10),
      });
      await onChanged();
      toast(t('toast.billBooked'));
    } catch (err) {
      toast(err instanceof ApiError ? err.message : t('toast.failed'), 'error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <tr className="border-b border-line last:border-0 hover:bg-subtle">
        <td className="py-2 font-mono text-xs">{po.poNo}</td>
        <td className="py-2 whitespace-nowrap">
          {new Date(po.date).toLocaleDateString('en-IN')}
        </td>
        <td className="py-2">{po.party.name}</td>
        <td className="py-2 text-right tabular-nums">₹{inr(po.value)}</td>
        <td className="py-2">
          <div className="flex items-center gap-2">
            <div className="h-1.5 w-20 overflow-hidden rounded-full bg-subtle">
              <div
                className="h-full rounded-full bg-brand-500"
                style={{ width: `${po.receivedPct}%` }}
              />
            </div>
            <span className="text-xs tabular-nums text-muted">{po.receivedPct}%</span>
          </div>
        </td>
        <td className="py-2 text-center">
          <Badge tone={STATUS_TONE[po.status]}>{t(`status.${po.status}`)}</Badge>
        </td>
        <td className="py-2 text-right text-xs whitespace-nowrap">
          <RowActions
            menuLabel={tc('actions')}
            primary={{ label: 'PDF', onClick: () => void withPdf(downloadFile) }}
            actions={[
              { label: tc('print'), onClick: () => void withPdf(printFile) },
              ...(canManage && receivable
                ? [{
                    label: showReceive ? t('rowActions.close') : t('rowActions.receive'),
                    onClick: () => setShowReceive(!showReceive),
                    tone: 'success' as const,
                  }]
                : []),
              ...(canManage && convertible
                ? [{ label: t('rowActions.toBill'), onClick: () => void onConvert(), tone: 'primary' as const }]
                : []),
              ...(canManage && po.status === 'OPEN'
                ? [{ label: tc('edit'), onClick: onEdit }]
                : []),
              ...(canManage && po.status === 'OPEN'
                ? [{ label: t('rowActions.cancel'), onClick: onCancel, tone: 'danger' as const, divider: true as const }]
                : []),
              ...(canManage
                ? [{ label: tc('delete'), onClick: () => void del(`/companies/${companyId}/purchase-orders/${po.id}`), tone: 'danger' as const }]
                : []),
            ]}
          />
        </td>
      </tr>
      {showReceive && (
        <tr>
          <td colSpan={7} className="bg-subtle px-4 py-3">
            <form onSubmit={onReceive} className="space-y-2">
              {po.lines
                .filter((l) => l.remainingQty > 0)
                .map((l) => (
                  <div key={l.id} className="flex flex-wrap items-center gap-3 text-sm">
                    <span className="min-w-48 flex-1">{l.description}</span>
                    <span className="text-xs text-faint">
                      {t('remaining', { qty: l.remainingQty, unit: l.unit })}
                    </span>
                    <Input
                      type="number"
                      step="0.001"
                      min="0"
                      max={l.remainingQty}
                      value={quantities[l.id] ?? ''}
                      onChange={(e) =>
                        setQuantities((prev) => ({ ...prev, [l.id]: e.target.value }))
                      }
                      placeholder={t('qtyReceived')}
                      className="w-36"
                    />
                  </div>
                ))}
              <div className="flex justify-end">
                <Button type="submit" disabled={busy}>
                  {busy ? '…' : t('recordReceipt')}
                </Button>
              </div>
            </form>
          </td>
        </tr>
      )}
    </>
  );
}
