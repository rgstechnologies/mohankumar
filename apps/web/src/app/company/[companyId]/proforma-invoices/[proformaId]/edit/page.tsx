'use client';

import { useParams } from 'next/navigation';
import { DocEntryForm } from '../../../_entry/doc-entry-form';
import { PROFORMA_ENTRY } from '../../../_entry/configs';

export default function EditProformaPage() {
  const { companyId, proformaId } = useParams<{ companyId: string; proformaId: string }>();
  return <DocEntryForm companyId={companyId} config={PROFORMA_ENTRY} editId={proformaId} />;
}
