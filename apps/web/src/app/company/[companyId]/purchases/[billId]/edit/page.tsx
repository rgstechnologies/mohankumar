'use client';

import { useParams } from 'next/navigation';
import { DocEntryForm } from '../../../_entry/doc-entry-form';
import { PURCHASE_BILL_ENTRY } from '../../../_entry/configs';

export default function EditPurchaseBillPage() {
  const { companyId, billId } = useParams<{ companyId: string; billId: string }>();
  return <DocEntryForm companyId={companyId} config={PURCHASE_BILL_ENTRY} editId={billId} />;
}
