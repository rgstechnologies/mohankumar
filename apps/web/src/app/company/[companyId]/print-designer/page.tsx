'use client';

import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { PrintDesigner } from '@/components/print-designer/designer';

export default function PrintDesignerPage() {
  const params = useParams<{ companyId: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const companyId = params.companyId;
  const docKind = searchParams.get('docKind') ?? 'invoice';

  return (
    <PrintDesigner
      companyId={companyId}
      docKind={docKind}
      onBack={() => router.push(`/company/${companyId}?tab=print-settings`)}
    />
  );
}
