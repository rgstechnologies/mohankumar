'use client';

import { api } from './api';

export interface AccountGroup {
  id: string;
  name: string;
  nature: 'ASSET' | 'LIABILITY' | 'INCOME' | 'EXPENSE';
  children: AccountGroup[];
}

export interface LedgerRow {
  id: string;
  name: string;
  isSystem: boolean;
  openingBalance: number;
  group: { name: string; nature: string };
  balance: number;
  balanceType: 'DEBIT' | 'CREDIT';
}

export interface VoucherLineView {
  lineNo: number;
  ledgerId: string;
  ledgerName: string;
  type: 'DEBIT' | 'CREDIT';
  amount: number;
}

export interface VoucherView {
  id: string;
  type: string;
  voucherNo: string;
  date: string;
  narration: string | null;
  status: 'ACTIVE' | 'CANCELLED';
  lines: VoucherLineView[];
  totalAmount: number;
}

export const VOUCHER_TYPES = [
  'JOURNAL',
  'PAYMENT',
  'RECEIPT',
  'CONTRA',
  'SALES',
  'PURCHASE',
] as const;

export interface PartyRow {
  id: string;
  type: 'CUSTOMER' | 'VENDOR';
  name: string;
  aliasName: string | null;
  gstin: string | null;
  stateCode: string | null;
  state: string | null;
  email: string | null;
  phone: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  pincode: string | null;
  ledgerId: string;
  /** Strict document-based outstanding (estimate/invoice etc.) — what every
   *  balance display shows. `balance`/`balanceType` is the raw ledger net. */
  outstanding: number;
  docType: 'invoice' | 'estimate';
  /** Per-party override; null = inherits the company default. */
  balanceDocType: 'invoice' | 'estimate' | null;
  balance: number;
  balanceType: 'DEBIT' | 'CREDIT';
  loyaltyPoints: number;
}

/** Full party record (includes the heavy base64 image), fetched on demand. */
export interface PartyDetail {
  id: string;
  type: 'CUSTOMER' | 'VENDOR';
  name: string;
  aliasName: string | null;
  gstin: string | null;
  stateCode: string | null;
  state: string | null;
  email: string | null;
  phone: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  pincode: string | null;
  image: string | null;
  loyaltyPoints: number;
  balanceDocType: 'invoice' | 'estimate' | null;
  ledger: { id: string; name: string };
  /** Resolved tracked doc type + document-based outstanding for this party. */
  docType: 'invoice' | 'estimate';
  outstanding: number;
  documents: {
    id: string;
    no: string;
    date: string;
    total: number;
    paid: number;
    outstanding: number;
  }[];
}

export const fetchParty = (companyId: string, partyId: string) =>
  api.get<PartyDetail>(`/companies/${companyId}/parties/${partyId}`);

/** A party's document-based statement (its tracked doc type only). */
export interface PartyStatement {
  party: { id: string; name: string; type: 'CUSTOMER' | 'VENDOR' };
  docType: 'invoice' | 'estimate';
  outstanding: number;
  documents: {
    id: string;
    no: string;
    date: string;
    total: number;
    paid: number;
    outstanding: number;
  }[];
}

export const fetchPartyStatement = (companyId: string, partyId: string) =>
  api.get<PartyStatement>(`/companies/${companyId}/parties/${partyId}/statement`);

export interface PartyPaymentView {
  id: string;
  direction: 'RECEIPT' | 'PAYMENT';
  date: string;
  amount: number;
  method: string;
  reference: string | null;
  note: string | null;
  estimateId: string | null;
  purchaseEstimateId?: string | null;
  advanceRef: string | null;
}

export const fetchPartyPayments = (companyId: string, partyId: string) =>
  api.get<PartyPaymentView[]>(`/companies/${companyId}/parties/${partyId}/payments`);

export const deletePartyPayment = (
  companyId: string,
  partyId: string,
  paymentId: string,
) =>
  api.delete<{ ok: boolean }>(
    `/companies/${companyId}/parties/${partyId}/payments/${paymentId}`,
  );

export interface ItemRow {
  id: string;
  name: string;
  sku: string | null;
  hsnCode: string | null;
  unit: string;
  gstRate: number;
  salePrice: number | null;
  purchasePrice: number | null;
  openingStock: number;
  reorderLevel: number | null;
  barcode: string | null;
  trackBatches: boolean;
  customFields: ItemCustomField[] | null;
  parentItemId: string | null;
  variantLabel: string | null;
}

export interface ItemCustomField {
  name: string;
  value: string;
}

