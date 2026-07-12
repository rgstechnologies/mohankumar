import { Injectable } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import * as QRCode from 'qrcode';
import {
  MM_TO_PT,
  paperDimsMm,
  type DesignElement,
  type PrintDesign,
  type TableColumn,
  type VisibilityRule,
} from '@bookly/shared';
import { pdfLang, registerPdfFonts, type PdfFonts } from '../common/pdf-locale';
import {
  amountInWords,
  amountInWordsIntl,
  type FullInvoice,
} from '../invoices/invoice-pdf.service';
import { stateNameForCode } from '@bookly/shared';

const inr = (n: number | string) =>
  Number(n).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

/** Document-number prefix per doc kind (mirrors InvoicePdfService). */
const DOC_PREFIX: Record<string, string> = {
  invoice: 'INV', estimate: 'EST', proformaInvoice: 'PI',
  purchaseEstimate: 'PEST', deliveryChallan: 'DC', salesOrder: 'SO',
  purchaseBill: 'BILL', purchaseOrder: 'PO',
};

/** Human label per doc kind, used in the QR payload. */
const DOC_LABEL: Record<string, string> = {
  invoice: 'Invoice', estimate: 'Estimate', proformaInvoice: 'Proforma Invoice',
  purchaseEstimate: 'Purchase Estimate', deliveryChallan: 'Delivery Challan',
  salesOrder: 'Sales Order', purchaseBill: 'Purchase Bill', purchaseOrder: 'Purchase Order',
};

interface ItemRow {
  [key: string]: string;
}

interface RenderContext {
  values: Record<string, string>;
  items: ItemRow[];
  cond: Record<string, string | boolean>;
}

/** One line/row of any transaction document, fed to the item table. */
export interface DocModelLine {
  description?: string | null;
  hsnCode?: string | null;
  quantity?: unknown;
  unit?: string | null;
  rate?: unknown;
  discount?: unknown;
  taxableValue?: unknown;
  gstRate?: unknown;
  cgst?: unknown;
  sgst?: unknown;
  igst?: unknown;
  total?: unknown;
}

/**
 * A normalised view of any printable transaction document (invoice, estimate,
 * delivery challan, purchase bill, …). The no-code renderer binds only against
 * this shape, so a single `PrintDesign` engine serves every doc kind. Each
 * concrete document is mapped into a `DocModel` by its controller.
 */
export interface DocModel {
  /** Field-key prefix for aliases, e.g. 'invoice' | 'estimate'. */
  prefix: string;
  /** Human label used in the QR payload, e.g. 'Invoice', 'Estimate'. */
  label: string;
  /** Pre-formatted document number, e.g. 'INV/2026-27/0001'. */
  number: string;
  date: Date;
  dueDate?: Date | null;
  placeOfSupply?: string | null;
  status: string;
  isInterState: boolean;
  company: {
    name: string;
    printName?: string | null;
    addressLine1?: string | null;
    addressLine2?: string | null;
    city?: string | null;
    pincode?: string | null;
    stateCode?: string | null;
    gstin?: string | null;
    phone?: string | null;
    email?: string | null;
    logo?: string | null;
  };
  party: Record<string, unknown>;
  totals: {
    subtotal?: unknown;
    discountTotal?: unknown;
    taxableAmount?: unknown;
    cgstAmount?: unknown;
    sgstAmount?: unknown;
    igstAmount?: unknown;
    roundOff?: unknown;
    total?: unknown;
  };
  lines: DocModelLine[];
}

/**
 * Renders a no-code `PrintDesign` (from the drag-and-drop editor) to a PDF using
 * PDFKit. Elements are absolutely positioned in millimetres; this service maps
 * them to PDF points, binds dynamic ERP data, flows the item table across pages
 * with repeating header/footer bands, and draws watermarks + page numbers.
 */
@Injectable()
export class DesignPdfService {
  /**
   * Entry point for any invoice-shaped document (invoice, estimate, proforma,
   * sales/purchase order, challan, …). Other doc types reuse the `FullInvoice`
   * shape via their `getForPdf`; `docKind` selects the number prefix + label.
   */
  async render(
    invoice: FullInvoice,
    design: PrintDesign,
    lang?: string,
    docKind = 'invoice',
  ): Promise<Buffer> {
    return this.renderDoc(this.invoiceToModel(invoice, docKind), design, lang);
  }

