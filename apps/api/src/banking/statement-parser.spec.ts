import { parseStatementCsv } from './statement-parser';

describe('parseStatementCsv', () => {
  it('parses the common debit/credit column layout (HDFC/SBI style)', () => {
    const csv = [
      'Date,Narration,Debit,Credit,Balance',
      '11/06/2026,UPI-LAKSHMI FABRICS,,5000.00,105000.00',
      '12/06/2026,"RENT, JUNE",15000.00,,90000.00',
    ].join('\n');

    const rows = parseStatementCsv(csv);
    expect(rows).toEqual([
      { date: '2026-06-11', description: 'UPI-LAKSHMI FABRICS', amount: 5000, direction: 'IN' },
      { date: '2026-06-12', description: 'RENT, JUNE', amount: 15000, direction: 'OUT' },
    ]);
  });

  it('parses single amount column with Dr/Cr type', () => {
    const csv = [
      'Txn Date;Description;Amount;Dr/Cr',
      '2026-06-01;NEFT IN;"1,00,000.00";CR',
      '03-06-2026;ATM WDL;2000;DR',
    ].join('\n');

    const rows = parseStatementCsv(csv);
    expect(rows[0]).toEqual({
      date: '2026-06-01',
      description: 'NEFT IN',
      amount: 100000,
      direction: 'IN',
    });
    expect(rows[1].direction).toBe('OUT');
  });

  it('parses signed amount columns and "01 Jun 2026" dates', () => {
    const csv = ['Date,Details,Amount', '01 Jun 2026,Card refund,250.50', '02 Jun 2026,Card spend,-99.99'].join('\n');
    const rows = parseStatementCsv(csv);
    expect(rows[0].direction).toBe('IN');
    expect(rows[1]).toEqual({
      date: '2026-06-02',
      description: 'Card spend',
      amount: 99.99,
      direction: 'OUT',
    });
  });

  it('skips footer/summary rows without dates', () => {
    const csv = [
      'Date,Narration,Debit,Credit',
      '11/06/2026,Payment,100,',
      'TOTAL,,100,0',
    ].join('\n');
    expect(parseStatementCsv(csv)).toHaveLength(1);
  });

  it('rejects files without recognizable columns', () => {
    expect(() => parseStatementCsv('foo,bar\n1,2')).toThrow(/Date column/);
    expect(() => parseStatementCsv('Date,Note\n11/06/2026,hi')).toThrow(/Amount/);
  });
});
