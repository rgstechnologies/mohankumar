/**
 * Print Template Designer — the shared design document schema.
 *
 * A `PrintDesign` is a resolution-independent description of a printable
 * business document: positioned elements measured in millimetres on a chosen
 * paper, plus repeating header/footer bands, a flowing item table, watermarks
 * and visibility conditions. The web editor produces it; the API's PDFKit
 * renderer consumes it. Millimetres are the canonical unit so the same design
 * looks identical on screen (px = mm × zoom) and on paper (pt = mm × 2.8346).
 */

/** 1mm in PostScript points — the PDF unit. */
export const MM_TO_PT = 2.834645669;

export type PaperSize =
  | 'A4'
  | 'A5'
  | 'Letter'
  | 'Legal'
  | 'Thermal58'
  | 'Thermal80'
  | 'Custom';

export type Orientation = 'portrait' | 'landscape';

/** Portrait width/height in mm. Thermals are roll paper (height grows). */
export const PAPER_SIZES_MM: Record<
  Exclude<PaperSize, 'Custom'>,
  { w: number; h: number }
> = {
  A4: { w: 210, h: 297 },
  A5: { w: 148, h: 210 },
  Letter: { w: 215.9, h: 279.4 },
  Legal: { w: 215.9, h: 355.6 },
  Thermal58: { w: 58, h: 200 },
  Thermal80: { w: 80, h: 200 },
};

/** Which band an element belongs to (controls repetition across pages). */
export type Zone = 'header' | 'body' | 'footer';

export type ElementType =
  | 'text'
  | 'heading'
  | 'line'
  | 'rect'
  | 'ellipse'
  | 'image'
  | 'itemTable'
  | 'qr';

export interface ElementStyle {
  fontFamily?: string;
  fontSize?: number; // pt
  bold?: boolean;
  italic?: boolean;
  color?: string;
  align?: 'left' | 'center' | 'right';
  lineHeight?: number;
  letterSpacing?: number;
  bg?: string;
  borderColor?: string;
  borderWidth?: number; // mm
  borderRadius?: number; // mm
  opacity?: number; // 0..1
  padding?: number; // mm
}

export interface TableColumn {
  /** A line-item field key, e.g. 'srNo' | 'itemName' | 'qty' | 'amount'. */
  key: string;
  label: string;
  /** Relative weight; columns share the table width proportionally. */
  width: number;
  align?: 'left' | 'center' | 'right';
}

export interface TableSpec {
  columns: TableColumn[];
  headerBg?: string;
  headerColor?: string;
  zebra?: boolean;
  zebraColor?: string;
  borderColor?: string;
  rowHeight?: number; // mm
  fontSize?: number; // pt
}

/** A single show/hide rule evaluated against the live document context. */
export interface VisibilityRule {
  /** e.g. 'gstEnabled' | 'status' | 'customerType'. */
  field: string;
  op: 'eq' | 'ne' | 'truthy' | 'falsy';
  value?: string;
}

export interface DesignElement {
  id: string;
  type: ElementType;
  /** Position/size in millimetres, relative to the page (top-left origin). */
  x: number;
  y: number;
  w: number;
  h: number;
  rotation?: number; // degrees
  zone: Zone;
  z: number; // layer order (higher = front)
  name?: string;
  locked?: boolean;
  hidden?: boolean;
  style: ElementStyle;
  /** Static text or a template with {{field.key}} tokens (text/heading). */
  text?: string;
  /** A bound dynamic field key for single-value elements. */
  field?: string;
  /** Image source: a data: URL, or the literal 'logo' / 'signature'. */
  src?: string;
  table?: TableSpec;
  qr?: { kind: 'qr' | 'upi'; value: string };
  condition?: VisibilityRule;
}

export interface Watermark {
  enabled: boolean;
  text: string; // PAID | UNPAID | CANCELLED | DRAFT | custom
  color: string;
  opacity: number; // 0..1
  rotation: number; // degrees
  fontSize: number; // pt
  condition?: VisibilityRule;
}

