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

/**
 * The fiscal years this business has books for: from the year it started using
 * the system (`firstDate`, i.e. the company's creation date) through to the
 * year `now` falls in. Oldest first.
 *
 * This is what makes the year roll forward on its own — nothing is "opened" or
 * "closed". The day the calendar crosses into the next fiscal year, that year
 * simply appears in the list and can be selected at login. The books are one
 * continuous ledger underneath, so stock and customer dues carry across the
 * boundary without an opening-balance step.
 */
export function fiscalYearsSince(
  firstDate: Date,
  now: Date,
  fyStartMonth: number,
): string[] {
  const first = fiscalYearOf(firstDate, fyStartMonth);
  const current = fiscalYearOf(now, fyStartMonth);
  const startYear = Number(first.slice(0, 4));
  const endYear = Number(current.slice(0, 4));
  const years: string[] = [];
  for (let y = startYear; y <= endYear; y++) {
    years.push(`${y}-${String((y + 1) % 100).padStart(2, '0')}`);
  }
  return years;
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
