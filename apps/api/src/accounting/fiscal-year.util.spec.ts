import { displayVoucherNo, fiscalYearOf } from './fiscal-year.util';

describe('fiscalYearOf', () => {
  it('starts the Indian FY in April', () => {
    expect(fiscalYearOf(new Date('2026-04-01'), 4)).toBe('2026-27');
    expect(fiscalYearOf(new Date('2026-03-31'), 4)).toBe('2025-26');
    expect(fiscalYearOf(new Date('2026-12-31'), 4)).toBe('2026-27');
    expect(fiscalYearOf(new Date('2027-01-15'), 4)).toBe('2026-27');
  });

  it('supports a January fiscal year start', () => {
    expect(fiscalYearOf(new Date('2026-01-01'), 1)).toBe('2026-27');
    expect(fiscalYearOf(new Date('2026-12-31'), 1)).toBe('2026-27');
  });

  it('pads the short year across the century boundary', () => {
    expect(fiscalYearOf(new Date('2099-06-01'), 4)).toBe('2099-00');
  });
});

describe('displayVoucherNo', () => {
  it('formats type prefix, fiscal year and padded number', () => {
    expect(displayVoucherNo('PAYMENT', '2026-27', 3)).toBe('PMT/2026-27/0003');
    expect(displayVoucherNo('SALES', '2026-27', 1234)).toBe('SAL/2026-27/1234');
  });
});
