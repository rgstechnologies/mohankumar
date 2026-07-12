import { computePayLine, daysInMonth, periodEnd, periodLabel } from './payroll.math';

const FULL = {
  basic: 18000,
  hra: 6000,
  conveyance: 1600,
  otherAllowances: 0,
  pfEnabled: true,
  esiEnabled: true,
  ptMonthly: 200,
  tdsMonthly: 500,
};

describe('computePayLine', () => {
  it('caps PF wage at ₹15,000 and skips ESI above ₹21,000 gross', () => {
    const line = computePayLine(FULL, 30, 0);
    expect(line.gross).toBe(25600);
    expect(line.pfEmployee).toBe(1800); // 12% of capped 15,000, not 18,000
    expect(line.pfEmployer).toBe(1800);
    expect(line.esiEmployee).toBe(0); // gross over the ESI limit
    expect(line.esiEmployer).toBe(0);
    expect(line.totalDeductions).toBe(1800 + 200 + 500);
    expect(line.netPay).toBe(25600 - 2500);
  });

  it('applies ESI at and below ₹21,000 gross, rounded up per ESIC rules', () => {
    const line = computePayLine(
      { ...FULL, basic: 12000, hra: 4000, conveyance: 0, ptMonthly: 0, tdsMonthly: 0 },
      30,
      0,
    );
    expect(line.gross).toBe(16000);
    expect(line.pfEmployee).toBe(1440); // 12% of 12,000 (below cap)
    expect(line.esiEmployee).toBe(120); // ceil(16000 × 0.75%)
    expect(line.esiEmployer).toBe(520); // ceil(16000 × 3.25%)
    expect(line.netPay).toBe(16000 - 1440 - 120);
  });

  it('prorates earnings for loss-of-pay days and recomputes statutory amounts', () => {
    const line = computePayLine(
      { ...FULL, basic: 12000, hra: 4000, conveyance: 0, ptMonthly: 0, tdsMonthly: 0 },
      30,
      15,
    );
    expect(line.basic).toBe(6000);
    expect(line.hra).toBe(2000);
    expect(line.gross).toBe(8000);
    expect(line.pfEmployee).toBe(720); // 12% of prorated 6,000
    expect(line.esiEmployee).toBe(60);
    expect(line.netPay).toBe(8000 - 720 - 60);
  });

  it('zeroes everything on full loss of pay — including PT and TDS', () => {
    const line = computePayLine(FULL, 30, 30);
    expect(line.gross).toBe(0);
    expect(line.pfEmployee).toBe(0);
    expect(line.pt).toBe(0);
    expect(line.tds).toBe(0);
    expect(line.netPay).toBe(0);
  });

  it('honours the PF/ESI flags and the TDS override', () => {
    const line = computePayLine(
      { ...FULL, pfEnabled: false, esiEnabled: false, basic: 10000, hra: 0, conveyance: 0 },
      30,
      0,
      1234,
    );
    expect(line.pfEmployee).toBe(0);
    expect(line.esiEmployee).toBe(0);
    expect(line.tds).toBe(1234);
    expect(line.netPay).toBe(10000 - 200 - 1234);
  });
});

describe('period helpers', () => {
  it('labels and bounds the period', () => {
    expect(periodLabel(2026, 6)).toBe('June 2026');
    expect(daysInMonth(2026, 6)).toBe(30);
    expect(daysInMonth(2028, 2)).toBe(29); // leap year
    expect(periodEnd(2026, 6)).toBe('2026-06-30');
  });
});