  /** Map a full invoice-shaped document into the generic model. */
  private invoiceToModel(invoice: FullInvoice, docKind = 'invoice'): DocModel {
    const prefix = DOC_PREFIX[docKind] ?? 'INV';
    return {
      prefix: docKind,
      label: DOC_LABEL[docKind] ?? 'Invoice',
      number: `${prefix}/${invoice.fiscalYear}/${String(invoice.invoiceNo).padStart(4, '0')}`,
      date: invoice.date,
      dueDate: invoice.dueDate,
      placeOfSupply: invoice.placeOfSupply,
      status: invoice.status,
      isInterState: !!invoice.isInterState,
      company: invoice.company,
      party: invoice.party as unknown as Record<string, unknown>,
      totals: {
        subtotal: invoice.subtotal,
        discountTotal: invoice.discountTotal,
        taxableAmount: invoice.taxableAmount,
        cgstAmount: invoice.cgstAmount,
        sgstAmount: invoice.sgstAmount,
        igstAmount: invoice.igstAmount,
        roundOff: invoice.roundOff,
        total: invoice.total,
      },
      lines: invoice.lines as unknown as DocModelLine[],
    };
  }

  /** Render any transaction document described by a `DocModel`. */
  async renderDoc(
    model: DocModel,
    design: PrintDesign,
    lang?: string,
  ): Promise<Buffer> {
    const dims = paperDimsMm(design.paper);
    const pageW = dims.w * MM_TO_PT;
    const pageH = dims.h * MM_TO_PT;
    const mm = (v: number) => v * MM_TO_PT;

    const doc = new PDFDocument({ size: [pageW, pageH], margin: 0 });
    const F = registerPdfFonts(doc, pdfLang(lang));
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    const finished = new Promise<Buffer>((resolve) =>
      doc.on('end', () => resolve(Buffer.concat(chunks))),
    );

    const ctx = await this.buildDocContext(model);

    // -- Partition elements by band, honouring visibility conditions ----------
    const visible = design.elements
      .filter((e) => !e.hidden && this.passes(e.condition, ctx.cond))
      .slice()
      .sort((a, b) => a.z - b.z);
    const header = visible.filter((e) => e.zone === 'header');
    const footer = visible.filter((e) => e.zone === 'footer');
    const body = visible.filter((e) => e.zone === 'body');
    const tableEl = body.find((e) => e.type === 'itemTable') ?? null;
    const bodyAbove = body.filter(
      (e) => !tableEl || e !== tableEl ? (!tableEl || e.y < tableEl.y) && e !== tableEl : false,
    );
    const bodyBelow = tableEl
      ? body.filter((e) => e !== tableEl && e.y >= tableEl.y + tableEl.h)
      : [];

    const headerH = design.bands.headerHeight;
    const footerTopMm = dims.h - design.bands.footerHeight;

    // -- Paginate the item table ----------------------------------------------
    const pages = this.paginate(tableEl, ctx.items, headerH, footerTopMm, dims.h);
    const totalPages = pages.length;

    for (let p = 0; p < totalPages; p++) {
      if (p > 0) doc.addPage({ size: [pageW, pageH], margin: 0 });
      const isLast = p === totalPages - 1;

      // background
      if (design.background && design.background !== '#ffffff') {
        doc.save().rect(0, 0, pageW, pageH).fill(design.background).restore();
      }
      // watermark (under content)
      this.drawWatermark(doc, design, ctx, pageW, pageH);

      // repeating bands
      for (const el of header) this.drawElement(doc, el, ctx, F, mm, 0);
      for (const el of footer) this.drawElement(doc, el, ctx, F, mm, 0);

      // body-above only on the first page
      if (p === 0) for (const el of bodyAbove) this.drawElement(doc, el, ctx, F, mm, 0);

      // the flowing table
      let tableBottomMm = tableEl ? tableEl.y + tableEl.h : 0;
      if (tableEl && pages[p].rows.length >= 0) {
        tableBottomMm = this.drawTable(doc, tableEl, pages[p], ctx, F, mm);
      }

      // body-below follows the actual table end, on the last page only
      if (isLast && tableEl) {
        const delta = tableBottomMm - (tableEl.y + tableEl.h);
        for (const el of bodyBelow) this.drawElement(doc, el, ctx, F, mm, delta);
      }

      // page numbers
      if (design.pageNumbers?.enabled) {
        const label = design.pageNumbers.format
          .replace('{n}', String(p + 1))
          .replace('{total}', String(totalPages));
        doc
          .font(F.regular)
          .fontSize(8)
          .fillColor('#888')
          .text(label, 0, footerTopMm * MM_TO_PT + 6, { width: pageW, align: 'center' });
      }
    }

    doc.end();
    return finished;
  }

  // -------------------------------------------------------------------------
  // Layout
  // -------------------------------------------------------------------------

