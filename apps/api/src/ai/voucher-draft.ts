import { EntryType, VoucherType } from '@prisma/client';
import { z } from 'zod';

/**
 * Pure logic for turning a model's JSON answer into a reviewed-by-a-human
 * voucher draft: schema validation, ledger-name → ledger-id matching and
 * double-entry sanity checks. No I/O — unit tested in voucher-draft.spec.ts.
 */

/** AI drafts accounting vouchers only; sales/purchases go through invoices. */
export const AI_VOUCHER_TYPES = [
  VoucherType.JOURNAL,
  VoucherType.PAYMENT,
  VoucherType.RECEIPT,
  VoucherType.CONTRA,
] as const;

const modelLineSchema = z.object({
  ledger: z.string().min(1).max(200),
  type: z.enum([EntryType.DEBIT, EntryType.CREDIT]),
  amount: z.number().positive().finite(),
});

export const modelAnswerSchema = z.object({
  type: z.enum(AI_VOUCHER_TYPES),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  narration: z.string().max(1000).default(''),
  lines: z.array(modelLineSchema).min(2).max(20),
  confidence: z.number().min(0).max(1).default(0.5),
  warnings: z.array(z.string().max(300)).max(10).default([]),
});

export type ModelAnswer = z.infer<typeof modelAnswerSchema>;

export interface LedgerCatalogueEntry {
  id: string;
  name: string;
  groupName: string;
}

export interface DraftLine {
  /** null when the model named a ledger that doesn't exist in this company. */
  ledgerId: string | null;
  ledgerName: string;
  type: EntryType;
  amount: number;
}

export interface VoucherDraft {
  type: VoucherType;
  date: string;
  narration: string;
  lines: DraftLine[];
  /** Ledger names the model used that matched nothing — UI asks the user. */
  unmatchedLedgers: string[];
  balanced: boolean;
  confidence: number;
  warnings: string[];
}

/**
 * Models return null for fields they cannot fill even when told to omit
 * them. Schemas treat null as a type error, so: object keys with null
 * values are dropped, nulls inside arrays become '' (only table cells are
 * primitive arrays in our schemas).
 */
function stripNulls(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((v) => (v === null ? '' : stripNulls(v)));
  }
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      if (v !== null) out[k] = stripNulls(v);
    }
    return out;
  }
  return value;
}

/** Models love wrapping JSON in ```json fences even when told not to. */
export function extractJson(text: string): unknown {
  const trimmed = text.trim();
  const unfenced = trimmed.startsWith('```')
    ? trimmed.replace(/^```[a-z]*\s*/i, '').replace(/```\s*$/, '')
    : trimmed;
  return stripNulls(JSON.parse(unfenced));
}

const normalize = (name: string) =>
  name.toLowerCase().replace(/\s+/g, ' ').trim();

/**
 * Match a model-emitted ledger name against the company's catalogue:
 * exact (case/space-insensitive) first, then a unique substring match in
 * either direction ("HDFC Bank" ↔ "HDFC Bank Current A/c").
 */
export function matchLedger(
  name: string,
  catalogue: LedgerCatalogueEntry[],
): LedgerCatalogueEntry | null {
  const wanted = normalize(name);
  const exact = catalogue.find((l) => normalize(l.name) === wanted);
  if (exact) return exact;
  const partial = catalogue.filter((l) => {
    const have = normalize(l.name);
    return have.includes(wanted) || wanted.includes(have);
  });
  return partial.length === 1 ? partial[0] : null;
}

export function buildDraft(
  answer: ModelAnswer,
  catalogue: LedgerCatalogueEntry[],
): VoucherDraft {
  const warnings = [...answer.warnings];
  const unmatched: string[] = [];

  const lines: DraftLine[] = answer.lines.map((line) => {
    const match = matchLedger(line.ledger, catalogue);
    if (!match && !unmatched.includes(line.ledger)) unmatched.push(line.ledger);
    return {
      ledgerId: match?.id ?? null,
      ledgerName: match?.name ?? line.ledger,
      type: line.type,
      amount: Math.round(line.amount * 100) / 100,
    };
  });

  const debit = lines
    .filter((l) => l.type === EntryType.DEBIT)
    .reduce((sum, l) => sum + l.amount, 0);
  const credit = lines
    .filter((l) => l.type === EntryType.CREDIT)
    .reduce((sum, l) => sum + l.amount, 0);
  const balanced = Math.abs(debit - credit) < 0.005;
  if (!balanced) {
    warnings.push(
      `Debits (${debit.toFixed(2)}) and credits (${credit.toFixed(2)}) do not balance — adjust before posting`,
    );
  }

  return {
    type: answer.type,
    date: answer.date,
    narration: answer.narration,
    lines,
    unmatchedLedgers: unmatched,
    balanced,
    confidence: answer.confidence,
    warnings,
  };
}
