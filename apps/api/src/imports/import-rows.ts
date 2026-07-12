import {
  GST_RATES,
  GSTIN_REGEX,
  HSN_REGEX,
  ITEM_UNITS,
  PINCODE_REGEX,
} from '../common/validation';
import type { TallyLedger, TallyMasters } from './tally-parser';

/**
 * Normalization + validation for import rows. Pure — the service feeds it
 * raw cells (from CSV/XLSX/Tally) and existing-name sets, it returns what
 * can be created, what already exists, and what is wrong row by row.
 */

export type ImportEntity =
  | 'LEDGERS'
  | 'PARTIES'
  | 'ITEMS'
  | 'OPEN_INVOICES'
  | 'OPEN_BILLS';

export interface LedgerImportRow {
  name: string;
  group: string;
  openingBalance: number;
  openingType: 'DEBIT' | 'CREDIT';
  description?: string;
}

export interface PartyImportRow {
  name: string;
  type: 'CUSTOMER' | 'VENDOR';
  gstin?: string;
  email?: string;
  phone?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  pincode?: string;
  openingBalance: number;
  openingType: 'DEBIT' | 'CREDIT';
}

export interface ItemImportRow {
  name: string;
  sku?: string;
  hsnCode?: string;
  unit: string;
  gstRate: number;
  salePrice?: number;
  purchasePrice?: number;
  openingStock: number;
  barcode?: string;
  description?: string;
}

/** One outstanding bill carried over; kind comes from the entity. */
export interface OpenDocImportRow {
  party: string;
  partyId: string;
  refNo: string;
  date: string;
  dueDate?: string;
  amount: number;
  notes?: string;
}

export interface RowError {
  row: number;
  name: string;
  message: string;
}

export interface ValidatedRows<T> {
  valid: T[];
  /** Names that already exist in this company — skipped, not errors. */
  duplicates: string[];
  errors: RowError[];
}

/** Our importable fields per entity, in display order (drives mapping UIs). */
export const ENTITY_FIELDS: Record<ImportEntity, string[]> = {
  LEDGERS: ['name', 'group', 'openingBalance', 'openingType', 'description'],
  PARTIES: [
    'name',
    'type',
    'gstin',
    'email',
    'phone',
    'addressLine1',
    'addressLine2',
    'city',
    'pincode',
    'openingBalance',
    'openingType',
  ],
  ITEMS: [
    'name',
    'sku',
    'hsnCode',
    'unit',
    'gstRate',
    'salePrice',
    'purchasePrice',
    'openingStock',
    'barcode',
    'description',
  ],
  OPEN_INVOICES: ['party', 'refNo', 'date', 'dueDate', 'amount', 'notes'],
  OPEN_BILLS: ['party', 'refNo', 'date', 'dueDate', 'amount', 'notes'],
};

// ---------------------------------------------------------------
// Coercion helpers — imports meet the messiest data
// ---------------------------------------------------------------

