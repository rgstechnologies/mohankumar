'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { EmptyState, ExportButtons, Pagination, SearchInput, useTable } from '@/components/table';
import { useFeedback } from '@/components/feedback';
import { Button, Card, ErrorText, Input, Select } from '@/components/ui';
import {
  inr,
  parseBillAi,
  type ItemRow,
  type LedgerRow,
  type PartyRow,
  type PurchaseBillView,
} from '@/lib/accounting';
import { api, ApiError, downloadFile, printFile } from '@/lib/api';
import { OpeningDocsCard } from './opening-docs-card';
import { AiSparkle } from '@/components/icons';
import { RowActions } from '@/components/row-actions';
import { useDeleteDocument } from '@/components/use-delete-document';

/** ArrayBuffer → base64 without blowing the call stack on multi-MB scans. */
function toBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

const STATUS_STYLE: Record<string, string> = {
  PAID: 'bg-emerald-50 text-emerald-700',
  PARTIAL: 'bg-amber-50 text-amber-700',
  UNPAID: 'bg-subtle text-muted',
  CANCELLED: 'bg-red-50 text-red-600',
};

export function PurchasesTab({
  companyId,
  parties,
  items,
  ledgers,
  branches,
  bills,
  canBill,
  canCancel,
  aiEnabled,
  onChanged,
}: {
  companyId: string;
  parties: PartyRow[];
  items: ItemRow[];
  ledgers: LedgerRow[];
  branches: { id: string; name: string; isActive: boolean }[];
  bills: PurchaseBillView[];
  canBill: boolean;
  canCancel: boolean;
  aiEnabled: boolean;
  onChanged: () => Promise<void>;
}) {
  const t = useTranslations('purchases');
  const tc = useTranslations('common');
  const router = useRouter();
  const cashBankLedgers = useMemo(
    () => ledgers.filter((l) => ['Cash-in-Hand', 'Bank Accounts'].includes(l.group.name)),
    [ledgers],
  );

  const table = useTable(
    bills,
    (b) => `${b.billNo} ${b.supplierBillNo ?? ''} ${b.party.name} ${b.paymentStatus}`,
  );
  const { toast, confirm } = useFeedback();

  const [scanning, setScanning] = useState(false);
  const scanRef = useRef<HTMLInputElement>(null);
  // When purchase payments reconcile against purchase estimates, bills must not
  // expose a Pay action — all Payment Out flows through the purchase estimate.
  const [estimateLinked, setEstimateLinked] = useState(false);
  useEffect(() => {
    api
      .get<{ purchasePaymentLink?: string }>(`/companies/${companyId}`)
      .then((c) => setEstimateLinked(c.purchasePaymentLink === 'purchaseEstimate'))
      .catch(() => {});
  }, [companyId]);

  async function onScanFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setScanning(true);
    try {
      const draft = await parseBillAi(companyId, file.name, toBase64(await file.arrayBuffer()));
      // Hand the AI-parsed draft to the full-page entry form.
      if (typeof window !== 'undefined') {
        window.sessionStorage.setItem(`purchase-bill-draft:${companyId}`, JSON.stringify(draft));
      }
      toast(t('ai.drafted'));
      router.push(`/company/${companyId}/purchases/new`);
    } catch (err) {
      toast(err instanceof ApiError ? err.message : tc('somethingWentWrong'), 'error');
    } finally {
      setScanning(false);
      if (scanRef.current) scanRef.current.value = '';
    }
  }

  async function cancelBill(billId: string) {
    const ok = await confirm({
      title: t('confirmCancel.title'),
      body: t('confirmCancel.body'),
      confirmLabel: t('confirmCancel.confirm'),
      danger: true,
    });
    if (!ok) return;
    try {
      await api.post(`/companies/${companyId}/purchase-bills/${billId}/cancel`);
      await onChanged();
      toast(t('toasts.cancelled'), 'info');
    } catch (err) {
      toast(err instanceof ApiError ? err.message : t('toasts.cancelFailed'), 'error');
    }
  }

  async function downloadPdf(bill: PurchaseBillView) {
    try {
      await downloadFile(`/companies/${companyId}/purchase-bills/${bill.id}/pdf`);
    } catch {
      toast(tc('somethingWentWrong'), 'error');
    }
  }

  async function printPdf(bill: PurchaseBillView) {
    try {
      await printFile(`/companies/${companyId}/purchase-bills/${bill.id}/pdf`);
    } catch {
      toast(tc('somethingWentWrong'), 'error');
    }
  }

  return (
    <div className="space-y-4">
      <OpeningDocsCard
        companyId={companyId}
        kind="PAYABLE"
        ledgers={ledgers}
        canSettle={canBill}
        onChanged={onChanged}
      />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SearchInput
          value={table.query}
          onChange={table.setQuery}
          placeholder={t('searchPlaceholder')}
        />
        <ExportButtons companyId={companyId} report="purchases" />
        {canBill && (
          <div className="flex items-center gap-2">
            {aiEnabled && (
              <>
                <input
                  ref={scanRef}
                  type="file"
                  accept=".jpg,.jpeg,.png,.webp,.pdf,image/jpeg,image/png,image/webp,application/pdf"
                  className="hidden"
                  onChange={onScanFile}
                />
                <Button
                  variant="secondary"
                  onClick={() => scanRef.current?.click()}
                  disabled={scanning}
                  title={t('ai.hint')}
                >
                  <AiSparkle className="h-4 w-4" /> {scanning ? t('ai.scanning') : t('ai.scan')}
                </Button>
              </>
            )}
            <Button
              variant="primary"
              onClick={() => router.push(`/company/${companyId}/purchases/new`)}
            >
              {t('newBill')}
            </Button>
          </div>
        )}
      </div>

      <Card>
        {bills.length === 0 ? (
          <EmptyState
            title={t('empty.title')}
            body={t('empty.body')}
            action={
              canBill && (
                <Button onClick={() => router.push(`/company/${companyId}/purchases/new`)}>
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
                <th className="py-2">{t('table.bill')}</th>
                <th className="py-2">{t('table.vendorRef')}</th>
                <th className="py-2">{tc('date')}</th>
                <th className="py-2">{t('table.vendor')}</th>
                <th className="py-2 text-right">{tc('total')}</th>
                <th className="py-2 text-right">{t('table.outstanding')}</th>
                <th className="py-2 text-center">{tc('status')}</th>
                <th className="py-2 text-right">{tc('actions')}</th>
              </tr>
            </thead>
            <tbody>
              {table.rows.map((bill) => (
                <BillRow
                  key={bill.id}
                  companyId={companyId}
                  bill={bill}
                  cashBankLedgers={cashBankLedgers}
                  canBill={canBill}
                  canCancel={canCancel}
                  estimateLinked={estimateLinked}
                  onChanged={onChanged}
                  onDownload={() => downloadPdf(bill)}
                  onPrint={() => printPdf(bill)}
                  onCancel={() => cancelBill(bill.id)}
                  onEdit={() => router.push(`/company/${companyId}/purchases/${bill.id}/edit`)}
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

function BillRow({
  companyId,
  bill,
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
  bill: PurchaseBillView;
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
  const t = useTranslations('purchases');
  const tc = useTranslations('common');
  const { toast } = useFeedback();
  const del = useDeleteDocument(onChanged);
  const [showPay, setShowPay] = useState(false);
  const [amount, setAmount] = useState('');
  const [ledgerId, setLedgerId] = useState(cashBankLedgers[0]?.id ?? '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function onPay(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await api.post(`/companies/${companyId}/purchase-bills/${bill.id}/payments`, {
        amount: Number(amount),
        date: new Date().toISOString().slice(0, 10),
        ledgerId,
      });
      setShowPay(false);
      setAmount('');
      await onChanged();
      toast(t('toasts.paymentRecorded'));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('row.payFailed'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <tr className="border-b border-line last:border-0 hover:bg-subtle">
        <td className="py-2 font-mono text-xs">{bill.billNo}</td>
        <td className="py-2 text-xs text-muted">{bill.supplierBillNo ?? '—'}</td>
        <td className="py-2 whitespace-nowrap">
          {new Date(bill.date).toLocaleDateString('en-IN')}
        </td>
        <td className="py-2">{bill.party.name}</td>
        <td className="py-2 text-right tabular-nums">₹{inr(bill.total)}</td>
        <td className="py-2 text-right tabular-nums">₹{inr(bill.outstanding)}</td>
        <td className="py-2 text-center">
          <span
            className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${STATUS_STYLE[bill.paymentStatus]}`}
          >
            {t(`status.${bill.paymentStatus}`)}
          </span>
        </td>
        <td className="py-2 text-right text-xs whitespace-nowrap">
          <RowActions
            menuLabel={tc('actions')}
            primary={{ label: 'PDF', onClick: onDownload }}
            actions={[
              { label: tc('print'), onClick: onPrint },
              ...(canBill && bill.status === 'ISSUED' && bill.outstanding > 0 && !estimateLinked
                ? [{
                    label: showPay ? t('row.close') : t('row.pay'),
                    onClick: () => setShowPay(!showPay),
                    tone: 'success' as const,
                  }]
                : []),
              ...(canBill && bill.status === 'ISSUED' && bill.paidAmount === 0
                ? [{ label: tc('edit'), onClick: onEdit, tone: 'primary' as const }]
                : []),
              ...(canCancel && bill.status === 'ISSUED' && bill.paidAmount === 0
                ? [{ label: t('row.cancel'), onClick: onCancel, tone: 'danger' as const, divider: true }]
                : []),
              ...(canCancel
                ? [{ label: tc('delete'), onClick: () => void del(`/companies/${companyId}/purchase-bills/${bill.id}`), tone: 'danger' as const }]
                : []),
            ]}
          />
        </td>
      </tr>
      {showPay && (
        <tr>
          <td colSpan={8} className="bg-subtle px-3 py-2">
            <form onSubmit={onPay} className="flex flex-wrap items-center gap-2">
              <Input
                type="number"
                step="0.01"
                min="0.01"
                max={bill.outstanding}
                required
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder={t('row.amountPlaceholder', { max: inr(bill.outstanding) })}
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
                {busy ? '…' : t('row.payVendor')}
              </Button>
              <ErrorText>{error}</ErrorText>
            </form>
          </td>
        </tr>
      )}
    </>
  );
}
