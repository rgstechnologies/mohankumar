import type { DocEntryConfig } from './doc-entry-form';

export const INVOICE_ENTRY: DocEntryConfig = {
  kind: 'invoice',
  apiBase: 'invoices',
  tab: 'invoices',
  loyalty: true,
  batches: true,
  extraCharges: true,
  bankPicker: true,
  creditCash: true,
  stateOfSupply: true,
};

export const ESTIMATE_ENTRY: DocEntryConfig = {
  kind: 'estimate',
  apiBase: 'estimates',
  tab: 'estimates',
  secondDate: 'validUntil',
  extraCharges: true,
  stateOfSupply: true,
};

export const PROFORMA_ENTRY: DocEntryConfig = {
  kind: 'proformaInvoice',
  apiBase: 'proforma-invoices',
  tab: 'proforma-invoices',
  secondDate: 'validUntil',
  extraCharges: true,
};

export const PURCHASE_ESTIMATE_ENTRY: DocEntryConfig = {
  kind: 'purchaseEstimate',
  apiBase: 'purchase-estimates',
  tab: 'purchase-estimates',
  party: 'vendor',
  secondDate: 'validUntil',
  extraCharges: true,
};

export const PURCHASE_ORDER_ENTRY: DocEntryConfig = {
  kind: 'purchaseOrder',
  apiBase: 'purchase-orders',
  tab: 'purchase-orders',
  party: 'vendor',
  secondDate: 'expectedDate',
  noTax: true,
};

export const PURCHASE_BILL_ENTRY: DocEntryConfig = {
  kind: 'purchaseBill',
  apiBase: 'purchase-bills',
  tab: 'purchases',
  party: 'vendor',
  supplierBillNo: true,
  purchaseBatch: true,
  extraCharges: true,
  aiScanDraft: true,
};

export const SALES_ORDER_ENTRY: DocEntryConfig = {
  kind: 'salesOrder',
  apiBase: 'sales-orders',
  tab: 'sales-orders',
  secondDate: 'expectedDate',
  extraCharges: true,
};

export const DELIVERY_CHALLAN_ENTRY: DocEntryConfig = {
  kind: 'deliveryChallan',
  apiBase: 'delivery-challans',
  tab: 'delivery-challans',
  vehicle: true,
  extraCharges: true,
};
