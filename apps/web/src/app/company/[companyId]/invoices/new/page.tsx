'use client';

import { useParams } from 'next/navigation';
import { DocEntryForm } from '../../_entry/doc-entry-form';
import { INVOICE_ENTRY } from '../../_entry/configs';

export default function NewInvoicePage() {
  const { companyId } = useParams<{ companyId: string }>();
  return <DocEntryForm companyId={companyId} config={INVOICE_ENTRY} />;
}
