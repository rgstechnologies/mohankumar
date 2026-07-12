/**
 * Returns the fiscal year label (e.g. "2026-27") for a date, given the
 * fiscal-year start month (4 = April for the standard Indian FY).
 */
export function fiscalYearOf(date: Date, fyStartMonth: number): string {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + 1; // 1-12
  const startYear = month >= fyStartMonth ? year : year - 1;
  const endYearShort = String((startYear + 1) % 100).padStart(2, '0');
  return `${startYear}-${endYearShort}`;
}

/** Short prefixes used in display voucher numbers, e.g. PMT/2026-27/0003. */
export const VOUCHER_PREFIX: Record<string, string> = {
  JOURNAL: 'JNL',
  PAYMENT: 'PMT',
  RECEIPT: 'RCT',
  CONTRA: 'CON',
  SALES: 'SAL',
  PURCHASE: 'PUR',
  CREDIT_NOTE: 'CRN',
  DEBIT_NOTE: 'DBN',
};

export function displayVoucherNo(
  type: string,
  fiscalYear: string,
  voucherNo: number,
): string {
  return `${VOUCHER_PREFIX[type] ?? type}/${fiscalYear}/${String(voucherNo).padStart(4, '0')}`;
}