export interface PrintDesign {
  version: 1;
  paper: {
    size: PaperSize;
    orientation: Orientation;
    /** Only for size === 'Custom' (millimetres). */
    width?: number;
    height?: number;
  };
  margins: { top: number; right: number; bottom: number; left: number }; // mm
  background?: string;
  /** Heights of the repeating bands, in mm. */
  bands: { headerHeight: number; footerHeight: number };
  elements: DesignElement[];
  watermark?: Watermark;
  pageNumbers?: { enabled: boolean; format: string }; // e.g. 'Page {n} of {total}'
  grid: number; // mm
  snap: boolean;
}

/** Page width/height in mm for a design's paper + orientation. */
export function paperDimsMm(paper: PrintDesign['paper']): { w: number; h: number } {
  const base =
    paper.size === 'Custom'
      ? { w: paper.width ?? 210, h: paper.height ?? 297 }
      : PAPER_SIZES_MM[paper.size];
  return paper.orientation === 'landscape' ? { w: base.h, h: base.w } : base;
}

// ---------------------------------------------------------------------------
// Dynamic field catalogue — the searchable field picker in the editor. The
// labels live here (shared); the API resolves each key to a value at render.
// ---------------------------------------------------------------------------

export interface FieldDef {
  key: string;
  label: string;
}
export interface FieldGroup {
  group: string;
  fields: FieldDef[];
}

const COMPANY_GROUP: FieldGroup = {
  group: 'Company',
  fields: [
    { key: 'company.name', label: 'Company Name' },
    { key: 'company.address', label: 'Address' },
    { key: 'company.gstin', label: 'GSTIN' },
    { key: 'company.phone', label: 'Phone' },
    { key: 'company.email', label: 'Email' },
    { key: 'company.stateName', label: 'State' },
  ],
};

const TOTALS_GROUP: FieldGroup = {
  group: 'Totals',
  fields: [
    { key: 'totals.subtotal', label: 'Subtotal' },
    { key: 'totals.discount', label: 'Discount Total' },
    { key: 'totals.taxable', label: 'Taxable Amount' },
    { key: 'totals.cgst', label: 'CGST' },
    { key: 'totals.sgst', label: 'SGST' },
    { key: 'totals.igst', label: 'IGST' },
    { key: 'totals.tax', label: 'Tax Total' },
    { key: 'totals.roundOff', label: 'Round Off' },
    { key: 'totals.grandTotal', label: 'Grand Total' },
    { key: 'totals.amountInWords', label: 'Amount in Words' },
  ],
};

/** Display name + the header-field labels that vary per document kind. */
const DOC_FIELD_META: Record<
  string,
  { label: string; vendor: boolean; numberLabel: string; dueLabel: string }
> = {
  invoice: { label: 'Invoice', vendor: false, numberLabel: 'Invoice Number', dueLabel: 'Due Date' },
  estimate: { label: 'Estimate', vendor: false, numberLabel: 'Estimate Number', dueLabel: 'Valid Until' },
  proformaInvoice: { label: 'Proforma', vendor: false, numberLabel: 'Proforma Number', dueLabel: 'Valid Until' },
  salesOrder: { label: 'Sales Order', vendor: false, numberLabel: 'Order Number', dueLabel: 'Expected Delivery' },
  deliveryChallan: { label: 'Delivery Challan', vendor: false, numberLabel: 'Challan Number', dueLabel: 'Date' },
  purchaseBill: { label: 'Purchase Bill', vendor: true, numberLabel: 'Bill Number', dueLabel: 'Due Date' },
  purchaseEstimate: { label: 'Purchase Estimate', vendor: true, numberLabel: 'Estimate Number', dueLabel: 'Valid Until' },
  purchaseOrder: { label: 'Purchase Order', vendor: true, numberLabel: 'Order Number', dueLabel: 'Expected Delivery' },
};

