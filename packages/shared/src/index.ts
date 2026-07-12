/**
 * @bookly/shared
 * Types and constants shared between the API and the web app.
 */

/**
 * Indian states/UTs with their GST state code (first 2 digits of a GSTIN).
 * Single source of truth for the state dropdown and CGST/SGST-vs-IGST logic.
 */
export const INDIAN_STATES: readonly { code: string; name: string }[] = [
  { code: '01', name: 'Jammu & Kashmir' }, { code: '02', name: 'Himachal Pradesh' },
  { code: '03', name: 'Punjab' }, { code: '04', name: 'Chandigarh' },
  { code: '05', name: 'Uttarakhand' }, { code: '06', name: 'Haryana' },
  { code: '07', name: 'Delhi' }, { code: '08', name: 'Rajasthan' },
  { code: '09', name: 'Uttar Pradesh' }, { code: '10', name: 'Bihar' },
  { code: '11', name: 'Sikkim' }, { code: '12', name: 'Arunachal Pradesh' },
  { code: '13', name: 'Nagaland' }, { code: '14', name: 'Manipur' },
  { code: '15', name: 'Mizoram' }, { code: '16', name: 'Tripura' },
  { code: '17', name: 'Meghalaya' }, { code: '18', name: 'Assam' },
  { code: '19', name: 'West Bengal' }, { code: '20', name: 'Jharkhand' },
  { code: '21', name: 'Odisha' }, { code: '22', name: 'Chhattisgarh' },
  { code: '23', name: 'Madhya Pradesh' }, { code: '24', name: 'Gujarat' },
  { code: '27', name: 'Maharashtra' }, { code: '29', name: 'Karnataka' },
  { code: '30', name: 'Goa' }, { code: '32', name: 'Kerala' },
  { code: '33', name: 'Tamil Nadu' }, { code: '34', name: 'Puducherry' },
  { code: '36', name: 'Telangana' }, { code: '37', name: 'Andhra Pradesh' },
] as const;

/** GST state code for a state name (case-insensitive); null if unknown. */
export function stateCodeForName(name?: string | null): string | null {
  if (!name) return null;
  const hit = INDIAN_STATES.find(
    (s) => s.name.toLowerCase() === name.trim().toLowerCase(),
  );
  return hit ? hit.code : null;
}

/** State name for a GST state code; null if unknown. */
export function stateNameForCode(code?: string | null): string | null {
  if (!code) return null;
  const hit = INDIAN_STATES.find((s) => s.code === code.trim());
  return hit ? hit.name : null;
}

/** User roles within a company (from SRS §2.2 User Classes). */
export const ROLES = [
  'ADMIN',
  'OWNER',
  'ACCOUNTANT',
  'CASHIER',
  'EMPLOYEE',
  'AUDITOR',
  'BRANCH_MANAGER',
] as const;

export type Role = (typeof ROLES)[number];

/** Standard API health response. */
export interface HealthResponse {
  status: 'ok' | 'degraded';
  db: 'up' | 'down';
  redis: 'up' | 'down';
  uptimeSeconds: number;
}

// Print Template Designer schema (shared between editor and PDF renderer).
export * from './print-design';