  /** Split the item rows across pages given the table's vertical envelope. */
  private paginate(
    tableEl: DesignElement | null,
    items: ItemRow[],
    headerHMm: number,
    footerTopMm: number,
    _pageHMm: number,
  ): { rows: ItemRow[]; startYMm: number }[] {
    if (!tableEl) return [{ rows: [], startYMm: 0 }];
    const spec = tableEl.table!;
    const rowH = spec.rowHeight ?? 7;
    const headerRowH = rowH + 1;
    const pages: { rows: ItemRow[]; startYMm: number }[] = [];

    let idx = 0;
    let first = true;
    do {
      const startY = first ? tableEl.y : headerHMm;
      const avail = footerTopMm - startY - headerRowH;
      const cap = Math.max(1, Math.floor(avail / rowH));
      const slice = items.slice(idx, idx + cap);
      pages.push({ rows: slice, startYMm: startY });
      idx += cap;
      first = false;
    } while (idx < items.length);
    return pages;
  }

  // -------------------------------------------------------------------------
  // Element drawing
  // -------------------------------------------------------------------------

  private drawElement(
    doc: PDFKit.PDFDocument,
    el: DesignElement,
    ctx: RenderContext,
    F: PdfFonts,
    mm: (v: number) => number,
    offsetYmm: number,
  ): void {
    const x = mm(el.x);
    const y = mm(el.y + offsetYmm);
    const w = mm(el.w);
    const h = mm(el.h);
    const s = el.style ?? {};
    const opacity = s.opacity ?? 1;

    doc.save();
    if (opacity < 1) doc.opacity(opacity);
    if (el.rotation) doc.rotate(el.rotation, { origin: [x + w / 2, y + h / 2] });

    // box background + border (shapes & boxed text)
    const radius = mm(s.borderRadius ?? 0);
    const hasBox = !!s.bg || (!!s.borderColor && (s.borderWidth ?? 0) > 0);
    if (el.type === 'rect' || el.type === 'ellipse' || hasBox) {
      if (el.type === 'ellipse') {
        if (s.bg) doc.save().ellipse(x + w / 2, y + h / 2, w / 2, h / 2).fill(s.bg).restore();
        if (s.borderColor && (s.borderWidth ?? 0) > 0)
          doc.lineWidth(mm(s.borderWidth!)).ellipse(x + w / 2, y + h / 2, w / 2, h / 2).stroke(s.borderColor);
      } else {
        if (s.bg) {
          if (radius > 0) doc.save().roundedRect(x, y, w, h, radius).fill(s.bg).restore();
          else doc.save().rect(x, y, w, h).fill(s.bg).restore();
        }
        if (s.borderColor && (s.borderWidth ?? 0) > 0) {
          doc.lineWidth(mm(s.borderWidth!));
          if (radius > 0) doc.roundedRect(x, y, w, h, radius).stroke(s.borderColor);
          else doc.rect(x, y, w, h).stroke(s.borderColor);
        }
      }
    }

    switch (el.type) {
      case 'line': {
        doc
          .lineWidth(mm(s.borderWidth ?? 0.3))
          .moveTo(x, y)
          // a tall, thin box is a vertical line; otherwise horizontal
          .lineTo(w >= h ? x + w : x, w >= h ? y : y + h)
          .stroke(s.borderColor ?? s.color ?? '#000');
        break;
      }
      case 'text':
      case 'heading': {
        const value = this.resolveText(el, ctx);
        const pad = mm(s.padding ?? 0.5);
        doc
          .font(s.bold ? F.bold : F.regular)
          .fontSize(s.fontSize ?? (el.type === 'heading' ? 16 : 9))
          .fillColor(s.color ?? '#111111');
        const opts: PDFKit.Mixins.TextOptions = {
          width: w - pad * 2,
          align: s.align ?? 'left',
          lineGap: s.lineHeight ? (s.lineHeight - 1) * (s.fontSize ?? 9) : 0,
        };
        if (s.letterSpacing) (opts as { characterSpacing?: number }).characterSpacing = s.letterSpacing;
        doc.text(value, x + pad, y + pad, opts);
        break;
      }
      case 'image': {
        const buf = this.resolveImage(el, ctx);
        if (buf) {
          try {
            doc.image(buf, x, y, { fit: [w, h], align: 'center', valign: 'center' });
          } catch {
            /* unreadable image data — skip */
          }
        }
        break;
      }
      case 'qr': {
        const png = ctx.values['__qr__'];
        if (png) {
          try {
            doc.image(Buffer.from(png, 'base64'), x, y, { fit: [w, h] });
          } catch {
            /* ignore */
          }
        }
        break;
      }
      default:
        break;
    }
    doc.restore();
  }

