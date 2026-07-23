'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { EmptyState, ExportButtons, Pagination, SearchInput, useTable } from '@/components/table';
import { useFeedback } from '@/components/feedback';
import { Button, Card, ErrorText, Input, Select } from '@/components/ui';
import {
  inr,
  type InvoiceView,
  type LedgerRow,
} from '@/lib/accounting';
import { api, ApiError, downloadFile, printFile } from '@/lib/api';
import { RowActions } from '@/components/row-actions';
import { useDeleteDocument } from '@/components/use-delete-document';
export function InvoicesTab({
  companyId,
  ledgers,
  invoices,
  canBill,
  canCancel,
  onChanged,
}: {
  companyId: string;
  ledgers: LedgerRow[];
  invoices: InvoiceView[];
  canBill: boolean;
  canCancel: boolean;
  onChanged: () => Promise<void>;
}) {
  const t = useTranslations('invoices');
  const tc = useTranslations('common');
  const router = useRouter();
  const cashBankLedgers = useMemo(
    () =>
      ledgers.filter((l) => ['Cash-in-Hand', 'Bank Accounts'].includes(l.group.name)),
    [ledgers],
  );

  const table = useTable(
    invoices,
    (inv) => `${inv.invoiceNo} ${inv.party.name} ${inv.paymentStatus}`,
  );
  const { toast, confirm } = useFeedback();

  // When sales payments are reconciled against estimates (Profile → Payment
  // linking = estimate), invoices must NOT expose a Make-Payment action — all
  // Payment In flows through the linked sales estimate instead.
  const [estimateLinked, setEstimateLinked] = useState(false);
  useEffect(() => {
    api
      .get<{ salesPaymentLink?: string }>(`/companies/${companyId}`)
      .then((c) => setEstimateLinked(c.salesPaymentLink === 'estimate'))
      .catch(() => {});
  }, [companyId]);

  async function downloadPdf(invoice: InvoiceView) {
    try {
      await downloadFile(`/companies/${companyId}/invoices/${invoice.id}/pdf`);
    } catch {
      toast(t('toast.pdfFailed'), 'error');
    }
  }

  async function printPdf(invoice: InvoiceView) {
    try {
      await printFile(`/companies/${companyId}/invoices/${invoice.id}/pdf`);
    } catch {
      toast(t('toast.pdfFailed'), 'error');
    }
  }

  async function cancelInvoice(invoiceId: string) {
    const ok = await confirm({
      title: t('cancelDialog.title'),
      body: t('cancelDialog.body'),
      confirmLabel: t('cancelDialog.confirm'),
      danger: true,
    });
    if (!ok) return;
    try {
      await api.post(`/companies/${companyId}/invoices/${invoiceId}/cancel`);
      await onChanged();
      toast(t('toast.cancelled'), 'info');
    } catch (err) {
      toast(err instanceof ApiError ? err.message : t('toast.cancelFailed'), 'error');
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
        <ExportButtons companyId={companyId} report="invoices" />
        {canBill && (
          <Button
            variant="primary"
            onClick={() => router.push(`/company/${companyId}/invoices/new`)}
          >
            {t('newInvoice')}
          </Button>
        )}
      </div>

      <Card>
        {invoices.length === 0 ? (
          <EmptyState
            title={t('empty.title')}
            body={t('empty.body')}
            action={
              canBill && (
                <Button onClick={() => router.push(`/company/${companyId}/invoices/new`)}>
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
                  <th className="py-2">{t('table.invoice')}</th>
                  <th className="py-2">{tc('date')}</th>
                  <th className="py-2">{t('table.customer')}</th>
                  <th className="py-2 text-right">{tc('total')}</th>
                  <th className="py-2 text-right">{tc('actions')}</th>
                </tr>
              </thead>
              <tbody>
                {table.rows.map((invoice) => (
                  <InvoiceRow
                    key={invoice.id}
                    companyId={companyId}
                    invoice={invoice}
                    cashBankLedgers={cashBankLedgers}
                    canBill={canBill}
                    canCancel={canCancel}
                    estimateLinked={estimateLinked}
                    onChanged={onChanged}
                    onDownload={() => downloadPdf(invoice)}
                    onPrint={() => printPdf(invoice)}
                    onCancel={() => cancelInvoice(invoice.id)}
                    onEdit={() => router.push(`/company/${companyId}/invoices/${invoice.id}/edit`)}
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

function InvoiceRow({
  companyId,
  invoice,
  cashBankLedgers,
  canBill,
  canCancel,
  estimateLinked,
  onChanged,
  onDownload,
  onPrint,
  onCancel,
  onEdit,
}: {
  companyId: string;
  invoice: InvoiceView;
  cashBankLedgers: LedgerRow[];
  canBill: boolean;
  canCancel: boolean;
  estimateLinked: boolean;
  onChanged: () => Promise<void>;
  onDownload: () => void;
  onPrint: () => void;
  onCancel: () => void;
  onEdit: () => void;
}) {
  const t = useTranslations('invoices');
  const tc = useTranslations('common');
  const { toast } = useFeedback();
  const del = useDeleteDocument(onChanged);
  const [eiBusy, setEiBusy] = useState(false);
  const [showPay, setShowPay] = useState(false);
  const [showEwb, setShowEwb] = useState(false);
  const [ewbBusy, setEwbBusy] = useState(false);
  const [ewbMode, setEwbMode] = useState('ROAD');
  const [ewbVehicle, setEwbVehicle] = useState('');
  const [ewbDistance, setEwbDistance] = useState('');
  const [ewbTransporter, setEwbTransporter] = useState('');
  // Set when generation is blocked because the company hasn't saved its NIC
  // e-way bill API credentials — shows a setup prompt with direct links.
  const [ewbNeedsCreds, setEwbNeedsCreds] = useState(false);

  async function generateEwb(e: React.FormEvent) {
    e.preventDefault();
    setEwbBusy(true);
    try {
      const ewb = await api.post<{ ewbNo: string }>(
        `/companies/${companyId}/invoices/${invoice.id}/eway-bill/generate`,
        {
          transportMode: ewbMode,
          distanceKm: Number(ewbDistance) || 0,
          vehicleNo: ewbVehicle || undefined,
          transporterName: ewbTransporter || undefined,
        },
      );
      setShowEwb(false);
      await onChanged();
      toast(t('ewb.generated', { no: ewb.ewbNo }));
    } catch (err) {
      if (
        err instanceof ApiError &&
        err.message.includes('credentials are not set')
      ) {
        setEwbNeedsCreds(true);
      } else {
        toast(err instanceof ApiError ? err.message : tc('somethingWentWrong'), 'error');
      }
    } finally {
      setEwbBusy(false);
    }
  }

  async function cancelEwb() {
    const reason = window.prompt(t('ewb.cancelPrompt'));
    if (!reason || reason.trim().length < 3) return;
    setEwbBusy(true);
    try {
      await api.post(`/companies/${companyId}/invoices/${invoice.id}/eway-bill/cancel`, {
        reason: reason.trim(),
      });
      await onChanged();
      toast(t('ewb.cancelled'), 'info');
    } catch (err) {
      toast(err instanceof ApiError ? err.message : tc('somethingWentWrong'), 'error');
    } finally {
      setEwbBusy(false);
    }
  }

  async function generateEInvoice() {
    setEiBusy(true);
    try {
      const ei = await api.post<{ irn: string }>(
        `/companies/${companyId}/invoices/${invoice.id}/einvoice/generate`,
      );
      await onChanged();
      toast(t('einvoice.generated', { irn: ei.irn.slice(0, 14) }));
    } catch (err) {
      toast(err instanceof ApiError ? err.message : tc('somethingWentWrong'), 'error');
    } finally {
      setEiBusy(false);
    }
  }

  async function cancelEInvoice() {
    const reason = window.prompt(t('einvoice.cancelPrompt'));
    if (!reason || reason.trim().length < 3) return;
    setEiBusy(true);
    try {
      await api.post(`/companies/${companyId}/invoices/${invoice.id}/einvoice/cancel`, {
        reason: reason.trim(),
      });
      await onChanged();
      toast(t('einvoice.cancelled'), 'info');
    } catch (err) {
      toast(err instanceof ApiError ? err.message : tc('somethingWentWrong'), 'error');
    } finally {
      setEiBusy(false);
    }
  }
  const [amount, setAmount] = useState('');
  const [ledgerId, setLedgerId] = useState(cashBankLedgers[0]?.id ?? '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function onWhatsApp() {
    try {
      const shared = await api.post<{
        url: string;
        invoiceNo: string;
        total: number;
        party: { name: string; phone: string | null };
      }>(`/companies/${companyId}/invoices/${invoice.id}/share`);
      const message = t('share.message', {
        party: shared.party.name,
        invoiceNo: shared.invoiceNo,
        total: inr(shared.total),
        link: shared.url,
      });
      // 10-digit Indian numbers get the country code; anything else is left
      // to WhatsApp's own contact picker.
      const digits = (shared.party.phone ?? '').replace(/\D/g, '');
      const phone =
        digits.length === 10 ? `91${digits}` : digits.length > 10 ? digits : '';
      window.open(
        `https://wa.me/${phone}?text=${encodeURIComponent(message)}`,
        '_blank',
        'noopener',
      );
    } catch (err) {
      toast(err instanceof ApiError ? err.message : t('share.failed'), 'error');
    }
  }

  async function onRecordPayment(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await api.post(`/companies/${companyId}/invoices/${invoice.id}/payments`, {
        amount: Number(amount),
        date: new Date().toISOString().slice(0, 10),
        ledgerId,
      });
      setShowPay(false);
      setAmount('');
      await onChanged();
      toast(t('toast.paymentRecorded'));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('toast.paymentFailed'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <tr className="border-b border-line last:border-0 hover:bg-subtle">
        <td className="py-2 font-mono text-xs">{invoice.invoiceNo}</td>
        <td className="py-2 whitespace-nowrap">
          {new Date(invoice.date).toLocaleDateString('en-IN')}
        </td>
        <td className="py-2">{invoice.party.name}</td>
        <td className="py-2 text-right tabular-nums">₹{inr(invoice.total)}</td>
        <td className="py-2 text-right text-xs whitespace-nowrap">
          <div className="inline-flex items-center justify-end gap-1">
            {invoice.eInvoice?.status === 'GENERATED' && (
              <span
                className="rounded-sm bg-emerald-50 px-1 py-0.5 text-[10px] font-semibold text-emerald-700"
                title={`IRN: ${invoice.eInvoice.irn}`}
              >
                {t('einvoice.badge')}
              </span>
            )}
            {invoice.eInvoice?.status === 'CANCELLED' && (
              <span className="text-[10px] text-faint">{t('einvoice.cancelledTag')}</span>
            )}
            {invoice.eWayBill?.status === 'GENERATED' && (
              <span
                className="rounded-sm bg-sky-50 px-1 py-0.5 text-[10px] font-semibold text-sky-700"
                title={`EWB: ${invoice.eWayBill.ewbNo}`}
              >
                {t('ewb.badge')}
              </span>
            )}
            {invoice.eWayBill?.status === 'CANCELLED' && (
              <span className="text-[10px] text-faint">{t('ewb.cancelledTag')}</span>
            )}
            <RowActions
              menuLabel={tc('actions')}
              primary={{ label: 'PDF', onClick: onDownload }}
              actions={[
                { label: tc('print'), onClick: onPrint },
                ...(invoice.status === 'ISSUED'
                  ? [{ label: 'WhatsApp', onClick: () => void onWhatsApp(), tone: 'primary' as const }]
                  : []),
                ...(canBill &&
                invoice.status === 'ISSUED' &&
                !invoice.eInvoice &&
                invoice.party.gstin
                  ? [
                      {
                        label: eiBusy ? '…' : t('einvoice.generate'),
                        onClick: () => void generateEInvoice(),
                        tone: 'primary' as const,
                      },
                    ]
                  : []),
                ...(invoice.eInvoice?.status === 'GENERATED' && canCancel
                  ? [
                      {
                        label: t('einvoice.cancel'),
                        onClick: () => void cancelEInvoice(),
                        tone: 'danger' as const,
                        divider: true,
                      },
                    ]
                  : []),
                ...(canBill && invoice.status === 'ISSUED' && !invoice.eWayBill
                  ? [
                      {
                        label: showEwb ? t('row.close') : t('ewb.generate'),
                        onClick: () => setShowEwb(!showEwb),
                        tone: 'primary' as const,
                      },
                    ]
                  : []),
                ...(invoice.eWayBill?.status === 'GENERATED' && canCancel
                  ? [
                      {
                        label: t('ewb.cancel'),
                        onClick: () => void cancelEwb(),
                        tone: 'danger' as const,
                        divider: true,
                      },
                    ]
                  : []),
                ...(canBill && invoice.status === 'ISSUED' && invoice.outstanding > 0 && !estimateLinked
                  ? [
                      {
                        label: showPay ? t('row.close') : t('row.payment'),
                        onClick: () => setShowPay(!showPay),
                        tone: 'success' as const,
                      },
                    ]
                  : []),
                ...(canBill &&
                invoice.status === 'ISSUED' &&
                invoice.paidAmount === 0 &&
                invoice.eInvoice?.status !== 'GENERATED'
                  ? [{ label: tc('edit'), onClick: onEdit }]
                  : []),
                ...(canCancel && invoice.status === 'ISSUED' && invoice.paidAmount === 0
                  ? [{ label: t('row.cancel'), onClick: onCancel, tone: 'danger' as const, divider: true }]
                  : []),
                ...(canCancel
                  ? [{ label: tc('delete'), onClick: () => void del(`/companies/${companyId}/invoices/${invoice.id}`), tone: 'danger' as const }]
                  : []),
              ]}
            />
          </div>
        </td>
      </tr>
      {showEwb && (
        <tr>
          <td colSpan={7} className="bg-subtle px-3 py-2">
            {ewbNeedsCreds && (
              <div className="mb-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
                <p className="font-semibold">{t('ewb.noCredsTitle')}</p>
                <p className="mt-1 leading-relaxed">{t('ewb.noCredsBody')}</p>
                <div className="mt-2.5 flex flex-wrap items-center gap-3">
                  <a
                    href={`/company/${companyId}?tab=profile`}
                    className="inline-flex items-center rounded-lg bg-brand-600 px-3 py-1.5 font-semibold text-white shadow-sm shadow-brand-600/25 hover:bg-brand-700"
                  >
                    {t('ewb.addCredentials')}
                  </a>
                  <a
                    href="https://ewaybillgst.gov.in"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium text-brand-700 underline hover:text-brand-600"
                  >
                    {t('ewb.createOnPortal')} ↗
                  </a>
                </div>
              </div>
            )}
            <form onSubmit={generateEwb} className="flex flex-wrap items-end gap-2">
              <label className="text-xs text-muted">
                <span className="mb-1 block font-medium">{t('ewb.mode')}</span>
                <Select value={ewbMode} onChange={(e) => setEwbMode(e.target.value)} className="w-28">
                  <option value="ROAD">{t('ewb.modes.ROAD')}</option>
                  <option value="RAIL">{t('ewb.modes.RAIL')}</option>
                  <option value="AIR">{t('ewb.modes.AIR')}</option>
                  <option value="SHIP">{t('ewb.modes.SHIP')}</option>
                </Select>
              </label>
              <label className="text-xs text-muted">
                <span className="mb-1 block font-medium">{t('ewb.vehicle')}</span>
                <Input
                  value={ewbVehicle}
                  onChange={(e) => setEwbVehicle(e.target.value)}
                  placeholder="TN01AB1234"
                  className="w-36"
                />
              </label>
              <label className="text-xs text-muted">
                <span className="mb-1 block font-medium">{t('ewb.distance')}</span>
                <Input
                  type="number"
                  min="0"
                  required
                  value={ewbDistance}
                  onChange={(e) => setEwbDistance(e.target.value)}
                  placeholder="km"
                  className="w-24"
                />
              </label>
              <label className="text-xs text-muted">
                <span className="mb-1 block font-medium">{t('ewb.transporter')}</span>
                <Input
                  value={ewbTransporter}
                  onChange={(e) => setEwbTransporter(e.target.value)}
                  className="w-44"
                />
              </label>
              <Button type="submit" disabled={ewbBusy}>
                {ewbBusy ? t('ewb.generating') : t('ewb.generate')}
              </Button>
            </form>
          </td>
        </tr>
      )}
      {showPay && (
        <tr>
          <td colSpan={7} className="bg-subtle px-3 py-2">
            <form onSubmit={onRecordPayment} className="flex flex-wrap items-center gap-2">
              <Input
                type="number"
                step="0.01"
                min="0.01"
                max={invoice.outstanding}
                required
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder={t('row.amountMax', { max: inr(invoice.outstanding) })}
                className="w-48"
              />
              <Select value={ledgerId} onChange={(e) => setLedgerId(e.target.value)} className="w-44">
                {cashBankLedgers.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </Select>
              <Button type="submit" disabled={busy}>
                {busy ? '…' : t('row.recordPayment')}
              </Button>
              <ErrorText>{error}</ErrorText>
            </form>
          </td>
        </tr>
      )}
    </>
  );
}