/**
 * The searchable field catalogue for a given document kind. Header fields use
 * the generic `doc.*` keys (resolved for every doc type by the renderer), while
 * the group label + the party group adapt to the document (customer vs vendor).
 */
export function printFieldGroups(docKind = 'invoice'): FieldGroup[] {
  const meta = DOC_FIELD_META[docKind] ?? DOC_FIELD_META.invoice;
  return [
    COMPANY_GROUP,
    {
      group: meta.vendor ? 'Vendor' : 'Customer',
      fields: [
        { key: 'party.name', label: meta.vendor ? 'Vendor Name' : 'Customer Name' },
        { key: 'party.billingAddress', label: 'Billing Address' },
        { key: 'party.gstin', label: 'GST Number' },
        { key: 'party.phone', label: 'Phone / Mobile' },
      ],
    },
    {
      group: meta.label,
      fields: [
        { key: 'doc.number', label: meta.numberLabel },
        { key: 'doc.date', label: 'Date' },
        { key: 'doc.dueDate', label: meta.dueLabel },
        { key: 'doc.placeOfSupply', label: 'Place of Supply' },
      ],
    },
    TOTALS_GROUP,
  ];
}

/** Default (invoice) field catalogue — kept for backward compatibility. */
export const PRINT_FIELD_GROUPS: FieldGroup[] = printFieldGroups('invoice');

/** Item-table column choices (line-item fields). */
export const ITEM_TABLE_FIELDS: FieldDef[] = [
  { key: 'srNo', label: '#' },
  { key: 'itemName', label: 'Item' },
  { key: 'description', label: 'Description' },
  { key: 'hsn', label: 'HSN/SAC' },
  { key: 'qty', label: 'Qty' },
  { key: 'unit', label: 'Unit' },
  { key: 'rate', label: 'Rate' },
  { key: 'discount', label: 'Discount' },
  { key: 'taxable', label: 'Taxable' },
  { key: 'gstRate', label: 'GST%' },
  { key: 'tax', label: 'Tax' },
  { key: 'amount', label: 'Amount' },
];

/** Condition fields available in the visibility-rule builder. */
export const CONDITION_FIELDS: FieldDef[] = [
  { key: 'gstEnabled', label: 'GST Enabled' },
  { key: 'status', label: 'Invoice Status' },
  { key: 'customerType', label: 'Customer Type' },
  { key: 'isInterState', label: 'Inter-state Supply' },
];

// ---------------------------------------------------------------------------
// Starter designs — ready-made layouts so the editor never opens to a blank
// page. Each is a complete PrintDesign the user can load and then tweak.
// ---------------------------------------------------------------------------

export interface StarterDesign {
  key: string;
  name: string;
  description: string;
  design: PrintDesign;
}

/** Element factory with sensible defaults for starter authoring. */
function se(e: Partial<DesignElement> & { id: string; type: ElementType }): DesignElement {
  return { x: 10, y: 10, w: 50, h: 8, zone: 'body', z: 0, style: {}, ...e };
}

const NAVY = '#1a2a5e';
const ITEM_COLS_FULL: TableColumn[] = [
  { key: 'srNo', label: '#', width: 1, align: 'center' },
  { key: 'itemName', label: 'Item', width: 6, align: 'left' },
  { key: 'hsn', label: 'HSN', width: 2, align: 'center' },
  { key: 'qty', label: 'Qty', width: 2, align: 'right' },
  { key: 'rate', label: 'Rate', width: 3, align: 'right' },
  { key: 'gstRate', label: 'GST%', width: 2, align: 'right' },
  { key: 'amount', label: 'Amount', width: 3, align: 'right' },
];

