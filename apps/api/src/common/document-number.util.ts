/**
 * Display document numbers, e.g. `INV/2026-27/0042`. The stored `invoiceNo` /
 * `estimateNo` / `billNo` are plain sequential integers per company-and-year;
 * this is the single place that turns one into the human-readable string, so
 * the prefix and zero-padding are defined once instead of inline in a dozen
 * services. Changing a prefix here changes it everywhere.
 */
export function formatDocNo(
  prefix: string,
  fiscalYear: string,
  no: number,
): string {
  return `${prefix}/${fiscalYear}/${String(no).padStart(4, '0')}`;
}

/** Sales invoice, e.g. `INV/2026-27/0042`. */
export const invoiceNo = (fiscalYear: string, no: number) =>
  formatDocNo('INV', fiscalYear, no);

/** Sales estimate, e.g. `EST/2026-27/0042`. */
export const estimateNo = (fiscalYear: string, no: number) =>
  formatDocNo('EST', fiscalYear, no);

/** Purchase bill, e.g. `BILL/2026-27/0042`. */
export const billNo = (fiscalYear: string, no: number) =>
  formatDocNo('BILL', fiscalYear, no);
