/**
 * Tally Masters XML parser (TallyPrime / Tally.ERP 9 "Export Masters").
 * The XML is machine-generated and regular, so a tolerant tag extractor is
 * enough — no XML dependency. Pure functions, unit tested.
 *
 * Tally sign convention: amounts are CREDIT-positive — a debit opening
 * balance (receivables, assets) is exported as a NEGATIVE number.
 */

export interface TallyBillAllocation {
  refNo: string;
  /** Rupees; positive number, side in type (Tally credit-positive). */
  amount: number;
  type: 'DEBIT' | 'CREDIT';
  /** ISO date when the export carries one (vouchers do, masters often don't). */
  date?: string;
}

export interface TallyLedger {
  name: string;
  /** Immediate parent group name as exported. */
  parent: string;
  /** Rupees; positive number, side in openingType. */
  openingBalance: number;
  openingType: 'DEBIT' | 'CREDIT';
  gstin?: string;
  email?: string;
  phone?: string;
  address?: string;
  /** Bill-wise breakup of the opening balance, when maintained. */
  bills: TallyBillAllocation[];
}

export interface TallyStockItem {
  name: string;
  unit?: string;
  hsnCode?: string;
  gstRate?: number;
  openingQty: number;
  openingRate?: number;
}

export interface TallyMasters {
  ledgers: TallyLedger[];
  items: TallyStockItem[];
  /** Custom group → parent group, for resolving non-standard parents. */
  groupParents: Record<string, string>;
}

const decode = (s: string) =>
  s
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .trim();

/** All <TAG NAME="...">block</TAG> occurrences (Tally puts NAME in the attribute). */
function blocks(
  xml: string,
  tag: string,
): { name: string; body: string; reserved: boolean }[] {
  const re = new RegExp(
    `<${tag}\\b([^>]*)>([\\s\\S]*?)</${tag}>`,
    'gi',
  );
  const out: { name: string; body: string; reserved: boolean }[] = [];
  for (const m of xml.matchAll(re)) {
    const attrs = m[1];
    const nameAttr = /NAME="([^"]*)"/i.exec(attrs);
    const reserved = /RESERVEDNAME="[^"]+"/i.test(attrs);
    const body = m[2];
    const name = nameAttr
      ? decode(nameAttr[1])
      : decode(tagValue(body, 'NAME') ?? '');
    if (name) out.push({ name, body, reserved });
  }
  return out;
}

function tagValue(body: string, tag: string): string | null {
  const m = new RegExp(`<${tag}\\b[^>]*>([^<]*)</${tag}>`, 'i').exec(body);
  return m ? decode(m[1]) : null;
}

function parseTallyAmount(raw: string | null): number {
  if (!raw) return 0;
  const n = Number(raw.replace(/[,\s]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

/** "910.000 Mtr" or "910" → 910 */
function parseQty(raw: string | null): number {
  if (!raw) return 0;
  const m = /-?[\d,]+(?:\.\d+)?/.exec(raw);
  if (!m) return 0;
  const n = Number(m[0].replace(/,/g, ''));
  return Number.isFinite(n) ? Math.abs(n) : 0;
}

/** "20260401", "1-Apr-2026" or ISO → ISO date, else undefined. */
function parseTallyDate(raw: string | null): string | undefined {
  if (!raw) return undefined;
  const s = raw.trim();
  let m = /^(\d{4})(\d{2})(\d{2})$/.exec(s);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (m) return s;
  m = /^(\d{1,2})-([A-Za-z]{3})[a-z]*-(\d{4})$/.exec(s);
  if (m) {
    const months: Record<string, string> = {
      jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
      jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
    };
    const month = months[m[2].toLowerCase()];
    if (month) return `${m[3]}-${month}-${m[1].padStart(2, '0')}`;
  }
  return undefined;
}

/** Bill-wise opening allocations inside a LEDGER block. */
function parseBillAllocations(body: string): TallyBillAllocation[] {
  const bills: TallyBillAllocation[] = [];
  const re = /<BILLALLOCATIONS\.LIST\b[^>]*>([\s\S]*?)<\/BILLALLOCATIONS\.LIST>/gi;
  for (const m of body.matchAll(re)) {
    const block = m[1];
    const refNo = tagValue(block, 'NAME');
    const amount = parseTallyAmount(tagValue(block, 'OPENINGBALANCE'));
    if (!refNo || amount === 0) continue;
    bills.push({
      refNo,
      amount: Math.abs(amount),
      type: amount < 0 ? 'DEBIT' : 'CREDIT',
      date: parseTallyDate(tagValue(block, 'BILLDATE')),
    });
  }
  return bills;
}

export function looksLikeTallyXml(content: string): boolean {
  const head = content.slice(0, 2000);
  return /<ENVELOPE>|<TALLYMESSAGE/i.test(head) || /<TALLYMESSAGE/i.test(content);
}

export function parseTallyMasters(xml: string): TallyMasters {
  const ledgers: TallyLedger[] = [];
  for (const block of blocks(xml, 'LEDGER')) {
    if (block.reserved) continue; // Profit & Loss A/c and friends
    const parent = tagValue(block.body, 'PARENT') ?? '';
    const opening = parseTallyAmount(tagValue(block.body, 'OPENINGBALANCE'));
    const gstin =
      tagValue(block.body, 'PARTYGSTIN') ?? tagValue(block.body, 'GSTIN');
    const address = tagValue(block.body, 'ADDRESS');
    ledgers.push({
      name: block.name,
      parent,
      openingBalance: Math.abs(opening),
      // Tally: negative = debit.
      openingType: opening < 0 ? 'DEBIT' : 'CREDIT',
      gstin: gstin?.toUpperCase() || undefined,
      email: tagValue(block.body, 'EMAIL') || undefined,
      phone:
        tagValue(block.body, 'LEDGERPHONE') ??
        tagValue(block.body, 'LEDGERMOBILE') ??
        undefined,
      address: address || undefined,
      bills: parseBillAllocations(block.body),
    });
  }

  const items: TallyStockItem[] = [];
  for (const block of blocks(xml, 'STOCKITEM')) {
    if (block.reserved) continue;
    const gstRateRaw = tagValue(block.body, 'GSTRATE');
    const gstRate = gstRateRaw !== null ? Number(gstRateRaw) : undefined;
    const rateRaw = tagValue(block.body, 'OPENINGRATE'); // "120.00/Mtr"
    items.push({
      name: block.name,
      unit: tagValue(block.body, 'BASEUNITS') ?? undefined,
      hsnCode:
        tagValue(block.body, 'HSNCODE') ??
        tagValue(block.body, 'HSN') ??
        undefined,
      gstRate: Number.isFinite(gstRate) ? gstRate : undefined,
      openingQty: parseQty(tagValue(block.body, 'OPENINGBALANCE')),
      openingRate: rateRaw ? parseQty(rateRaw) : undefined,
    });
  }

  const groupParents: Record<string, string> = {};
  for (const block of blocks(xml, 'GROUP')) {
    const parent = tagValue(block.body, 'PARENT');
    if (parent) groupParents[block.name.toLowerCase()] = parent;
  }

  return { ledgers, items, groupParents };
}
