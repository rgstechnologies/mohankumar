'use client';

import { useParams } from 'next/navigation';
import { DocEntryForm } from '../../_entry/doc-entry-form';
import { PROFORMA_ENTRY } from '../../_entry/configs';

export default function NewProformaPage() {
  const { companyId } = useParams<{ companyId: string }>();
  return <DocEntryForm companyId={companyId} config={PROFORMA_ENTRY} />;
}
