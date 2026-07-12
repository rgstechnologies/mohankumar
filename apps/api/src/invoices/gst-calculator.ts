/**
 * GST invoice arithmetic. All rounding happens here, in one place,
 * using paise-precision half-up rounding.
 */

export interface CalcLineInput {
  quantity: number;
  rate: number;
  discountPct: number;
  gstRate: number;
}

export interface CalcLine extends CalcLineInput {
  gross: number;
  discount: number;
  taxableValue: number;
  cgst: number;
  sgst: number;
  igst: number;
  total: number;
}

export interface CalcResult {
  lines: CalcLine[];
  subtotal: number;
  discountTotal: number;
  taxableAmount: number;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  /** Difference applied to reach a whole-rupee total (-0.49..+0.50). */
  roundOff: number;
  total: number;
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

export function calculateInvoice(
  inputs: CalcLineInput[],
  isInterState: boolean,
  /** Non-taxed charges (freight + other) added to the total after tax. */
  extraCharges = 0,
): CalcResult {
  const lines: CalcLine[] = inputs.map((input) => {
    const gross = round2(input.quantity * input.rate);
    const discount = round2((gross * input.discountPct) / 100);
    const taxableValue = round2(gross - discount);
    const tax = round2((taxableValue * input.gstRate) / 100);

    let cgst = 0;
    let sgst = 0;
    let igst = 0;
    if (isInterState) {
      igst = tax;
    } else {
      // Split evenly; any odd paisa goes to SGST so cgst+sgst === tax.
      cgst = round2(tax / 2);
      sgst = round2(tax - cgst);
    }

    return {
      ...input,
      gross,
      discount,
      taxableValue,
      cgst,
      sgst,
      igst,
      total: round2(taxableValue + tax),
    };
  });

  const sum = (pick: (l: CalcLine) => number) =>
    round2(lines.reduce((acc, l) => acc + pick(l), 0));

  const subtotal = sum((l) => l.gross);
  const discountTotal = sum((l) => l.discount);
  const taxableAmount = sum((l) => l.taxableValue);
  const cgstAmount = sum((l) => l.cgst);
  const sgstAmount = sum((l) => l.sgst);
  const igstAmount = sum((l) => l.igst);

  const exactTotal = round2(
    taxableAmount + cgstAmount + sgstAmount + igstAmount + round2(extraCharges),
  );
  const total = Math.round(exactTotal); // invoice total in whole rupees
  const roundOff = round2(total - exactTotal);

  return {
    lines,
    subtotal,
    discountTotal,
    taxableAmount,
    cgstAmount,
    sgstAmount,
    igstAmount,
    roundOff,
    total,
  };
}
