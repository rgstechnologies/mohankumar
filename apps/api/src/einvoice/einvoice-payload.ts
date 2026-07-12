import type { Company, Invoice, InvoiceLine, Party, Prisma } from '@prisma/client';

/**
 * Builds the GST e-invoice (IRP) JSON for an invoice. Shape follows the
 * official e-invoice schema v1.1 (subset). Pure + deterministic so it can be
 * unit-tested and replayed; the network call lives in the provider.
 */

export type EInvoiceInput = Invoice & {
  company: Company;
  party: Party;
  lines: InvoiceLine[];
};

const n2 = (d: Prisma.Decimal | number) => Math.round(Number(d) * 100) / 100;
const ddmmyyyy = (d: Date) => {
  const iso = d.toISOString().slice(0, 10); // YYYY-MM-DD
  const [y, m, day] = iso.split('-');
  return `${day}/${m}/${y}`;
};
const pin = (p: string | null | undefined) => {
  const digits = (p ?? '').replace(/\D/g, '');
  return digits.length === 6 ? Number(digits) : 999999;
};

export interface EInvoicePayload {
  Version: '1.1';
  TranDtls: { TaxSch: 'GST'; SupTyp: string; RegRev: 'N'; IgstOnIntra: 'N' };
  DocDtls: { Typ: 'INV'; No: string; Dt: string };
  SellerDtls: Record<string, string | number>;
  BuyerDtls: Record<string, string | number>;
  ItemList: Array<Record<string, string | number>>;
  ValDtls: Record<string, number>;
}

export function buildEInvoicePayload(
  invoice: EInvoiceInput,
  displayNo: string,
): EInvoicePayload {
  const c = invoice.company;
  const p = invoice.party;
  const interState = invoice.isInterState;

  return {
    Version: '1.1',
    TranDtls: {
      TaxSch: 'GST',
      SupTyp: 'B2B',
      RegRev: 'N',
      IgstOnIntra: 'N',
    },
    DocDtls: {
      Typ: 'INV',
      No: displayNo,
      Dt: ddmmyyyy(invoice.date),
    },
    SellerDtls: {
      Gstin: c.gstin ?? '',
      LglNm: c.legalName ?? c.name,
      Addr1: c.addressLine1 ?? c.name,
      Loc: c.city ?? '',
      Pin: pin(c.pincode),
      Stcd: c.stateCode ?? '',
    },
    BuyerDtls: {
      Gstin: p.gstin ?? 'URP',
      LglNm: p.name,
      Pos: invoice.placeOfSupply ?? p.stateCode ?? c.stateCode ?? '',
      Addr1: p.addressLine1 ?? p.name,
      Loc: p.city ?? '',
      Pin: pin(p.pincode),
      Stcd: p.stateCode ?? '',
    },
    ItemList: invoice.lines.map((l, i) => {
      const ass = n2(l.taxableValue);
      const rate = Number(l.gstRate);
      return {
        SlNo: String(i + 1),
        PrdDesc: l.description.slice(0, 300),
        IsServc: 'N',
        HsnCd: l.hsnCode ?? '',
        Qty: n2(l.quantity),
        Unit: l.unit,
        UnitPrice: n2(l.rate),
        TotAmt: ass,
        AssAmt: ass,
        GstRt: rate,
        IgstAmt: interState ? n2(l.igst) : 0,
        CgstAmt: interState ? 0 : n2(l.cgst),
        SgstAmt: interState ? 0 : n2(l.sgst),
        TotItemVal: n2(l.total),
      };
    }),
    ValDtls: {
      AssVal: n2(invoice.taxableAmount),
      CgstVal: n2(invoice.cgstAmount),
      SgstVal: n2(invoice.sgstAmount),
      IgstVal: n2(invoice.igstAmount),
      RndOffAmt: n2(invoice.roundOff),
      TotInvVal: n2(invoice.total),
    },
  };
}