  /** Draws the item table on one page; returns the bottom Y in mm. */
  private drawTable(
    doc: PDFKit.PDFDocument,
    el: DesignElement,
    page: { rows: ItemRow[]; startYMm: number },
    _ctx: RenderContext,
    F: PdfFonts,
    mm: (v: number) => number,
  ): number {
    const spec = el.table!;
    const cols = spec.columns;
    const totalW = cols.reduce((s, c) => s + (c.width || 1), 0);
    const tableW = el.w;
    const x0 = el.x;
    const rowH = spec.rowHeight ?? 7;
    const headerH = rowH + 1;
    const fs = spec.fontSize ?? 8;
    const border = spec.borderColor ?? '#cccccc';

    let yMm = page.startYMm;

    // header row
    doc.save().rect(mm(x0), mm(yMm), mm(tableW), mm(headerH)).fill(spec.headerBg ?? '#f1f5f9').restore();
    let cx = x0;
    doc.font(F.bold).fontSize(fs).fillColor(spec.headerColor ?? '#111111');
    for (const c of cols) {
      const cw = (c.width / totalW) * tableW;
      doc.text(c.label, mm(cx) + 3, mm(yMm) + (mm(headerH) - fs) / 2, {
        width: mm(cw) - 6,
        align: c.align ?? 'left',
      });
      cx += cw;
    }
    yMm += headerH;

    // body rows
    doc.font(F.regular).fontSize(fs).fillColor('#222222');
    page.rows.forEach((row, i) => {
      if (spec.zebra && i % 2 === 1) {
        doc.save().rect(mm(x0), mm(yMm), mm(tableW), mm(rowH)).fill(spec.zebraColor ?? '#f8fafc').restore();
      }
      let rx = x0;
      doc.fillColor('#222222');
      for (const c of cols) {
        const cw = (c.width / totalW) * tableW;
        doc.text(String(row[c.key] ?? ''), mm(rx) + 3, mm(yMm) + (mm(rowH) - fs) / 2, {
          width: mm(cw) - 6,
          align: c.align ?? 'left',
        });
        rx += cw;
      }
      yMm += rowH;
    });

    // grid: outer box, column separators, row separators
    const topMm = page.startYMm;
    doc.lineWidth(0.4).strokeColor(border);
    doc.rect(mm(x0), mm(topMm), mm(tableW), mm(yMm - topMm)).stroke();
    doc.moveTo(mm(x0), mm(topMm + headerH)).lineTo(mm(x0 + tableW), mm(topMm + headerH)).stroke();
    let sx = x0;
    for (let i = 0; i < cols.length - 1; i++) {
      sx += (cols[i].width / totalW) * tableW;
      doc.moveTo(mm(sx), mm(topMm)).lineTo(mm(sx), mm(yMm)).stroke();
    }
    for (let r = 0; r < page.rows.length; r++) {
      const ly = topMm + headerH + (r + 1) * rowH;
      doc.moveTo(mm(x0), mm(ly)).lineTo(mm(x0 + tableW), mm(ly)).stroke();
    }
    return yMm;
  }

  private drawWatermark(
    doc: PDFKit.PDFDocument,
    design: PrintDesign,
    ctx: RenderContext,
    pageW: number,
    pageH: number,
  ): void {
    const wm = design.watermark;
    if (!wm?.enabled || !this.passes(wm.condition, ctx.cond)) return;
    doc.save();
    doc.opacity(wm.opacity);
    doc.rotate(wm.rotation, { origin: [pageW / 2, pageH / 2] });
    doc
      .font('Helvetica-Bold')
      .fontSize(wm.fontSize)
      .fillColor(wm.color)
      .text(wm.text, 0, pageH / 2 - wm.fontSize / 2, { width: pageW, align: 'center' });
    doc.restore();
  }

  // -------------------------------------------------------------------------
  // Dynamic data
  // -------------------------------------------------------------------------

