import { AccountNature } from '@prisma/client';

/**
 * Default Indian chart of accounts, modeled on the Tally group structure
 * every Indian accountant already knows. Seeded for each new company.
 */

export interface SeedGroup {
  name: string;
  nature: AccountNature;
  children?: SeedGroup[];
}

export const DEFAULT_ACCOUNT_GROUPS: SeedGroup[] = [
  { name: 'Capital Account', nature: AccountNature.LIABILITY },
  { name: 'Loans (Liability)', nature: AccountNature.LIABILITY },
  {
    name: 'Current Liabilities',
    nature: AccountNature.LIABILITY,
    children: [
      { name: 'Sundry Creditors', nature: AccountNature.LIABILITY },
      { name: 'Duties & Taxes', nature: AccountNature.LIABILITY },
    ],
  },
  { name: 'Fixed Assets', nature: AccountNature.ASSET },
  {
    name: 'Current Assets',
    nature: AccountNature.ASSET,
    children: [
      { name: 'Cash-in-Hand', nature: AccountNature.ASSET },
      { name: 'Bank Accounts', nature: AccountNature.ASSET },
      { name: 'Sundry Debtors', nature: AccountNature.ASSET },
      { name: 'Stock-in-Hand', nature: AccountNature.ASSET },
    ],
  },
  { name: 'Sales Accounts', nature: AccountNature.INCOME },
  { name: 'Indirect Income', nature: AccountNature.INCOME },
  { name: 'Purchase Accounts', nature: AccountNature.EXPENSE },
  { name: 'Direct Expenses', nature: AccountNature.EXPENSE },
  { name: 'Indirect Expenses', nature: AccountNature.EXPENSE },
];

/** System ledgers that sales/purchase flows post to automatically. */
export const DEFAULT_LEDGERS: { name: string; group: string }[] = [
  { name: 'Cash', group: 'Cash-in-Hand' },
  { name: 'Sales', group: 'Sales Accounts' },
  { name: 'Purchases', group: 'Purchase Accounts' },
  { name: 'CGST Payable', group: 'Duties & Taxes' },
  { name: 'SGST Payable', group: 'Duties & Taxes' },
  { name: 'IGST Payable', group: 'Duties & Taxes' },
  { name: 'CGST Input', group: 'Duties & Taxes' },
  { name: 'SGST Input', group: 'Duties & Taxes' },
  { name: 'IGST Input', group: 'Duties & Taxes' },
  { name: 'Rounding Off', group: 'Indirect Expenses' },
];
