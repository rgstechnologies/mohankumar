import {
  classifyTallyMasters,
  mapTableRows,
  normalizeUnit,
  parseDrCr,
  parseFlexibleDate,
  parseMoney,
  resolveTallyGroup,
  validateItemRows,
  validateLedgerRows,
  validateOpenDocRows,
  validatePartyRows,
  type KnownParty,
} from './import-rows';
import { looksLikeTallyXml, parseTallyMasters } from './tally-parser';
import { parseCsvTable } from './table-parser';

const OUR_GROUPS = new Set([
  'Capital Account',
  'Loans (Liability)',
  'Current Liabilities',
  'Sundry Creditors',
  'Duties & Taxes',
  'Fixed Assets',
  'Current Assets',
  'Cash-in-Hand',
  'Bank Accounts',
  'Sundry Debtors',
  'Stock-in-Hand',
  'Sales Accounts',
  'Indirect Income',
  'Purchase Accounts',
  'Direct Expenses',
  'Indirect Expenses',
]);

const TALLY_XML = `<?xml version="1.0"?>
<ENVELOPE>
 <BODY><IMPORTDATA><REQUESTDATA>
  <TALLYMESSAGE xmlns:UDF="TallyUDF">
   <GROUP NAME="South Customers" RESERVEDNAME="">
    <PARENT>Sundry Debtors</PARENT>
   </GROUP>
  </TALLYMESSAGE>
  <TALLYMESSAGE>
   <LEDGER NAME="Lakshmi Fabrics &amp; Co" RESERVEDNAME="">
    <PARENT>South Customers</PARENT>
    <OPENINGBALANCE>-45000.00</OPENINGBALANCE>
    <PARTYGSTIN>33AABCL4567C1ZD</PARTYGSTIN>
    <EMAIL>accounts@lakshmi.in</EMAIL>
    <ADDRESS.LIST TYPE="String"><ADDRESS>12 Market Road, Erode</ADDRESS></ADDRESS.LIST>
    <BILLALLOCATIONS.LIST>
     <NAME>INV-101</NAME>
     <BILLDATE>20260301</BILLDATE>
     <OPENINGBALANCE>-30000.00</OPENINGBALANCE>
    </BILLALLOCATIONS.LIST>
    <BILLALLOCATIONS.LIST>
     <NAME>INV-117</NAME>
     <OPENINGBALANCE>-15000.00</OPENINGBALANCE>
    </BILLALLOCATIONS.LIST>
    <BILLALLOCATIONS.LIST>
     <NAME>ADV-9</NAME>
     <OPENINGBALANCE>2000.00</OPENINGBALANCE>
    </BILLALLOCATIONS.LIST>
   </LEDGER>
  </TALLYMESSAGE>
  <TALLYMESSAGE>
   <LEDGER NAME="Karnataka Yarns" RESERVEDNAME="">
    <PARENT>Sundry Creditors</PARENT>
    <OPENINGBALANCE>23000.00</OPENINGBALANCE>
   </LEDGER>
  </TALLYMESSAGE>
  <TALLYMESSAGE>
   <LEDGER NAME="Electricity Charges" RESERVEDNAME="">
    <PARENT>Indirect Expenses</PARENT>
    <OPENINGBALANCE></OPENINGBALANCE>
   </LEDGER>
  </TALLYMESSAGE>
  <TALLYMESSAGE>
   <LEDGER NAME="Profit &amp; Loss A/c" RESERVEDNAME="Profit &amp; Loss A/c">
    <OPENINGBALANCE>100</OPENINGBALANCE>
   </LEDGER>
  </TALLYMESSAGE>
  <TALLYMESSAGE>
   <LEDGER NAME="Weird Ledger" RESERVEDNAME="">
    <PARENT>My Custom Group</PARENT>
    <OPENINGBALANCE>-10.00</OPENINGBALANCE>
   </LEDGER>
  </TALLYMESSAGE>
  <TALLYMESSAGE>
   <STOCKITEM NAME="Cotton Fabric 40s" RESERVEDNAME="">
    <PARENT>Fabrics</PARENT>
    <BASEUNITS>Mtr</BASEUNITS>
    <HSNCODE>5208</HSNCODE>
    <GSTRATE>5</GSTRATE>
    <OPENINGBALANCE> 910.000 Mtr</OPENINGBALANCE>
    <OPENINGRATE>120.00/Mtr</OPENINGRATE>
   </STOCKITEM>
  </TALLYMESSAGE>
 </REQUESTDATA></IMPORTDATA></BODY>
</ENVELOPE>`;

