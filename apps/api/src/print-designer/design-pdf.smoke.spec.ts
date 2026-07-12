import { blankDesign, type PrintDesign, type DesignElement } from '@bookly/shared';
import { DesignPdfService } from './design-pdf.service';
import type { FullInvoice } from '../invoices/invoice-pdf.service';

function mockInvoice(lineCount: number): FullInvoice {
  const d = (n: number) => n as unknown as never;
  const lines = Array.from({ length: lineCount }, (_, i) => ({
    id: `l${i}`,
    invoiceId: 'inv',
    lineNo: i + 1,
    itemId: null,
    description: `Sample item ${i + 1} with a fairly long name`,
    hsnCode: '5208',
    quantity: d(10),
    unit: 'PCS',
    rate: d(120),
    discount: d(0),
    taxableValue: d(1200),
    gstRate: d(5),
    cgst: d(30),
    sgst: d(30),
    igst: d(0),
    total: d(1260),
  }));
  return {
    id: 'inv',
    companyId: 'c',
    invoiceNo: 1,
    fiscalYear: '2026-27',
    date: new Date('2026-06-23'),
    dueDate: new Date('2026-07-08'),
    placeOfSupply: '33',
    isInterState: false,
    subtotal: d(lineCount * 1200),
    discountTotal: d(0),
    taxableAmount: d(lineCount * 1200),
    cgstAmount: d(lineCount * 30),
    sgstAmount: d(lineCount * 30),
    igstAmount: d(0),
    roundOff: d(0),
    total: d(lineCount * 1260),
    status: 'ISSUED',
    company: {
      name: 'Acme Textiles', printName: 'Acme Textiles', gstin: '33ABCDE1234F1Z5',
      addressLine1: '12 Mill Road', addressLine2: null, city: 'Coimbatore',
      pincode: '641001', stateCode: '33', phone: '99999 88888', email: 'hi@acme.test', logo: null,
    },
    party: {
      name: 'Sample Customer', type: 'CUSTOMER', addressLine1: '1 Market St',
      city: 'Chennai', pincode: '600001', gstin: '33ZZZZZ9999Z1Z0',
    },
    lines,
  } as unknown as FullInvoice;
}

function sampleDesign(): PrintDesign {
  const base = blankDesign();
  const el = (e: Partial<DesignElement> & { type: DesignElement['type']; id: string }): DesignElement => ({
    x: 10, y: 10, w: 50, h: 8, zone: 'body', z: 0, style: {}, ...e,
  });
  const els: DesignElement[] = [
    el({ id: 'title', type: 'heading', text: 'TAX INVOICE', x: 10, y: 8, w: 190, h: 12, zone: 'header', z: 1, style: { fontSize: 18, bold: true, align: 'center', color: '#0f172a' } }),
    el({ id: 'cname', type: 'text', field: 'company.name', x: 10, y: 24, w: 100, h: 6, zone: 'header', z: 2, style: { fontSize: 11, bold: true } }),
    el({ id: 'gstin', type: 'text', text: 'GSTIN: {{company.gstin}}', x: 10, y: 30, w: 120, h: 5, zone: 'header', z: 2, style: { fontSize: 8 } }),
    el({ id: 'billto', type: 'text', text: 'Bill To: {{party.name}}', x: 10, y: 50, w: 120, h: 6, zone: 'body', z: 1, style: { fontSize: 9, bold: true } }),
    el({
      id: 'tbl', type: 'itemTable', x: 10, y: 60, w: 190, h: 40, zone: 'body', z: 1, style: {},
      table: {
        columns: [
          { key: 'srNo', label: '#', width: 1, align: 'center' },
          { key: 'itemName', label: 'Item', width: 6 },
          { key: 'qty', label: 'Qty', width: 2, align: 'right' },
          { key: 'rate', label: 'Rate', width: 2, align: 'right' },
          { key: 'amount', label: 'Amount', width: 3, align: 'right' },
        ],
        zebra: true, rowHeight: 7, fontSize: 8,
      },
    }),
    el({ id: 'gt', type: 'text', text: 'Grand Total: Rs {{totals.grandTotal}}', x: 110, y: 105, w: 90, h: 8, zone: 'body', z: 2, style: { fontSize: 11, bold: true, align: 'right' } }),
    el({ id: 'words', type: 'text', field: 'totals.amountInWords', x: 10, y: 105, w: 95, h: 10, zone: 'body', z: 1, style: { fontSize: 8 } }),
    el({ id: 'ftr', type: 'text', text: 'Thank you for your business.', x: 10, y: 280, w: 190, h: 6, zone: 'footer', z: 1, style: { fontSize: 8, align: 'center', color: '#64748b' } }),
  ];
  base.elements = els;
  base.pageNumbers = { enabled: true, format: 'Page {n} of {total}' };
  return base;
}

describe('DesignPdfService', () => {
  const svc = new DesignPdfService();

  it('renders a single-page PDF for a short invoice', async () => {
    const buf = await svc.render(mockInvoice(3), sampleDesign(), 'en');
    expect(buf.length).toBeGreaterThan(1000);
    expect(buf.subarray(0, 5).toString()).toBe('%PDF-');
  });

  it('paginates the item table for a long invoice', async () => {
    const buf = await svc.render(mockInvoice(60), sampleDesign(), 'en');
    expect(buf.length).toBeGreaterThan(1000);
    // crude page count: number of "/Type /Page" occurrences (not /Pages)
    const text = buf.toString('latin1');
    const pageCount = (text.match(/\/Type\s*\/Page[^s]/g) || []).length;
    expect(pageCount).toBeGreaterThanOrEqual(2);
  });

  it('honours a watermark with a passing condition', async () => {
    const design = sampleDesign();
    design.watermark = { enabled: true, text: 'PAID', color: '#16a34a', opacity: 0.1, rotation: -30, fontSize: 100, condition: { field: 'gstEnabled', op: 'truthy' } };
    const buf = await svc.render(mockInvoice(2), design, 'en');
    expect(buf.subarray(0, 5).toString()).toBe('%PDF-');
  });
});