export function parseMoney(raw: string | undefined): number | null {
  if (raw === undefined) return 0;
  const cleaned = raw.replace(/[₹,\s]/g, '').replace(/^\((.+)\)$/, '-$1');
  if (cleaned === '') return 0;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/** "Dr", "debit", "DR." → DEBIT; "Cr" → CREDIT; blank → null (use default). */
export function parseDrCr(raw: string | undefined): 'DEBIT' | 'CREDIT' | null {
  const s = (raw ?? '').trim().toLowerCase().replace(/[.\s]/g, '');
  if (!s) return null;
  if (s.startsWith('d')) return 'DEBIT';
  if (s.startsWith('c')) return 'CREDIT';
  return null;
}

/** ISO, DD/MM/YYYY, DD-MM-YYYY or DD.MM.YYYY → ISO; null when unreadable. */
export function parseFlexibleDate(raw: string | undefined): string | null {
  const s = (raw ?? '').trim();
  if (!s) return null;
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (m) return iso(+m[1], +m[2], +m[3]);
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/.exec(s);
  if (m) return iso(+m[3], +m[2], +m[1]); // Indian convention: day first
  return null;
}

function iso(y: number, mo: number, d: number): string | null {
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

const UNIT_ALIASES: Record<string, (typeof ITEM_UNITS)[number]> = {
  pcs: 'PCS', pc: 'PCS', piece: 'PCS', pieces: 'PCS',
  nos: 'NOS', no: 'NOS', num: 'NOS', numbers: 'NOS', unit: 'NOS', units: 'NOS',
  kg: 'KG', kgs: 'KG', kilogram: 'KG', kilograms: 'KG',
  g: 'G', gm: 'G', gms: 'G', gram: 'G', grams: 'G',
  mtr: 'MTR', m: 'MTR', meter: 'MTR', metre: 'MTR', meters: 'MTR', metres: 'MTR',
  cm: 'CM', ltr: 'LTR', l: 'LTR', litre: 'LTR', liter: 'LTR', litres: 'LTR',
  ml: 'ML', box: 'BOX', boxes: 'BOX', doz: 'DOZ', dozen: 'DOZ',
  set: 'SET', sets: 'SET', pair: 'PAIR', pairs: 'PAIR', pr: 'PAIR',
  roll: 'ROLL', rolls: 'ROLL', sqm: 'SQM', bale: 'BALE', bales: 'BALE',
  bundle: 'BUNDLE', bundles: 'BUNDLE', bdl: 'BUNDLE',
};

export function normalizeUnit(raw: string | undefined): string | null {
  const s = (raw ?? '').trim().toLowerCase().replace(/[.\s]/g, '');
  if (!s) return 'PCS';
  const upper = s.toUpperCase();
  if ((ITEM_UNITS as readonly string[]).includes(upper)) return upper;
  return UNIT_ALIASES[s] ?? null;
}

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');

// ---------------------------------------------------------------
// Tally group → our chart-of-accounts group
// ---------------------------------------------------------------

/** lowercase Tally group name → our seeded group name. */
const GROUP_ALIASES: Record<string, string> = {
  'capital account': 'Capital Account',
  'reserves & surplus': 'Capital Account',
  'loans (liability)': 'Loans (Liability)',
  'secured loans': 'Loans (Liability)',
  'unsecured loans': 'Loans (Liability)',
  'bank od a/c': 'Loans (Liability)',
  'bank occ a/c': 'Loans (Liability)',
  'current liabilities': 'Current Liabilities',
  'provisions': 'Current Liabilities',
  'sundry creditors': 'Sundry Creditors',
  'duties & taxes': 'Duties & Taxes',
  'fixed assets': 'Fixed Assets',
  'current assets': 'Current Assets',
  'deposits (asset)': 'Current Assets',
  'loans & advances (asset)': 'Current Assets',
  'misc. expenses (asset)': 'Current Assets',
  'cash-in-hand': 'Cash-in-Hand',
  'bank accounts': 'Bank Accounts',
  'sundry debtors': 'Sundry Debtors',
  'stock-in-hand': 'Stock-in-Hand',
  'sales accounts': 'Sales Accounts',
  'income (direct)': 'Sales Accounts',
  'direct incomes': 'Sales Accounts',
  'income (indirect)': 'Indirect Income',
  'indirect incomes': 'Indirect Income',
  'indirect income': 'Indirect Income',
  'purchase accounts': 'Purchase Accounts',
  'direct expenses': 'Direct Expenses',
  'expenses (direct)': 'Direct Expenses',
  'indirect expenses': 'Indirect Expenses',
  'expenses (indirect)': 'Indirect Expenses',
};

/** Resolves a Tally parent (possibly a custom sub-group) to one of our groups. */
export function resolveTallyGroup(
  parent: string,
  groupParents: Record<string, string>,
  ourGroups: Set<string>,
): string | null {
  let current = parent;
  for (let hop = 0; hop < 10 && current; hop++) {
    const direct = GROUP_ALIASES[norm(current)];
    if (direct) return direct;
    const exact = [...ourGroups].find((g) => norm(g) === norm(current));
    if (exact) return exact;
    current = groupParents[norm(current)] ?? '';
  }
  return null;
}

// ---------------------------------------------------------------
// Tally masters → import rows
// ---------------------------------------------------------------

export interface TallyClassified {
  ledgers: { rows: (LedgerImportRow & { sourceParent: string })[]; unknownGroups: string[] };
  parties: PartyImportRow[];
  items: ItemImportRow[];
  /** Bill-wise breakups of debtor/creditor openings (partyId resolved later). */
  openInvoices: Omit<OpenDocImportRow, 'partyId'>[];
  openBills: Omit<OpenDocImportRow, 'partyId'>[];
}

export function classifyTallyMasters(
  masters: TallyMasters,
  ourGroups: Set<string>,
): TallyClassified {
  const parties: PartyImportRow[] = [];
  const ledgerRows: (LedgerImportRow & { sourceParent: string })[] = [];
  const unknownGroups = new Set<string>();
  const openInvoices: Omit<OpenDocImportRow, 'partyId'>[] = [];
  const openBills: Omit<OpenDocImportRow, 'partyId'>[] = [];

  const partySide = (l: TallyLedger): 'CUSTOMER' | 'VENDOR' | null => {
    const resolved = resolveTallyGroup(l.parent, masters.groupParents, ourGroups);
    if (resolved === 'Sundry Debtors') return 'CUSTOMER';
    if (resolved === 'Sundry Creditors') return 'VENDOR';
    return null;
  };

  for (const ledger of masters.ledgers) {
    const side = partySide(ledger);
    if (side) {
      parties.push({
        name: ledger.name,
        type: side,
        gstin: ledger.gstin,
        email: ledger.email,
        phone: ledger.phone?.slice(0, 20),
        addressLine1: ledger.address?.slice(0, 200),
        openingBalance: ledger.openingBalance,
        openingType: ledger.openingType,
      });
      // Bill-wise breakup: customer DEBIT bills are open invoices, vendor
      // CREDIT bills are open bills. Opposite signs (advances) are skipped —
      // they stay inside the party's net opening balance.
      for (const bill of ledger.bills) {
        const target =
          side === 'CUSTOMER' && bill.type === 'DEBIT'
            ? openInvoices
            : side === 'VENDOR' && bill.type === 'CREDIT'
              ? openBills
              : null;
        target?.push({
          party: ledger.name,
          refNo: bill.refNo,
          date: bill.date ?? '',
          amount: bill.amount,
        });
      }
      continue;
    }
    const group = resolveTallyGroup(
      ledger.parent,
      masters.groupParents,
      ourGroups,
    );
    if (!group) unknownGroups.add(ledger.parent || '(none)');
    ledgerRows.push({
      name: ledger.name,
      group: group ?? ledger.parent,
      openingBalance: ledger.openingBalance,
      openingType: ledger.openingType,
      sourceParent: ledger.parent,
    });
  }

  const items: ItemImportRow[] = masters.items.map((item) => ({
    name: item.name,
    hsnCode: item.hsnCode,
    unit: normalizeUnit(item.unit) ?? 'PCS',
    gstRate: (GST_RATES as readonly number[]).includes(item.gstRate ?? -1)
      ? (item.gstRate as number)
      : 0,
    purchasePrice: item.openingRate,
    openingStock: item.openingQty,
  }));

  return {
    ledgers: { rows: ledgerRows, unknownGroups: [...unknownGroups] },
    parties,
    items,
    openInvoices,
    openBills,
  };
}

// ---------------------------------------------------------------
// Generic table rows (CSV/XLSX) → import rows, via a column mapping
// ---------------------------------------------------------------

/** field name → column index in the source table (missing = not mapped). */
export type ColumnMapping = Record<string, number>;

export function mapTableRows(
  entity: ImportEntity,
  headersLength: number,
  rows: string[][],
  mapping: ColumnMapping,
): Record<string, string>[] {
  const fields = ENTITY_FIELDS[entity];
  return rows.map((cells) => {
    const out: Record<string, string> = {};
    for (const field of fields) {
      const idx = mapping[field];
      if (idx === undefined || idx < 0 || idx >= headersLength) continue;
      const value = (cells[idx] ?? '').trim();
      if (value !== '') out[field] = value;
    }
    return out;
  });
}

// ---------------------------------------------------------------
// Validation (shared by both sources; raw = string-keyed records)
// ---------------------------------------------------------------

export function validateLedgerRows(
  raw: Record<string, string | number | undefined>[],
  existingLedgers: Set<string>,
  ourGroups: Set<string>,
): ValidatedRows<LedgerImportRow> {
  const valid: LedgerImportRow[] = [];
  const duplicates: string[] = [];
  const errors: RowError[] = [];
  const seen = new Set<string>();

  raw.forEach((r, i) => {
    const row = i + 1;
    const name = String(r.name ?? '').trim();
    if (!name) return errors.push({ row, name: '', message: 'Name is required' });
    if (name.length > 150)
      return errors.push({ row, name, message: 'Name is longer than 150 characters' });
    if (seen.has(norm(name)))
      return errors.push({ row, name, message: 'Duplicate name within the file' });
    seen.add(norm(name));
    if (existingLedgers.has(norm(name))) return duplicates.push(name);

    const groupRaw = String(r.group ?? '').trim();
    const group = [...ourGroups].find((g) => norm(g) === norm(groupRaw));
    if (!group)
      return errors.push({
        row,
        name,
        message: groupRaw
          ? `Unknown account group "${groupRaw}"`
          : 'Account group is required',
      });

    const opening =
      typeof r.openingBalance === 'number'
        ? r.openingBalance
        : parseMoney(r.openingBalance as string | undefined);
    if (opening === null)
      return errors.push({ row, name, message: 'Opening balance is not a number' });
    const type =
      typeof r.openingType === 'string' && r.openingType.length > 2
        ? (r.openingType as 'DEBIT' | 'CREDIT')
        : parseDrCr(r.openingType as string | undefined);

    valid.push({
      name,
      group,
      openingBalance: Math.abs(opening),
      openingType: type ?? (opening < 0 ? 'CREDIT' : 'DEBIT'),
      description: r.description ? String(r.description).slice(0, 500) : undefined,
    });
  });

  return { valid, duplicates, errors };
}

export function validatePartyRows(
  raw: Record<string, string | number | undefined>[],
  existingLedgers: Set<string>,
  defaultType: 'CUSTOMER' | 'VENDOR',
): ValidatedRows<PartyImportRow> {
  const valid: PartyImportRow[] = [];
  const duplicates: string[] = [];
  const errors: RowError[] = [];
  const seen = new Set<string>();

  raw.forEach((r, i) => {
    const row = i + 1;
    const name = String(r.name ?? '').trim();
    if (!name) return errors.push({ row, name: '', message: 'Name is required' });
    if (name.length > 200)
      return errors.push({ row, name, message: 'Name is longer than 200 characters' });
    if (seen.has(norm(name)))
      return errors.push({ row, name, message: 'Duplicate name within the file' });
    seen.add(norm(name));
    // Parties own a ledger with the same name, so the ledger namespace decides.
    if (existingLedgers.has(norm(name))) return duplicates.push(name);

    // "Customer"/"Debtor" vs "Vendor"/"Supplier"/"Creditor"; else the default.
    const typeRaw = String(r.type ?? '').trim().toLowerCase();
    const type: 'CUSTOMER' | 'VENDOR' =
      /^(cust|debtor|buyer|sundry de)/.test(typeRaw)
        ? 'CUSTOMER'
        : /^(vend|suppl|credit|seller|sundry cr)/.test(typeRaw)
          ? 'VENDOR'
          : defaultType;

    const gstin = r.gstin ? String(r.gstin).trim().toUpperCase() : undefined;
    if (gstin && !GSTIN_REGEX.test(gstin))
      return errors.push({ row, name, message: `Invalid GSTIN "${gstin}"` });
    const pincode = r.pincode ? String(r.pincode).trim() : undefined;
    if (pincode && !PINCODE_REGEX.test(pincode))
      return errors.push({ row, name, message: `Invalid pincode "${pincode}"` });
    const email = r.email ? String(r.email).trim() : undefined;
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      return errors.push({ row, name, message: `Invalid email "${email}"` });

    const opening =
      typeof r.openingBalance === 'number'
        ? r.openingBalance
        : parseMoney(r.openingBalance as string | undefined);
    if (opening === null)
      return errors.push({ row, name, message: 'Opening balance is not a number' });
    const drcr =
      typeof r.openingType === 'string' && r.openingType.length > 2
        ? (r.openingType as 'DEBIT' | 'CREDIT')
        : parseDrCr(r.openingType as string | undefined);

    valid.push({
      name,
      type,
      gstin,
      email,
      phone: r.phone ? String(r.phone).slice(0, 20) : undefined,
      addressLine1: r.addressLine1 ? String(r.addressLine1).slice(0, 200) : undefined,
      addressLine2: r.addressLine2 ? String(r.addressLine2).slice(0, 200) : undefined,
      city: r.city ? String(r.city).slice(0, 100) : undefined,
      pincode,
      openingBalance: Math.abs(opening),
      openingType:
        drcr ?? (type === 'CUSTOMER' ? 'DEBIT' : 'CREDIT'),
    });
  });

  return { valid, duplicates, errors };
}

export interface KnownParty {
  id: string;
  type: 'CUSTOMER' | 'VENDOR';
}

/**
 * Open invoices (customers) / open bills (vendors). Parties must exist in
 * the DB — or, for same-file Tally imports, be listed in `pendingParties`
 * (they get imported first; commit resolves them again and fails cleanly
 * if the user skipped that step).
 */
export function validateOpenDocRows(
  raw: Record<string, string | number | undefined>[],
  kind: 'RECEIVABLE' | 'PAYABLE',
  partiesByName: Map<string, KnownParty>,
  pendingParties: Set<string>,
  existingRefs: Set<string>,
  defaultDate: string,
): ValidatedRows<OpenDocImportRow> {
  const valid: OpenDocImportRow[] = [];
  const duplicates: string[] = [];
  const errors: RowError[] = [];
  const seen = new Set<string>();
  const wantedType = kind === 'RECEIVABLE' ? 'CUSTOMER' : 'VENDOR';

  raw.forEach((r, i) => {
    const row = i + 1;
    const party = String(r.party ?? '').trim();
    const refNo = String(r.refNo ?? '').trim().slice(0, 80);
    const label = `${party} / ${refNo}`;
    if (!party) return errors.push({ row, name: label, message: 'Party is required' });
    if (!refNo)
      return errors.push({ row, name: label, message: 'Bill/invoice reference is required' });

    const key = `${norm(party)}|${norm(refNo)}`;
    if (seen.has(key))
      return errors.push({ row, name: label, message: 'Duplicate reference within the file' });
    seen.add(key);
    if (existingRefs.has(key)) return duplicates.push(label);

    const known = partiesByName.get(norm(party));
    if (known && known.type !== wantedType) {
      return errors.push({
        row,
        name: label,
        message:
          wantedType === 'CUSTOMER'
            ? `"${party}" is a vendor — open invoices need customers`
            : `"${party}" is a customer — open bills need vendors`,
      });
    }
    if (!known && !pendingParties.has(norm(party))) {
      return errors.push({
        row,
        name: label,
        message: `Party "${party}" not found — import Customers & Vendors first`,
      });
    }

    const amount =
      typeof r.amount === 'number' ? r.amount : parseMoney(r.amount as string | undefined);
    if (amount === null || amount <= 0)
      return errors.push({ row, name: label, message: 'Outstanding amount must be a positive number' });

    const dateRaw = String(r.date ?? '').trim();
    const date = dateRaw ? parseFlexibleDate(dateRaw) : defaultDate;
    if (!date)
      return errors.push({ row, name: label, message: `Unreadable date "${dateRaw}"` });
    const dueRaw = String(r.dueDate ?? '').trim();
    const dueDate = dueRaw ? parseFlexibleDate(dueRaw) : undefined;
    if (dueRaw && !dueDate)
      return errors.push({ row, name: label, message: `Unreadable due date "${dueRaw}"` });

    valid.push({
      party,
      partyId: known?.id ?? '',
      refNo,
      date,
      dueDate: dueDate ?? undefined,
      amount: Math.round(amount * 100) / 100,
      notes: r.notes ? String(r.notes).slice(0, 500) : undefined,
    });
  });

  return { valid, duplicates, errors };
}

export function validateItemRows(
  raw: Record<string, string | number | undefined>[],
  existingItems: Set<string>,
): ValidatedRows<ItemImportRow> {
  const valid: ItemImportRow[] = [];
  const duplicates: string[] = [];
  const errors: RowError[] = [];
  const seen = new Set<string>();

  raw.forEach((r, i) => {
    const row = i + 1;
    const name = String(r.name ?? '').trim();
    if (!name) return errors.push({ row, name: '', message: 'Name is required' });
    if (name.length > 200)
      return errors.push({ row, name, message: 'Name is longer than 200 characters' });
    if (seen.has(norm(name)))
      return errors.push({ row, name, message: 'Duplicate name within the file' });
    seen.add(norm(name));
    if (existingItems.has(norm(name))) return duplicates.push(name);

    const hsnCode = r.hsnCode ? String(r.hsnCode).trim() : undefined;
    if (hsnCode && !HSN_REGEX.test(hsnCode))
      return errors.push({ row, name, message: `Invalid HSN code "${hsnCode}"` });

    const unit = normalizeUnit(r.unit as string | undefined);
    if (!unit)
      return errors.push({ row, name, message: `Unknown unit "${String(r.unit)}"` });

    const gstRaw =
      typeof r.gstRate === 'number'
        ? r.gstRate
        : r.gstRate !== undefined
          ? Number(String(r.gstRate).replace('%', '').trim())
          : 0;
    if (!(GST_RATES as readonly number[]).includes(gstRaw))
      return errors.push({
        row,
        name,
        message: `GST rate ${String(r.gstRate)} is not one of ${GST_RATES.join(', ')}`,
      });

    const money = (v: string | number | undefined): number | null =>
      typeof v === 'number' ? v : parseMoney(v);
    const salePrice = money(r.salePrice);
    const purchasePrice = money(r.purchasePrice);
    const openingStock = money(r.openingStock);
    if (salePrice === null || purchasePrice === null || openingStock === null)
      return errors.push({ row, name, message: 'Price or stock is not a number' });

    valid.push({
      name,
      sku: r.sku ? String(r.sku).slice(0, 50) : undefined,
      hsnCode,
      unit,
      gstRate: gstRaw,
      salePrice: salePrice || undefined,
      purchasePrice: purchasePrice || undefined,
      openingStock: Math.abs(openingStock),
      barcode: r.barcode ? String(r.barcode).slice(0, 64) : undefined,
      description: r.description ? String(r.description).slice(0, 500) : undefined,
    });
  });

  return { valid, duplicates, errors };
}
