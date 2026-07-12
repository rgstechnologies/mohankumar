/** Shared validation patterns (Indian statutory formats). */

export const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
export const PINCODE_REGEX = /^[0-9]{6}$/;
export const STATE_CODE_REGEX = /^[0-9]{2}$/;
export const HSN_REGEX = /^[0-9]{2,8}$/;

/** GST rate slabs in force. */
export const GST_RATES = [0, 0.25, 3, 5, 12, 18, 28] as const;

/** Common stock-keeping units (UQC-aligned). */
export const ITEM_UNITS = [
  'PCS',
  'NOS',
  'KG',
  'G',
  'MTR',
  'CM',
  'LTR',
  'ML',
  'BOX',
  'DOZ',
  'SET',
  'PAIR',
  'ROLL',
  'SQM',
  'BALE',
  'BUNDLE',
] as const;
