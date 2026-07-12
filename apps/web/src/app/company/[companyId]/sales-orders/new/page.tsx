'use client';

import { useParams } from 'next/navigation';
import { DocEntryForm } from '../../_entry/doc-entry-form';
import { SALES_ORDER_ENTRY } from '../../_entry/configs';

export default function NewSalesOrderPage() {
  const { companyId } = useParams<{ companyId: string }>();
  return <DocEntryForm companyId={companyId} config={SALES_ORDER_ENTRY} />;
}
