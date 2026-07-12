import { EntryType } from '@prisma/client';
import {
  recoAnswerSchema,
  validateSuggestions,
  type BookLineLite,
  type StatementLineLite,
} from './reco-suggestions';
import type { LedgerCatalogueEntry } from './voucher-draft';

const STATEMENT: StatementLineLite[] = [
  {
    id: 'st-1',
    date: '2026-06-10',
    description: 'NEFT-LAKSHMI FAB-XK129',
    amount: 5000,
    type: EntryType.DEBIT,
  },
  {
    id: 'st-2',
    date: '2026-06-11',
    description: 'SMS CHGS APR-JUN',
    amount: 59,
    type: EntryType.CREDIT,
  },
];

const BOOK: BookLineLite[] = [
  {
    voucherLineId: 'vl-1',
    date: '2026-06-09',
    voucherNo: 'RCT/2026-27/0007',
    narration: 'Received from Lakshmi Fabrics',
    type: EntryType.DEBIT,
    amount: 5000,
  },
];

const CATALOGUE: LedgerCatalogueEntry[] = [
  { id: 'l-bank', name: 'HDFC Bank', groupName: 'Bank Accounts' },
  { id: 'l-charges', name: 'Bank Charges', groupName: 'Indirect Expenses' },
];

const base = { narration: undefined, confidence: 0.9 };

describe('validateSuggestions', () => {
  it('keeps a valid MATCH and resolves CREATE counter ledgers', () => {
    const result = validateSuggestions(
      recoAnswerSchema.parse({
        suggestions: [
          {
            ...base,
            statementLineId: 'st-1',
            kind: 'MATCH',
            voucherLineId: 'vl-1',
            reason: 'Same amount, NEFT name matches narration',
          },
          {
            ...base,
            statementLineId: 'st-2',
            kind: 'CREATE',
            counterLedger: 'bank charges',
            narration: 'SMS alert charges',
            reason: 'Bank fee with no book entry',
          },
        ],
      }),
      STATEMENT,
      BOOK,
      CATALOGUE,
      'l-bank',
    );
    expect(result).toHaveLength(2);
    expect(result[0].match?.voucherLineId).toBe('vl-1');
    expect(result[1].create).toEqual({
      counterLedgerId: 'l-charges',
      counterLedgerName: 'Bank Charges',
      narration: 'SMS alert charges',
    });
  });

  it('drops invented ids, direction mismatches, duplicates and self-matches', () => {
    const result = validateSuggestions(
      recoAnswerSchema.parse({
        suggestions: [
          // invented statement id
          { ...base, statementLineId: 'st-99', kind: 'MATCH', voucherLineId: 'vl-1', reason: 'x' },
          // direction mismatch: st-2 is OUT, vl-1 is IN
          { ...base, statementLineId: 'st-2', kind: 'MATCH', voucherLineId: 'vl-1', reason: 'x' },
          // valid
          { ...base, statementLineId: 'st-1', kind: 'MATCH', voucherLineId: 'vl-1', reason: 'ok' },
          // duplicate statement line
          { ...base, statementLineId: 'st-1', kind: 'CREATE', counterLedger: 'Bank Charges', reason: 'x' },
          // CREATE resolving to the bank ledger itself
          { ...base, statementLineId: 'st-2', kind: 'CREATE', counterLedger: 'HDFC Bank', reason: 'x' },
        ],
      }),
      STATEMENT,
      BOOK,
      CATALOGUE,
      'l-bank',
    );
    expect(result).toHaveLength(1);
    expect(result[0].reason).toBe('ok');
  });

  it('keeps an unresolvable CREATE ledger as a named placeholder', () => {
    const result = validateSuggestions(
      recoAnswerSchema.parse({
        suggestions: [
          {
            ...base,
            statementLineId: 'st-2',
            kind: 'CREATE',
            counterLedger: 'Bank Interest Income',
            reason: 'Interest credit',
          },
        ],
      }),
      STATEMENT,
      BOOK,
      CATALOGUE,
      'l-bank',
    );
    expect(result[0].create?.counterLedgerId).toBeNull();
    expect(result[0].create?.counterLedgerName).toBe('Bank Interest Income');
    // narration falls back to the statement description
    expect(result[0].create?.narration).toBe('SMS CHGS APR-JUN');
  });
});
