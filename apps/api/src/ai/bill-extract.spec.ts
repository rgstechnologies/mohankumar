import {
  billAnswerSchema,
  buildBillDraft,
  detectMime,
  matchVendor,
  type ItemCandidate,
  type VendorCandidate,
} from './bill-extract';

const VENDORS: VendorCandidate[] = [
  { id: 'v-ky', name: 'Karnataka Yarns', gstin: '29AAACK1234A1Z9' },
  { id: 'v-cs', name: 'Coimbatore Spinners', gstin: null },
];

const ITEMS: ItemCandidate[] = [
  { id: 'i-cf', name: 'Cotton Fabric 40s' },
  { id: 'i-py', name: 'Polyester Yarn 75D' },
];

const answer = billAnswerSchema.parse({
  vendor: { name: 'KARNATAKA YARNS PVT LTD', gstin: '29AAACK1234A1Z9' },
  billNo: 'KY/1234',
  date: '2026-06-10',
  lines: [
    { description: 'Cotton Fabric 40s', hsnCode: '5208', quantity: 100, unit: 'MTR', rate: 120, gstRate: 5 },
    { description: 'Packing Charges', quantity: 1, rate: 500, gstRate: 18 },
  ],
  totals: { subtotal: 12500, total: 13190 },
  confidence: 0.93,
  warnings: [],
});

describe('matchVendor', () => {
  it('prefers GSTIN over name', () => {
    expect(matchVendor(answer.vendor, VENDORS)?.id).toBe('v-ky');
  });

  it('falls back to unique name containment', () => {
    expect(
      matchVendor({ name: 'Coimbatore Spinners (P) Ltd' }, VENDORS)?.id,
    ).toBe('v-cs');
    expect(matchVendor({ name: 'Unknown Mills' }, VENDORS)).toBeNull();
  });
});

describe('buildBillDraft', () => {
  it('matches vendor and items, keeps unmatched lines as descriptions', () => {
    const draft = buildBillDraft(answer, VENDORS, ITEMS);
    expect(draft.vendor).toEqual({
      partyId: 'v-ky',
      name: 'Karnataka Yarns',
      gstin: '29AAACK1234A1Z9',
    });
    expect(draft.supplierBillNo).toBe('KY/1234');
    expect(draft.lines[0]).toMatchObject({ itemId: 'i-cf', gstRate: 5 });
    expect(draft.lines[1]).toMatchObject({ itemId: null, description: 'Packing Charges' });
    // 100×120×1.05 + 1×500×1.18 = 13190 — matches the printed total, no warning.
    expect(draft.warnings).toEqual([]);
  });

  it('warns on unknown vendor, bad GSTIN, odd GST slab and total mismatch', () => {
    const draft = buildBillDraft(
      billAnswerSchema.parse({
        vendor: { name: 'Mystery Traders', gstin: 'BADGSTIN' },
        date: '2026-06-10',
        lines: [{ description: 'Thing', quantity: 2, rate: 100, gstRate: 7 }],
        totals: { total: 999 },
      }),
      VENDORS,
      ITEMS,
    );
    expect(draft.vendor.partyId).toBeNull();
    expect(draft.lines[0].gstRate).toBeNull(); // 7% is not a slab
    const text = draft.warnings.join(' | ');
    expect(text).toContain('looks invalid');
    expect(text).toContain('not in your vendors');
    expect(text).toContain('not a standard slab');
    expect(text).toContain('bill total reads ₹999');
  });

  it('rejects answers without lines or with bad dates', () => {
    expect(
      billAnswerSchema.safeParse({
        vendor: { name: 'X' },
        date: '10/06/2026',
        lines: [{ description: 'a', quantity: 1, rate: 1 }],
      }).success,
    ).toBe(false);
    expect(
      billAnswerSchema.safeParse({ vendor: { name: 'X' }, date: '2026-06-10', lines: [] })
        .success,
    ).toBe(false);
  });
});

describe('null and malformed tolerance (real Gemini behaviour)', () => {
  it('accepts the null-riddled answers Gemini returns for sparse bills', () => {
    // Replica of a live failure: nulls instead of omitted fields.
    const { extractJson } = require('./voucher-draft');
    const raw = JSON.stringify({
      vendor: { name: 'Local Stationery Mart', gstin: null },
      billNo: null,
      date: '2026-06-12',
      dueDate: null,
      lines: [
        { description: 'A4 Paper', hsnCode: null, quantity: 2, unit: null, rate: 250, gstRate: null, amount: null },
      ],
      totals: { subtotal: null, cgst: null, sgst: null, igst: null, total: 500 },
      confidence: 0.7,
      warnings: [],
    });
    const parsed = billAnswerSchema.safeParse(extractJson(raw));
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.vendor.gstin).toBeUndefined();
      expect(parsed.data.lines[0].gstRate).toBeUndefined();
      expect(parsed.data.totals.total).toBe(500);
    }
  });

  it('drops a malformed dueDate instead of failing the whole bill', () => {
    const parsed = billAnswerSchema.safeParse({
      vendor: { name: 'X' },
      date: '2026-06-12',
      dueDate: '15/07/2026', // wrong format — non-critical
      lines: [{ description: 'a', quantity: 1, rate: 1 }],
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.dueDate).toBeUndefined();
  });
});

describe('detectMime', () => {
  it('sniffs magic bytes and falls back to the extension', () => {
    expect(detectMime('JVBERi0xLjQ...', 'whatever.bin')).toBe('application/pdf');
    expect(detectMime('/9j/4AAQSkZJRg...', 'x')).toBe('image/jpeg');
    expect(detectMime('iVBORw0KGgo...', 'x')).toBe('image/png');
    expect(detectMime('AAAA', 'scan.PNG')).toBe('image/png');
    expect(detectMime('AAAA', 'notes.txt')).toBeNull();
  });
});
