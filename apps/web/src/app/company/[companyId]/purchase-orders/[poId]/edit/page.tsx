'use client';

import { useParams } from 'next/navigation';
import { DocEntryForm } from '../../../_entry/doc-entry-form';
import { PURCHASE_ORDER_ENTRY } from '../../../_entry/configs';

export default function EditPurchaseOrderPage() {
  const { companyId, poId } = useParams<{ companyId: string; poId: string }>();
  return <DocEntryForm companyId={companyId} config={PURCHASE_ORDER_ENTRY} editId={poId} />;
}