export interface BankAccountRow {
  id: string;
  ledgerId: string;
  accountName: string;
  bankName: string | null;
  accountNo: string | null;
  ifsc: string | null;
  branch: string | null;
  upiId: string | null;
  isDefault: boolean;
}

export const fetchBanks = (companyId: string) =>
  api.get<BankAccountRow[]>(`/companies/${companyId}/banks`);

export interface BatchStock {
  id: string;
  batchNo: string;
  expiryDate: string | null;
  qty: number;
  expired: boolean;
  expiringSoon: boolean;
}

export const fetchItemBatches = (companyId: string, itemId: string) =>
  api.get<BatchStock[]>(`/companies/${companyId}/items/${itemId}/batches`);

export const GST_RATES = [0, 0.25, 3, 5, 12, 18, 28] as const;

export const ITEM_UNITS = [
  'PCS', 'NOS', 'KG', 'G', 'MTR', 'CM', 'LTR', 'ML',
  'BOX', 'DOZ', 'SET', 'PAIR', 'ROLL', 'SQM', 'BALE', 'BUNDLE',
] as const;

export interface InvoiceLineView {
  lineNo: number;
  itemId?: string | null;
  description: string;
  hsnCode: string | null;
  unit: string;
  quantity: number;
  rate: number;
  discountPct: number;
  taxableValue: number;
  gstRate: number;
  cgst: number;
  sgst: number;
  igst: number;
  total: number;
}

export interface InvoiceView {
  id: string;
  invoiceNo: string;
  date: string;
  dueDate: string | null;
  isInterState: boolean;
  status: 'ISSUED' | 'CANCELLED';
  party: { id: string; name: string; gstin: string | null };
  branch: { id: string; name: string } | null;
  taxableAmount: number;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  roundOff: number;
  total: number;
  loyaltyDiscount: number;
  loyaltyPointsRedeemed: number;
  paidAmount: number;
  outstanding: number;
  paymentStatus: 'UNPAID' | 'PARTIAL' | 'PAID' | 'CANCELLED';
  eInvoice: { status: 'GENERATED' | 'CANCELLED'; irn: string } | null;
  eWayBill: { status: 'GENERATED' | 'CANCELLED'; ewbNo: string } | null;
  lines: InvoiceLineView[];
}

export type EstimateStatus =
  | 'OPEN'
  | 'ACCEPTED'
  | 'DECLINED'
  | 'CONVERTED'
  | 'CANCELLED';

export interface EstimateView {
  id: string;
  estimateNo: string;
  date: string;
  validUntil: string | null;
  isInterState: boolean;
  status: EstimateStatus;
  isExpired: boolean;
  isTaxed: boolean;
  isBooked: boolean;
  advanceReceived: number;
  party: { id: string; name: string; gstin: string | null };
  branch: { id: string; name: string } | null;
  invoice: { id: string; invoiceNo: string } | null;
  subtotal: number;
  taxableAmount: number;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  roundOff: number;
  total: number;
  notes: string | null;
  lines: InvoiceLineView[];
}

export interface ProformaInvoiceView {
  id: string;
  proformaNo: string;
  date: string;
  validUntil: string | null;
  isInterState: boolean;
  status: EstimateStatus;
  isExpired: boolean;
  party: { id: string; name: string; gstin: string | null };
  branch: { id: string; name: string } | null;
  invoice: { id: string; invoiceNo: string } | null;
  subtotal: number;
  taxableAmount: number;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  roundOff: number;
  total: number;
  notes: string | null;
  lines: InvoiceLineView[];
}

export interface DeliveryChallanView {
  id: string;
  challanNo: string;
  date: string;
  isInterState: boolean;
  status: EstimateStatus;
  vehicleNo: string | null;
  party: { id: string; name: string; gstin: string | null };
  branch: { id: string; name: string } | null;
  invoice: { id: string; invoiceNo: string } | null;
  subtotal: number;
  taxableAmount: number;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  roundOff: number;
  total: number;
  notes: string | null;
  lines: InvoiceLineView[];
}

export interface SalesOrderView {
  id: string;
  orderNo: string;
  date: string;
  expectedDate: string | null;
  isInterState: boolean;
  status: EstimateStatus;
  isOverdue: boolean;
  party: { id: string; name: string; gstin: string | null };
  branch: { id: string; name: string } | null;
  invoice: { id: string; invoiceNo: string } | null;
  subtotal: number;
  taxableAmount: number;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  roundOff: number;
  total: number;
  notes: string | null;
  lines: InvoiceLineView[];
}

export interface ExpenseEntry {
  id: string;
  kind: 'EXPENSE' | 'INCOME';
  voucherNo: string;
  date: string;
  category: string;
  account: string;
  amount: number;
  narration: string | null;
  status: 'ACTIVE' | 'CANCELLED';
}

