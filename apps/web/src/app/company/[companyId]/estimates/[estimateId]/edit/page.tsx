'use client';

import { useParams } from 'next/navigation';
import { DocEntryForm } from '../../../_entry/doc-entry-form';
import { ESTIMATE_ENTRY } from '../../../_entry/configs';

export default function EditEstimatePage() {
  const { companyId, estimateId } = useParams<{ companyId: string; estimateId: string }>();
  return <DocEntryForm companyId={companyId} config={ESTIMATE_ENTRY} editId={estimateId} />;
}