describe('tally-parser', () => {
  it('detects Tally XML', () => {
    expect(looksLikeTallyXml(TALLY_XML)).toBe(true);
    expect(looksLikeTallyXml('Name,Group\nCash,Cash-in-Hand')).toBe(false);
  });

  it('parses ledgers with the credit-positive sign convention', () => {
    const masters = parseTallyMasters(TALLY_XML);
    const lakshmi = masters.ledgers.find((l) => l.name === 'Lakshmi Fabrics & Co');
    expect(lakshmi).toMatchObject({
      parent: 'South Customers',
      openingBalance: 45000,
      openingType: 'DEBIT', // negative in Tally = debit
      gstin: '33AABCL4567C1ZD',
      email: 'accounts@lakshmi.in',
      address: '12 Market Road, Erode',
    });
    const yarns = masters.ledgers.find((l) => l.name === 'Karnataka Yarns');
    expect(yarns?.openingType).toBe('CREDIT');
    // Reserved (P&L) ledgers are skipped.
    expect(masters.ledgers.some((l) => l.name.includes('Profit'))).toBe(false);
  });

  it('parses stock items and custom group parents', () => {
    const masters = parseTallyMasters(TALLY_XML);
    expect(masters.items[0]).toMatchObject({
      name: 'Cotton Fabric 40s',
      unit: 'Mtr',
      hsnCode: '5208',
      gstRate: 5,
      openingQty: 910,
      openingRate: 120,
    });
    expect(masters.groupParents['south customers']).toBe('Sundry Debtors');
  });
});

describe('resolveTallyGroup + classification', () => {
  it('resolves custom sub-groups transitively', () => {
    expect(
      resolveTallyGroup('South Customers', { 'south customers': 'Sundry Debtors' }, OUR_GROUPS),
    ).toBe('Sundry Debtors');
    expect(resolveTallyGroup('Expenses (Indirect)', {}, OUR_GROUPS)).toBe('Indirect Expenses');
    expect(resolveTallyGroup('My Custom Group', {}, OUR_GROUPS)).toBeNull();
  });

  it('classifies debtors/creditors as parties and flags unknown groups', () => {
    const classified = classifyTallyMasters(parseTallyMasters(TALLY_XML), OUR_GROUPS);
    expect(classified.parties.map((p) => [p.name, p.type])).toEqual([
      ['Lakshmi Fabrics & Co', 'CUSTOMER'],
      ['Karnataka Yarns', 'VENDOR'],
    ]);
    expect(classified.ledgers.rows.map((r) => r.name)).toEqual([
      'Electricity Charges',
      'Weird Ledger',
    ]);
    expect(classified.ledgers.unknownGroups).toEqual(['My Custom Group']);
    expect(classified.items[0]).toMatchObject({ unit: 'MTR', gstRate: 5 });
  });
});

describe('bill allocations → open documents', () => {
  it('parses bill-wise openings and keeps only matching-sign bills', () => {
    const classified = classifyTallyMasters(parseTallyMasters(TALLY_XML), OUR_GROUPS);
    expect(classified.openInvoices).toEqual([
      { party: 'Lakshmi Fabrics & Co', refNo: 'INV-101', date: '2026-03-01', amount: 30000 },
      { party: 'Lakshmi Fabrics & Co', refNo: 'INV-117', date: '', amount: 15000 },
    ]);
    // ADV-9 is a credit on a debtor (advance) — stays in the net opening.
    expect(classified.openBills).toEqual([]);
  });
});

describe('validateOpenDocRows', () => {
  const parties = new Map<string, KnownParty>([
    ['lakshmi fabrics', { id: 'p-lf', type: 'CUSTOMER' }],
    ['karnataka yarns', { id: 'p-ky', type: 'VENDOR' }],
  ]);

  it('resolves known parties, accepts pending ones, errors on missing', () => {
    const result = validateOpenDocRows(
      [
        { party: 'Lakshmi Fabrics', refNo: 'INV-1', date: '12/05/2026', amount: '10,000' },
        { party: 'New Customer', refNo: 'INV-2', amount: 500 },
        { party: 'Ghost Co', refNo: 'INV-3', amount: 500 },
        { party: 'Karnataka Yarns', refNo: 'INV-4', amount: 500 },
      ],
      'RECEIVABLE',
      parties,
      new Set(['new customer']),
      new Set(),
      '2026-06-12',
    );
    expect(result.valid).toHaveLength(2);
    expect(result.valid[0]).toMatchObject({
      partyId: 'p-lf',
      date: '2026-05-12', // DD/MM/YYYY
      amount: 10000,
    });
    expect(result.valid[1]).toMatchObject({ partyId: '', date: '2026-06-12' });
    expect(result.errors.map((e) => e.message)).toEqual([
      'Party "Ghost Co" not found — import Customers & Vendors first',
      '"Karnataka Yarns" is a vendor — open invoices need customers',
    ]);
  });

  it('skips refs that already exist and rejects bad amounts/dates', () => {
    const result = validateOpenDocRows(
      [
        { party: 'Lakshmi Fabrics', refNo: 'OLD-1', amount: 100 },
        { party: 'Lakshmi Fabrics', refNo: 'INV-9', amount: '-5' },
        { party: 'Lakshmi Fabrics', refNo: 'INV-10', date: 'sometime', amount: 100 },
      ],
      'RECEIVABLE',
      parties,
      new Set(),
      new Set(['lakshmi fabrics|old-1']),
      '2026-06-12',
    );
    expect(result.duplicates).toEqual(['Lakshmi Fabrics / OLD-1']);
    expect(result.errors.map((e) => e.message)).toEqual([
      'Outstanding amount must be a positive number',
      'Unreadable date "sometime"',
    ]);
  });
});

