import { DOCUMENT_PREFIX, formatDocumentNo } from '@bookly/shared';
import { Injectable } from '@nestjs/common';
import type { Company, Invoice, InvoiceLine, Party, Payment, Prisma } from '@prisma/client';
import PDFDocument from 'pdfkit';
import { pickDocTemplate, resolveTemplate } from '../invoices/invoice-template';
import { pdfLang, registerPdfFonts, type PdfLang } from '../common/pdf-locale';

type ReceiptInvoice = Invoice & {
  company: Company;
  party: Party;
  lines: InvoiceLine[];
  payments: Payment[];
};

const LABELS: Record<PdfLang, Record<string, string>> = {
  en: {
    taxInvoice: 'TAX INVOICE',
    bill: 'Bill',
    customer: 'Customer',
    subtotal: 'Subtotal',
    total: 'TOTAL',
    paid: 'Paid',
    qty: 'Qty',
    thankYou: 'Thank you! Visit again.',
    footer: 'Goods once sold are taken back per store policy.',
  },
  ta: {
    taxInvoice: 'வரி ரசீது',
    bill: 'பில்',
    customer: 'வாடிக்கையாளர்',
    subtotal: 'கூட்டுத்தொகை',
    total: 'மொத்தம்',
    paid: 'செலுத்தியது',
    qty: 'அளவு',
    thankYou: 'நன்றி! மீண்டும் வருக.',
    footer: 'விற்ற பொருட்கள் கடை விதிப்படி மட்டுமே திரும்பப் பெறப்படும்.',
  },
  hi: {
    taxInvoice: 'टैक्स रसीद',
    bill: 'बिल',
    customer: 'ग्राहक',
    subtotal: 'उप-योग',
    total: 'कुल',
    paid: 'भुगतान',
    qty: 'मात्रा',
    thankYou: 'धन्यवाद! फिर पधारें।',
    footer: 'बेचा गया माल स्टोर की नीति के अनुसार ही वापस लिया जाएगा।',
  },
};

const inr = (n: number | string | Prisma.Decimal) =>
  Number(n).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

@Injectable()
export class PosReceiptService {
  /** Renders a thermal receipt (width per the company's chosen 2/3/4-inch roll). */
  async render(invoice: ReceiptInvoice, lang?: string): Promise<Buffer> {
    const L = LABELS[pdfLang(lang)];
    const tpl = resolveTemplate(pickDocTemplate(invoice.company, 'invoice'));
    // 2in≈58mm, 3in≈80mm, 4in≈112mm in PDF points (72pt/inch).
    const W = tpl.thermalWidth === '2in' ? 164 : tpl.thermalWidth === '4in' ? 317 : 226;
    const M = 10;
    const CW = W - M * 2;
    const c = invoice.company;
    const displayNo = formatDocumentNo(DOCUMENT_PREFIX.INVOICE, invoice.fiscalYear, invoice.invoiceNo);
    const isWalkIn = invoice.party.name === 'Walk-in Customer';

    // Estimate height so the page hugs the content (thermal rolls are continuous).
    const height =
      200 +
      invoice.lines.length * 24 +
      (Number(invoice.igstAmount) > 0 ? 1 : 2) * 12 +
      invoice.payments.length * 12;

    const doc = new PDFDocument({ size: [W, height], margin: M });
    const F = registerPdfFonts(doc, pdfLang(lang));
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    const finished = new Promise<Buffer>((resolve) =>
      doc.on('end', () => resolve(Buffer.concat(chunks))),
    );

    const center = (text: string, size: number, font = F.regular) => {
      doc.font(font).fontSize(size).fillColor('#000').text(text, M, doc.y, {
        width: CW,
        align: 'center',
      });
    };
    const rule = () => {
      doc.moveDown(0.3);
      doc
        .moveTo(M, doc.y)
        .lineTo(M + CW, doc.y)
        .dash(1, { space: 1 })
        .strokeColor('#000')
        .lineWidth(0.5)
        .stroke()
        .undash();
      doc.moveDown(0.3);
    };
    // Left label + right value on one row.
    const row = (left: string, right: string, size = 8, font = F.regular) => {
      const y = doc.y;
      doc.font(font).fontSize(size).fillColor('#000');
      doc.text(left, M, y, { width: CW - 60, align: 'left' });
      doc.text(right, M + CW - 60, y, { width: 60, align: 'right' });
      doc.y = Math.max(doc.y, y + size + 3);
    };

    doc.y = M;
    center(c.printName?.trim() || c.name, 12, F.bold);
    const addr = [c.addressLine1, [c.city, c.pincode].filter(Boolean).join(' - ')]
      .filter(Boolean)
      .join(', ');
    if (addr) center(addr, 7);
    if (c.phone) center(`Ph: ${c.phone}`, 7);
    if (c.gstin) center(`GSTIN: ${c.gstin}`, 7);

    rule();
    center(L.taxInvoice, 9, F.bold);
    doc.moveDown(0.2);
    doc.font(F.regular).fontSize(7).fillColor('#000');
    doc.text(`${L.bill}: ${displayNo}`, M, doc.y, { width: CW });
    doc.text(
      `${invoice.date.toLocaleDateString('en-IN')} ${invoice.createdAt.toLocaleTimeString('en-IN')}`,
      M,
      doc.y,
      { width: CW },
    );
    if (!isWalkIn) doc.text(`${L.customer}: ${invoice.party.name}`, M, doc.y, { width: CW });
    if (!isWalkIn && invoice.party.phone) doc.text(`Ph: ${invoice.party.phone}`, M, doc.y, { width: CW });

    rule();
    for (const line of invoice.lines) {
      doc.font(F.bold).fontSize(8).fillColor('#000').text(line.description, M, doc.y, {
        width: CW,
      });
      row(
        `${Number(line.quantity)} ${line.unit} x ${inr(line.rate)}`,
        inr(line.total),
        7,
        F.regular,
      );
    }

    rule();
    row(L.subtotal, inr(invoice.taxableAmount), 8);
    if (Number(invoice.cgstAmount) > 0) {
      row('CGST', inr(invoice.cgstAmount), 8);
      row('SGST', inr(invoice.sgstAmount), 8);
    }
    if (Number(invoice.igstAmount) > 0) row('IGST', inr(invoice.igstAmount), 8);
    if (Number(invoice.roundOff) !== 0) row('Round off', inr(invoice.roundOff), 8);
    rule();
    row(L.total, `Rs. ${inr(invoice.total)}`, 11, F.bold);

    rule();
    for (const p of invoice.payments) {
      row(`${L.paid} (${p.method})`, inr(p.amount), 8);
    }

    doc.moveDown(0.5);
    center(L.thankYou, 8, F.bold);
    doc.moveDown(0.2);
    center(L.footer, 6);

    doc.end();
    return finished;
  }
}