export const STARTER_DESIGNS: StarterDesign[] = [
  {
    key: 'standard',
    name: 'Standard Invoice',
    description: 'Branded header band, GST item table and totals.',
    design: {
      ...blankDesign(),
      bands: { headerHeight: 42, footerHeight: 20 },
      elements: [
        se({ id: 'bar', type: 'rect', x: 0, y: 0, w: 210, h: 30, zone: 'header', z: 0, style: { bg: NAVY } }),
        se({ id: 'title', type: 'heading', x: 12, y: 8, w: 120, h: 14, zone: 'header', z: 2, style: { fontSize: 20, bold: true, color: '#ffffff' }, text: 'TAX INVOICE' }),
        se({ id: 'cnum', type: 'text', x: 118, y: 11, w: 80, h: 6, zone: 'header', z: 2, style: { fontSize: 9, align: 'right', color: '#e0e7ff' }, text: '{{invoice.number}}' }),
        se({ id: 'cname', type: 'text', x: 12, y: 33, w: 120, h: 6, zone: 'header', z: 2, style: { fontSize: 12, bold: true, color: '#0f172a' }, field: 'company.name' }),
        se({ id: 'caddr', type: 'text', x: 12, y: 39, w: 130, h: 5, zone: 'header', z: 2, style: { fontSize: 8, color: '#475569' }, field: 'company.address' }),
        se({ id: 'billlabel', type: 'text', x: 12, y: 50, w: 90, h: 4, zone: 'body', z: 1, style: { fontSize: 7.5, bold: true, color: NAVY, letterSpacing: 0.4 }, text: 'BILL TO' }),
        se({ id: 'pname', type: 'text', x: 12, y: 54, w: 95, h: 6, zone: 'body', z: 1, style: { fontSize: 11, bold: true, color: '#0f172a' }, field: 'party.name' }),
        se({ id: 'paddr', type: 'text', x: 12, y: 61, w: 95, h: 5, zone: 'body', z: 1, style: { fontSize: 8, color: '#475569' }, field: 'party.billingAddress' }),
        se({ id: 'pgst', type: 'text', x: 12, y: 66, w: 95, h: 5, zone: 'body', z: 1, style: { fontSize: 8, color: '#475569' }, text: 'GSTIN: {{party.gstin}}' }),
        se({ id: 'idate', type: 'text', x: 138, y: 51, w: 60, h: 5, zone: 'body', z: 1, style: { fontSize: 8, align: 'right', color: '#475569' }, text: 'Date: {{invoice.date}}' }),
        se({ id: 'idue', type: 'text', x: 138, y: 56, w: 60, h: 5, zone: 'body', z: 1, style: { fontSize: 8, align: 'right', color: '#475569' }, text: 'Due: {{invoice.dueDate}}' }),
        se({ id: 'tbl', type: 'itemTable', x: 12, y: 75, w: 186, h: 48, zone: 'body', z: 1, style: {}, table: { columns: ITEM_COLS_FULL, zebra: true, headerBg: NAVY, headerColor: '#ffffff', zebraColor: '#f1f5f9', borderColor: '#cbd5e1', rowHeight: 7, fontSize: 8 } }),
        se({ id: 'words', type: 'text', x: 12, y: 128, w: 100, h: 10, zone: 'body', z: 1, style: { fontSize: 8, italic: true, color: '#64748b' }, field: 'totals.amountInWords' }),
        se({ id: 'taxable', type: 'text', x: 118, y: 127, w: 80, h: 5, zone: 'body', z: 2, style: { fontSize: 9, align: 'right', color: '#475569' }, text: 'Taxable: {{totals.taxable}}' }),
        se({ id: 'tax', type: 'text', x: 118, y: 133, w: 80, h: 5, zone: 'body', z: 2, style: { fontSize: 9, align: 'right', color: '#475569' }, text: 'Tax: {{totals.tax}}' }),
        se({ id: 'gt', type: 'text', x: 108, y: 140, w: 90, h: 9, zone: 'body', z: 2, style: { fontSize: 13, bold: true, align: 'right', color: NAVY }, text: 'Total: Rs {{totals.grandTotal}}' }),
        se({ id: 'ftr', type: 'text', x: 10, y: 284, w: 190, h: 5, zone: 'footer', z: 1, style: { fontSize: 8, align: 'center', color: '#94a3b8' }, text: 'Thank you for your business' }),
      ],
    },
  },
  {
    key: 'minimal',
    name: 'Minimal Invoice',
    description: 'Clean, no colour band — name, rule, table, total.',
    design: {
      ...blankDesign(),
      bands: { headerHeight: 36, footerHeight: 18 },
      elements: [
        se({ id: 'cname', type: 'heading', x: 12, y: 10, w: 120, h: 12, zone: 'header', z: 2, style: { fontSize: 18, bold: true, color: '#0f172a' }, field: 'company.name' }),
        se({ id: 'caddr', type: 'text', x: 12, y: 23, w: 130, h: 5, zone: 'header', z: 2, style: { fontSize: 8, color: '#64748b' }, field: 'company.address' }),
        se({ id: 'title', type: 'text', x: 120, y: 12, w: 78, h: 8, zone: 'header', z: 2, style: { fontSize: 14, bold: true, align: 'right', color: '#0f172a' }, text: 'INVOICE' }),
        se({ id: 'cnum', type: 'text', x: 120, y: 21, w: 78, h: 5, zone: 'header', z: 2, style: { fontSize: 8, align: 'right', color: '#64748b' }, text: '{{invoice.number}}' }),
        se({ id: 'rule', type: 'line', x: 12, y: 33, w: 186, h: 0.5, zone: 'header', z: 1, style: { borderColor: '#0f172a', borderWidth: 0.5 } }),
        se({ id: 'pname', type: 'text', x: 12, y: 44, w: 120, h: 6, zone: 'body', z: 1, style: { fontSize: 10, bold: true, color: '#0f172a' }, text: 'Bill to: {{party.name}}' }),
        se({ id: 'tbl', type: 'itemTable', x: 12, y: 56, w: 186, h: 48, zone: 'body', z: 1, style: {}, table: { columns: [{ key: 'itemName', label: 'Item', width: 6, align: 'left' }, { key: 'qty', label: 'Qty', width: 2, align: 'right' }, { key: 'rate', label: 'Rate', width: 3, align: 'right' }, { key: 'amount', label: 'Amount', width: 3, align: 'right' }], zebra: false, headerBg: '#f1f5f9', headerColor: '#0f172a', borderColor: '#e2e8f0', rowHeight: 7, fontSize: 9 } }),
        se({ id: 'gt', type: 'text', x: 108, y: 110, w: 90, h: 9, zone: 'body', z: 2, style: { fontSize: 12, bold: true, align: 'right', color: '#0f172a' }, text: 'Total: Rs {{totals.grandTotal}}' }),
        se({ id: 'ftr', type: 'text', x: 10, y: 286, w: 190, h: 5, zone: 'footer', z: 1, style: { fontSize: 8, align: 'center', color: '#94a3b8' }, text: '{{company.name}} · {{company.phone}}' }),
      ],
    },
  },
];

/** A blank A4 design with sensible default bands and grid. */
export function blankDesign(): PrintDesign {
  return {
    version: 1,
    paper: { size: 'A4', orientation: 'portrait' },
    margins: { top: 10, right: 10, bottom: 10, left: 10 },
    background: '#ffffff',
    bands: { headerHeight: 45, footerHeight: 25 },
    elements: [],
    watermark: {
      enabled: false,
      text: 'PAID',
      color: '#16a34a',
      opacity: 0.12,
      rotation: -30,
      fontSize: 120,
    },
    pageNumbers: { enabled: false, format: 'Page {n} of {total}' },
    grid: 5,
    snap: true,
  };
}