describe('coercion helpers', () => {
  it('parses flexible dates', () => {
    expect(parseFlexibleDate('2026-06-12')).toBe('2026-06-12');
    expect(parseFlexibleDate('12/06/2026')).toBe('2026-06-12');
    expect(parseFlexibleDate('1-6-2026')).toBe('2026-06-01');
    expect(parseFlexibleDate('12.06.2026')).toBe('2026-06-12');
    expect(parseFlexibleDate('31/13/2026')).toBeNull();
    expect(parseFlexibleDate('soon')).toBeNull();
  });

  it('parses Indian money formats', () => {
    expect(parseMoney('₹1,45,000.50')).toBe(145000.5);
    expect(parseMoney('(500)')).toBe(-500);
    expect(parseMoney('')).toBe(0);
    expect(parseMoney('abc')).toBeNull();
  });

  it('parses Dr/Cr and units', () => {
    expect(parseDrCr('Dr.')).toBe('DEBIT');
    expect(parseDrCr('credit')).toBe('CREDIT');
    expect(parseDrCr('')).toBeNull();
    expect(normalizeUnit('Pieces')).toBe('PCS');
    expect(normalizeUnit('kgs')).toBe('KG');
    expect(normalizeUnit('')).toBe('PCS');
    expect(normalizeUnit('lightyears')).toBeNull();
  });
});

describe('CSV mapping + validation', () => {
  const csv = [
    'Party Name,GSTIN/UIN,Op. Bal.,Bal Dr/Cr,Type',
    'Lakshmi Fabrics,33AABCL4567C1ZD,"45,000",Dr,Customer',
    'Karnataka Yarns,29AAACK9999A1Z1,23000,Cr,Supplier',
    ',missing-name,1,Dr,Customer',
    'Bad GST Co,NOT-A-GSTIN,0,,Customer',
  ].join('\n');

  it('maps columns and validates parties', () => {
    const table = parseCsvTable(csv);
    const raw = mapTableRows('PARTIES', table.headers.length, table.rows, {
      name: 0,
      gstin: 1,
      openingBalance: 2,
      openingType: 3,
      type: 4,
    });
    const result = validatePartyRows(raw, new Set(['cash']), 'CUSTOMER');
    expect(result.valid).toHaveLength(2);
    expect(result.valid[0]).toMatchObject({
      name: 'Lakshmi Fabrics',
      type: 'CUSTOMER',
      openingBalance: 45000,
      openingType: 'DEBIT',
    });
    expect(result.valid[1].type).toBe('VENDOR');
    expect(result.errors).toHaveLength(2);
    expect(result.errors[0].message).toBe('Name is required');
    expect(result.errors[1].message).toContain('Invalid GSTIN');
  });

  it('skips existing names as duplicates, not errors', () => {
    const result = validateLedgerRows(
      [
        { name: 'Cash', group: 'Cash-in-Hand' },
        { name: 'Generator Fuel', group: 'indirect expenses', openingBalance: '1,000', openingType: 'dr' },
        { name: 'Mystery', group: 'No Such Group' },
      ],
      new Set(['cash']),
      OUR_GROUPS,
    );
    expect(result.duplicates).toEqual(['Cash']);
    expect(result.valid).toEqual([
      {
        name: 'Generator Fuel',
        group: 'Indirect Expenses',
        openingBalance: 1000,
        openingType: 'DEBIT',
        description: undefined,
      },
    ]);
    expect(result.errors[0].message).toContain('Unknown account group');
  });

  it('validates items: units, HSN, GST rates', () => {
    const result = validateItemRows(
      [
        { name: 'Cotton Fabric', unit: 'Meters', hsnCode: '5208', gstRate: '5%', openingStock: '910' },
        { name: 'Bad Unit', unit: 'lightyears' },
        { name: 'Bad Rate', gstRate: '7' },
        { name: 'Bad HSN', hsnCode: 'ABC' },
      ],
      new Set(),
    );
    expect(result.valid).toHaveLength(1);
    expect(result.valid[0]).toMatchObject({ unit: 'MTR', gstRate: 5, openingStock: 910 });
    expect(result.errors.map((e) => e.name)).toEqual(['Bad Unit', 'Bad Rate', 'Bad HSN']);
  });
});
