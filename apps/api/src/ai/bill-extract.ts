import { z } from 'zod';
import { GST_RATES, GSTIN_REGEX } from '../common/validation';

/**
 * Pure logic for bill OCR: schema for the model's reading of a supplier
 * bill, plus matching of the extracted vendor/lines against the company's
 * real parties and items. The result is a DRAFT for the purchase-bill form —
 * nothing is posted without human review.
 */

// Non-critical fields use .catch(undefined): a malformed HSN or GST rate
// must not kill an otherwise readable bill (the draft warns instead).
const lineSchema = z.object({
  description: z.string().min(1).max(300),
  hsnCode: z.string().max(20).optional().catch(undefined),
  quantity: z.number().positive().finite(),
  unit: z.string().max(20).optional().catch(undefined),
  rate: z.number().min(0).finite(),
  gstRate: z.number().min(0).max(100).optional().catch(undefined),
  amount: z.number().min(0).finite().optional().catch(undefined),
});

export const billAnswerSchema = z.object({
  vendor: z.object({
    name: z.string().min(1).max(200),
    gstin: z.string().max(20).optional().catch(undefined),
  }),
  billNo: z.string().max(50).optional().catch(undefined),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  dueDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .catch(undefined),
  lines: z.array(lineSchema).min(1).max(50),
  totals: z
    .object({
      subtotal: z.number().optional().catch(undefined),
      cgst: z.number().optional().catch(undefined),
      sgst: z.number().optional().catch(undefined),
      igst: z.number().optional().catch(undefined),
      total: z.number().optional().catch(undefined),
    })
    .default({})
    .catch({}),
  confidence: z.number().min(0).max(1).default(0.5),
  warnings: z.array(z.string().max(300)).max(10).default([]),
});

export type BillAnswer = z.infer<typeof billAnswerSchema>;

export interface VendorCandidate {
  id: string;
  name: string;
  gstin: string | null;
}

export interface ItemCandidate {
  id: string;
  name: string;
}

export interface BillDraftLine {
  /** null when no catalogue item matched — the form keeps the description. */
  itemId: string | null;
  description: string;
  hsnCode?: string;
  quantity: number;
  unit?: string;
  rate: number;
  /** null when the extracted rate is not a legal Indian GST slab. */
  gstRate: number | null;
}

export interface BillDraft {
  vendor: {
    /** null when no existing vendor matched — UI offers to create one. */
    partyId: string | null;
    name: string;
    gstin?: string;
  };
  supplierBillNo?: string;
  date: string;
  dueDate?: string;
  lines: BillDraftLine[];
  extractedTotals: BillAnswer['totals'];
  confidence: number;
  warnings: string[];
}

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');

export function matchVendor(
  vendor: BillAnswer['vendor'],
  candidates: VendorCandidate[],
): VendorCandidate | null {
  const gstin = vendor.gstin?.trim().toUpperCase();
  if (gstin) {
    const byGstin = candidates.find((c) => c.gstin?.toUpperCase() === gstin);
    if (byGstin) return byGstin;
  }
  const wanted = norm(vendor.name);
  const exact = candidates.find((c) => norm(c.name) === wanted);
  if (exact) return exact;
  const partial = candidates.filter((c) => {
    const have = norm(c.name);
    return have.includes(wanted) || wanted.includes(have);
  });
  return partial.length === 1 ? partial[0] : null;
}

function matchItem(
  description: string,
  items: ItemCandidate[],
): ItemCandidate | null {
  const wanted = norm(description);
  const exact = items.find((i) => norm(i.name) === wanted);
  if (exact) return exact;
  const partial = items.filter((i) => {
    const have = norm(i.name);
    return have.includes(wanted) || wanted.includes(have);
  });
  return partial.length === 1 ? partial[0] : null;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

export function buildBillDraft(
  answer: BillAnswer,
  vendors: VendorCandidate[],
  items: ItemCandidate[],
): BillDraft {
  const warnings = [...answer.warnings];

  const gstin = answer.vendor.gstin?.trim().toUpperCase();
  if (gstin && !GSTIN_REGEX.test(gstin)) {
    warnings.push(`The GSTIN read from the bill ("${gstin}") looks invalid — verify it`);
  }
  const matchedVendor = matchVendor(answer.vendor, vendors);
  if (!matchedVendor) {
    warnings.push(
      `Vendor "${answer.vendor.name}" is not in your vendors yet — create it first, then pick it`,
    );
  }

  const lines: BillDraftLine[] = answer.lines.map((line) => {
    const item = matchItem(line.description, items);
    let gstRate: number | null = null;
    if (line.gstRate !== undefined) {
      if ((GST_RATES as readonly number[]).includes(line.gstRate)) {
        gstRate = line.gstRate;
      } else {
        warnings.push(
          `"${line.description}": GST ${line.gstRate}% is not a standard slab — set it manually`,
        );
      }
    }
    return {
      itemId: item?.id ?? null,
      description: line.description,
      hsnCode: line.hsnCode,
      quantity: line.quantity,
      unit: line.unit,
      rate: r2(line.rate),
      gstRate,
    };
  });

  // Cross-check: do the extracted lines actually add up to the bill total?
  const computedSubtotal = r2(
    lines.reduce((sum, l) => sum + l.quantity * l.rate, 0),
  );
  const computedTax = r2(
    lines.reduce(
      (sum, l) => sum + (l.gstRate ? (l.quantity * l.rate * l.gstRate) / 100 : 0),
      0,
    ),
  );
  const expected = answer.totals.total;
  if (expected !== undefined && Math.abs(computedSubtotal + computedTax - expected) > 1) {
    warnings.push(
      `Line items add up to ₹${r2(computedSubtotal + computedTax)} but the bill total reads ₹${expected} — check quantities and rates`,
    );
  }

  return {
    vendor: {
      partyId: matchedVendor?.id ?? null,
      name: matchedVendor?.name ?? answer.vendor.name,
      gstin: gstin || undefined,
    },
    supplierBillNo: answer.billNo,
    date: answer.date,
    dueDate: answer.dueDate,
    lines,
    extractedTotals: answer.totals,
    confidence: answer.confidence,
    warnings,
  };
}

/** base64 magic-byte sniffing for the formats Gemini accepts inline. */
export function detectMime(contentBase64: string, fileName: string): string | null {
  if (contentBase64.startsWith('JVBERi')) return 'application/pdf';
  if (contentBase64.startsWith('/9j/')) return 'image/jpeg';
  if (contentBase64.startsWith('iVBOR')) return 'image/png';
  if (contentBase64.startsWith('UklGR')) return 'image/webp';
  const ext = fileName.toLowerCase().split('.').pop();
  if (ext === 'pdf') return 'application/pdf';
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'png') return 'image/png';
  if (ext === 'webp') return 'image/webp';
  return null;
}
