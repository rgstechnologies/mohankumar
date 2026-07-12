'use client';

import { useTranslations } from 'next-intl';
import { api, ApiError } from '@/lib/api';
import { useFeedback } from './feedback';

/**
 * Shared "permanently delete a document" action for every form list page
 * (invoices, estimates, proforma, challans, sales orders, purchase
 * estimates/bills, POs). Confirms first, calls the doc's DELETE endpoint
 * (which reverses vouchers/payments/stock server-side), then refreshes.
 *
 *   const del = useDeleteDocument(onChanged);
 *   <button onClick={() => del(`/companies/${companyId}/invoices/${id}`)} />
 */
export function useDeleteDocument(onChanged: () => Promise<void> | void) {
  const { confirm, toast } = useFeedback();
  const tc = useTranslations('common');

  return async (path: string): Promise<boolean> => {
    const ok = await confirm({
      title: tc('deleteDocTitle'),
      body: tc('deleteDocBody'),
      confirmLabel: tc('delete'),
      danger: true,
    });
    if (!ok) return false;
    try {
      await api.delete(path);
      await onChanged();
      toast(tc('deleted'), 'info');
      return true;
    } catch (err) {
      toast(err instanceof ApiError ? err.message : tc('somethingWentWrong'), 'error');
      return false;
    }
  };
}
