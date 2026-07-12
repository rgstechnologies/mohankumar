'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Card } from '@/components/ui';
import { InvoiceTemplateCard } from './branches-tab';

/** Document types that have their own customizable print layout. */
const FORMS = [
  'invoice',
  'estimate',
  'proformaInvoice',
  'salesOrder',
  'deliveryChallan',
  'purchaseBill',
  'purchaseEstimate',
  'purchaseOrder',
  'payslip',
] as const;

/**
 * Print Settings hub: lists every printable document on the left; selecting one
 * opens the layout editor bound to that document type, with a per-form live
 * preview. Each form remembers its own saved design.
 */
export function PrintSettingsTab({
  companyId,
  canManage,
}: {
  companyId: string;
  canManage: boolean;
}) {
  const t = useTranslations('printSettings');
  const [docKind, setDocKind] = useState<string>('invoice');

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-ink">{t('title')}</h2>
          <p className="text-sm text-muted">{t('subtitle')}</p>
        </div>
        {canManage && docKind !== 'payslip' && (
          <Link
            href={`/company/${companyId}/print-designer?docKind=${docKind}`}
            className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-700"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 19l7-7 3 3-7 7-3-3z" /><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" /><path d="M2 2l7.586 7.586" /><circle cx="11" cy="11" r="2" />
            </svg>
            {t('openDesigner')}
          </Link>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[210px_1fr]">
        <Card>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-faint">
            {t('formsHeading')}
          </p>
          <nav className="space-y-1">
            {FORMS.map((f) => (
              <button
                key={f}
                onClick={() => setDocKind(f)}
                className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm font-medium transition-colors ${
                  docKind === f
                    ? 'bg-brand-50 text-brand-700'
                    : 'text-muted hover:bg-subtle'
                }`}
              >
                {t(`forms.${f}`)}
                <span aria-hidden>›</span>
              </button>
            ))}
          </nav>
        </Card>

        <div>
          {/* Remount on form change so the editor reloads that form's layout. */}
          <InvoiceTemplateCard
            key={docKind}
            companyId={companyId}
            canManage={canManage}
            docKind={docKind}
          />
        </div>
      </div>
    </div>
  );
}
