import { Injectable } from '@nestjs/common';
import type { Company, Invoice, InvoiceLine, Party, Prisma } from '@prisma/client';
import PDFDocument from 'pdfkit';
import * as QRCode from 'qrcode';
import {
  pdfLang,
  registerPdfFonts,
  type PdfLang,
} from '../common/pdf-locale';
import { pickDocTemplate, resolveTemplate, TEMPLATE_STYLES } from './invoice-template';

/** Printed labels per language. Values stay numeric/Latin everywhere. */
const LABELS: Record<PdfLang, Record<string, string>> = {
  en: {
    taxInvoice: 'TAX INVOICE',
    cancelled: 'TAX INVOICE (CANCELLED)',
    billOfSupply: 'BILL OF SUPPLY',
    billOfSupplyCancelled: 'BILL OF SUPPLY (CANCELLED)',
    estimate: 'ESTIMATE',
    estCancelled: 'ESTIMATE (CANCELLED)',
    estimateNo: 'Estimate No',
    proformaInvoice: 'PROFORMA INVOICE',
    proformaCancelled: 'PROFORMA INVOICE (CANCELLED)',
    proformaNo: 'Proforma No',
    footerProforma: 'This is a computer-generated proforma invoice. Not a tax invoice.',
    purchaseEstimate: 'PURCHASE ESTIMATE',
    purchaseEstCancelled: 'PURCHASE ESTIMATE (CANCELLED)',
    purchaseEstNo: 'Estimate No',
    deliveryChallan: 'DELIVERY CHALLAN',
    dcCancelled: 'DELIVERY CHALLAN (CANCELLED)',
    deliveryChallanNo: 'Challan No',
    footerChallan: 'This is a computer-generated delivery challan. Not a tax invoice.',
    salesOrder: 'SALES ORDER',
    soCancelled: 'SALES ORDER (CANCELLED)',
    salesOrderNo: 'Order No',
    expectedDelivery: 'Expected delivery',
    footerOrder: 'This is a computer-generated sales order. Not a tax invoice.',
    purchaseBill: 'PURCHASE BILL',
    purchaseBillCancelled: 'PURCHASE BILL (CANCELLED)',
    purchaseBillNo: 'Bill No',
    purchaseOrder: 'PURCHASE ORDER',
    poCancelled: 'PURCHASE ORDER (CANCELLED)',
    poNo: 'Order No',
    footerPurchaseOrder: 'This is a computer-generated purchase order.',
    vendor: 'Vendor:',
    validUntil: 'Valid until',
    invoiceNo: 'Invoice No',
    date: 'Date',
    due: 'Due',
    placeOfSupply: 'Place of supply',
    inter: '(Inter-state)',
    intra: '(Intra-state)',
    billTo: 'Bill To:',
    colNo: '#', colDesc: 'Description', colHsn: 'HSN', colQty: 'Qty',
    colRate: 'Rate', colTaxable: 'Taxable', colGst: 'GST%', colTax: 'Tax', colTotal: 'Total',
    subtotal: 'Subtotal',
    discount: 'Discount',
    taxableAmount: 'Taxable amount',
    totalQty: 'Total Qty',
    received: 'Received',
    balance: 'Balance',
    loyaltyDiscount: 'Loyalty discount',
    netPayable: 'Net payable',
    roundOff: 'Round off',
    total: 'TOTAL',
    amountWords: 'Amount in words',
    notes: 'Notes',
    terms: 'Terms & Conditions',
    footer: 'This is a computer-generated invoice.',
    footerEstimate: 'This is a computer-generated estimate.',
    scanToPay: 'Scan to pay with any UPI app',
    bankDetails: 'Bank Details',
    bankNameL: 'Bank',
    acName: 'A/c Name',
    acNo: 'A/c No',
    ifsc: 'IFSC',
    branch: 'Branch',
    phoneL: 'Phone',
    emailL: 'Email',
    forLabel: 'For',
    authSign: 'Authorised Signatory',
  },
  ta: {
    taxInvoice: 'வரி விலைப்பட்டியல்',
    cancelled: 'வரி விலைப்பட்டியல் (ரத்து செய்யப்பட்டது)',
    billOfSupply: 'பில் ஆஃப் சப்ளை',
    billOfSupplyCancelled: 'பில் ஆஃப் சப்ளை (ரத்து செய்யப்பட்டது)',
    estimate: 'மதிப்பீடு',
    estCancelled: 'மதிப்பீடு (ரத்து செய்யப்பட்டது)',
    estimateNo: 'மதிப்பீட்டு எண்',
    proformaInvoice: 'புரோஃபார்மா விலைப்பட்டியல்',
    proformaCancelled: 'புரோஃபார்மா விலைப்பட்டியல் (ரத்து செய்யப்பட்டது)',
    proformaNo: 'புரோஃபார்மா எண்',
    footerProforma: 'இது கணினியில் உருவாக்கப்பட்ட புரோஃபார்மா விலைப்பட்டியல். வரி விலைப்பட்டியல் அல்ல.',
    purchaseEstimate: 'கொள்முதல் மதிப்பீடு',
    purchaseEstCancelled: 'கொள்முதல் மதிப்பீடு (ரத்து செய்யப்பட்டது)',
    purchaseEstNo: 'மதிப்பீட்டு எண்',
    deliveryChallan: 'டெலிவரி சலான்',
    dcCancelled: 'டெலிவரி சலான் (ரத்து செய்யப்பட்டது)',
    deliveryChallanNo: 'சலான் எண்',
    footerChallan: 'இது கணினியில் உருவாக்கப்பட்ட டெலிவரி சலான். வரி விலைப்பட்டியல் அல்ல.',
    salesOrder: 'விற்பனை ஆர்டர்',
    soCancelled: 'விற்பனை ஆர்டர் (ரத்து செய்யப்பட்டது)',
    salesOrderNo: 'ஆர்டர் எண்',
    expectedDelivery: 'எதிர்பார்க்கப்படும் டெலிவரி',
    footerOrder: 'இது கணினியில் உருவாக்கப்பட்ட விற்பனை ஆர்டர். வரி விலைப்பட்டியல் அல்ல.',
    purchaseBill: 'கொள்முதல் பில்',
    purchaseBillCancelled: 'கொள்முதல் பில் (ரத்து)',
    purchaseBillNo: 'பில் எண்',
    purchaseOrder: 'கொள்முதல் ஆர்டர்',
    poCancelled: 'கொள்முதல் ஆர்டர் (ரத்து)',
    poNo: 'ஆர்டர் எண்',
    footerPurchaseOrder: 'இது கணினியில் உருவாக்கப்பட்ட கொள்முதல் ஆர்டர்.',
    vendor: 'விற்பனையாளர்:',
    validUntil: 'செல்லுபடியாகும் தேதி',
    invoiceNo: 'விலைப்பட்டியல் எண்',
    date: 'தேதி',
    due: 'கடைசி நாள்',
    placeOfSupply: 'வழங்கும் இடம்',
    inter: '(மாநிலம் கடந்தது)',
    intra: '(மாநிலத்திற்குள்)',
    billTo: 'பெறுநர்:',
    colNo: '#', colDesc: 'விவரம்', colHsn: 'HSN', colQty: 'அளவு',
    colRate: 'விலை', colTaxable: 'மதிப்பு', colGst: 'GST%', colTax: 'வரி', colTotal: 'மொத்தம்',
    subtotal: 'கூட்டுத்தொகை',
    discount: 'தள்ளுபடி',
    taxableAmount: 'வரிக்குட்பட்ட தொகை',
    totalQty: 'மொத்த அளவு',
    received: 'பெறப்பட்டது',
    balance: 'மீதம்',
    loyaltyDiscount: 'லாயல்டி தள்ளுபடி',
    netPayable: 'நிகரத் தொகை',
    roundOff: 'முழுமையாக்கல்',
    total: 'மொத்தம்',
    amountWords: 'தொகை எழுத்தில்',
    notes: 'குறிப்புகள்',
    terms: 'விதிமுறைகள்',
    footer: 'இது கணினியில் உருவாக்கப்பட்ட விலைப்பட்டியல்.',
    footerEstimate: 'இது கணினியில் உருவாக்கப்பட்ட மதிப்பீடு.',
    scanToPay: 'எந்த UPI செயலியிலும் ஸ்கேன் செய்து செலுத்துங்கள்',
    bankDetails: 'வங்கி விவரங்கள்',
    bankNameL: 'வங்கி',
    acName: 'கணக்கு பெயர்',
    acNo: 'கணக்கு எண்',
    ifsc: 'IFSC',
    branch: 'கிளை',
    phoneL: 'தொலைபேசி',
    emailL: 'மின்னஞ்சல்',
    forLabel: 'சார்பாக',
    authSign: 'அங்கீகரிக்கப்பட்ட கையொப்பம்',
  },
  hi: {
    taxInvoice: 'टैक्स इनवॉइस',
    cancelled: 'टैक्स इनवॉइस (रद्द)',
    billOfSupply: 'बिल ऑफ सप्लाई',
    billOfSupplyCancelled: 'बिल ऑफ सप्लाई (रद्द)',
    estimate: 'एस्टीमेट',
    estCancelled: 'एस्टीमेट (रद्द)',
    estimateNo: 'एस्टीमेट नं',
    proformaInvoice: 'प्रोफ़ॉर्मा इनवॉइस',
    proformaCancelled: 'प्रोफ़ॉर्मा इनवॉइस (रद्द)',
    proformaNo: 'प्रोफ़ॉर्मा नं',
    footerProforma: 'यह कंप्यूटर से तैयार प्रोफ़ॉर्मा इनवॉइस है। यह टैक्स इनवॉइस नहीं है।',
    purchaseEstimate: 'खरीद एस्टीमेट',
    purchaseEstCancelled: 'खरीद एस्टीमेट (रद्द)',
    purchaseEstNo: 'एस्टीमेट नं',
    deliveryChallan: 'डिलीवरी चालान',
    dcCancelled: 'डिलीवरी चालान (रद्द)',
    deliveryChallanNo: 'चालान नं',
    footerChallan: 'यह कंप्यूटर से तैयार डिलीवरी चालान है। यह टैक्स इनवॉइस नहीं है।',
    salesOrder: 'सेल्स ऑर्डर',
    soCancelled: 'सेल्स ऑर्डर (रद्द)',
    salesOrderNo: 'ऑर्डर नं',
    expectedDelivery: 'अपेक्षित डिलीवरी',
    footerOrder: 'यह कंप्यूटर से तैयार सेल्स ऑर्डर है। यह टैक्स इनवॉइस नहीं है।',
    purchaseBill: 'खरीद बिल',
    purchaseBillCancelled: 'खरीद बिल (रद्द)',
    purchaseBillNo: 'बिल सं',
    purchaseOrder: 'खरीद ऑर्डर',
    poCancelled: 'खरीद ऑर्डर (रद्द)',
    poNo: 'ऑर्डर सं',
    footerPurchaseOrder: 'यह कंप्यूटर से तैयार खरीद ऑर्डर है।',
    vendor: 'विक्रेता:',
    validUntil: 'मान्य तिथि तक',
    invoiceNo: 'इनवॉइस नं',
    date: 'तिथि',
    due: 'देय',
    placeOfSupply: 'आपूर्ति का स्थान',
    inter: '(अंतर-राज्यीय)',
    intra: '(राज्य के भीतर)',
    billTo: 'बिल प्राप्तकर्ता:',
    colNo: '#', colDesc: 'विवरण', colHsn: 'HSN', colQty: 'मात्रा',
    colRate: 'दर', colTaxable: 'मूल्य', colGst: 'GST%', colTax: 'कर', colTotal: 'कुल',
    subtotal: 'उप-योग',
    discount: 'छूट',
    taxableAmount: 'कर-योग्य राशि',
    totalQty: 'कुल मात्रा',
    received: 'प्राप्त',
    balance: 'शेष',
    loyaltyDiscount: 'लॉयल्टी छूट',
    netPayable: 'देय राशि',
    roundOff: 'राउंड ऑफ',
    total: 'कुल',
    amountWords: 'राशि शब्दों में',
    notes: 'टिप्पणियाँ',
    terms: 'नियम और शर्तें',
    footer: 'यह कंप्यूटर से तैयार इनवॉइस है।',
    footerEstimate: 'यह कंप्यूटर से तैयार एस्टीमेट है।',
    scanToPay: 'किसी भी UPI ऐप से स्कैन करके भुगतान करें',
    bankDetails: 'बैंक विवरण',
    bankNameL: 'बैंक',
    acName: 'खाता नाम',
    acNo: 'खाता नं',
    ifsc: 'IFSC',
    branch: 'शाखा',
    phoneL: 'फ़ोन',
    emailL: 'ईमेल',
    forLabel: 'के लिए',
    authSign: 'अधिकृत हस्ताक्षरकर्ता',
  },
};

