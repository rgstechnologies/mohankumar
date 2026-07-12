/**
 * Indian SME payroll arithmetic — pure functions, unit-tested.
 *
 * Statutory defaults (FY 2026-27):
 * - EPF: 12% employee + 12% employer on basic, wage capped at ₹15,000/mo,
 *   rounded to the nearest rupee (EPFO convention).
 * - ESI: 0.75% employee + 3.25% employer on gross when monthly gross is
 *   ₹21,000 or less, rounded UP to the next rupee (ESIC convention).
 * - Professional tax: state-slab amount stored per employee (flat ₹/month).
 * - TDS: computed outside (slab regime choice etc.), stored per employee,
 *   overridable per payslip.
 */

export const PF_WAGE_CAP = 15_000;
export const PF_RATE = 0.12;
export const ESI_GROSS_LIMIT = 21_000;
export const ESI_EMPLOYEE_RATE = 0.0075;
export const ESI_EMPLOYER_RATE = 0.0325;

const r2 = (n: number) => Math.round(n * 100) / 100;

export interface SalaryStructure {
  basic: number;
  hra: number;
  conveyance: number;
  otherAllowances: number;
  pfEnabled: boolean;
  esiEnabled: boolean;
  ptMonthly: number;
  tdsMonthly: number;
}

export interface PayLineAmounts {
  basic: number;
  hra: number;
  conveyance: number;
  otherAllowances: number;
  gross: number;
  pfEmployee: number;
  pfEmployer: number;
  esiEmployee: number;
  esiEmployer: number;
  pt: number;
  tds: number;
  totalDeductions: number;
  netPay: number;
}

/**
 * One employee's payslip for a month. Earnings are prorated by attendance
 * (loss-of-pay days); statutory deductions follow the prorated amounts.
 */
export function computePayLine(
  s: SalaryStructure,
  workingDays: number,
  lopDays: number,
  tdsOverride?: number,
): PayLineAmounts {
  const factor = workingDays > 0 ? (workingDays - lopDays) / workingDays : 0;

  const basic = r2(s.basic * factor);
  const hra = r2(s.hra * factor);
  const conveyance = r2(s.conveyance * factor);
  const otherAllowances = r2(s.otherAllowances * factor);
  const gross = r2(basic + hra + conveyance + otherAllowances);

  const pfWage = Math.min(basic, PF_WAGE_CAP);
  const pfEmployee = s.pfEnabled ? Math.round(pfWage * PF_RATE) : 0;
  const pfEmployer = s.pfEnabled ? Math.round(pfWage * PF_RATE) : 0;

  // ESI coverage is decided by the employee's FULL monthly wage against the
  // ₹21,000 ceiling — not the LOP-prorated earning. Otherwise an above-ceiling
  // employee with a few loss-of-pay days would dip under the limit and be
  // wrongly pulled into ESI. Contributions themselves are on the wages actually
  // paid (the prorated gross).
  const fullGross = r2(s.basic + s.hra + s.conveyance + s.otherAllowances);
  const esiEligible = s.esiEnabled && gross > 0 && fullGross <= ESI_GROSS_LIMIT;
  const esiEmployee = esiEligible ? Math.ceil(gross * ESI_EMPLOYEE_RATE) : 0;
  const esiEmployer = esiEligible ? Math.ceil(gross * ESI_EMPLOYER_RATE) : 0;

  const pt = gross > 0 ? r2(s.ptMonthly) : 0;
  const tds = gross > 0 ? r2(tdsOverride ?? s.tdsMonthly) : 0;

  const totalDeductions = r2(pfEmployee + esiEmployee + pt + tds);
  const netPay = r2(gross - totalDeductions);

  return {
    basic,
    hra,
    conveyance,
    otherAllowances,
    gross,
    pfEmployee,
    pfEmployer,
    esiEmployee,
    esiEmployer,
    pt,
    tds,
    totalDeductions,
    netPay,
  };
}

export const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const;

export const periodLabel = (year: number, month: number): string =>
  `${MONTH_NAMES[month - 1]} ${year}`;

export const daysInMonth = (year: number, month: number): number =>
  new Date(Date.UTC(year, month, 0)).getUTCDate();

/** Last calendar day of the period — default voucher date for the posting. */
export const periodEnd = (year: number, month: number): string =>
  `${year}-${String(month).padStart(2, '0')}-${String(daysInMonth(year, month)).padStart(2, '0')}`;
