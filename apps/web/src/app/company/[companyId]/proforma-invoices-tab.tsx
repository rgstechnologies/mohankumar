'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { EmptyState, Pagination, SearchInput, useTable } from '@/components/table';
import { useFeedback } from '@/components/feedback';
import { Button, Card } from '@/components/ui';
import { RowActions } from '@/components/row-actions';
import { useDeleteDocument } from '@/components/use-delete-document';
import {
  inr,
  type ProformaInvoiceView,
  type ItemRow,
  type PartyRow,
} from '@/lib/accounting';
import { api, ApiError, downloadFile, printFile } from '@/lib/api';

const STATUS_STYLE: Record<string, string> = {
  OPEN: 'bg-sky-50 text-sky-700',
  ACCEPTED: 'bg-emerald-50 text-emerald-700',
  DECLINED: 'bg-subtle text-muted',
  CONVERTED: 'bg-brand-50 text-brand-700',
  CANCELLED: 'bg-red-50 text-red-600',
};

export function ProformaInvoicesTab({
  companyId,
  parties,
  items,
  branches,
  proformaInvoices,
  canBill,
  canCancel,
  onChanged,
}: {
  companyId: string;
  parties: PartyRow[];
  items: ItemRow[];
  branches: { id: string; name: string; isActive: boolean }[];
  proformaInvoices: ProformaInvoiceView[];
  canBill: boolean;
  canCancel: boolean;
  onChanged: () => Promise<void>;
}) {
  const t = useTranslations('proformaInvoices');
  const tc = useTranslations('common');
  const router = useRouter();

  const table = useTable(
    proformaInvoices,
    (e) => `${e.proformaNo} ${e.party.name} ${e.status}`,
  );
  const { toast, confirm } = useFeedback();
  const del = useDeleteDocument(onChanged);

  async function withPdf(est: ProformaInvoiceView, fn: (p: string) => Promise<void>) {
    try {
      await fn(`/companies/${companyId}/proforma-invoices/${est.id}/pdf`);
    } catch {
      toast(t('toast.pdfFailed'), 'error');
    }
  }

  async function setStatus(est: ProformaInvoiceView, status: 'ACCEPTED' | 'DECLINED' | 'OPEN') {
    try {
      await api.post(`/companies/${companyId}/proforma-invoices/${est.id}/status`, { status });
      await onChanged();
      toast(t('toast.statusChanged'));
    } catch (err) {
      toast(err instanceof ApiError ? err.message : tc('somethingWentWrong'), 'error');
    }
  }

  async function convert(est: ProformaInvoiceView) {
    const ok = await confirm({
      title: t('convertDialog.title'),
      body: t('convertDialog.body', { no: est.proformaNo }),
      confirmLabel: t('convertDialog.confirm'),
    });
    if (!ok) return;
    try {
      const updated = await api.post<ProformaInvoiceView>(
        `/companies/${companyId}/proforma-invoices/${est.id}/convert`,
      );
      await onChanged();
      toast(t('toast.converted', { no: updated.invoice?.invoiceNo ?? '' }));
    } catch (err) {
      toast(err instanceof ApiError ? err.message : t('toast.convertFailed'), 'error');
    }
  }

  async function cancel(est: ProformaInvoiceView) {
    const ok = await confirm({
      title: t('cancelDialog.title'),
      body: t('cancelDialog.body'),
      confirmLabel: t('cancelDialog.confirm'),
      danger: true,
    });
    if (!ok) return;
    try {
      await api.post(`/companies/${companyId}/proforma-invoices/${est.id}/cancel`);
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
            onClick={() => router.push(`/company/${companyId}/proforma-invoices/new`)}
          >
            {t('newEstimate')}
          </Button>
        )}
      </div>

      <Card>
        {proformaInvoices.length === 0 ? (
          <EmptyState
            title={t('empty.title')}
            body={t('empty.body')}
            action={
              canBill && (
                <Button onClick={() => router.push(`/company/${companyId}/proforma-invoices/new`)}>
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
                  <th className="py-2">{t('table.estimate')}</th>
                  <th className="py-2">{tc('date')}</th>
                  <th className="py-2">{t('table.customer')}</th>
                  <th className="py-2">{t('table.validUntil')}</th>
                  <th className="py-2 text-right">{tc('total')}</th>
                  <th className="py-2 text-center">{tc('status')}</th>
                  <th className="py-2 text-right">{tc('actions')}</th>
                </tr>
              </thead>
              <tbody>
                {table.rows.map((est) => (
                  <tr key={est.id} className="border-b border-line last:border-0 align-top hover:bg-subtle">
                    <td className="py-2 font-mono text-xs">{est.proformaNo}</td>
                    <td className="py-2 whitespace-nowrap">
                      {new Date(est.date).toLocaleDateString('en-IN')}
                    </td>
                    <td className="py-2">{est.party.name}</td>
                    <td className="py-2 whitespace-nowrap text-xs">
                      {est.validUntil
                        ? new Date(est.validUntil).toLocaleDateString('en-IN')
                        : '—'}
                      {est.isExpired && (
                        <span className="ml-1 rounded bg-amber-50 px-1 py-0.5 text-[10px] text-amber-700">
                          {t('expired')}
                        </span>
                      )}
                    </td>
                    <td className="py-2 text-right tabular-nums">₹{inr(est.total)}</td>
                    <td className="py-2 text-center">
                      <span
                        className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${STATUS_STYLE[est.status]}`}
                      >
                        {t(`status.${est.status}`)}
                      </span>
                      {est.invoice && (
                        <div className="mt-0.5 font-mono text-[10px] text-brand-600">
                          {est.invoice.invoiceNo}
                        </div>
                      )}
                    </td>
                    <td className="py-2 text-right text-xs whitespace-nowrap">
                      <RowActions
                        menuLabel={tc('actions')}
                        primary={{ label: 'PDF', onClick: () => void withPdf(est, downloadFile) }}
                        actions={[
                          { label: tc('print'), onClick: () => void withPdf(est, printFile) },
                          ...(canBill && est.status !== 'CONVERTED' && est.status !== 'CANCELLED'
                            ? [{ label: tc('edit'), onClick: () => router.push(`/company/${companyId}/proforma-invoices/${est.id}/edit`) }]
                            : []),
                          ...(canBill && est.status === 'OPEN'
                            ? [
                                { label: t('row.accept'), onClick: () => void setStatus(est, 'ACCEPTED'), tone: 'success' as const },
                                { label: t('row.decline'), onClick: () => void setStatus(est, 'DECLINED') },
                              ]
                            : []),
                          ...(canBill && (est.status === 'OPEN' || est.status === 'ACCEPTED')
                            ? [{ label: t('row.convert'), onClick: () => void convert(est), tone: 'primary' as const }]
                            : []),
                          ...(canCancel && est.status !== 'CONVERTED' && est.status !== 'CANCELLED'
                            ? [{ label: tc('cancel'), onClick: () => void cancel(est), tone: 'danger' as const, divider: true }]
                            : []),
                          ...(canCancel
                            ? [{ label: tc('delete'), onClick: () => void del(`/companies/${companyId}/proforma-invoices/${est.id}`), tone: 'danger' as const }]
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
