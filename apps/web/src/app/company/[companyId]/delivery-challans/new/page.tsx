'use client';

import { useParams } from 'next/navigation';
import { DocEntryForm } from '../../_entry/doc-entry-form';
import { DELIVERY_CHALLAN_ENTRY } from '../../_entry/configs';

export default function NewDeliveryChallanPage() {
  const { companyId } = useParams<{ companyId: string }>();
  return <DocEntryForm companyId={companyId} config={DELIVERY_CHALLAN_ENTRY} />;
}
