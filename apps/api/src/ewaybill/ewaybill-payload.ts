import type { Company, Invoice, InvoiceLine, Party, Prisma } from '@prisma/client';
import type { GenerateEWayBillDto } from './dto/ewaybill.dto';

/**
 * Builds the GST e-way bill (EWB) JSON. Shape follows the official EWB schema
 * (subset): Part-A (parties, document, item list, value) + Part-B (transport).
 */

export type EWayBillInput = Invoice & {
  company: Company;
  party: Party;
  lines: InvoiceLine[];
};

const TRANS_MODE_CODE: Record<string, string> = {
  ROAD: '1',
  RAIL: '2',
  AIR: '3',
  SHIP: '4',
};

const n2 = (d: Prisma.Decimal | number) => Math.round(Number(d) * 100) / 100;
const ddmmyyyy = (d: Date) => {
  const [y, m, day] = d.toISOString().slice(0, 10).split('-');
  return `${day}/${m}/${y}`;
};
const pin = (p: string | null | undefined) => {
  const digits = (p ?? '').replace(/\D/g, '');
  return digits.length === 6 ? Number(digits) : 999999;
};

export interface EWayBillPayload {
  supplyType: 'O';
  subSupplyType: '1';
  docType: 'INV';
  docNo: string;
  docDate: string;
  fromGstin: string;
  fromPincode: number;
  fromStateCode: string;
  toGstin: string;
  toPincode: number;
  toStateCode: string;
  totInvValue: number;
  itemList: Array<Record<string, string | number>>;
  transMode: string;
  transDistance: number;
  vehicleNo?: string;
  transporterId?: string;
  transporterName?: string;
  transDocNo?: string;
  transDocDate?: string;
}

export function buildEWayBillPayload(
  invoice: EWayBillInput,
  displayNo: string,
  dto: GenerateEWayBillDto,
): EWayBillPayload {
  const c = invoice.company;
  const p = invoice.party;
  const interState = invoice.isInterState;
  return {
    supplyType: 'O',
    subSupplyType: '1',
    docType: 'INV',
    docNo: displayNo,
    docDate: ddmmyyyy(invoice.date),
    fromGstin: c.gstin ?? 'URP',
    fromPincode: pin(c.pincode),
    fromStateCode: c.stateCode ?? '',
    toGstin: p.gstin ?? 'URP',
    toPincode: pin(p.pincode),
    toStateCode: p.stateCode ?? c.stateCode ?? '',
    totInvValue: n2(invoice.total),
    itemList: invoice.lines.map((l, i) => ({
      itemNo: i + 1,
      productName: l.description.slice(0, 100),
      hsnCode: l.hsnCode ?? '',
      quantity: n2(l.quantity),
      qtyUnit: l.unit,
      taxableAmount: n2(l.taxableValue),
      gstRate: Number(l.gstRate),
      igstAmount: interState ? n2(l.igst) : 0,
      cgstAmount: interState ? 0 : n2(l.cgst),
      sgstAmount: interState ? 0 : n2(l.sgst),
    })),
    transMode: TRANS_MODE_CODE[dto.transportMode] ?? '1',
    transDistance: dto.distanceKm,
    vehicleNo: dto.vehicleNo,
    transporterId: dto.transporterId,
    transporterName: dto.transporterName,
    transDocNo: dto.transportDocNo,
    transDocDate: dto.transportDocDate ? ddmmyyyy(new Date(dto.transportDocDate)) : undefined,
  };
}
