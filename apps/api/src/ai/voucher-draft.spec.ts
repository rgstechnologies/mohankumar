import { EntryType, VoucherType } from '@prisma/client';
import {
  buildDraft,
  extractJson,
  matchLedger,
  modelAnswerSchema,
  type LedgerCatalogueEntry,
} from './voucher-draft';

const CATALOGUE: LedgerCatalogueEntry[] = [
  { id: 'l-cash', name: 'Cash', groupName: 'Cash-in-Hand' },
  { id: 'l-hdfc', name: 'HDFC Bank Current A/c', groupName: 'Bank Accounts' },
  { id: 'l-rent', name: 'Rent Expense', groupName: 'Indirect Expenses' },
  { id: 'l-sal', name: 'Salaries & Wages', groupName: 'Indirect Expenses' },
  { id: 'l-cgst', name: 'Input CGST', groupName: 'Duties & Taxes' },
  { id: 'l-sgst', name: 'Input SGST', groupName: 'Duties & Taxes' },
];

describe('extractJson', () => {
  it('parses plain JSON', () => {
    expect(extractJson('{"a":1}')).toEqual({ a: 1 });
  });

  it('strips markdown code fences', () => {
    expect(extractJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
  });

  it('throws on garbage', () => {
    expect(() => extractJson('sorry, I cannot')).toThrow();
  });
});

describe('matchLedger', () => {
  it('matches exactly ignoring case and extra spaces', () => {
    expect(matchLedger('  rent   expense ', CATALOGUE)?.id).toBe('l-rent');
  });

  it('matches a unique substring in either direction', () => {
    expect(matchLedger('HDFC Bank', CATALOGUE)?.id).toBe('l-hdfc');
    expect(matchLedger('Salaries & Wages A/c', CATALOGUE)?.id).toBe('l-sal');
  });

  it('returns null when ambiguous or unknown', () => {
    // 'Input' substring-matches both CGST and SGST → ambiguous.
    expect(matchLedger('Input', CATALOGUE)).toBeNull();
    expect(matchLedger('Travelling Expense', CATALOGUE)).toBeNull();
  });
});

describe('buildDraft', () => {
  const answer = modelAnswerSchema.parse({
    type: VoucherType.PAYMENT,
    date: '2026-06-12',
    narration: 'Being rent paid by HDFC bank transfer',
    lines: [
      { ledger: 'Rent Expense', type: EntryType.DEBIT, amount: 12000 },
      { ledger: 'HDFC Bank', type: EntryType.CREDIT, amount: 12000 },
    ],
    confidence: 0.9,
    warnings: [],
  });

  it('maps matched ledgers to ids and reports balance', () => {
    const draft = buildDraft(answer, CATALOGUE);
    expect(draft.lines).toEqual([
      {
        ledgerId: 'l-rent',
        ledgerName: 'Rent Expense',
        type: EntryType.DEBIT,
        amount: 12000,
      },
      {
        ledgerId: 'l-hdfc',
        ledgerName: 'HDFC Bank Current A/c',
        type: EntryType.CREDIT,
        amount: 12000,
      },
    ]);
    expect(draft.balanced).toBe(true);
    expect(draft.unmatchedLedgers).toEqual([]);
    expect(draft.warnings).toEqual([]);
  });

  it('collects unmatched ledger names and keeps the model name on the line', () => {
    const draft = buildDraft(
      {
        ...answer,
        lines: [
          { ledger: 'Travelling Expense', type: EntryType.DEBIT, amount: 500 },
          { ledger: 'Cash', type: EntryType.CREDIT, amount: 500 },
        ],
      },
      CATALOGUE,
    );
    expect(draft.lines[0]).toMatchObject({
      ledgerId: null,
      ledgerName: 'Travelling Expense',
    });
    expect(draft.unmatchedLedgers).toEqual(['Travelling Expense']);
  });

  it('flags unbalanced drafts with a warning', () => {
    const draft = buildDraft(
      {
        ...answer,
        lines: [
          { ledger: 'Rent Expense', type: EntryType.DEBIT, amount: 12000 },
          { ledger: 'Cash', type: EntryType.CREDIT, amount: 11000 },
        ],
      },
      CATALOGUE,
    );
    expect(draft.balanced).toBe(false);
    expect(draft.warnings.some((w) => w.includes('do not balance'))).toBe(true);
  });

  it('rounds amounts to paise', () => {
    const draft = buildDraft(
      {
        ...answer,
        lines: [
          { ledger: 'Rent Expense', type: EntryType.DEBIT, amount: 100.005 },
          { ledger: 'Cash', type: EntryType.CREDIT, amount: 100.005 },
        ],
      },
      CATALOGUE,
    );
    expect(draft.lines[0].amount).toBe(100.01);
    expect(draft.balanced).toBe(true);
  });
});

describe('modelAnswerSchema', () => {
  it('rejects sales vouchers and bad dates', () => {
    expect(
      modelAnswerSchema.safeParse({
        type: 'SALES',
        date: '2026-06-12',
        lines: [],
      }).success,
    ).toBe(false);
    expect(
      modelAnswerSchema.safeParse({
        type: 'PAYMENT',
        date: '12/06/2026',
        lines: [
          { ledger: 'Cash', type: 'DEBIT', amount: 1 },
          { ledger: 'Cash', type: 'CREDIT', amount: 1 },
        ],
      }).success,
    ).toBe(false);
  });

  it('defaults narration, confidence and warnings', () => {
    const parsed = modelAnswerSchema.parse({
      type: 'JOURNAL',
      date: '2026-06-12',
      lines: [
        { ledger: 'Cash', type: 'DEBIT', amount: 1 },
        { ledger: 'Rent Expense', type: 'CREDIT', amount: 1 },
      ],
    });
    expect(parsed.narration).toBe('');
    expect(parsed.confidence).toBe(0.5);
    expect(parsed.warnings).toEqual([]);
  });
});
