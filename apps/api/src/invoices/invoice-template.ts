/**
 * Editable invoice/estimate layout. Stored as JSON on Company.invoiceTemplate.
 * `resolveTemplate` is intentionally defensive — it coerces whatever is in the
 * DB (or a preview override) into a complete, safe template with sane defaults,
 * so the PDF renderer never has to null-check.
 */

/** Selectable visual designs. Each maps to a distinct layout in the renderer. */
export type TemplateId =
  | 'tally'
  | 'classic'
  | 'modern'
  | 'minimal'
  | 'professional'
  | 'elegant';

export type PaperSize = 'A4' | 'A5';

/**
 * Document format. `tax` is a full GST tax invoice (CGST/SGST/IGST shown);
 * `simple` is a plain Bill of Supply / personal invoice — no tax columns or
 * tax breakup, for unregistered sellers or non-GST bills.
 */
export type InvoiceFormat = 'tax' | 'simple';

export interface InvoiceTemplate {
  /** Which visual design to render. */
  templateId: TemplateId;
  /** Tax invoice vs simple/personal bill (Bill of Supply). */
  format: InvoiceFormat;
  /** Paper size for the generated PDF. */
  paperSize: PaperSize;
  /** Accent colour for the title, header, table head and TOTAL. */
  accentColor: string;
  /** The info QR (invoice no / GSTIN / total) in the top-right. */
  showInfoQr: boolean;
  /** Seller bank-details block. */
  showBank: boolean;
  /** UPI scan-to-pay QR. */
  showUpiQr: boolean;
  /** "For <Company> / Authorised Signatory" block. */
  showSignature: boolean;
  /** HSN/SAC column in the lines table. */
  showHsn: boolean;
  /** GST% + Tax columns (uncheck for a simpler, non-itemised-tax bill). */
  showGstColumns: boolean;
  /** "Total Qty" row under the totals. */
  showTotalQty: boolean;
  /** "Received" row under the totals (sum of payments; invoices only). */
  showReceived: boolean;
  /** "Balance" row under the totals (total − received; invoices only). */
  showBalance: boolean;
  /** The "Amount in words" line under the totals. */
  showAmountInWords: boolean;
  /** Number-to-words grouping: Indian (lakh/crore) vs International (million). */
  amountWordsFormat: 'indian' | 'international';
  /** Thermal/receipt paper width for the POS printer tab. */
  thermalWidth: '2in' | '3in' | '4in';
  /** Override for the signatory caption (else the localized default). */
  signatureLabel: string | null;
  /** Override for the document title (else the localized "TAX INVOICE"). */
  title: string | null;
  /** Terms & conditions printed under the totals. */
  terms: string | null;
  /** Override for the bottom footer line. */
  footerText: string | null;
  /** Print the company name in the header (estimate/PE header controls). */
  printName: boolean;
  /** Print the company address block. */
  printAddress: boolean;
  /** Print the company phone. */
  printPhone: boolean;
  /** Print the company email. */
  printEmail: boolean;
  /** Print the company GSTIN. */
  printGstin: boolean;
  /** Text printed in place of the company name when printName is off. */
  headerNameOverride: string | null;
}

/**
 * Structural style spec per template. The single PDF engine reads this to
 * decide how the header, lines table and totals are drawn — so adding a design
 * is a matter of describing it here rather than forking the renderer.
 */
export interface TemplateStyle {
  /** Header layout: plain (logo+text), accent band, accent sidebar, centered. */
  header: 'plain' | 'band' | 'sidebar' | 'centered';
  /** Lines table: bottom-rule rows, full grid, or zebra striping. */
  table: 'lines' | 'grid' | 'zebra';
  /** Totals block: plain right-aligned, or a tinted box with accent total. */
  totals: 'plain' | 'boxed';
  /** Draw the full-page border. */
  border: boolean;
  /** Document-title alignment. */
  titleAlign: 'left' | 'right' | 'center';
}

export const TEMPLATE_STYLES: Record<TemplateId, TemplateStyle> = {
  // Tally is drawn by a dedicated full-grid renderer; this entry only keeps the
  // registry total (header/table/totals are ignored for the tally path).
  tally: { header: 'plain', table: 'grid', totals: 'boxed', border: true, titleAlign: 'center' },
  classic: { header: 'plain', table: 'lines', totals: 'plain', border: true, titleAlign: 'left' },
  modern: { header: 'band', table: 'grid', totals: 'boxed', border: false, titleAlign: 'left' },
  minimal: { header: 'plain', table: 'lines', totals: 'plain', border: false, titleAlign: 'right' },
  professional: { header: 'sidebar', table: 'zebra', totals: 'boxed', border: true, titleAlign: 'left' },
  elegant: { header: 'centered', table: 'grid', totals: 'boxed', border: true, titleAlign: 'center' },
};

