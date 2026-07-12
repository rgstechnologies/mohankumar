import { calculateInvoice } from './gst-calculator';

describe('calculateInvoice', () => {
  it('splits tax into CGST + SGST for intra-state supplies', () => {
    const result = calculateInvoice(
      [{ quantity: 10, rate: 100, discountPct: 0, gstRate: 18 }],
      false,
    );
    expect(result.taxableAmount).toBe(1000);
    expect(result.cgstAmount).toBe(90);
    expect(result.sgstAmount).toBe(90);
    expect(result.igstAmount).toBe(0);
    expect(result.total).toBe(1180);
    expect(result.roundOff).toBe(0);
  });

  it('charges IGST for inter-state supplies', () => {
    const result = calculateInvoice(
      [{ quantity: 100, rate: 250, discountPct: 0, gstRate: 5 }],
      true,
    );
    expect(result.taxableAmount).toBe(25000);
    expect(result.igstAmount).toBe(1250);
    expect(result.cgstAmount).toBe(0);
    expect(result.sgstAmount).toBe(0);
    expect(result.total).toBe(26250);
  });

  it('rounds the invoice total to a whole rupee and reports the round-off', () => {
    // 3 × 33.33 = 99.99 @18% → tax 18.00 → 117.99 → total 118, round-off +0.01
    const result = calculateInvoice(
      [{ quantity: 3, rate: 33.33, discountPct: 0, gstRate: 18 }],
      false,
    );
    expect(result.taxableAmount).toBe(99.99);
    expect(result.cgstAmount).toBe(9);
    expect(result.sgstAmount).toBe(9);
    expect(result.total).toBe(118);
    expect(result.roundOff).toBe(0.01);
  });

  it('keeps cgst + sgst exactly equal to the line tax when the tax is an odd paisa', () => {
    // taxable 100.05 @5% → tax 5.00 (4.9975 → 5.00); odd-paisa case:
    // taxable 33.35 @5% → tax 1.67 → cgst 0.84 + sgst 0.83 = 1.67
    const result = calculateInvoice(
      [{ quantity: 1, rate: 33.35, discountPct: 0, gstRate: 5 }],
      false,
    );
    const line = result.lines[0];
    expect(line.cgst + line.sgst).toBeCloseTo(1.67, 10);
  });

  it('applies line discounts before tax', () => {
    const result = calculateInvoice(
      [{ quantity: 10, rate: 100, discountPct: 10, gstRate: 18 }],
      false,
    );
    expect(result.subtotal).toBe(1000);
    expect(result.discountTotal).toBe(100);
    expect(result.taxableAmount).toBe(900);
    expect(result.cgstAmount).toBe(81);
    expect(result.sgstAmount).toBe(81);
    expect(result.total).toBe(1062);
  });

  it('sums mixed-rate lines correctly', () => {
    const result = calculateInvoice(
      [
        { quantity: 100, rate: 250, discountPct: 0, gstRate: 5 },
        { quantity: 1, rate: 1000, discountPct: 0, gstRate: 18 },
      ],
      true,
    );
    expect(result.taxableAmount).toBe(26000);
    expect(result.igstAmount).toBe(1430); // 1250 + 180
    expect(result.total).toBe(27430);
  });

  it('handles zero-rated (0% GST) lines', () => {
    const result = calculateInvoice(
      [{ quantity: 5, rate: 200, discountPct: 0, gstRate: 0 }],
      false,
    );
    expect(result.taxableAmount).toBe(1000);
    expect(result.cgstAmount).toBe(0);
    expect(result.total).toBe(1000);
  });

  it('invoice total always equals taxable + taxes + roundOff', () => {
    const cases = [
      [{ quantity: 7, rate: 33.33, discountPct: 2.5, gstRate: 12 }],
      [{ quantity: 1.234, rate: 99.99, discountPct: 0, gstRate: 28 }],
      [
        { quantity: 3, rate: 10.01, discountPct: 1, gstRate: 5 },
        { quantity: 11, rate: 7.77, discountPct: 0, gstRate: 18 },
      ],
    ];
    for (const lines of cases) {
      for (const interState of [true, false]) {
        const r = calculateInvoice(lines, interState);
        const reconstructed =
          r.taxableAmount + r.cgstAmount + r.sgstAmount + r.igstAmount + r.roundOff;
        expect(reconstructed).toBeCloseTo(r.total, 10);
        expect(Number.isInteger(r.total)).toBe(true);
      }
    }
  });
});
