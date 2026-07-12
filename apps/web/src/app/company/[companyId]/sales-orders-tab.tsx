'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { EmptyState, Pagination, SearchInput, useTable } from '@/components/table';
import { useFeedback } from '@/components/feedback';
import { RowActions } from '@/components/row-actions';
import { useDeleteDocument } from '@/components/use-delete-document';
import { Button, Card } from '@/components/ui';
import {
  inr,
  type SalesOrderView,
  type ItemRow,
  type PartyRow,
} from '@/lib/accounting';
import { api, ApiError, downloadFile, printFile } from '@/lib/api';

const STATUS_STYLE: Record<string, string> = {
  OPEN: 'bg-sky-50 text-sky-700',
  CONVERTED: 'bg-brand-50 text-brand-700',
  CANCELLED: 'bg-red-50 text-red-600',
};

export function SalesOrdersTab({
  companyId,
  parties,
  items,
  branches,
  orders,
  canBill,
  canCancel,
  onChanged,
}: {
  companyId: string;
  parties: PartyRow[];
  items: ItemRow[];
  branches: { id: string; name: string; isActive: boolean }[];
  orders: SalesOrderView[];
  canBill: boolean;
  canCancel: boolean;
  onChanged: () => Promise<void>;
}) {
  const t = useTranslations('salesOrders');
  const tc = useTranslations('common');
  const router = useRouter();

  const table = useTable(
    orders,
    (o) => `${o.orderNo} ${o.party.name} ${o.status}`,
  );
  const { toast, confirm } = useFeedback();
  const del = useDeleteDocument(onChanged);

  async function withPdf(so: SalesOrderView, fn: (p: string) => Promise<void>) {
    try {
      await fn(`/companies/${companyId}/sales-orders/${so.id}/pdf`);
    } catch {
      toast(t('toast.pdfFailed'), 'error');
    }
  }

  async function convert(so: SalesOrderView) {
    const ok = await confirm({
      title: t('convertDialog.title'),
      body: t('convertDialog.body', { no: so.orderNo }),
      confirmLabel: t('convertDialog.confirm'),
    });
    if (!ok) return;
    try {
      const updated = await api.post<SalesOrderView>(
        `/companies/${companyId}/sales-orders/${so.id}/convert`,
      );
      await onChanged();
      toast(t('toast.converted', { no: updated.invoice?.invoiceNo ?? '' }));
    } catch (err) {
      toast(err instanceof ApiError ? err.message : t('toast.convertFailed'), 'error');
    }
  }

  async function cancel(so: SalesOrderView) {
    const ok = await confirm({
      title: t('cancelDialog.title'),
      body: t('cancelDialog.body'),
      confirmLabel: t('cancelDialog.confirm'),
      danger: true,
    });
    if (!ok) return;
    try {
      await api.post(`/companies/${companyId}/sales-orders/${so.id}/cancel`);
      await onChanged();
      toast(t('toast.cancelled'), 'info');
    } catch (err) {
      toast(err instanceof ApiError ? err.message : tc('somethingWentWrong'), 'error');
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
        {canBill && (
          <Button
            variant="primary"
            onClick={() => router.push(`/company/${companyId}/sales-orders/new`)}
          >
            {t('newOrder')}
          </Button>
        )}
      </div>

      <Card>
        {orders.length === 0 ? (
          <EmptyState
            title={t('empty.title')}
            body={t('empty.body')}
            action={
              canBill && (
                <Button onClick={() => router.push(`/company/${companyId}/sales-orders/new`)}>
                  {t('empty.cta')}
                </Button>
              )
            }
          />
        ) : (
          <>
            <div className="overflow-x-auto"><table className="w-full min-w-[600px] text-sm">
              <thead>
                <tr className="border-b border-line bg-subtle text-left text-[11px] font-semibold uppercase tracking-wide text-muted">
                  <th className="py-2">{t('table.order')}</th>
                  <th className="py-2">{tc('date')}</th>
                  <th className="py-2">{t('table.customer')}</th>
                  <th className="py-2">{t('table.expected')}</th>
                  <th className="py-2 text-right">{tc('total')}</th>
                  <th className="py-2 text-center">{tc('status')}</th>
                  <th className="py-2 text-right">{tc('actions')}</th>
                </tr>
              </thead>
              <tbody>
                {table.rows.map((so) => (
                  <tr key={so.id} className="border-b border-line last:border-0 align-top hover:bg-subtle">
                    <td className="py-2 font-mono text-xs">{so.orderNo}</td>
                    <td className="py-2 whitespace-nowrap">
                      {new Date(so.date).toLocaleDateString('en-IN')}
                    </td>
                    <td className="py-2">{so.party.name}</td>
                    <td className="py-2 whitespace-nowrap text-xs">
                      {so.expectedDate
                        ? new Date(so.expectedDate).toLocaleDateString('en-IN')
                        : '—'}
                      {so.isOverdue && (
                        <span className="ml-1 rounded bg-amber-50 px-1 py-0.5 text-[10px] text-amber-700">
                          {t('overdue')}
                        </span>
                      )}
                    </td>
                    <td className="py-2 text-right tabular-nums">₹{inr(so.total)}</td>
                    <td className="py-2 text-center">
                      <span
                        className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${STATUS_STYLE[so.status]}`}
                      >
                        {t(`status.${so.status}`)}
                      </span>
                      {so.invoice && (
                        <div className="mt-0.5 font-mono text-[10px] text-brand-600">
                          {so.invoice.invoiceNo}
                        </div>
                      )}
                    </td>
                    <td className="py-2 text-right text-xs whitespace-nowrap">
                      <RowActions
                        menuLabel={tc('actions')}
                        primary={{ label: 'PDF', onClick: () => void withPdf(so, downloadFile) }}
                        actions={[
                          { label: tc('print'), onClick: () => void withPdf(so, printFile) },
                          ...(canBill && so.status === 'OPEN'
                            ? [{ label: tc('edit'), onClick: () => router.push(`/company/${companyId}/sales-orders/${so.id}/edit`) }] : []),
                          ...(canBill && so.status === 'OPEN'
                            ? [{ label: t('row.convert'), onClick: () => void convert(so), tone: 'primary' as const }] : []),
                          ...(canCancel && so.status !== 'CONVERTED' && so.status !== 'CANCELLED'
                            ? [{ label: tc('cancel'), onClick: () => void cancel(so), tone: 'danger' as const, divider: true }] : []),
                          ...(canCancel
                            ? [{ label: tc('delete'), onClick: () => void del(`/companies/${companyId}/sales-orders/${so.id}`), tone: 'danger' as const }] : []),
                        ]}
                      />
                    </td>
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
