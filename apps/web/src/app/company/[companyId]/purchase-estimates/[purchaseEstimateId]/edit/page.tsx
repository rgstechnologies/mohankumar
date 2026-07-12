'use client';

import { useParams } from 'next/navigation';
import { DocEntryForm } from '../../../_entry/doc-entry-form';
import { PURCHASE_ESTIMATE_ENTRY } from '../../../_entry/configs';

export default function EditPurchaseEstimatePage() {
  const { companyId, purchaseEstimateId } = useParams<{
    companyId: string;
    purchaseEstimateId: string;
  }>();
  return (
    <DocEntryForm companyId={companyId} config={PURCHASE_ESTIMATE_ENTRY} editId={purchaseEstimateId} />
  );
}
