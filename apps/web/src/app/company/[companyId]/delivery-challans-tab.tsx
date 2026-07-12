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
  type DeliveryChallanView,
  type ItemRow,
  type PartyRow,
} from '@/lib/accounting';
import { api, ApiError, downloadFile, printFile } from '@/lib/api';

const STATUS_STYLE: Record<string, string> = {
  OPEN: 'bg-sky-50 text-sky-700',
  CONVERTED: 'bg-brand-50 text-brand-700',
  CANCELLED: 'bg-red-50 text-red-600',
};

export function DeliveryChallansTab({
  companyId,
  parties,
  items,
  branches,
  challans,
  canBill,
  canCancel,
  onChanged,
}: {
  companyId: string;
  parties: PartyRow[];
  items: ItemRow[];
  branches: { id: string; name: string; isActive: boolean }[];
  challans: DeliveryChallanView[];
  canBill: boolean;
  canCancel: boolean;
  onChanged: () => Promise<void>;
}) {
  const t = useTranslations('deliveryChallans');
  const tc = useTranslations('common');
  const router = useRouter();

  const table = useTable(
    challans,
    (c) => `${c.challanNo} ${c.party.name} ${c.status} ${c.vehicleNo ?? ''}`,
  );
  const { toast, confirm } = useFeedback();
  const del = useDeleteDocument(onChanged);

  async function withPdf(dc: DeliveryChallanView, fn: (p: string) => Promise<void>) {
    try {
      await fn(`/companies/${companyId}/delivery-challans/${dc.id}/pdf`);
    } catch {
      toast(t('toast.pdfFailed'), 'error');
    }
  }

  async function convert(dc: DeliveryChallanView) {
    const ok = await confirm({
      title: t('convertDialog.title'),
      body: t('convertDialog.body', { no: dc.challanNo }),
      confirmLabel: t('convertDialog.confirm'),
    });
    if (!ok) return;
    try {
      const updated = await api.post<DeliveryChallanView>(
        `/companies/${companyId}/delivery-challans/${dc.id}/convert`,
      );
      await onChanged();
      toast(t('toast.converted', { no: updated.invoice?.invoiceNo ?? '' }));
    } catch (err) {
      toast(err instanceof ApiError ? err.message : t('toast.convertFailed'), 'error');
    }
  }

  async function cancel(dc: DeliveryChallanView) {
    const ok = await confirm({
      title: t('cancelDialog.title'),
      body: t('cancelDialog.body'),
      confirmLabel: t('cancelDialog.confirm'),
      danger: true,
    });
    if (!ok) return;
    try {
      await api.post(`/companies/${companyId}/delivery-challans/${dc.id}/cancel`);
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
            onClick={() => router.push(`/company/${companyId}/delivery-challans/new`)}
          >
            {t('newChallan')}
          </Button>
        )}
      </div>

      <Card>
        {challans.length === 0 ? (
          <EmptyState
            title={t('empty.title')}
            body={t('empty.body')}
            action={
              canBill && (
                <Button onClick={() => router.push(`/company/${companyId}/delivery-challans/new`)}>
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
                  <th className="py-2">{t('table.challan')}</th>
                  <th className="py-2">{tc('date')}</th>
                  <th className="py-2">{t('table.customer')}</th>
                  <th className="py-2">{t('table.vehicle')}</th>
                  <th className="py-2 text-right">{tc('total')}</th>
                  <th className="py-2 text-center">{tc('status')}</th>
                  <th className="py-2 text-right">{tc('actions')}</th>
                </tr>
              </thead>
              <tbody>
                {table.rows.map((dc) => (
                  <tr key={dc.id} className="border-b border-line last:border-0 align-top hover:bg-subtle">
                    <td className="py-2 font-mono text-xs">{dc.challanNo}</td>
                    <td className="py-2 whitespace-nowrap">
                      {new Date(dc.date).toLocaleDateString('en-IN')}
                    </td>
                    <td className="py-2">{dc.party.name}</td>
                    <td className="py-2 text-xs">{dc.vehicleNo || '—'}</td>
                    <td className="py-2 text-right tabular-nums">₹{inr(dc.total)}</td>
                    <td className="py-2 text-center">
                      <span
                        className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${STATUS_STYLE[dc.status]}`}
                      >
                        {t(`status.${dc.status}`)}
                      </span>
                      {dc.invoice && (
                        <div className="mt-0.5 font-mono text-[10px] text-brand-600">
                          {dc.invoice.invoiceNo}
                        </div>
                      )}
                    </td>
                    <td className="py-2 text-right text-xs whitespace-nowrap">
                      <RowActions
                        menuLabel={tc('actions')}
                        primary={{ label: 'PDF', onClick: () => void withPdf(dc, downloadFile) }}
                        actions={[
                          { label: tc('print'), onClick: () => void withPdf(dc, printFile) },
                          ...(canBill && dc.status === 'OPEN'
                            ? [{ label: tc('edit'), onClick: () => router.push(`/company/${companyId}/delivery-challans/${dc.id}/edit`) }]
                            : []),
                          ...(canBill && dc.status === 'OPEN'
                            ? [{ label: t('row.convert'), onClick: () => void convert(dc), tone: 'primary' as const }]
                            : []),
                          ...(canCancel && dc.status !== 'CONVERTED' && dc.status !== 'CANCELLED'
                            ? [{ label: tc('cancel'), onClick: () => void cancel(dc), tone: 'danger' as const, divider: true }]
                            : []),
                          ...(canCancel
                            ? [{ label: tc('delete'), onClick: () => void del(`/companies/${companyId}/delivery-challans/${dc.id}`), tone: 'danger' as const }]
                            : []),
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
