import { normalizeTable, reportAnswerSchema } from './report-answer';

describe('reportAnswerSchema', () => {
  it('accepts an answer without a table', () => {
    const parsed = reportAnswerSchema.parse({ answer: 'Net profit is ₹1,20,000.' });
    expect(parsed.table).toBeUndefined();
  });

  it('accepts a well-formed table with mixed cells', () => {
    const parsed = reportAnswerSchema.parse({
      answer: 'Your top customers by dues:',
      table: {
        title: 'Outstanding receivables',
        columns: ['Customer', 'Due (₹)'],
        rows: [
          ['Lakshmi Fabrics', 59000],
          ['Mysore Mills Pvt Ltd', 23600],
        ],
      },
    });
    expect(parsed.table?.rows).toHaveLength(2);
  });

  it('rejects empty answers and oversized tables', () => {
    expect(reportAnswerSchema.safeParse({ answer: '' }).success).toBe(false);
    expect(
      reportAnswerSchema.safeParse({
        answer: 'x',
        table: { columns: [], rows: [['a']] },
      }).success,
    ).toBe(false);
  });
});

describe('normalizeTable', () => {
  it('drops ragged rows', () => {
    const result = normalizeTable({
      answer: 'a',
      table: {
        columns: ['x', 'y'],
        rows: [
          ['ok', 1],
          ['short'],
          ['too', 'many', 'cells'],
        ],
      },
    });
    expect(result.table?.rows).toEqual([['ok', 1]]);
  });

  it('removes the table entirely when no rows survive', () => {
    const result = normalizeTable({
      answer: 'a',
      table: { columns: ['x', 'y'], rows: [['only-one']] },
    });
    expect(result.table).toBeUndefined();
  });
});