export const TEMPLATE_IDS = Object.keys(TEMPLATE_STYLES) as TemplateId[];

export const DEFAULT_TEMPLATE: InvoiceTemplate = {
  templateId: 'tally',
  format: 'tax',
  paperSize: 'A4',
  accentColor: '#673de6',
  showInfoQr: true,
  showBank: true,
  showUpiQr: true,
  showSignature: true,
  showHsn: true,
  showGstColumns: true,
  showTotalQty: true,
  showReceived: false,
  showBalance: false,
  showAmountInWords: true,
  amountWordsFormat: 'indian',
  thermalWidth: '3in',
  signatureLabel: null,
  title: null,
  terms: null,
  footerText: null,
  printName: true,
  printAddress: true,
  printPhone: true,
  printEmail: true,
  printGstin: true,
  headerNameOverride: null,
};

const HEX6 = /^#[0-9a-fA-F]{6}$/;

/** Document types that have their own customizable print layout. */
export const DOC_KINDS = [
  'invoice',
  'estimate',
  'proformaInvoice',
  'salesOrder',
  'deliveryChallan',
  'purchaseEstimate',
  'purchaseBill',
  'purchaseOrder',
  'payslip',
] as const;
export type DocKind = (typeof DOC_KINDS)[number];

/**
 * Picks the raw stored layout for a document type: the per-form entry in
 * `documentTemplates[docKind]` if present, else the shared `invoiceTemplate`.
 * The result still needs `resolveTemplate()` to fill defaults.
 */
export function pickDocTemplate(
  company: { documentTemplates?: unknown; invoiceTemplate?: unknown },
  docKind: string,
): unknown {
  const map =
    company.documentTemplates && typeof company.documentTemplates === 'object'
      ? (company.documentTemplates as Record<string, unknown>)
      : null;
  const perForm = map?.[docKind];
  if (perForm && typeof perForm === 'object') return perForm;
  return company.invoiceTemplate;
}

export function resolveTemplate(raw: unknown): InvoiceTemplate {
  const t = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const str = (v: unknown, max: number): string | null =>
    typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null;
  const bool = (v: unknown, d: boolean): boolean => (typeof v === 'boolean' ? v : d);
  return {
    templateId: TEMPLATE_IDS.includes(t.templateId as TemplateId)
      ? (t.templateId as TemplateId)
      : DEFAULT_TEMPLATE.templateId,
    format: t.format === 'simple' ? 'simple' : 'tax',
    paperSize: t.paperSize === 'A5' ? 'A5' : 'A4',
    accentColor:
      typeof t.accentColor === 'string' && HEX6.test(t.accentColor)
        ? t.accentColor
        : DEFAULT_TEMPLATE.accentColor,
    showInfoQr: bool(t.showInfoQr, true),
    showBank: bool(t.showBank, true),
    showUpiQr: bool(t.showUpiQr, true),
    showSignature: bool(t.showSignature, true),
    showHsn: bool(t.showHsn, true),
    showGstColumns: bool(t.showGstColumns, true),
    showTotalQty: bool(t.showTotalQty, true),
    showReceived: bool(t.showReceived, false),
    showBalance: bool(t.showBalance, false),
    showAmountInWords: bool(t.showAmountInWords, true),
    amountWordsFormat: t.amountWordsFormat === 'international' ? 'international' : 'indian',
    thermalWidth: t.thermalWidth === '2in' || t.thermalWidth === '4in' ? t.thermalWidth : '3in',
    signatureLabel: str(t.signatureLabel, 60),
    title: str(t.title, 40),
    terms: str(t.terms, 1000),
    footerText: str(t.footerText, 200),
    printName: bool(t.printName, true),
    printAddress: bool(t.printAddress, true),
    printPhone: bool(t.printPhone, true),
    printEmail: bool(t.printEmail, true),
    printGstin: bool(t.printGstin, true),
    headerNameOverride: str(t.headerNameOverride, 120),
  };
}