export type FullInvoice = Invoice & {
  company: Company;
  party: Party;
  lines: InvoiceLine[];
  /** Quotes/estimates may suppress the company name in the header. */
  showCompanyName?: boolean;
  /** Optional ship-to / dispatch metadata (Tally layout). */
  shipTo?: { name: string; address?: string | null; gstin?: string | null } | null;
  /** Recorded payments — used for the optional Received/Balance totals rows. */
  payments?: { amount: Prisma.Decimal | number | string }[];
  eInvoice?: {
    status: string;
    irn: string;
    ackNo: string;
    ackDate: Date;
    signedQrCode: string;
  } | null;
  eWayBill?: {
    status: string;
    ewbNo: string;
    validUpto: Date;
  } | null;
};

const inr = (n: number | string) =>
  Number(n).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

/** Indian-system amount in words (crore/lakh), for the invoice footer. */
export function amountInWords(amount: number): string {
  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

  const two = (n: number): string =>
    n < 20 ? ones[n] : `${tens[Math.floor(n / 10)]}${n % 10 ? ' ' + ones[n % 10] : ''}`;
  const three = (n: number): string => {
    const h = Math.floor(n / 100);
    const rest = n % 100;
    return `${h ? ones[h] + ' Hundred' : ''}${h && rest ? ' ' : ''}${rest ? two(rest) : ''}`;
  };

  const rupees = Math.floor(amount);
  const paise = Math.round((amount - rupees) * 100);
  if (rupees === 0 && paise === 0) return 'Zero Rupees Only';

  let n = rupees;
  const crore = Math.floor(n / 10000000); n %= 10000000;
  const lakh = Math.floor(n / 100000); n %= 100000;
  const thousand = Math.floor(n / 1000); n %= 1000;

  const parts: string[] = [];
  if (crore) parts.push(`${two(crore)} Crore`);
  if (lakh) parts.push(`${two(lakh)} Lakh`);
  if (thousand) parts.push(`${two(thousand)} Thousand`);
  if (n) parts.push(three(n));

  let words = parts.length ? `${parts.join(' ')} Rupees` : '';
  if (paise) words += `${words ? ' and ' : ''}${two(paise)} Paise`;
  return `${words} Only`;
}

/** International-system amount in words (thousand/million/billion). */
export function amountInWordsIntl(amount: number): string {
  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  const two = (n: number): string =>
    n < 20 ? ones[n] : `${tens[Math.floor(n / 10)]}${n % 10 ? ' ' + ones[n % 10] : ''}`;
  const three = (n: number): string => {
    const h = Math.floor(n / 100);
    const rest = n % 100;
    return `${h ? ones[h] + ' Hundred' : ''}${h && rest ? ' ' : ''}${rest ? two(rest) : ''}`;
  };
  const rupees = Math.floor(amount);
  const paise = Math.round((amount - rupees) * 100);
  if (rupees === 0 && paise === 0) return 'Zero Rupees Only';

  const scales = ['', ' Thousand', ' Million', ' Billion', ' Trillion'];
  const groups: number[] = [];
  let n = rupees;
  while (n > 0) { groups.push(n % 1000); n = Math.floor(n / 1000); }
  const parts: string[] = [];
  for (let i = groups.length - 1; i >= 0; i--) {
    if (groups[i]) parts.push(`${three(groups[i])}${scales[i]}`);
  }
  let words = parts.length ? `${parts.join(' ')} Rupees` : '';
  if (paise) words += `${words ? ' and ' : ''}${two(paise)} Paise`;
  return `${words} Only`;
}