  private resolveText(el: DesignElement, ctx: RenderContext): string {
    if (el.field) return ctx.values[el.field] ?? '';
    const raw = el.text ?? '';
    return raw.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, key: string) => ctx.values[key] ?? '');
  }

  private resolveImage(el: DesignElement, ctx: RenderContext): Buffer | null {
    const src = el.src;
    if (!src) return null;
    if (src === 'logo') return this.dataUrlToBuffer(ctx.values['__logo__']);
    return this.dataUrlToBuffer(src);
  }

  private dataUrlToBuffer(src?: string): Buffer | null {
    if (!src) return null;
    const m = /^data:[^;]+;base64,(.+)$/.exec(src);
    if (m) return Buffer.from(m[1], 'base64');
    return null;
  }

  private passes(rule: VisibilityRule | undefined, cond: Record<string, string | boolean>): boolean {
    if (!rule) return true;
    const v = cond[rule.field];
    switch (rule.op) {
      case 'truthy':
        return !!v;
      case 'falsy':
        return !v;
      case 'ne':
        return String(v) !== String(rule.value);
      case 'eq':
      default:
        return String(v) === String(rule.value);
    }
  }

  private async buildDocContext(m: DocModel): Promise<RenderContext> {
    const c = m.company;
    const party = m.party;
    const t = m.totals;
    const num = (v: unknown) => Number(v ?? 0);
    const tax = num(t.cgstAmount) + num(t.sgstAmount) + num(t.igstAmount);
    const grand = num(t.total);

    const billingAddress = [
      party['addressLine1'],
      party['addressLine2'],
      [party['city'], party['pincode']].filter(Boolean).join(' - '),
    ]
      .filter(Boolean)
      .join(', ');

    const dateStr = m.date.toISOString().slice(0, 10);
    const values: Record<string, string> = {
      'company.name': (c.printName?.trim() || c.name) ?? '',
      'company.address': [
        c.addressLine1,
        c.addressLine2,
        [c.city, c.pincode].filter(Boolean).join(' - '),
      ]
        .filter(Boolean)
        .join(', '),
      'company.gstin': c.gstin ?? '',
      'company.phone': c.phone ?? '',
      'company.email': c.email ?? '',
      'company.stateName': stateNameForCode(c.stateCode ?? undefined) ?? '',
      'party.name': String(party['name'] ?? ''),
      'party.billingAddress': billingAddress,
      'party.gstin': String(party['gstin'] ?? ''),
      'party.phone': String(party['phone'] ?? ''),
      'totals.subtotal': inr(num(t.subtotal)),
      'totals.discount': inr(num(t.discountTotal)),
      'totals.taxable': inr(num(t.taxableAmount)),
      'totals.cgst': inr(num(t.cgstAmount)),
      'totals.sgst': inr(num(t.sgstAmount)),
      'totals.igst': inr(num(t.igstAmount)),
      'totals.tax': inr(tax),
      'totals.roundOff': inr(num(t.roundOff)),
      'totals.grandTotal': inr(grand),
      'totals.amountInWords': amountInWords(grand) || amountInWordsIntl(grand),
    };

    // Document header fields are exposed under both the generic `doc.*` keys and
    // a doc-kind-specific alias (`invoice.*`, `estimate.*`, …) so older
    // invoice templates keep resolving while new templates can use `doc.*`.
    const header: Record<string, string> = {
      number: m.number,
      date: dateStr,
      dueDate: m.dueDate ? m.dueDate.toISOString().slice(0, 10) : '',
      placeOfSupply: stateNameForCode(m.placeOfSupply ?? undefined) ?? m.placeOfSupply ?? '',
    };
    for (const [k, v] of Object.entries(header)) {
      values[`doc.${k}`] = v;
      values[`${m.prefix}.${k}`] = v;
    }

    values['__logo__'] = c.logo ?? '';
    const qrPayload = [
      `${m.label}: ${m.number}`,
      `Seller GSTIN: ${c.gstin ?? 'Unregistered'}`,
      `Date: ${dateStr}`,
      `Total: INR ${values['totals.grandTotal']}`,
    ].join('\n');
    try {
      const png = await QRCode.toBuffer(qrPayload, { width: 160, margin: 0 });
      values['__qr__'] = png.toString('base64');
    } catch {
      /* QR optional */
    }

    const items: ItemRow[] = m.lines.map((l, i) => {
      const lineTax = num(l.cgst) + num(l.sgst) + num(l.igst);
      return {
        srNo: String(i + 1),
        itemName: l.description ?? '',
        description: l.description ?? '',
        hsn: l.hsnCode ?? '',
        qty: String(num(l.quantity)),
        unit: l.unit ?? '',
        rate: inr(num(l.rate)),
        discount: String(num(l.discount ?? 0)),
        taxable: inr(num(l.taxableValue)),
        gstRate: `${num(l.gstRate)}%`,
        tax: inr(lineTax),
        amount: inr(num(l.total)),
      };
    });

    const cond: Record<string, string | boolean> = {
      gstEnabled: tax > 0,
      status: m.status,
      customerType: String(party['type'] ?? 'CUSTOMER'),
      isInterState: !!m.isInterState,
    };

    return { values, items, cond };
  }
}
