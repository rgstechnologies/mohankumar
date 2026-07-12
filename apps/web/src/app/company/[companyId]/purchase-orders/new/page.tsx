'use client';

import { useParams } from 'next/navigation';
import { DocEntryForm } from '../../_entry/doc-entry-form';
import { PURCHASE_ORDER_ENTRY } from '../../_entry/configs';

export default function NewPurchaseOrderPage() {
  const { companyId } = useParams<{ companyId: string }>();
  return <DocEntryForm companyId={companyId} config={PURCHASE_ORDER_ENTRY} />;
}
