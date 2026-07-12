import { BadRequestException, Injectable } from '@nestjs/common';
import { InvoiceStatus, NoteType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/**
 * GSTR-1 in the GST portal's offline-tool JSON format — clients upload the
 * file at gst.gov.in (Returns → GSTR-1 → Prepare Offline) without needing a
 * GSP. Section coverage: B2B (4), B2CL (5), B2CS (7, net of unregistered
 * credit notes), CDNR (9B), HSN (12), doc_issue (13).
 * Known simplification: rate-0 lines are reported in their rate tables
 * rather than table 8 (nil-rated), matching common SME-tool behaviour.
 */

const r2 = (n: number) => Math.round(n * 100) / 100;

/** DD-MM-YYYY, the portal's date format. */
const gstDate = (d: Date) => {
  const iso = d.toISOString().slice(0, 10);
  return `${iso.slice(8, 10)}-${iso.slice(5, 7)}-${iso.slice(0, 4)}`;
};

/** Our units → GST UQC codes (Unit Quantity Codes). */
const UQC: Record<string, string> = {
  PCS: 'PCS-PIECES',
  NOS: 'NOS-NUMBERS',
  KG: 'KGS-KILOGRAMS',
  G: 'GMS-GRAMMES',
  MTR: 'MTR-METERS',
  CM: 'CMS-CENTIMETERS',
  LTR: 'LTR-LITRES',
  ML: 'MLT-MILILITRE',
  BOX: 'BOX-BOX',
  DOZ: 'DOZ-DOZENS',
  SET: 'SET-SETS',
  PAIR: 'PRS-PAIRS',
  ROLL: 'ROL-ROLLS',
  SQM: 'SQM-SQUARE METERS',
  BALE: 'BAL-BALE',
  BUNDLE: 'BDL-BUNDLES',
};

/** B2C invoices above this are reported invoice-wise (B2CL) when inter-state. */
const B2CL_THRESHOLD = 250000;

interface LineLite {
  hsnCode: string | null;
  unit: string;
  description: string;
  quantity: number;
  taxableValue: number;
  gstRate: number;
  cgst: number;
  sgst: number;
  igst: number;
}

interface RateBucket {
  txval: number;
  iamt: number;
  camt: number;
  samt: number;
}

/** Groups document lines by GST rate — the shape every section needs. */
function rateWise(lines: LineLite[]): Map<number, RateBucket> {
  const buckets = new Map<number, RateBucket>();
  for (const line of lines) {
    const rate = Number(line.gstRate);
    const bucket = buckets.get(rate) ?? { txval: 0, iamt: 0, camt: 0, samt: 0 };
    bucket.txval += Number(line.taxableValue);
    bucket.iamt += Number(line.igst);
    bucket.camt += Number(line.cgst);
    bucket.samt += Number(line.sgst);
    buckets.set(rate, bucket);
  }
  return buckets;
}

function itms(lines: LineLite[]) {
  return [...rateWise(lines).entries()].map(([rt, b], i) => ({
    num: (i + 1) * 1,
    itm_det: {
      rt,
      txval: r2(b.txval),
      iamt: r2(b.iamt),
      camt: r2(b.camt),
      samt: r2(b.samt),
      csamt: 0,
    },
  }));
}

@Injectable()
export class Gstr1JsonService {
  constructor(private readonly prisma: PrismaService) {}

  /** @param month "YYYY-MM" */
  async build(companyId: string, month: string) {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
      throw new BadRequestException('month must be YYYY-MM');
    }
    const company = await this.prisma.company.findUniqueOrThrow({
      where: { id: companyId },
      select: { gstin: true, stateCode: true, name: true },
    });
    if (!company.gstin) {
      throw new BadRequestException(
        'Set the company GSTIN before exporting GSTR-1',
      );
    }

    const [y, m] = month.split('-').map(Number);
    const from = new Date(Date.UTC(y, m - 1, 1));
    const to = new Date(Date.UTC(y, m, 0, 23, 59, 59));
    const inPeriod = { gte: from, lte: to };

    const [invoices, allInvoicesInPeriod, creditNotes, allNotesInPeriod] =
      await Promise.all([
        this.prisma.invoice.findMany({
          where: { companyId, status: InvoiceStatus.ISSUED, date: inPeriod },
          include: {
            party: { select: { name: true, gstin: true } },
            lines: true,
          },
          orderBy: [{ fiscalYear: 'asc' }, { invoiceNo: 'asc' }],
        }),
        // Cancelled ones too — doc_issue reports the series with gaps.
        this.prisma.invoice.findMany({
          where: { companyId, date: inPeriod },
          select: { invoiceNo: true, fiscalYear: true, status: true },
          orderBy: [{ fiscalYear: 'asc' }, { invoiceNo: 'asc' }],
        }),
        this.prisma.note.findMany({
          where: {
            companyId,
            type: NoteType.CREDIT_NOTE,
            status: InvoiceStatus.ISSUED,
            date: inPeriod,
          },
          include: {
            party: { select: { name: true, gstin: true } },
            lines: true,
          },
          orderBy: [{ fiscalYear: 'asc' }, { noteNo: 'asc' }],
        }),
        this.prisma.note.findMany({
          where: { companyId, date: inPeriod },
          select: { noteNo: true, fiscalYear: true, status: true, type: true },
          orderBy: [{ fiscalYear: 'asc' }, { noteNo: 'asc' }],
        }),
      ]);

    const pos = (p: string | null) => p ?? company.stateCode ?? '33';
    const invNo = (fy: string, no: number) =>
      `INV/${fy}/${String(no).padStart(4, '0')}`;

    // ---- B2B (table 4): registered buyers, grouped by their GSTIN ----
    const b2bMap = new Map<string, ReturnType<typeof buildInv>[]>();
    type Inv = (typeof invoices)[number];
    const buildInv = (inv: Inv) => ({
      inum: invNo(inv.fiscalYear, inv.invoiceNo),
      idt: gstDate(inv.date),
      val: r2(Number(inv.total)),
      pos: pos(inv.placeOfSupply),
      rchrg: 'N',
      inv_typ: 'R',
      itms: itms(inv.lines as unknown as LineLite[]),
    });
    for (const inv of invoices.filter((i) => i.party.gstin)) {
      const ctin = inv.party.gstin as string;
      const list = b2bMap.get(ctin) ?? [];
      list.push(buildInv(inv));
      b2bMap.set(ctin, list);
    }

    // ---- B2CL (table 5): unregistered, inter-state, above threshold.
    //      pos sits on the group; invoices carry inum/idt/val/itms only. ----
    const b2clMap = new Map<
      string,
      { inum: string; idt: string; val: number; itms: ReturnType<typeof itms> }[]
    >();
    const isB2cl = (inv: Inv) =>
      !inv.party.gstin && inv.isInterState && Number(inv.total) > B2CL_THRESHOLD;
    for (const inv of invoices.filter(isB2cl)) {
      const p = pos(inv.placeOfSupply);
      const list = b2clMap.get(p) ?? [];
      list.push({
        inum: invNo(inv.fiscalYear, inv.invoiceNo),
        idt: gstDate(inv.date),
        val: r2(Number(inv.total)),
        itms: itms(inv.lines as unknown as LineLite[]),
      });
      b2clMap.set(p, list);
    }

    // ---- B2CS (table 7): everything else unregistered, rate+pos wise,
    //      NET of unregistered credit notes ----
    const b2csMap = new Map<string, { sply_ty: string; pos: string; rt: number } & RateBucket>();
    const addB2cs = (
      placeOfSupply: string,
      interState: boolean,
      lines: LineLite[],
      sign: 1 | -1,
    ) => {
      for (const [rt, b] of rateWise(lines)) {
        const key = `${placeOfSupply}|${rt}|${interState ? 'INTER' : 'INTRA'}`;
        const entry =
          b2csMap.get(key) ??
          ({
            sply_ty: interState ? 'INTER' : 'INTRA',
            pos: placeOfSupply,
            rt,
            txval: 0,
            iamt: 0,
            camt: 0,
            samt: 0,
          } as { sply_ty: string; pos: string; rt: number } & RateBucket);
        entry.txval += sign * b.txval;
        entry.iamt += sign * b.iamt;
        entry.camt += sign * b.camt;
        entry.samt += sign * b.samt;
        b2csMap.set(key, entry);
      }
    };
    for (const inv of invoices.filter((i) => !i.party.gstin && !isB2cl(i))) {
      addB2cs(
        pos(inv.placeOfSupply),
        inv.isInterState,
        inv.lines as unknown as LineLite[],
        1,
      );
    }
    for (const note of creditNotes.filter((n) => !n.party.gstin)) {
      addB2cs(
        company.stateCode ?? '33',
        note.isInterState,
        note.lines as unknown as LineLite[],
        -1,
      );
    }

    // ---- CDNR (table 9B): credit notes to registered buyers ----
    const cdnrMap = new Map<
      string,
      {
        ntty: string;
        nt_num: string;
        nt_dt: string;
        pos: string;
        rchrg: string;
        inv_typ: string;
        val: number;
        itms: ReturnType<typeof itms>;
      }[]
    >();
    for (const note of creditNotes.filter((n) => n.party.gstin)) {
      const ctin = note.party.gstin as string;
      const list = cdnrMap.get(ctin) ?? [];
      list.push({
        ntty: 'C',
        nt_num: `CRN/${note.fiscalYear}/${String(note.noteNo).padStart(4, '0')}`,
        nt_dt: gstDate(note.date),
        pos: company.stateCode ?? '33',
        rchrg: 'N',
        inv_typ: 'R',
        val: r2(Number(note.total)),
        itms: itms(note.lines as unknown as LineLite[]),
      });
      cdnrMap.set(ctin, list);
    }

    // ---- HSN summary (table 12): invoices minus credit notes ----
    const hsnMap = new Map<
      string,
      { desc: string; uqc: string; qty: number; rt: number } & RateBucket
    >();
    const addHsn = (lines: LineLite[], sign: 1 | -1) => {
      for (const line of lines) {
        const hsn = line.hsnCode ?? '';
        if (!hsn) continue; // portal rejects blank HSN rows
        const rt = Number(line.gstRate);
        const key = `${hsn}|${line.unit}|${rt}`;
        const entry =
          hsnMap.get(key) ??
          ({
            desc: line.description.slice(0, 30),
            uqc: UQC[line.unit] ?? 'OTH-OTHERS',
            qty: 0,
            rt,
            txval: 0,
            iamt: 0,
            camt: 0,
            samt: 0,
          } as { desc: string; uqc: string; qty: number; rt: number } & RateBucket);
        entry.qty += sign * Number(line.quantity);
        entry.txval += sign * Number(line.taxableValue);
        entry.iamt += sign * Number(line.igst);
        entry.camt += sign * Number(line.cgst);
        entry.samt += sign * Number(line.sgst);
        hsnMap.set(key, entry);
      }
    };
    for (const inv of invoices) addHsn(inv.lines as unknown as LineLite[], 1);
    for (const note of creditNotes) addHsn(note.lines as unknown as LineLite[], -1);

    // ---- doc_issue (table 13): document series with cancellations ----
    const series = (
      docs: { no: number; fy: string; cancelled: boolean }[],
      prefix: string,
    ) => {
      if (docs.length === 0) return [];
      const byFy = new Map<string, { no: number; cancelled: boolean }[]>();
      for (const d of docs) {
        const list = byFy.get(d.fy) ?? [];
        list.push(d);
        byFy.set(d.fy, list);
      }
      return [...byFy.entries()].map(([fy, list], i) => {
        const nos = list.map((d) => d.no);
        const cancelled = list.filter((d) => d.cancelled).length;
        return {
          num: i + 1,
          from: `${prefix}/${fy}/${String(Math.min(...nos)).padStart(4, '0')}`,
          to: `${prefix}/${fy}/${String(Math.max(...nos)).padStart(4, '0')}`,
          totnum: list.length,
          cancel: cancelled,
          net_issue: list.length - cancelled,
        };
      });
    };
    const docDet: { doc_num: number; docs: ReturnType<typeof series> }[] = [];
    const invSeries = series(
      allInvoicesInPeriod.map((i) => ({
        no: i.invoiceNo,
        fy: i.fiscalYear,
        cancelled: i.status === InvoiceStatus.CANCELLED,
      })),
      'INV',
    );
    if (invSeries.length) docDet.push({ doc_num: 1, docs: invSeries });
    const crnSeries = series(
      allNotesInPeriod
        .filter((n) => n.type === NoteType.CREDIT_NOTE)
        .map((n) => ({
          no: n.noteNo,
          fy: n.fiscalYear,
          cancelled: n.status === InvoiceStatus.CANCELLED,
        })),
      'CRN',
    );
    if (crnSeries.length) docDet.push({ doc_num: 5, docs: crnSeries });
    const dbnSeries = series(
      allNotesInPeriod
        .filter((n) => n.type === NoteType.DEBIT_NOTE)
        .map((n) => ({
          no: n.noteNo,
          fy: n.fiscalYear,
          cancelled: n.status === InvoiceStatus.CANCELLED,
        })),
      'DBN',
    );
    if (dbnSeries.length) docDet.push({ doc_num: 4, docs: dbnSeries });

    const fp = `${String(m).padStart(2, '0')}${y}`;
    const json: Record<string, unknown> = {
      gstin: company.gstin,
      fp,
      version: 'GST3.1.6',
      hash: 'hash',
    };
    if (b2bMap.size) {
      json.b2b = [...b2bMap.entries()].map(([ctin, inv]) => ({ ctin, inv }));
    }
    if (b2clMap.size) {
      json.b2cl = [...b2clMap.entries()].map(([p, inv]) => ({ pos: p, inv }));
    }
    const b2cs = [...b2csMap.values()]
      .filter((e) => Math.abs(e.txval) > 0.005)
      .map((e) => ({
        sply_ty: e.sply_ty,
        pos: e.pos,
        typ: 'OS',
        rt: e.rt,
        txval: r2(e.txval),
        iamt: r2(e.iamt),
        camt: r2(e.camt),
        samt: r2(e.samt),
        csamt: 0,
      }));
    if (b2cs.length) json.b2cs = b2cs;
    if (cdnrMap.size) {
      json.cdnr = [...cdnrMap.entries()].map(([ctin, nt]) => ({ ctin, nt }));
    }
    if (hsnMap.size) {
      json.hsn = {
        data: [...hsnMap.entries()].map(([key, e], i) => ({
          num: i + 1,
          hsn_sc: key.split('|')[0],
          desc: e.desc,
          uqc: e.uqc,
          qty: r2(e.qty),
          rt: e.rt,
          txval: r2(e.txval),
          iamt: r2(e.iamt),
          camt: r2(e.camt),
          samt: r2(e.samt),
          csamt: 0,
        })),
      };
    }
    if (docDet.length) json.doc_issue = { doc_det: docDet };

    return {
      fileName: `gstr1-${fp}`,
      json,
      summary: {
        period: month,
        b2bInvoices: invoices.filter((i) => i.party.gstin).length,
        b2clInvoices: invoices.filter(isB2cl).length,
        b2csEntries: b2cs.length,
        creditNotes: creditNotes.length,
        hsnRows: hsnMap.size,
      },
    };
  }
}