@Injectable()
export class InvoicePdfService {
  async render(
    invoice: FullInvoice,
    lang?: string,
    opts?: {
      docKind?:
        | 'invoice'
        | 'estimate'
        | 'proformaInvoice'
        | 'purchaseEstimate'
        | 'deliveryChallan'
        | 'salesOrder'
        | 'purchaseBill'
        | 'purchaseOrder';
    },
  ): Promise<Buffer> {
    const L = LABELS[pdfLang(lang)];
    const docKind = opts?.docKind ?? 'invoice';
    const isInvoice = docKind === 'invoice';
    const isPurchaseBill = docKind === 'purchaseBill';
    const isPurchaseOrder = docKind === 'purchaseOrder';
    const isPurchaseEst = docKind === 'purchaseEstimate';
    const isChallan = docKind === 'deliveryChallan';
    const isOrder = docKind === 'salesOrder';
    const isProforma = docKind === 'proformaInvoice';
    // A document that buys (lists a vendor) rather than sells.
    const isVendorDoc = isPurchaseBill || isPurchaseOrder || isPurchaseEst;
    // "Bill-like" = a real money document (invoice / purchase bill) vs a quote.
    const isBillLike = isInvoice || isPurchaseBill;
    const isQuote = !isBillLike; // estimate, proforma, PEST, challan, SO, PO
    const tpl = resolveTemplate(pickDocTemplate(invoice.company, docKind));
    const style = TEMPLATE_STYLES[tpl.templateId];
    // Total GST on the document — 0 when an estimate/PE was raised with Apply-GST off.
    const taxTotal =
      Number(invoice.cgstAmount) + Number(invoice.sgstAmount) + Number(invoice.igstAmount);
    // A "simple" bill shows no tax columns, no "taxable" split and no breakup:
    // an explicit Bill of Supply, OR an estimate / purchase-estimate raised with
    // Apply-GST off (no tax at all → render it as a plain amount-only document).
    const isEstimateLike = docKind === 'estimate' || isPurchaseEst;
    const simple =
      (isBillLike && tpl.format === 'simple') || (isEstimateLike && taxTotal === 0);
    // Never print GST columns/breakup when there is no tax or it's a simple bill.
    const showGst = tpl.showGstColumns && !simple && taxTotal > 0;
    const accent = invoice.status === 'CANCELLED' ? '#cc0000' : tpl.accentColor;
    const PREFIX: Record<string, string> = {
      invoice: 'INV', estimate: 'EST', proformaInvoice: 'PI',
      purchaseEstimate: 'PEST', deliveryChallan: 'DC', salesOrder: 'SO',
      purchaseBill: 'BILL', purchaseOrder: 'PO',
    };
    const prefix = PREFIX[docKind] ?? 'INV';
    const displayNo = `${prefix}/${invoice.fiscalYear}/${String(invoice.invoiceNo).padStart(4, '0')}`;
    const DOCLABEL: Record<string, string> = {
      invoice: simple ? L.billOfSupply : L.taxInvoice,
      estimate: L.estimate, proformaInvoice: L.proformaInvoice,
      purchaseEstimate: L.purchaseEstimate, deliveryChallan: L.deliveryChallan,
      salesOrder: L.salesOrder, purchaseBill: simple ? L.billOfSupply : L.purchaseBill,
      purchaseOrder: L.purchaseOrder,
    };
    const docLabel = DOCLABEL[docKind] ?? L.taxInvoice;
    const CANCELLED: Record<string, string> = {
      invoice: simple ? L.billOfSupplyCancelled : L.cancelled,
      estimate: L.estCancelled, proformaInvoice: L.proformaCancelled,
      purchaseEstimate: L.purchaseEstCancelled, deliveryChallan: L.dcCancelled,
      salesOrder: L.soCancelled, purchaseBill: L.purchaseBillCancelled,
      purchaseOrder: L.poCancelled,
    };
    const cancelledLabel = CANCELLED[docKind] ?? L.cancelled;
    const NUMBERLABEL: Record<string, string> = {
      invoice: L.invoiceNo, estimate: L.estimateNo, proformaInvoice: L.proformaNo,
      purchaseEstimate: L.purchaseEstNo, deliveryChallan: L.deliveryChallanNo,
      salesOrder: L.salesOrderNo, purchaseBill: L.purchaseBillNo, purchaseOrder: L.poNo,
    };
    const numberLabel = NUMBERLABEL[docKind] ?? L.invoiceNo;
    const dueLabel = isOrder || isPurchaseOrder ? L.expectedDelivery : isQuote ? L.validUntil : L.due;
    const partyLabel = isVendorDoc ? L.vendor : L.billTo;
    const QRWORD: Record<string, string> = {
      invoice: 'Invoice', estimate: 'Estimate', proformaInvoice: 'Proforma Invoice',
      purchaseEstimate: 'Purchase Estimate', deliveryChallan: 'Delivery Challan',
      salesOrder: 'Sales Order', purchaseBill: 'Purchase Bill', purchaseOrder: 'Purchase Order',
    };
    const qrWord = QRWORD[docKind] ?? 'Invoice';

    // A registered, non-cancelled e-invoice prints the mandatory signed QR.
    const ei =
      invoice.eInvoice && invoice.eInvoice.status === 'GENERATED'
        ? invoice.eInvoice
        : null;
    const qrPayload = ei
      ? ei.signedQrCode
      : [
          `${qrWord}: ${displayNo}`,
          `Seller GSTIN: ${invoice.company.gstin ?? 'Unregistered'}`,
          `Date: ${invoice.date.toISOString().slice(0, 10)}`,
          `Total: INR ${inr(Number(invoice.total))}`,
        ].join('\n');
    const qrPng =
      ei || tpl.showInfoQr
        ? await QRCode.toBuffer(qrPayload, { width: 110, margin: 0 })
        : null;

    let M = tpl.paperSize === 'A5' ? 16 : 40; // page margin (A5 tighter to fit one page)
    const doc = new PDFDocument({ size: tpl.paperSize, margin: M });
    const F = registerPdfFonts(doc, pdfLang(lang));
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    const finished = new Promise<Buffer>((resolve) =>
      doc.on('end', () => resolve(Buffer.concat(chunks))),
    );

    let W = doc.page.width - M * 2;
    let PAGE_BOTTOM = doc.page.height - M;
    // Numeric column widths are tuned for A4; scale down on A5 so a full GST
    // table still fits, with the Description column flexing to fill the rest.
    let scale = W / 515;

    const c = invoice.company;
    // Trade/display name printed on the document; falls back to the legal name.
    const displayName = c.printName?.trim() || c.name;
    // Per-template header controls (estimate/PE): which seller details print,
    // and an alternative header text to show in place of the name.
    const headerName = tpl.printName
      ? displayName
      : tpl.headerNameOverride?.trim() || '';
    const addr = tpl.printAddress
      ? [
          c.addressLine1,
          c.addressLine2,
          [c.city, c.pincode].filter(Boolean).join(' - '),
        ]
          .filter(Boolean)
          .join(', ')
      : '';
    const contact = [
      tpl.printPhone && c.phone ? `${L.phoneL}: ${c.phone}` : null,
      tpl.printEmail && c.email ? `${L.emailL}: ${c.email}` : null,
    ]
      .filter(Boolean)
      .join('   ');

    // ---- Tally: a dedicated full-grid layout (the default) ----
    if (tpl.templateId === 'tally') {
      await this.drawTally(doc, {
        M, W, F, L, accent, invoice, c, displayName, headerName, contact, addr,
        docLabel, cancelledLabel, numberLabel, dueLabel, partyLabel,
        displayNo, showGst, simple, qrPng, isVendorDoc, isQuote,
        printName: tpl.printName, printGstin: tpl.printGstin,
      });
      doc.end();
      return finished;
    }

    // ---- "Regular" (non-tally) templates print on the FULL PAGE ----
    // Tighten the margins close to the printable edge so the layout fills the
    // sheet instead of floating in the middle with wide side gaps. (Tally above
    // already used the original M/W and is unaffected by this reassignment.)
    M = tpl.paperSize === 'A5' ? 18 : 24;
    W = doc.page.width - M * 2;
    PAGE_BOTTOM = doc.page.height - M;
    scale = W / 515;
    // The document was created with a larger margin; sync it so PDFKit's
    // auto-pagination threshold matches our layout — otherwise the absolutely
    // positioned footer falls below the old margin and spills a blank page 2.
    doc.page.margins = { top: M, bottom: M, left: M, right: M };

    // ---- Full-page border (Classic / Professional / Elegant) ----
    if (style.border) {
      doc
        .lineWidth(1)
        .strokeColor('#cbd5e1')
        .rect(M - 12, M - 12, W + 24, doc.page.height - (M - 12) * 2)
        .stroke();
      doc.strokeColor('#000');
    }

    // ---- Seller identity lines, reused by every header variant ----
    const drawSeller = (
      x: number,
      w: number,
      o: { color: string; sub: string; align: 'left' | 'center' },
    ): void => {
      if (headerName && invoice.showCompanyName !== false) {
        doc.fillColor(o.color).fontSize(18).font(F.bold).text(headerName, x, doc.y, { width: w, align: o.align });
        if (tpl.printName && c.legalName && c.legalName !== displayName) {
          doc.fontSize(9).font(F.regular).fillColor(o.sub).text(c.legalName, x, doc.y, { width: w, align: o.align });
        }
      }
      doc.fontSize(9).font(F.regular).fillColor(o.sub);
      if (addr) doc.text(addr, x, doc.y, { width: w, align: o.align });
      if (contact) doc.text(contact, x, doc.y, { width: w, align: o.align });
      if (tpl.printGstin && c.gstin) {
        doc.font(F.bold).fillColor(o.color === '#ffffff' ? '#ffffff' : '#334155')
          .text(`GSTIN: ${c.gstin}`, x, doc.y, { width: w, align: o.align });
      }
      doc.font(F.regular).fillColor('#000');
    };

    const logoBuf = (() => {
      if (!c.logo) return null;
      try {
        return Buffer.from(c.logo.slice(c.logo.indexOf(',') + 1), 'base64');
      } catch {
        return null; // a malformed logo just falls back to the text name
      }
    })();

    // ---- Header (style-dependent) ----
    if (style.header === 'band') {
      // Modern: a full-width accent band with the seller in white.
      const bandH = logoBuf ? 96 : 78;
      doc.rect(M, M, W, bandH).fill(accent);
      let ty = M + 12;
      if (logoBuf) {
        try {
          doc.image(logoBuf, M + 12, ty, { fit: [150, 40] });
        } catch {
          /* ignore */
        }
        ty += 46;
      }
      doc.y = ty;
      drawSeller(M + 14, W * 0.62, { color: '#ffffff', sub: '#e5e7eb', align: 'left' });
      if (qrPng) {
        // White-bordered QR plate so it reads on the coloured band.
        doc.rect(M + W - 86, M + (bandH - 76) / 2 - 3, 82, 82).fill('#ffffff');
        doc.image(qrPng, M + W - 82, M + (bandH - 76) / 2, { width: 74 });
      }
      doc.y = M + bandH + 6;
    } else if (style.header === 'sidebar') {
      // Professional: a vertical accent bar beside the seller block.
      doc.rect(M, M, 5, logoBuf ? 60 : 50).fill(accent);
      let hy = M;
      const sx = M + 16;
      if (logoBuf) {
        try {
          doc.image(logoBuf, sx, hy, { fit: [150, 46] });
        } catch {
          /* ignore */
        }
        hy += 54;
      }
      doc.y = hy;
      drawSeller(sx, W - 110, { color: '#000', sub: '#555', align: 'left' });
      if (qrPng) doc.image(qrPng, M + W - 80, M, { width: 80 });
    } else if (style.header === 'centered') {
      // Elegant: everything centred.
      let hy = M;
      if (logoBuf) {
        try {
          doc.image(logoBuf, M + (W - 150) / 2, hy, { fit: [150, 46] });
        } catch {
          /* ignore */
        }
        hy += 52;
      }
      doc.y = hy;
      drawSeller(M, W, { color: '#000', sub: '#555', align: 'center' });
      if (qrPng) doc.image(qrPng, M + W - 70, M, { width: 70 });
    } else {
      // Classic / Minimal: logo top-left, seller left, QR top-right.
      let hy = M;
      if (logoBuf) {
        try {
          doc.image(logoBuf, M, hy, { fit: [150, 46] });
        } catch {
          /* ignore */
        }
        hy += 54;
      }
      doc.y = hy;
      drawSeller(M, W - 100, { color: '#000', sub: '#555', align: 'left' });
      if (qrPng) doc.image(qrPng, M + W - 80, M, { width: 80 });
    }

    // Keep the title + its accent rule clear of the top-right QR so the rule
    // never crosses through the QR in the shorter header variants.
    if (qrPng && style.header !== 'band') {
      doc.y = Math.max(doc.y, M + 84);
    }

    // ---- Document title + accent rule ----
    // Rule placement is computed from the measured title height (not the post-
    // draw cursor) so it always sits cleanly *under* the title regardless of
    // which header variant set the cursor above.
    const titleText =
      invoice.status === 'CANCELLED' ? cancelledLabel : tpl.title ?? docLabel;
    doc.moveDown(0.4);
    doc.fontSize(14).font(F.bold).fillColor(accent);
    const titleY = doc.y;
    const titleH = doc.heightOfString(titleText, { width: W });
    doc.text(titleText, M, titleY, { width: W, align: style.titleAlign });
    const ruleY = titleY + titleH + 3;
    doc.fillColor('#000');
    doc
      .moveTo(M, ruleY)
      .lineTo(M + W, ruleY)
      .lineWidth(1.5)
      .strokeColor(accent)
      .stroke();
    doc.strokeColor('#000');
    doc.y = ruleY + 4;

    // ---- e-Invoice (IRN) block, when registered ----
    if (ei) {
      doc.moveDown(0.5);
      doc.fontSize(8).font(F.bold).fillColor(accent).text('e-INVOICE', M, doc.y);
      doc.font(F.regular).fontSize(7).fillColor('#334155');
      doc.text(`IRN: ${ei.irn}`, M, doc.y, { width: W - 95 });
      doc.text(
        `Ack No: ${ei.ackNo}   Ack Date: ${ei.ackDate.toLocaleString('en-IN')}`,
        { width: W - 95 },
      );
      doc.fillColor('#000');
    }

    // ---- e-Way Bill line, when generated ----
    const ewb =
      invoice.eWayBill && invoice.eWayBill.status === 'GENERATED'
        ? invoice.eWayBill
        : null;
    if (ewb) {
      doc.moveDown(0.3);
      doc.font(F.bold).fontSize(8).fillColor(accent).text('e-WAY BILL', M, doc.y);
      doc.font(F.regular).fontSize(7).fillColor('#334155');
      doc.text(
        `EWB No: ${ewb.ewbNo}   Valid upto: ${ewb.validUpto.toLocaleDateString('en-IN')}`,
        { width: W - 95 },
      );
      doc.fillColor('#000');
    }

    // ---- Meta + buyer ----
    const metaY = doc.y + 12;
    // Left: document identifiers — the number is emphasised as the key reference.
    doc.fontSize(7.5).font(F.bold).fillColor(accent)
      .text(numberLabel.toUpperCase(), M, metaY, { characterSpacing: 0.4 });
    doc.fontSize(11).font(F.bold).fillColor('#1e293b').text(displayNo, M, doc.y);
    doc.fontSize(9).font(F.regular).fillColor('#475569');
    doc.text(`${L.date}: ${invoice.date.toLocaleDateString('en-IN')}`, M, doc.y + 2);
    if (invoice.dueDate) doc.text(`${dueLabel}: ${invoice.dueDate.toLocaleDateString('en-IN')}`, M, doc.y);
    doc.text(`${L.placeOfSupply}: ${invoice.placeOfSupply ?? '—'} ${invoice.isInterState ? L.inter : L.intra}`, M, doc.y);

    // Right: bill-to / vendor — a small accent heading over a bold party name.
    const buyerX = M + W / 2;
    doc.fontSize(7.5).font(F.bold).fillColor(accent)
      .text(partyLabel.replace(/:$/, '').toUpperCase(), buyerX, metaY, { characterSpacing: 0.4 });
    doc.fontSize(10.5).font(F.bold).fillColor('#1e293b').text(invoice.party.name, buyerX, doc.y);
    doc.fontSize(9).font(F.regular).fillColor('#475569');
    const pAddr = [invoice.party.addressLine1, invoice.party.city].filter(Boolean).join(', ');
    if (pAddr) doc.text(pAddr, buyerX, doc.y);
    if (invoice.party.gstin) doc.text(`GSTIN: ${invoice.party.gstin}`, buyerX, doc.y);
    if (invoice.party.phone) doc.text(`${L.phoneL}: ${invoice.party.phone}`, buyerX, doc.y);
    doc.fillColor('#000');

    // ---- Lines table ----
    let y = Math.max(doc.y, metaY + 60) + 14;

    // Active columns, with widths scaled to the page; Description flexes.
    const colSpec: {
      key: string;
      label: string;
      base: number;
      align: 'left' | 'right';
      on: boolean;
    }[] = [
      { key: 'no', label: L.colNo, base: 18, align: 'left', on: true },
      { key: 'desc', label: L.colDesc, base: 0, align: 'left', on: true },
      { key: 'hsn', label: L.colHsn, base: 42, align: 'left', on: tpl.showHsn },
      { key: 'qty', label: L.colQty, base: 52, align: 'right', on: true },
      { key: 'rate', label: L.colRate, base: 56, align: 'right', on: true },
      { key: 'taxable', label: L.colTaxable, base: 64, align: 'right', on: !simple },
      { key: 'gst', label: L.colGst, base: 34, align: 'right', on: showGst },
      { key: 'tax', label: L.colTax, base: 52, align: 'right', on: showGst },
      { key: 'total', label: L.colTotal, base: 60, align: 'right', on: true },
    ];
    const activeCols = colSpec.filter((col) => col.on);
    const fixedW = activeCols
      .filter((col) => col.key !== 'desc')
      .reduce((s, col) => s + Math.round(col.base * scale), 0);
    let cx = M;
    const cols = activeCols.map((col) => {
      const w = col.key === 'desc' ? W - fixedW : Math.round(col.base * scale);
      const out = { ...col, x: cx, w };
      cx += w;
      return out;
    });
    const descW = cols.find((col) => col.key === 'desc')!.w;

    const cellFor = (line: InvoiceLine, key: string): string => {
      switch (key) {
        case 'no':
          return String(line.lineNo);
        case 'desc':
          return line.description;
        case 'hsn':
          return line.hsnCode ?? '—';
        case 'qty':
          return `${Number(line.quantity)} ${line.unit}`;
        case 'rate':
          return inr(Number(line.rate));
        case 'taxable':
          return inr(Number(line.taxableValue));
        case 'gst':
          return `${Number(line.gstRate)}%`;
        case 'tax':
          return inr(Number(line.cgst) + Number(line.sgst) + Number(line.igst));
        case 'total':
          return inr(Number(line.total));
        default:
          return '';
      }
    };

    // Header row — repeatable so the table can flow across pages.
    const headFill = style.table === 'lines' ? '#f1f5f9' : accent;
    const headText = style.table === 'lines' ? accent : '#ffffff';
    const drawHead = (): number => {
      const top = y - 4;
      doc.rect(M, top, W, 18).fill(headFill);
      doc.fillColor(headText).fontSize(7.5).font(F.bold);
      for (const col of cols) {
        doc.text(col.label.toUpperCase(), col.x + 3, y + 1.5, {
          width: col.w - 5,
          align: col.align,
          characterSpacing: 0.4,
        });
      }
      doc.fillColor('#000').font(F.regular);
      y += 18;
      return top;
    };
    const drawGrid = (top: number) => {
      if (style.table === 'grid') {
        const tableBottom = y - 3;
        doc.lineWidth(0.5).strokeColor('#cbd5e1');
        doc.rect(M, top, W, tableBottom - top).stroke();
        for (const col of cols) {
          if (col.x === M) continue;
          doc.moveTo(col.x, top).lineTo(col.x, tableBottom).stroke();
        }
        doc.strokeColor('#000');
      }
    };

    let segTop = drawHead();
    // Body rows.
    invoice.lines.forEach((line, i) => {
      const rowHeight = Math.max(
        doc.heightOfString(line.description, { width: descW - 5 }) + 8,
        16,
      );
      if (y + rowHeight > PAGE_BOTTOM - 4) {
        drawGrid(segTop);
        doc.addPage();
        doc.page.margins = { top: M, bottom: M, left: M, right: M };
        y = M;
        segTop = drawHead();
      }
      if (style.table === 'zebra' && i % 2 === 1) {
        doc.rect(M, y - 3, W, rowHeight).fill('#f8fafc');
      }
      doc.fillColor('#1e293b').font(F.regular).fontSize(8.5);
      for (const col of cols) {
        doc.text(cellFor(line, col.key), col.x + 3, y + 1, { width: col.w - 5, align: col.align });
      }
      y += rowHeight;
      doc
        .moveTo(M, y - 3)
        .lineTo(M + W, y - 3)
        .strokeColor('#eef2f7')
        .lineWidth(0.5)
        .stroke();
    });
    drawGrid(segTop);

    // Keep the totals + signature block together: if little room is left on
    // the page, start a fresh one so they don't overflow or overlap.
    if (y > PAGE_BOTTOM - 200) {
      doc.addPage();
      doc.page.margins = { top: M, bottom: M, left: M, right: M };
      y = M;
    }

    // ---- Totals ----
    y += 6;
    const totals: [string, string][] = [
      ...(tpl.showTotalQty
        ? ([
            [
              L.totalQty,
              String(
                invoice.lines.reduce((s, l) => s + Number(l.quantity), 0),
              ),
            ],
          ] as [string, string][])
        : []),
      [L.subtotal, inr(Number(invoice.subtotal))],
      ...(Number(invoice.discountTotal) > 0
        ? ([[L.discount, `- ${inr(Number(invoice.discountTotal))}`]] as [string, string][])
        : []),
      ...(simple
        ? ([] as [string, string][])
        : ([[L.taxableAmount, inr(Number(invoice.taxableAmount))]] as [string, string][])),
      ...(!simple && Number(invoice.cgstAmount) > 0
        ? ([
            ['CGST', inr(Number(invoice.cgstAmount))],
            ['SGST', inr(Number(invoice.sgstAmount))],
          ] as [string, string][])
        : []),
      ...(!simple && Number(invoice.igstAmount) > 0
        ? ([['IGST', inr(Number(invoice.igstAmount))]] as [string, string][])
        : []),
      ...(Number(invoice.roundOff) !== 0
        ? ([[L.roundOff, inr(Number(invoice.roundOff))]] as [string, string][])
        : []),
    ];

    // Loyalty discount, Received & Balance (invoices only).
    const received = isInvoice
      ? (invoice.payments ?? []).reduce((s, p) => s + Number(p.amount), 0)
      : 0;
    const loyaltyDisc = 0;
    const afterTotals: [string, string][] = isInvoice
      ? [
          ...(loyaltyDisc > 0
            ? ([
                [L.loyaltyDiscount, `- ${inr(loyaltyDisc)}`],
                [L.netPayable, inr(Number(invoice.total) - loyaltyDisc)],
              ] as [string, string][])
            : []),
          ...(tpl.showReceived
            ? ([[L.received, inr(received)]] as [string, string][])
            : []),
          ...(tpl.showBalance
            ? ([
                [L.balance, inr(Number(invoice.total) - loyaltyDisc - received)],
              ] as [string, string][])
            : []),
        ]
      : [];

    const boxX = M + W - 210;
    if (style.totals === 'boxed') {
      doc.rect(boxX, y - 4, 210, totals.length * 14 + 6).fill('#f8fafc');
    }
    doc.fontSize(9).font(F.regular);
    for (const [label, value] of totals) {
      doc.fillColor('#64748b').text(label, M + W - 200, y, { width: 120, align: 'right' });
      doc.fillColor('#1e293b').text(value, M + W - 75, y, { width: 75, align: 'right' });
      y += 15;
    }
    if (style.totals === 'boxed') {
      doc.rect(boxX, y, 210, 24).fill(accent);
      doc
        .font(F.bold)
        .fontSize(11.5)
        .fillColor('#ffffff')
        .text(L.total, M + W - 205, y + 6, { width: 122, align: 'right' })
        .text(`Rs. ${inr(Number(invoice.total))}`, M + W - 80, y + 6, {
          width: 75,
          align: 'right',
        });
      y += 30;
    } else {
      // A crisp accent rule separates the line items from the grand total.
      doc.moveTo(M + W - 200, y).lineTo(M + W, y).lineWidth(0.8).strokeColor(accent).stroke();
      y += 4;
      doc
        .font(F.bold)
        .fontSize(11.5)
        .fillColor(accent)
        .text(L.total, M + W - 200, y + 2, { width: 120, align: 'right' })
        .text(`Rs. ${inr(Number(invoice.total))}`, M + W - 75, y + 2, {
          width: 75,
          align: 'right',
        });
      y += 24;
    }
    doc.fillColor('#000');

    // Received / Balance rows, printed under the grand total.
    if (afterTotals.length) {
      doc.fontSize(9).font(F.regular).fillColor('#334155');
      for (const [label, value] of afterTotals) {
        doc.text(label, M + W - 200, y, { width: 120, align: 'right' });
        doc.text(value, M + W - 75, y, { width: 75, align: 'right' });
        y += 14;
      }
      doc.fillColor('#000');
    }

    if (tpl.showAmountInWords) {
      const words =
        tpl.amountWordsFormat === 'international'
          ? amountInWordsIntl(Number(invoice.total))
          : amountInWords(Number(invoice.total));
      doc
        .font(F.oblique)
        .fontSize(8)
        .fillColor('#555')
        .text(`${L.amountWords}: ${words}`, M, y, { width: W });
    }

    if (invoice.notes) {
      doc.moveDown(0.5).font(F.regular).text(`${L.notes}: ${invoice.notes}`, M, doc.y, { width: W });
    }

    if (tpl.terms) {
      doc.moveDown(0.6);
      doc.font(F.bold).fontSize(8).fillColor('#334155').text(L.terms, M, doc.y, { width: W });
      doc.font(F.regular).fontSize(8).fillColor('#555').text(tpl.terms, M, doc.y, { width: W });
    }

    // ---- Bottom block: bank details (left) + UPI QR (middle) + signatory (right) ----
    // Anchored near the page bottom so a short invoice still fills a full page.
    const hasBank = tpl.showBank && !!(c.bankName || c.bankAccountNo || c.bankIfsc);
    const showUpi =
      !isQuote && tpl.showUpiQr && !!(c.upiId && invoice.status !== 'CANCELLED');
    const blockTop = Math.max(doc.y + 22, PAGE_BOTTOM - 150);

    if (hasBank) {
      const bw = 240;
      doc.font(F.bold).fontSize(9).fillColor('#334155').text(L.bankDetails, M, blockTop, { width: bw });
      doc.font(F.regular).fontSize(8).fillColor('#000');
      const bankRows: [string, string | null][] = [
        [L.bankNameL, c.bankName],
        [L.acName, c.bankAccountName],
        [L.acNo, c.bankAccountNo],
        [L.ifsc, c.bankIfsc],
        [L.branch, c.bankBranch],
      ];
      for (const [label, value] of bankRows) {
        if (!value) continue;
        doc.text(`${label}: ${value}`, M, doc.y, { width: bw });
      }
    }

    if (showUpi) {
      const upiLink =
        `upi://pay?pa=${encodeURIComponent(c.upiId as string)}` +
        `&pn=${encodeURIComponent(displayName.slice(0, 60))}` +
        `&am=${Number(invoice.total).toFixed(2)}` +
        `&tn=${encodeURIComponent(displayNo)}` +
        `&cu=INR`;
      const upiQr = await QRCode.toBuffer(upiLink, { width: 110, margin: 0 });
      const ux = M + 270;
      doc.image(upiQr, ux, blockTop, { width: 78 });
      doc
        .font(F.regular)
        .fontSize(7)
        .fillColor('#555')
        .text(L.scanToPay, ux - 10, blockTop + 80, { width: 98, align: 'center' });
    }

    // Right: authorised signatory. The "For <Company>" caption follows the
    // header's company-name toggle — when the name is suppressed (e.g. printing
    // on letterhead), it is omitted here too, leaving only "Authorised Signatory".
    if (tpl.showSignature) {
      const sigX = M + W - 180;
      const showSellerName = tpl.printName && invoice.showCompanyName !== false;
      if (showSellerName) {
        doc
          .font(F.regular)
          .fontSize(9)
          .fillColor('#000')
          .text(`${L.forLabel} ${displayName}`, sigX, blockTop, { width: 180, align: 'right' });
      }
      // A signing line above the caption — a recognisable place to sign.
      doc
        .moveTo(sigX + 36, PAGE_BOTTOM - 46)
        .lineTo(M + W, PAGE_BOTTOM - 46)
        .lineWidth(0.5)
        .strokeColor('#94a3b8')
        .stroke();
      doc
        .font(F.bold)
        .fontSize(9)
        .fillColor('#1e293b')
        .text(tpl.signatureLabel ?? L.authSign, sigX, PAGE_BOTTOM - 42, {
          width: 180,
          align: 'right',
        });
    }

    // Thin rule above the footer caption for a clean, finished edge.
    doc
      .moveTo(M, PAGE_BOTTOM - 22)
      .lineTo(M + W, PAGE_BOTTOM - 22)
      .lineWidth(0.5)
      .strokeColor('#e2e8f0')
      .stroke();
    doc
      .font(F.regular)
      .fontSize(8)
      .fillColor('#94a3b8')
      .text(
        tpl.footerText ??
          (isOrder
            ? L.footerOrder
            : isChallan
              ? L.footerChallan
              : isProforma
                ? L.footerProforma
                : isQuote
                  ? L.footerEstimate
                  : L.footer),
        M,
        PAGE_BOTTOM - 16,
        { width: W, align: 'center' },
      );

    doc.end();
    return finished;
  }

