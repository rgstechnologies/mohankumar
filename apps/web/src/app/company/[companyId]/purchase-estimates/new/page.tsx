'use client';

import { useParams } from 'next/navigation';
import { DocEntryForm } from '../../_entry/doc-entry-form';
import { PURCHASE_ESTIMATE_ENTRY } from '../../_entry/configs';

export default function NewPurchaseEstimatePage() {
  const { companyId } = useParams<{ companyId: string }>();
  return <DocEntryForm companyId={companyId} config={PURCHASE_ESTIMATE_ENTRY} />;
}