export interface ChequeView {
  id: string;
  direction: 'RECEIVED' | 'ISSUED';
  chequeNo: string;
  bankName: string | null;
  amount: number;
  chequeDate: string;
  status: 'PENDING' | 'CLEARED' | 'BOUNCED' | 'CANCELLED';
  clearedDate: string | null;
  notes: string | null;
  party: { id: string; name: string } | null;
  partyName: string;
  branch: { id: string; name: string } | null;
  isOverdue: boolean;
}

export interface StockRow {
  itemId: string;
  name: string;
  sku: string | null;
  unit: string;
  hsnCode: string | null;
  barcode: string | null;
  trackBatches: boolean;
  batches: { batchNo: string; expiryDate: string | null; qty: number; expired: boolean; expiringSoon: boolean }[];
  openingStock: number;
  purchasedQty: number;
  soldQty: number;
  onHand: number;
  avgRate: number;
  stockValue: number;
  reorderLevel: number | null;
  lowStock: boolean;
}

export interface NoteView {
  id: string;
  type: 'CREDIT_NOTE' | 'DEBIT_NOTE';
  noteNo: string;
  date: string;
  reason: string | null;
  status: 'ISSUED' | 'CANCELLED';
  party: { name: string };
  against: string | null;
  taxableAmount: number;
  total: number;
}

export interface BranchRow {
  id: string;
  name: string;
  city: string | null;
  isActive: boolean;
}

export const fetchBranches = (companyId: string) =>
  api.get<BranchRow[]>(`/companies/${companyId}/branches`);

export interface BranchStockMatrix {
  locations: { id: string; name: string; isActive: boolean }[];
  rows: {
    itemId: string;
    name: string;
    unit: string;
    trackBatches: boolean;
    quantities: Record<string, number>;
    total: number;
  }[];
}

export interface StockTransferLineView {
  lineNo: number;
  itemId: string;
  itemName: string;
  unit: string;
  batchNo: string | null;
  quantity: number;
}

export interface StockTransferView {
  id: string;
  transferNo: string;
  date: string;
  narration: string | null;
  status: 'ISSUED' | 'CANCELLED';
  fromBranch: { id: string; name: string } | null;
  toBranch: { id: string; name: string } | null;
  lines: StockTransferLineView[];
}

export const fetchNotes = (companyId: string) =>
  api.get<NoteView[]>(`/companies/${companyId}/notes`);

export const fetchStock = (companyId: string) =>
  api.get<StockRow[]>(`/companies/${companyId}/stock`);

export const fetchInvoices = (companyId: string) =>
  api.get<InvoiceView[]>(`/companies/${companyId}/invoices`);

export const fetchEstimates = (companyId: string) =>
  api.get<EstimateView[]>(`/companies/${companyId}/estimates`);

export const fetchParties = (companyId: string) =>
  api.get<PartyRow[]>(`/companies/${companyId}/parties`);

export const fetchItems = (companyId: string) =>
  api.get<ItemRow[]>(`/companies/${companyId}/items`);

export const fetchGroups = (companyId: string) =>
  api.get<AccountGroup[]>(`/companies/${companyId}/account-groups`);

export const fetchLedgers = (companyId: string) =>
  api.get<LedgerRow[]>(`/companies/${companyId}/ledgers`);

export const fetchVouchers = (companyId: string) =>
  api.get<VoucherView[]>(`/companies/${companyId}/vouchers`);

export function flattenGroups(
  groups: AccountGroup[],
  prefix = '',
): { id: string; label: string }[] {
  return groups.flatMap((g) => [
    { id: g.id, label: prefix ? `${prefix} › ${g.name}` : g.name },
    ...flattenGroups(g.children, prefix ? `${prefix} › ${g.name}` : g.name),
  ]);
}

export const inr = (n: number) =>
  n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// ----------------------------------------------------------------- GSTIN Lookup

export interface GstinDetails {
  gstin: string;
  legalName: string;
  tradeName: string;
  status: string;
  dealerType: string;
  constitutionOfBusiness: string;
  registrationDate: string;
  lastUpdated: string;
  einvoiceEnabled: boolean;
  address: {
    building: string;
    street: string;
    city: string;
    district: string;
    state: string;
    pincode: string;
  } | null;
}

/** Calls the backend Sandbox.co.in GSTIN search endpoint. */
export const resolveGstin = (companyId: string, gstin: string) =>
  api.get<GstinDetails>(`/companies/${companyId}/gstin/${encodeURIComponent(gstin)}`);