  /**
   * Draws the full TallyPrime-style tax invoice: a single bordered grid with a
   * boxed header (seller + metadata fields), Consignee/Buyer blocks, an items
   * grid, an HSN tax-summary table, amount-in-words and a signatory block.
   * Used for the default `tally` template across all document types.
   */
  private async drawTally(
    doc: PDFKit.PDFDocument,
    ctx: {
      M: number; W: number; F: { regular: string; bold: string };
      L: Record<string, string>; accent: string; invoice: FullInvoice;
      c: Company; displayName: string; headerName: string; contact: string; addr: string;
      docLabel: string; cancelledLabel: string; numberLabel: string;
      dueLabel: string; partyLabel: string; displayNo: string;
      showGst: boolean; simple: boolean; qrPng: Buffer | null;
      isVendorDoc: boolean; isQuote: boolean;
      printName: boolean; printGstin: boolean;
    },
  ): Promise<void> {
    const {
      M, W, F, invoice, c, displayName, headerName, contact, addr, docLabel, cancelledLabel,
      numberLabel, showGst, isVendorDoc, isQuote, printName, printGstin,
    } = ctx;
    const x0 = M;
    const x1 = M + W;
    const party = invoice.party;
    const cancelled = invoice.status === 'CANCELLED';
    const title = cancelled ? cancelledLabel : docLabel;
    const interstate = invoice.isInterState;
    const taxAmt =
      Number(invoice.cgstAmount) + Number(invoice.sgstAmount) + Number(invoice.igstAmount);
    const showTax = showGst && taxAmt > 0;
    const BLACK = '#000';
    const fmt = (n: number | string) => inr(n);

    doc.strokeColor(BLACK).lineWidth(0.7).fillColor(BLACK);
    const hline = (y: number, a = x0, b = x1) => doc.moveTo(a, y).lineTo(b, y).stroke();
    const vline = (x: number, a: number, b: number) => doc.moveTo(x, a).lineTo(x, b).stroke();
    const rect = (x: number, y: number, w: number, h: number) =>
      doc.rect(x, y, w, h).stroke();

    // ---- Title (centered, above the box) ----
    doc.font(F.bold).fontSize(12).fillColor(cancelled ? '#cc0000' : BLACK)
      .text(title.toUpperCase(), x0, M - 5, { width: W, align: 'center', characterSpacing: 1 });
    doc.fillColor(BLACK);
    const boxTop = M + 14;

    // ---- Header box: left = seller + ship-to + bill-to, right = metadata ----
    const LW = Math.round(W * 0.58);
    const midX = x0 + LW;
    const RW = W - LW;
    const rcol2 = midX + Math.round(RW / 2);
    const PAD = 4;

    // Right metadata grid (fixed-height rows) — gives us the box height.
    const rowH = 23;
    const metaRows: Array<[string, string, string, string]> = [
      [numberLabel + '.', ctx.displayNo, 'Dated', invoice.date.toISOString().slice(0, 10)],
      ['Delivery Note', '', 'Mode/Terms of Payment', ''],
      ['Reference No. & Date.', '', 'Other References', ''],
      ["Buyer's Order No.", '', 'Dated', ''],
      ['Dispatch Doc No.', '', 'Delivery Note Date', ''],
      ['Dispatched through', '', 'Destination', ''],
    ];
    const headerH = rowH * metaRows.length + rowH; // + Terms of Delivery row
    const boxBottom = boxTop + headerH;

    // Outer header box + middle split
    rect(x0, boxTop, W, headerH);
    vline(midX, boxTop, boxBottom);

    const cell = (
      x: number, y: number, w: number, label: string, value: string,
    ) => {
      doc.font(F.regular).fontSize(6.5).fillColor('#555')
        .text(label, x + 3, y + 2, { width: w - 6 });
      if (value)
        doc.font(F.bold).fontSize(8.5).fillColor(BLACK)
          .text(value, x + 3, y + 11, { width: w - 6, lineBreak: false });
    };

    // Right grid rows
    let ry = boxTop;
    for (const [l1, v1, l2, v2] of metaRows) {
      hline(ry, midX, x1);
      vline(rcol2, ry, ry + rowH);
      cell(midX, ry, rcol2 - midX, l1, v1);
      cell(rcol2, ry, x1 - rcol2, l2, v2);
      ry += rowH;
    }
    hline(ry, midX, x1);
    cell(midX, ry, x1 - midX, 'Terms of Delivery', '');

    // Left column: seller, then Consignee (Ship to), then Buyer (Bill to).
    const partyBlock = (label: string, top: number): void => {
      doc.font(F.regular).fontSize(6.5).fillColor('#555')
        .text(label, x0 + PAD, top + 2, { width: LW - 2 * PAD });
      let yy = top + 11;
      doc.font(F.bold).fontSize(9).fillColor(BLACK)
        .text(party.name, x0 + PAD, yy, { width: LW - 2 * PAD });
      yy = doc.y;
      doc.font(F.regular).fontSize(7.5).fillColor('#222');
      const paddr = [party.addressLine1, party.addressLine2, [party.city, party.pincode].filter(Boolean).join(' ')]
        .filter(Boolean).join(', ');
      if (paddr) { doc.text(paddr, x0 + PAD, yy, { width: LW - 2 * PAD }); }
      if (party.gstin) doc.text(`GSTIN/UIN : ${party.gstin}`, x0 + PAD, doc.y, { width: LW - 2 * PAD });
      if (party.stateCode) doc.text(`State Code : ${party.stateCode}`, x0 + PAD, doc.y, { width: LW - 2 * PAD });
      if (party.phone) doc.text(`Phone : ${party.phone}`, x0 + PAD, doc.y, { width: LW - 2 * PAD });
    };

    // Seller
    let ly = boxTop + PAD;
    if (headerName && invoice.showCompanyName !== false) {
      doc.font(F.bold).fontSize(10).fillColor(BLACK)
        .text(headerName, x0 + PAD, ly, { width: LW - 2 * PAD });
      ly = doc.y;
    }
    doc.font(F.regular).fontSize(7.5).fillColor('#222');
    if (addr) { doc.text(addr, x0 + PAD, ly, { width: LW - 2 * PAD }); ly = doc.y; }
    if (contact) { doc.text(contact, x0 + PAD, ly, { width: LW - 2 * PAD }); ly = doc.y; }
    if (printGstin && c.gstin) { doc.text(`GSTIN/UIN: ${c.gstin}`, x0 + PAD, ly, { width: LW - 2 * PAD }); ly = doc.y; }
    if (c.stateCode) { doc.text(`State Code : ${c.stateCode}`, x0 + PAD, ly, { width: LW - 2 * PAD }); ly = doc.y; }

    // Split the remaining left height between Ship-to and Bill-to.
    const shipTop = boxTop + Math.round(headerH * 0.4);
    const billTop = boxTop + Math.round(headerH * 0.7);
    hline(shipTop, x0, midX);
    hline(billTop, x0, midX);
    partyBlock(isVendorDoc ? 'Supplier (Ship from)' : 'Consignee (Ship to)', shipTop);
    partyBlock(isVendorDoc ? 'Supplier (Bill from)' : 'Buyer (Bill to)', billTop);

    // ---- Items table ----
    let y = boxBottom;
    const cols = { sl: 22, hsn: 48, qty: 58, rate: 52, per: 26, disc: 36, amt: 78 };
    const xSl = x0;
    const xDesc = xSl + cols.sl;
    const descW = W - cols.sl - cols.hsn - cols.qty - cols.rate - cols.per - cols.disc - cols.amt;
    const xHsn = xDesc + descW;
    const xQty = xHsn + cols.hsn;
    const xRate = xQty + cols.qty;
    const xPer = xRate + cols.rate;
    const xDisc = xPer + cols.per;
    const xAmt = xDisc + cols.disc;
    const colXs = [xSl, xDesc, xHsn, xQty, xRate, xPer, xDisc, xAmt, x1];

    // Header row — repeatable so the items table can flow across pages.
    const thH = 22;
    const pageBottom = () => doc.page.height - M;
    const drawTableHeader = () => {
      rect(x0, y, W, thH);
      doc.font(F.bold).fontSize(7).fillColor(BLACK);
      const th = (x: number, w: number, s: string, align: 'left' | 'right' | 'center' = 'center') =>
        doc.text(s, x + 2, y + 5, { width: w - 4, align });
      th(xSl, cols.sl, 'Sl\nNo.', 'center');
      th(xDesc, descW, 'Description of Goods', 'left');
      th(xHsn, cols.hsn, 'HSN/SAC');
      th(xQty, cols.qty, 'Quantity', 'right');
      th(xRate, cols.rate, 'Rate', 'right');
      th(xPer, cols.per, 'per');
      th(xDisc, cols.disc, 'Disc.%', 'right');
      th(xAmt, cols.amt, 'Amount', 'right');
      y += thH;
    };

    // The grid is drawn per page-segment so a multi-page table stays boxed.
    let segTop = 0;
    const closeSegment = () => {
      for (const cx of colXs) vline(cx, segTop - thH, y);
      rect(x0, segTop - thH, W, y - (segTop - thH));
    };
    const startSegment = () => {
      drawTableHeader();
      segTop = y;
      doc.font(F.regular).fontSize(8).fillColor(BLACK);
    };
    // Break to a fresh page (closing the current grid) when `need` more points
    // won't fit; repeats the column header on the new page.
    const rowBreak = (need: number) => {
      if (y + need > pageBottom() - 6) {
        closeSegment();
        doc.addPage();
        y = M;
        startSegment();
      }
    };

    startSegment();
    let totalQty = 0;
    invoice.lines.forEach((l, i) => {
      const qty = Number(l.quantity);
      totalQty += qty;
      const descH = doc.heightOfString(l.description, { width: descW - 4, lineBreak: true });
      const rh = Math.max(15, descH + 6);
      rowBreak(rh);
      doc.font(F.regular).fontSize(8).fillColor(BLACK);
      doc.text(String(i + 1), xSl + 2, y + 3, { width: cols.sl - 4, align: 'center' });
      doc.font(F.bold).text(l.description, xDesc + 2, y + 3, { width: descW - 4 });
      doc.font(F.regular);
      if (l.hsnCode) doc.text(l.hsnCode, xHsn, y + 3, { width: cols.hsn - 2, align: 'center' });
      doc.text(`${qty.toLocaleString('en-IN')}`, xQty, y + 3, { width: cols.qty - 4, align: 'right' });
      doc.text(fmt(Number(l.rate)), xRate, y + 3, { width: cols.rate - 4, align: 'right' });
      doc.text(l.unit ?? '', xPer, y + 3, { width: cols.per - 2, align: 'center' });
      doc.text(fmt(Number(l.taxableValue)), xAmt, y + 3, { width: cols.amt - 4, align: 'right' });
      y += rh;
    });

    // Tax + round-off lines, shown right-aligned in the description column.
    const taxLine = (label: string, amount: number) => {
      rowBreak(14);
      doc.font(F.regular).fontSize(8).fillColor(BLACK);
      doc.text(label, xDesc + 2, y + 2, { width: descW - 6, align: 'right' });
      doc.text(fmt(amount), xAmt, y + 2, { width: cols.amt - 4, align: 'right' });
      y += 14;
    };
    if (showTax) {
      if (interstate) taxLine('Output IGST', Number(invoice.igstAmount));
      else {
        taxLine('Output CGST', Number(invoice.cgstAmount));
        taxLine('Output SGST', Number(invoice.sgstAmount));
      }
    }
    // Non-taxed extra charges, shown after tax.
    const freight = Number(invoice.freightCharges) || 0;
    const otherCh = Number(invoice.otherCharges) || 0;
    if (freight > 0) taxLine('Freight charges', freight);
    if (otherCh > 0) taxLine('Other charges', otherCh);
    if (Number(invoice.roundOff) !== 0) taxLine('Round Off', Number(invoice.roundOff));

    // Total row
    const totH = 18;
    rowBreak(4 + totH);
    y += 4;
    hline(y);
    doc.font(F.bold).fontSize(9).fillColor(BLACK);
    doc.text('Total', xDesc + 2, y + 4, { width: descW - 4, align: 'right' });
    doc.text(totalQty.toLocaleString('en-IN'), xQty, y + 4, { width: cols.qty - 4, align: 'right' });
    doc.text(`Rs. ${fmt(Number(invoice.total))}`, xAmt - 6, y + 4, { width: cols.amt + 2, align: 'right' });
    y += totH;
    closeSegment();

    // Sections below the table flow onto a new page if they don't fit.
    const ensureSpace = (need: number) => {
      if (y + need > pageBottom() - 6) {
        doc.addPage();
        y = M;
      }
    };

    // ---- Amount chargeable (in words) ----
    const words = ctx.invoice;
    const amtWordsH = 26;
    ensureSpace(amtWordsH);
    rect(x0, y, W, amtWordsH);
    doc.font(F.regular).fontSize(7).fillColor('#555')
      .text('Amount Chargeable (in words)', x0 + 4, y + 2);
    doc.font(F.regular).fontSize(7).fillColor('#555')
      .text('E. & O.E', x1 - 80, y + 2, { width: 76, align: 'right' });
    doc.font(F.bold).fontSize(9).fillColor(BLACK)
      .text(amountInWords(Number(words.total)), x0 + 4, y + 12, { width: W - 8 });
    y += amtWordsH;

    // ---- HSN tax summary ----
    if (showTax) {
      const groups = new Map<string, { taxable: number; cgst: number; sgst: number; igst: number; rate: number }>();
      for (const l of invoice.lines) {
        const key = l.hsnCode ?? '-';
        const g = groups.get(key) ?? { taxable: 0, cgst: 0, sgst: 0, igst: 0, rate: Number(l.gstRate) };
        g.taxable += Number(l.taxableValue);
        g.cgst += Number(l.cgst);
        g.sgst += Number(l.sgst);
        g.igst += Number(l.igst);
        groups.set(key, g);
      }
      const sH = 16;
      // columns for the summary
      const sHsnW = 90;
      const sTaxableW = 90;
      const sTotalW = 80;
      const midBlock = W - sHsnW - sTaxableW - sTotalW;
      const sx = { hsn: x0, taxable: x0 + sHsnW, mid: x0 + sHsnW + sTaxableW, total: x1 - sTotalW };
      ensureSpace(sH * 2 + groups.size * 14 + 18);
      // header (two-tier)
      rect(x0, y, W, sH * 2);
      vline(sx.taxable, y, y + sH * 2);
      vline(sx.mid, y, y + sH * 2);
      vline(sx.total, y, y + sH * 2);
      hline(y + sH, sx.mid, sx.total);
      doc.font(F.bold).fontSize(7).fillColor(BLACK);
      doc.text('HSN/SAC', sx.hsn + 2, y + sH - 4, { width: sHsnW - 4, align: 'center' });
      doc.text('Taxable\nValue', sx.taxable + 2, y + 3, { width: sTaxableW - 4, align: 'center' });
      doc.text(interstate ? 'Integrated Tax' : 'Central + State Tax', sx.mid + 2, y + 3, { width: midBlock - 4, align: 'center' });
      const half = midBlock / 2;
      vline(sx.mid + half, y + sH, y + sH * 2);
      doc.fontSize(6.5);
      doc.text('Rate', sx.mid + 2, y + sH + 2, { width: half - 4, align: 'center' });
      doc.text('Amount', sx.mid + half + 2, y + sH + 2, { width: half - 4, align: 'center' });
      doc.fontSize(7).text('Total\nTax Amount', sx.total + 2, y + 3, { width: sTotalW - 4, align: 'center' });
      let sy = y + sH * 2;
      doc.font(F.regular).fontSize(7.5);
      let tTaxable = 0, tTax = 0;
      for (const [hsn, g] of groups) {
        const tax = interstate ? g.igst : g.cgst + g.sgst;
        tTaxable += g.taxable; tTax += tax;
        const rh = 14;
        doc.text(hsn, sx.hsn + 2, sy + 3, { width: sHsnW - 4, align: 'center' });
        doc.text(fmt(g.taxable), sx.taxable + 2, sy + 3, { width: sTaxableW - 6, align: 'right' });
        doc.text(`${g.rate}%`, sx.mid + 2, sy + 3, { width: half - 4, align: 'center' });
        doc.text(fmt(tax), sx.mid + half + 2, sy + 3, { width: half - 6, align: 'right' });
        doc.text(fmt(tax), sx.total + 2, sy + 3, { width: sTotalW - 6, align: 'right' });
        sy += rh;
      }
      // total row
      hline(sy, x0, x1);
      doc.font(F.bold).fontSize(7.5);
      doc.text('Total', sx.hsn + 2, sy + 3, { width: sHsnW - 4, align: 'center' });
      doc.text(fmt(tTaxable), sx.taxable + 2, sy + 3, { width: sTaxableW - 6, align: 'right' });
      doc.text(fmt(tTax), sx.mid + half + 2, sy + 3, { width: half - 6, align: 'right' });
      doc.text(fmt(tTax), sx.total + 2, sy + 3, { width: sTotalW - 6, align: 'right' });
      sy += 16;
      rect(x0, y, W, sy - y);
      vline(sx.taxable, y, sy); vline(sx.mid, y, sy); vline(sx.total, y, sy);
      vline(sx.mid + half, y + sH, sy);
      y = sy;
      // tax amount in words
      doc.font(F.regular).fontSize(7).fillColor('#555')
        .text('Tax Amount (in words) :', x0 + 4, y + 4, { width: 110, lineBreak: false });
      doc.font(F.bold).fontSize(8).fillColor(BLACK)
        .text(amountInWords(taxAmt), x0 + 116, y + 4, { width: W - 124 });
      y = doc.y + 4;
    }

    // ---- Description / Terms & conditions (from the document notes) ----
    if (invoice.notes && invoice.notes.trim()) {
      doc.font(F.regular).fontSize(8).fillColor('#222');
      const notesH = doc.heightOfString(invoice.notes, { width: W - 8 }) + 8;
      ensureSpace(notesH);
      rect(x0, y, W, notesH);
      doc.text(invoice.notes, x0 + 4, y + 4, { width: W - 8 });
      y += notesH;
    }

    // ---- Company's bank details (the chosen / default bank) ----
    if (c.bankName || c.bankAccountNo || c.bankIfsc) {
      const bankH = 30;
      ensureSpace(bankH);
      rect(x0, y, W, bankH);
      doc.font(F.regular).fontSize(7).fillColor('#555')
        .text("Company's Bank Details", x0 + 4, y + 3);
      const bankLine = [
        c.bankName ? `Bank: ${c.bankName}` : null,
        c.bankAccountNo ? `A/c No: ${c.bankAccountNo}` : null,
        c.bankIfsc ? `IFSC: ${c.bankIfsc}` : null,
        c.bankBranch ? `Branch: ${c.bankBranch}` : null,
      ].filter(Boolean).join('    ');
      doc.font(F.bold).fontSize(8).fillColor(BLACK)
        .text(bankLine, x0 + 4, y + 14, { width: W - 8 });
      y += bankH;
    }

    // ---- Declaration + signatory (+ QR inside the signatory cell) ----
    const decH = ctx.qrPng ? 84 : 56;
    ensureSpace(decH + 16);
    rect(x0, y, W, decH);
    vline(midX, y, y + decH);
    doc.font(F.regular).fontSize(7).fillColor('#555').text('Declaration', x0 + 4, y + 3);
    doc.font(F.regular).fontSize(7.5).fillColor('#222').text(
      'We declare that this document shows the actual price of the goods described and that all particulars are true and correct.',
      x0 + 4, y + 13, { width: LW - 10 },
    );
    if (printName && invoice.showCompanyName !== false) {
      doc.font(F.bold).fontSize(8).fillColor(BLACK)
        .text(`for ${displayName}`, midX + 6, y + 4, { width: x1 - midX - 12, align: 'right' });
    }
    if (ctx.qrPng) {
      try { doc.image(ctx.qrPng, x1 - 8 - 48, y + 16, { width: 48 }); } catch { /* ignore */ }
    }
    doc.font(F.regular).fontSize(7.5).fillColor('#555')
      .text('Authorised Signatory', midX + 6, y + decH - 12, { width: x1 - midX - 12, align: 'right' });
    y += decH;

    // Footer
    doc.font(F.regular).fontSize(7.5).fillColor('#555').text(
      isQuote ? 'This is a Computer Generated Document' : 'This is a Computer Generated Invoice',
      x0, doc.page.height - M - 12, { width: W, align: 'center' },
    );
    doc.fillColor(BLACK);
  }
}
