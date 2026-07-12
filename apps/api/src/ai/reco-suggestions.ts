import { EntryType } from '@prisma/client';
import { z } from 'zod';
import { matchLedger, type LedgerCatalogueEntry } from './voucher-draft';

/**
 * Pure logic for AI bank-reconciliation suggestions. The model proposes,
 * this module disposes: every suggestion is checked against the actual
 * unmatched sets, so the UI can act on what survives without re-validating.
 */

const suggestionSchema = z.object({
  statementLineId: z.string().min(1),
  kind: z.enum(['MATCH', 'CREATE']),
  /** MATCH: the unmatched book entry this statement line corresponds to. */
  voucherLineId: z.string().optional(),
  /** CREATE: counter ledger name for the missing voucher. */
  counterLedger: z.string().max(200).optional(),
  narration: z.string().max(300).optional(),
  reason: z.string().min(1).max(300),
  confidence: z.number().min(0).max(1).default(0.5),
});

export const recoAnswerSchema = z.object({
  suggestions: z.array(suggestionSchema).max(40).default([]),
});

export type RecoAnswer = z.infer<typeof recoAnswerSchema>;

export interface StatementLineLite {
  id: string;
  date: string;
  description: string;
  amount: number;
  type: EntryType;
}

export interface BookLineLite {
  voucherLineId: string;
  date: string;
  voucherNo: string;
  narration: string | null;
  type: EntryType;
  amount: number;
}

export interface RecoSuggestion {
  statementLineId: string;
  kind: 'MATCH' | 'CREATE';
  reason: string;
  confidence: number;
  /** MATCH only — guaranteed to reference a live unmatched book entry. */
  match?: BookLineLite;
  /** CREATE only. */
  create?: {
    counterLedgerId: string | null;
    counterLedgerName: string;
    narration: string;
  };
}

/**
 * Keeps only actionable suggestions: known statement line (once), MATCH must
 * point at an unmatched book entry with the same direction (used once),
 * CREATE resolves its counter ledger against the catalogue when possible.
 */
export function validateSuggestions(
  answer: RecoAnswer,
  statementLines: StatementLineLite[],
  bookLines: BookLineLite[],
  catalogue: LedgerCatalogueEntry[],
  bankLedgerId: string,
): RecoSuggestion[] {
  const statementById = new Map(statementLines.map((l) => [l.id, l]));
  const bookById = new Map(bookLines.map((l) => [l.voucherLineId, l]));
  const usedStatement = new Set<string>();
  const usedBook = new Set<string>();
  const result: RecoSuggestion[] = [];

  for (const s of answer.suggestions) {
    const statement = statementById.get(s.statementLineId);
    if (!statement || usedStatement.has(s.statementLineId)) continue;

    if (s.kind === 'MATCH') {
      const book = s.voucherLineId ? bookById.get(s.voucherLineId) : undefined;
      if (!book || usedBook.has(book.voucherLineId)) continue;
      if (book.type !== statement.type) continue;
      usedStatement.add(statement.id);
      usedBook.add(book.voucherLineId);
      result.push({
        statementLineId: statement.id,
        kind: 'MATCH',
        reason: s.reason,
        confidence: s.confidence,
        match: book,
      });
      continue;
    }

    if (!s.counterLedger) continue;
    const ledger = matchLedger(s.counterLedger, catalogue);
    if (ledger?.id === bankLedgerId) continue;
    usedStatement.add(statement.id);
    result.push({
      statementLineId: statement.id,
      kind: 'CREATE',
      reason: s.reason,
      confidence: s.confidence,
      create: {
        counterLedgerId: ledger?.id ?? null,
        counterLedgerName: ledger?.name ?? s.counterLedger,
        narration: s.narration?.trim() || statement.description,
      },
    });
  }

  return result;
}
