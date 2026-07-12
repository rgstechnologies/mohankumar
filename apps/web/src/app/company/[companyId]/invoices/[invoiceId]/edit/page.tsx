'use client';

import { useParams } from 'next/navigation';
import { DocEntryForm } from '../../../_entry/doc-entry-form';
import { INVOICE_ENTRY } from '../../../_entry/configs';

export default function EditInvoicePage() {
  const { companyId, invoiceId } = useParams<{ companyId: string; invoiceId: string }>();
  return <DocEntryForm companyId={companyId} config={INVOICE_ENTRY} editId={invoiceId} />;
}
