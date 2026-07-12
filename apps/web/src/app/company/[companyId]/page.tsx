'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useFeedback } from '@/components/feedback';
import { ThemeToggle } from '@/components/theme';
import { Button, Card, ErrorText, HelpTip, Input, Label, Select } from '@/components/ui';
import {
  fetchGroups,
  fetchInvoices,
  fetchEstimates,
  fetchProformaInvoices,
  fetchDeliveryChallans,
  fetchSalesOrders,
  fetchExpenses,
  fetchCheques,
  fetchPurchaseEstimates,
  fetchItems,
  fetchLedgers,
  fetchBranches,
  fetchNotes,
  fetchParties,
  fetchPurchaseOrders,
  fetchPurchaseBills,
  fetchStock,
  fetchVouchers,
  flattenGroups,
  inr,
  parseVoucherAi,
  VOUCHER_TYPES,
  type AccountGroup,
  type BranchRow,
  type InvoiceView,
  type EstimateView,
  type ProformaInvoiceView,
  type DeliveryChallanView,
  type SalesOrderView,
  type ExpenseEntry,
  type ChequeView,
  type PurchaseEstimateView,
  type ItemRow,
  type LedgerRow,
  type NoteView,
  type PartyRow,
  type PurchaseBillView,
  type StockRow,
  type VoucherView,
} from '@/lib/accounting';
import { api, ApiError, isAuthenticated, logout, type Me } from '@/lib/api';
import { Pagination, SearchInput, useTable } from '@/components/table';
import { NotificationsBell, UniversalSearch } from '@/components/topbar-tools';
import { LanguageSwitcher } from '@/components/language-switcher';
import { MicButton } from '@/components/mic-button';
import { NotesTab } from './notes-tab';
import { PurchaseOrdersTab, type PoView } from './purchase-orders-tab';
import { BranchesTab } from './branches-tab';
import { BankingTab } from './banking-tab';
import { InvoicesTab } from './invoices-tab';
import { EstimatesTab } from './estimates-tab';
import { ProformaInvoicesTab } from './proforma-invoices-tab';
import { DeliveryChallansTab } from './delivery-challans-tab';
import { SalesOrdersTab } from './sales-orders-tab';
import { ExpensesTab } from './expenses-tab';
import { ChequesTab } from './cheques-tab';
import { LoyaltyTab } from './loyalty-tab';
import { ProfileTab } from './profile-tab';
import { PrintSettingsTab } from './print-settings-tab';
import { PaymentPage } from './payment-page';
import { PurchaseEstimatesTab } from './purchase-estimates-tab';
import { ItemsTab } from './items-tab';
import { OverviewTab } from './overview-tab';
import { PartiesTab } from './parties-tab';
import { PayrollTab } from './payroll-tab';
import { ActivityTab } from './activity-tab';
import { ImportTab } from './import-tab';
import { JobWorkTab } from './job-work-tab';
import { PurchasesTab } from './purchases-tab';
import { ReportsTab } from './reports-tab';
import { StockTab } from './stock-tab';
import { AiSparkle } from '@/components/icons';

type Tab =
  | 'overview'
  | 'invoices'
  | 'estimates'
  | 'proforma-invoices'
  | 'sales-orders'
  | 'delivery-challans'
  | 'purchase-estimates'
  | 'purchases'
  | 'stock'
  | 'reports'
  | 'ledgers'
  | 'expenses'
  | 'vouchers'
  | 'cheques'
  | 'banking'
  | 'notes'
  | 'purchase-orders'
  | 'branches'
  | 'payroll'
  | 'parties'
  | 'loyalty'
  | 'items'
  | 'import'
  | 'activity'
  | 'jobwork'
  | 'payment-in'
  | 'payment-out'
  | 'print-settings'
  | 'profile';

function NavIcon({ name }: { name: Tab }) {
  const paths: Record<Tab, React.ReactNode> = {
    overview: <path d="M3 12l9-9 9 9M5 10v10h5v-6h4v6h5V10" />,
    invoices: <path d="M7 3h7l5 5v13H7V3zM14 3v5h5M10 13h6M10 17h6" />,
    estimates: <path d="M9 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8l-5-5H9zM14 3v5h5M9 13h6M9 17h4" />,
    'proforma-invoices': <path d="M9 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8l-5-5H9zM14 3v5h5M9 12l1.5 1.5L13 11M9 16l1.5 1.5L13 15" />,
    'sales-orders': <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 012-2h2a2 2 0 012 2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 13l2 2 4-4" />,
    'delivery-challans': <path d="M3 7h11v8H3zM14 10h4l3 3v2h-7zM7.5 18a1.5 1.5 0 100-3 1.5 1.5 0 000 3zM17.5 18a1.5 1.5 0 100-3 1.5 1.5 0 000 3z" />,
    'purchase-estimates': <path d="M9 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8l-5-5H9zM14 3v5h5M9 13h6M9 17h4M3 3l3 3" />,
    purchases: (
      <path d="M3 3h2l2.2 12.4a1 1 0 001 .6h9.8a1 1 0 001-.8L21 7H6M9 20a1 1 0 100-2 1 1 0 000 2zM18 20a1 1 0 100-2 1 1 0 000 2z" />
    ),
    stock: <path d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3zM12 12l8-4.5M12 12v9M12 12L4 7.5" />,
    reports: <path d="M5 20v-6M10 20V8M15 20v-10M20 20V13M3 20h18" />,
    ledgers: (
      <path d="M12 6.5C10 5 7 5 4 6.5v13c3-1.5 6-1.5 8 0 2-1.5 5-1.5 8 0v-13c-3-1.5-6-1.5-8 0zM12 6.5v13" />
    ),
    expenses: <path d="M12 1v22M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" />,
    cheques: <path d="M3 7a2 2 0 012-2h14a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2zM7 12h6M7 15h4M16 9.5l1.5 1.5 2.5-2.5" />,
    loyalty: <path d="M12 2l2.4 5.3 5.6.6-4.2 3.9 1.2 5.6L12 20l-5 2.9 1.2-5.6L4 8.9l5.6-.6z" />,
    vouchers: <path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01" />,
    parties: (
      <path d="M17 21v-2a4 4 0 00-4-4H7a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />
    ),
    items: (
      <path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82zM7 7h.01" />
    ),
    banking: (
      <path d="M3 9l9-6 9 6M4 9v11M20 9v11M2 20h20M8 13v4M12 13v4M16 13v4" />
    ),
    notes: (
      <path d="M9 14l-4 4V5a2 2 0 012-2h10a2 2 0 012 2v9a2 2 0 01-2 2H9zM8 8h8M8 11h5" />
    ),
    'purchase-orders': (
      <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 012-2h2a2 2 0 012 2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 12l2 2 4-4" />
    ),
    branches: (
      <path d="M12 3v6M12 9a3 3 0 100 6 3 3 0 000-6zM12 15v6M5 6h.01M19 6h.01M5 6a2 2 0 104 0 2 2 0 00-4 0zM15 6a2 2 0 104 0 2 2 0 00-4 0zM7 8l4 3M17 8l-4 3" />
    ),
    payroll: (
      <path d="M9 11a4 4 0 100-8 4 4 0 000 8zM3 21v-2a4 4 0 014-4h4M16 14v7M19.5 15.5c0-.83-1.12-1.5-2.5-1.5s-2.5.67-2.5 1.5S15.62 17 17 17s2.5.67 2.5 1.5S18.38 20 17 20s-2.5-.67-2.5-1.5" />
    ),
    import: (
      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" />
    ),
    activity: (
      <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
    ),
    jobwork: (
      <path d="M14.7 6.3a4 4 0 00-5.4 0L4 11.6a4 4 0 105.7 5.7l1.3-1.3M9.3 17.7a4 4 0 005.4 0l5.3-5.3a4 4 0 10-5.7-5.7l-1.3 1.3" />
    ),
    'print-settings': (
      <path d="M6 9V3h12v6M6 18H4a2 2 0 01-2-2v-4a2 2 0 012-2h16a2 2 0 012 2v4a2 2 0 01-2 2h-2M6 14h12v7H6z" />
    ),
    'payment-in': (
      <path d="M12 1v22M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" />
    ),
    'payment-out': (
      <path d="M12 1v22M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" />
    ),
    profile: (
      <path d="M3 21v-1a7 7 0 0114 0v1M10 11a4 4 0 100-8 4 4 0 000 8zM19 8v6M16 11h6" />
    ),
  };
  return (
    <svg
      className="h-4 w-4 shrink-0"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {paths[name]}
    </svg>
  );
}

// `group` and `label` are workspace.* message keys, translated at render.
const NAV_GROUPS: { group: string; items: { key: Tab; label: string }[] }[] = [
  { group: '', items: [{ key: 'overview', label: 'overview' }] },
  {
    group: 'sales',
    items: [
      { key: 'estimates', label: 'estimates' },
      { key: 'proforma-invoices', label: 'proformaInvoices' },
      { key: 'sales-orders', label: 'salesOrders' },
      { key: 'invoices', label: 'invoices' },
      { key: 'delivery-challans', label: 'deliveryChallans' },
      { key: 'payment-in', label: 'paymentIn' },
    ],
  },
  {
    group: 'purchase',
    items: [
      { key: 'purchase-estimates', label: 'purchaseEstimates' },
      { key: 'purchase-orders', label: 'purchaseOrders' },
      { key: 'purchases', label: 'purchases' },
      { key: 'payment-out', label: 'paymentOut' },
    ],
  },
  {
    group: 'inventory',
    items: [
      { key: 'stock', label: 'stock' },
      { key: 'items', label: 'items' },
      { key: 'jobwork', label: 'jobWork' },
    ],
  },
  {
    group: 'accounting',
    items: [
      { key: 'ledgers', label: 'ledgers' },
      { key: 'expenses', label: 'expenses' },
      { key: 'vouchers', label: 'vouchers' },
      { key: 'notes', label: 'notes' },
      { key: 'cheques', label: 'cheques' },
      { key: 'banking', label: 'banking' },
      { key: 'reports', label: 'reports' },
    ],
  },
  {
    group: 'contacts',
    items: [
      { key: 'parties', label: 'parties' },
      { key: 'loyalty', label: 'loyalty' },
    ],
  },
  {
    group: 'organization',
    items: [
      { key: 'branches', label: 'branches' },
      { key: 'payroll', label: 'payroll' },
      { key: 'import', label: 'importData' },
      { key: 'activity', label: 'activity' },
    ],
  },
  {
    group: 'settings',
    items: [
      { key: 'print-settings', label: 'printSettings' },
      { key: 'profile', label: 'profile' },
    ],
  },
];

/** Top-bar account button with a dropdown (profile, admin, log out). */
function ProfileMenu({
  name,
  email,
  isSuperAdmin,
  labels,
  onLogout,
}: {
  name: string;
  email: string;
  isSuperAdmin: boolean;
  labels: { companies: string; admin: string; signOut: string };
  onLogout: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);
  const initials =
    name
      .trim()
      .split(/\s+/)
      .map((s) => s[0])
      .slice(0, 2)
      .join('')
      .toUpperCase() || 'U';
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex h-9 items-center gap-2 rounded-lg border border-line pl-1 pr-1.5 transition-colors hover:bg-subtle"
        aria-label="Account"
      >
        <span className="flex h-7 w-7 items-center justify-center rounded-md bg-brand-600 text-xs font-bold text-white">
          {initials}
        </span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-muted">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {open && (
        <div className="absolute right-0 z-40 mt-1 w-56 overflow-hidden rounded-xl border border-line bg-elevated py-1 shadow-lg">
          <div className="border-b border-line px-4 py-3">
            <p className="truncate text-sm font-semibold text-ink">{name}</p>
            <p className="truncate text-xs text-muted">{email}</p>
          </div>
          <Link href="/dashboard" className="block px-4 py-2 text-sm text-ink transition-colors hover:bg-subtle">
            {labels.companies}
          </Link>
          {isSuperAdmin && (
            <Link href="/admin" className="block px-4 py-2 text-sm text-ink transition-colors hover:bg-subtle">
              {labels.admin}
            </Link>
          )}
          <button
            type="button"
            onClick={onLogout}
            className="block w-full px-4 py-2 text-left text-sm text-rose-600 transition-colors hover:bg-rose-50"
          >
            {labels.signOut}
          </button>
        </div>
      )}
    </div>
  );
}

export default function CompanyPage() {
  const { companyId } = useParams<{ companyId: string }>();
  const router = useRouter();
  const t = useTranslations('workspace');
  const tc = useTranslations('common');

  const [companyName, setCompanyName] = useState('');
  const [role, setRole] = useState('');
  const [user, setUser] = useState<{ name: string; email: string; isSuperAdmin: boolean }>({
    name: '',
    email: '',
    isSuperAdmin: false,
  });
  const [adminView, setAdminView] = useState(false);
  const [planFeatures, setPlanFeatures] = useState<Record<string, boolean>>({});
  const [tab, setTab] = useState<Tab>('overview');
  // Shell chrome: desktop collapse + mobile drawer.
  const [collapsed, setCollapsed] = useState(false);
  const [mobileNav, setMobileNav] = useState(false);
  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem('nav:collapsed') === '1');
    } catch {
      /* ignore */
    }
  }, []);
  const toggleCollapsed = useCallback(() => {
    setCollapsed((v) => {
      const next = !v;
      try {
        localStorage.setItem('nav:collapsed', next ? '1' : '0');
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);
  const [groups, setGroups] = useState<AccountGroup[]>([]);
  const [ledgers, setLedgers] = useState<LedgerRow[]>([]);
  const [vouchers, setVouchers] = useState<VoucherView[]>([]);
  const [parties, setParties] = useState<PartyRow[]>([]);
  const [items, setItems] = useState<ItemRow[]>([]);
  const [invoices, setInvoices] = useState<InvoiceView[]>([]);
  const [estimates, setEstimates] = useState<EstimateView[]>([]);
  const [proformaInvoices, setProformaInvoices] = useState<ProformaInvoiceView[]>([]);
  const [challans, setChallans] = useState<DeliveryChallanView[]>([]);
  const [salesOrders, setSalesOrders] = useState<SalesOrderView[]>([]);
  const [expenses, setExpenses] = useState<ExpenseEntry[]>([]);
  const [cheques, setCheques] = useState<ChequeView[]>([]);
  const [purchaseEstimates, setPurchaseEstimates] = useState<PurchaseEstimateView[]>([]);
  const [bills, setBills] = useState<PurchaseBillView[]>([]);
  const [notes, setNotes] = useState<NoteView[]>([]);
  const [pos, setPos] = useState<PoView[]>([]);
  const [branches, setBranches] = useState<BranchRow[]>([]);
  const [stock, setStock] = useState<StockRow[]>([]);

  // Open a specific tab when arriving with ?tab=… (e.g. returning from a
  // full-screen entry page like /invoices/new).
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const q = new URLSearchParams(window.location.search).get('tab');
    if (q) setTab(q as Tab);
  }, []);

  const reload = useCallback(async () => {
    const [g, l, v, p, i, inv, est, pest, pb, st, nt, po, br, dc, so, ex, chq, prof] = await Promise.all([
      fetchGroups(companyId),
      fetchLedgers(companyId),
      fetchVouchers(companyId),
      fetchParties(companyId),
      fetchItems(companyId),
      fetchInvoices(companyId),
      fetchEstimates(companyId),
      fetchPurchaseEstimates(companyId),
      fetchPurchaseBills(companyId),
      fetchStock(companyId),
      fetchNotes(companyId),
      fetchPurchaseOrders(companyId),
      fetchBranches(companyId),
      fetchDeliveryChallans(companyId),
      fetchSalesOrders(companyId),
      fetchExpenses(companyId),
      fetchCheques(companyId),
      fetchProformaInvoices(companyId),
    ]);
    setGroups(g);
    setLedgers(l);
    setVouchers(v);
    setParties(p);
    setItems(i);
    setInvoices(inv);
    setEstimates(est);
    setPurchaseEstimates(pest);
    setBills(pb);
    setStock(st);
    setNotes(nt);
    setPos(po as PoView[]);
    setBranches(br);
    setChallans(dc);
    setSalesOrders(so);
    setExpenses(ex);
    setCheques(chq);
    setProformaInvoices(prof);
  }, [companyId]);

  useEffect(() => {
    if (!isAuthenticated()) {
      router.push('/login');
      return;
    }
    api
      .get<Me>('/auth/me')
      .then(async (me) => {
        setUser({ name: me.name, email: me.email, isSuperAdmin: me.isSuperAdmin });
        setPlanFeatures(me.subscription?.features ?? {});
        const membership = me.memberships.find((m) => m.company.id === companyId);
        if (!membership) {
          // Super-admins can open any company in read-only mode for monitoring.
          if (me.isSuperAdmin) {
            const company = await api
              .get<{ name: string }>(`/companies/${companyId}`)
              .catch(() => null);
            if (!company) {
              router.push('/dashboard');
              return;
            }
            setCompanyName(company.name);
            setRole('AUDITOR'); // read-only viewer (writes blocked client + server side)
            setAdminView(true);
            return reload();
          }
          router.push('/dashboard');
          return;
        }
        setCompanyName(membership.company.name);
        setRole(membership.role);
        return reload();
      })
      .catch(() => router.push('/login'));
  }, [companyId, reload, router]);

  const canPostVouchers = ['OWNER', 'ADMIN', 'ACCOUNTANT', 'CASHIER'].includes(role);
  const canManageLedgers = ['OWNER', 'ADMIN', 'ACCOUNTANT'].includes(role);
  const isAdminRole = ['OWNER', 'ADMIN'].includes(role);
  // Plan entitlements: a feature is allowed unless the plan explicitly disables
  // it (mirrors the server's fail-open gate). Hides UI the user can't use.
  const payrollEnabled = planFeatures.payroll !== false;
  const aiEnabled = planFeatures.ai !== false;
  const currentGroup = NAV_GROUPS.find((g) => g.items.some((i) => i.key === tab));

  if (!companyName) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-canvas text-sm text-muted">
        {tc('loading')}
      </main>
    );
  }

  const canSee = (key: Tab) =>
    (key !== 'payroll' || (canManageLedgers && payrollEnabled)) &&
    (key !== 'import' || isAdminRole) &&
    (key !== 'activity' || isAdminRole) &&
    (key !== 'print-settings' || isAdminRole) &&
    (key !== 'profile' || isAdminRole);

  return (
    <div className="min-h-screen bg-canvas">
      {/* Mobile drawer scrim */}
      {mobileNav && (
        <div
          onClick={() => setMobileNav(false)}
          className="fixed inset-0 z-30 bg-black/60 lg:hidden"
          aria-hidden
        />
      )}

      {/* ---------- Sidebar (dark, collapsible, mobile drawer) ---------- */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-[260px] flex-col border-r border-line bg-surface text-muted transition-[width,transform] duration-200 lg:translate-x-0 ${
          collapsed ? 'lg:w-[76px]' : 'lg:w-[260px]'
        } ${mobileNav ? 'translate-x-0' : '-translate-x-full'}`}
      >
        <div className="flex h-[70px] items-center gap-2.5 border-b border-line px-4">
          <Link href="/dashboard" className="flex min-w-0 items-center gap-2.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/rgs-logo.jpeg" alt="RGS" className="h-9 w-9 shrink-0 rounded-xl bg-white object-contain shadow-sm" />
            {!collapsed && (
              <span className="truncate text-lg font-bold tracking-tight text-ink">RGS</span>
            )}
          </Link>
          <button
            type="button"
            onClick={toggleCollapsed}
            className="ml-auto hidden h-7 w-7 items-center justify-center rounded-md text-faint transition-colors hover:bg-subtle hover:text-ink lg:flex"
            aria-label="Collapse sidebar"
            title="Collapse"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              {collapsed ? <path d="m9 18 6-6-6-6" /> : <path d="m15 18-6-6 6-6" />}
            </svg>
          </button>
        </div>

        {!collapsed && (
          <div className="border-b border-line px-4 py-3">
            <p className="truncate text-sm font-semibold text-ink">{companyName}</p>
            <p className="mt-0.5 text-[11px] font-medium uppercase tracking-wide text-faint">
              {t(`roles.${role}`)}
            </p>
          </div>
        )}

        <nav className="scrollbar-light flex-1 space-y-4 overflow-y-auto px-2.5 py-3">
          {NAV_GROUPS.map((group) => {
            const items = group.items.filter((item) => canSee(item.key));
            if (items.length === 0) return null;
            return (
              <div key={group.group || 'main'}>
                {group.group && !collapsed && (
                  <p className="mb-1 px-2 text-[10px] font-semibold uppercase tracking-wider text-faint">
                    {t(`groups.${group.group}`)}
                  </p>
                )}
                <div className="space-y-0.5">
                  {items.map((item) => (
                    <button
                      key={item.key}
                      onClick={() => {
                        setTab(item.key);
                        setMobileNav(false);
                      }}
                      title={collapsed ? t(`nav.${item.label}`) : undefined}
                      className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors ${
                        collapsed ? 'justify-center' : ''
                      } ${
                        tab === item.key
                          ? 'bg-brand-600 font-semibold text-white shadow-sm shadow-brand-600/30'
                          : 'font-medium text-muted hover:bg-subtle hover:text-ink'
                      }`}
                    >
                      <NavIcon name={item.key} />
                      {!collapsed && t(`nav.${item.label}`)}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </nav>

        <Link
          href="/dashboard"
          title={t('allCompanies')}
          className={`flex items-center gap-2 border-t border-line px-4 py-3 text-xs font-medium text-muted transition-colors hover:text-ink ${
            collapsed ? 'justify-center' : ''
          }`}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
          </svg>
          {!collapsed && t('allCompanies')}
        </Link>
      </aside>

      {/* ---------- Main column ---------- */}
      <div className={`transition-[padding] duration-200 ${collapsed ? 'lg:pl-[76px]' : 'lg:pl-[260px]'}`}>
        {/* Top bar (70px) */}
        <header className="sticky top-0 z-20 flex h-[70px] items-center gap-2 border-b border-line bg-surface px-4 lg:px-6">
          <button
            type="button"
            onClick={() => setMobileNav(true)}
            className="-ml-1 flex h-9 w-9 items-center justify-center rounded-lg text-muted transition-colors hover:bg-subtle hover:text-ink lg:hidden"
            aria-label="Open menu"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M3 6h18M3 12h18M3 18h18" />
            </svg>
          </button>

          <nav
            aria-label="Breadcrumb"
            className="hidden min-w-0 flex-1 items-center gap-1.5 text-xs text-muted sm:flex"
          >
            <span className="truncate font-medium text-muted">{companyName}</span>
            {currentGroup?.group && (
              <>
                <span className="text-faint">/</span>
                <span className="whitespace-nowrap">{t(`groups.${currentGroup.group}`)}</span>
              </>
            )}
            <span className="text-faint">/</span>
            <span className="truncate font-semibold text-ink">{t(`titles.${tab}`)}</span>
          </nav>
          <div className="flex-1 sm:hidden" />

          <UniversalSearch companyId={companyId} onNavigate={(t) => setTab(t as Tab)} />
          <LanguageSwitcher />
          <ThemeToggle />
          <NotificationsBell companyId={companyId} onNavigate={(t) => setTab(t as Tab)} />
          <ProfileMenu
            name={user.name}
            email={user.email}
            isSuperAdmin={user.isSuperAdmin}
            labels={{
              companies: t('allCompanies'),
              admin: t('adminPanel'),
              signOut: t('signOut'),
            }}
            onLogout={async () => {
              await logout();
              router.push('/login');
            }}
          />
        </header>

        {/* Page title band */}
        <div className="flex items-center justify-between gap-3 border-b border-line bg-surface px-4 py-4 lg:px-6">
          <h1 className="truncate text-xl font-bold text-ink">{t(`titles.${tab}`)}</h1>
          {adminView ? (
            <span className="shrink-0 rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700 ring-1 ring-inset ring-brand-200">
              {t('adminReadOnly')}
            </span>
          ) : role === 'AUDITOR' ? (
            <span className="shrink-0 rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700 ring-1 ring-inset ring-amber-200">
              {t('readOnlyAuditor')}
            </span>
          ) : null}
        </div>

        <main className="space-y-6 p-4 lg:p-6">
          {tab === 'overview' && <OverviewTab companyId={companyId} />}
      {tab === 'reports' && <ReportsTab companyId={companyId} />}
      {tab === 'invoices' && (
        <InvoicesTab
          companyId={companyId}
          parties={parties}
          items={items}
          ledgers={ledgers}
          branches={branches}
          invoices={invoices}
          canBill={canPostVouchers}
          canCancel={canManageLedgers}
          canCustomize={isAdminRole}
          onChanged={reload}
        />
      )}
      {tab === 'estimates' && (
        <EstimatesTab
          companyId={companyId}
          parties={parties}
          items={items}
          branches={branches}
          estimates={estimates}
          canBill={canPostVouchers}
          canCancel={canManageLedgers}
          onChanged={reload}
        />
      )}
      {tab === 'proforma-invoices' && (
        <ProformaInvoicesTab
          companyId={companyId}
          parties={parties}
          items={items}
          branches={branches}
          proformaInvoices={proformaInvoices}
          canBill={canPostVouchers}
          canCancel={canManageLedgers}
          onChanged={reload}
        />
      )}
      {tab === 'sales-orders' && (
        <SalesOrdersTab
          companyId={companyId}
          parties={parties}
          items={items}
          branches={branches}
          orders={salesOrders}
          canBill={canPostVouchers}
          canCancel={canManageLedgers}
          onChanged={reload}
        />
      )}
      {tab === 'delivery-challans' && (
        <DeliveryChallansTab
          companyId={companyId}
          parties={parties}
          items={items}
          branches={branches}
          challans={challans}
          canBill={canPostVouchers}
          canCancel={canManageLedgers}
          onChanged={reload}
        />
      )}
      {tab === 'purchase-estimates' && (
        <PurchaseEstimatesTab
          companyId={companyId}
          parties={parties}
          items={items}
          branches={branches}
          estimates={purchaseEstimates}
          canBill={canManageLedgers}
          canCancel={canManageLedgers}
          onChanged={reload}
        />
      )}
      {tab === 'purchases' && (
        <PurchasesTab
          companyId={companyId}
          parties={parties}
          items={items}
          ledgers={ledgers}
          branches={branches}
          bills={bills}
          canBill={canPostVouchers}
          canCancel={canManageLedgers}
          aiEnabled={aiEnabled}
          onChanged={reload}
        />
      )}
      {tab === 'stock' && (
        <StockTab
          companyId={companyId}
          stock={stock}
          items={items}
          branches={branches}
          canTransfer={['OWNER', 'ADMIN', 'ACCOUNTANT', 'BRANCH_MANAGER'].includes(role)}
          onChanged={reload}
        />
      )}
          {tab === 'banking' && (
            <BankingTab
              companyId={companyId}
              canManage={canManageLedgers}
              ledgers={ledgers}
            />
          )}
          {tab === 'purchase-orders' && (
            <PurchaseOrdersTab
              companyId={companyId}
              parties={parties}
              items={items}
              branches={branches}
              orders={pos}
              canManage={canPostVouchers}
              onChanged={reload}
            />
          )}
          {tab === 'branches' && (
            <BranchesTab
              companyId={companyId}
              branches={branches}
              canManage={['OWNER', 'ADMIN'].includes(role)}
              onChanged={reload}
            />
          )}
          {tab === 'notes' && (
            <NotesTab
              companyId={companyId}
              invoices={invoices}
              bills={bills}
              items={items}
              notes={notes}
              canManage={canManageLedgers}
              onChanged={reload}
            />
          )}
      {tab === 'ledgers' && (
        <LedgersTab
          companyId={companyId}
          groups={groups}
          ledgers={ledgers}
          canManage={canManageLedgers}
          onChanged={reload}
        />
      )}
      {tab === 'expenses' && (
        <ExpensesTab
          companyId={companyId}
          ledgers={ledgers}
          parties={parties}
          expenses={expenses}
          canManage={canPostVouchers}
          onChanged={reload}
        />
      )}
      {tab === 'cheques' && (
        <ChequesTab
          companyId={companyId}
          parties={parties}
          cheques={cheques}
          canManage={canPostVouchers}
          onChanged={reload}
        />
      )}
      {tab === 'vouchers' && (
        <VouchersTab
          companyId={companyId}
          ledgers={ledgers}
          vouchers={vouchers}
          canPost={canPostVouchers}
          canCancel={canManageLedgers}
          aiEnabled={aiEnabled}
          onChanged={reload}
        />
      )}
      {tab === 'parties' && (
        <PartiesTab
          companyId={companyId}
          parties={parties}
          ledgers={ledgers}
          canManage={canManageLedgers}
          onChanged={reload}
        />
      )}
      {tab === 'loyalty' && (
        <LoyaltyTab companyId={companyId} canManage={canManageLedgers} />
      )}
          {tab === 'import' && isAdminRole && (
            <ImportTab companyId={companyId} onChanged={reload} />
          )}
          {tab === 'activity' && isAdminRole && <ActivityTab companyId={companyId} />}
          {tab === 'payment-in' && (
            <PaymentPage
              companyId={companyId}
              mode="in"
              parties={parties}
              ledgers={ledgers}
              canManage={canPostVouchers}
              onChanged={reload}
            />
          )}
          {tab === 'payment-out' && (
            <PaymentPage
              companyId={companyId}
              mode="out"
              parties={parties}
              ledgers={ledgers}
              canManage={canPostVouchers}
              onChanged={reload}
            />
          )}
          {tab === 'print-settings' && isAdminRole && (
            <PrintSettingsTab companyId={companyId} canManage={isAdminRole} />
          )}
          {tab === 'profile' && isAdminRole && (
            <ProfileTab companyId={companyId} canManage={isAdminRole} />
          )}
          {tab === 'jobwork' && (
            <JobWorkTab
              companyId={companyId}
              parties={parties}
              items={items}
              canManage={['OWNER', 'ADMIN', 'ACCOUNTANT', 'BRANCH_MANAGER'].includes(role)}
              onChanged={reload}
            />
          )}
          {tab === 'payroll' && canManageLedgers && payrollEnabled && (
            <PayrollTab
              companyId={companyId}
              branches={branches}
              ledgers={ledgers}
              onChanged={reload}
            />
          )}
          {tab === 'items' && (
            <ItemsTab
              companyId={companyId}
              items={items}
              canManage={canManageLedgers}
              onChanged={reload}
            />
          )}
        </main>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------
// Ledgers
// ----------------------------------------------------------------

function LedgersTab({
  companyId,
  groups,
  ledgers,
  canManage,
  onChanged,
}: {
  companyId: string;
  groups: AccountGroup[];
  ledgers: LedgerRow[];
  canManage: boolean;
  onChanged: () => Promise<void>;
}) {
  const t = useTranslations('ledgers');
  const tc = useTranslations('common');
  const groupOptions = useMemo(() => flattenGroups(groups), [groups]);
  const ledgerTable = useTable(ledgers, (l) => `${l.name} ${l.group.name}`);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [groupId, setGroupId] = useState('');
  const [opening, setOpening] = useState('');
  const [openingType, setOpeningType] = useState<'DEBIT' | 'CREDIT'>('DEBIT');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await api.post(`/companies/${companyId}/ledgers`, {
        name,
        groupId,
        openingBalance: opening ? Number(opening) : undefined,
        openingType,
      });
      setName('');
      setOpening('');
      setShowForm(false);
      await onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : tc('somethingWentWrong'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SearchInput
          value={ledgerTable.query}
          onChange={ledgerTable.setQuery}
          placeholder={t('searchPlaceholder')}
        />
        {canManage && (
          <Button
            variant={showForm ? 'secondary' : 'primary'}
            onClick={() => setShowForm(!showForm)}
          >
            {showForm ? tc('close') : t('newLedger')}
          </Button>
        )}
      </div>

      {showForm && (
        <Card>
          <form onSubmit={onCreate} className="grid grid-cols-1 items-end gap-4 sm:grid-cols-5">
            <div className="sm:col-span-2">
              <Label>{t('ledgerName')}</Label>
              <Input required value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div>
              <Label>{t('group')}</Label>
              <Select required value={groupId} onChange={(e) => setGroupId(e.target.value)}>
                <option value="">{t('select')}</option>
                {groupOptions.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.label}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>{t('openingBalance')}</Label>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={opening}
                onChange={(e) => setOpening(e.target.value)}
                placeholder="0.00"
              />
            </div>
            <div className="flex gap-2">
              <Select
                value={openingType}
                onChange={(e) => setOpeningType(e.target.value as 'DEBIT' | 'CREDIT')}
              >
                <option value="DEBIT">{tc('dr')}</option>
                <option value="CREDIT">{tc('cr')}</option>
              </Select>
              <Button type="submit" disabled={busy}>
                {busy ? '…' : tc('add')}
              </Button>
            </div>
            <div className="sm:col-span-5">
              <ErrorText>{error}</ErrorText>
            </div>
          </form>
        </Card>
      )}

      <Card>
        <div className="overflow-x-auto"><table className="w-full min-w-[600px] text-sm">
          <thead>
            <tr className="border-b border-line bg-subtle text-left text-[11px] font-semibold uppercase tracking-wide text-muted">
              <th className="py-2">{t('colLedger')}</th>
              <th className="py-2">{t('colGroup')}</th>
              <th className="py-2 text-right">{tc('balance')}</th>
            </tr>
          </thead>
          <tbody>
            {ledgerTable.rows.map((l) => (
              <tr key={l.id} className="border-b border-line last:border-0 hover:bg-subtle">
                <td className="py-2 font-medium">
                  {l.name}
                  {l.isSystem && (
                    <span className="ml-2 rounded bg-subtle px-1.5 py-0.5 text-[10px] text-muted">
                      {t('system')}
                    </span>
                  )}
                </td>
                <td className="py-2 text-muted">{l.group.name}</td>
                <td className="py-2 text-right tabular-nums">
                  ₹{inr(l.balance)}{' '}
                  <span className="text-xs text-faint">
                    {l.balanceType === 'DEBIT' ? tc('dr') : tc('cr')}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table></div>
        <Pagination
          page={ledgerTable.page}
          pageCount={ledgerTable.pageCount}
          total={ledgerTable.total}
          onPage={ledgerTable.setPage}
        />
      </Card>
    </div>
  );
}

// ----------------------------------------------------------------
// Vouchers
// ----------------------------------------------------------------

interface DraftLine {
  ledgerId: string;
  type: 'DEBIT' | 'CREDIT';
  amount: string;
}

const EMPTY_LINE: DraftLine = { ledgerId: '', type: 'DEBIT', amount: '' };

function VouchersTab({
  companyId,
  ledgers,
  vouchers,
  canPost,
  canCancel,
  aiEnabled,
  onChanged,
}: {
  companyId: string;
  ledgers: LedgerRow[];
  vouchers: VoucherView[];
  canPost: boolean;
  canCancel: boolean;
  aiEnabled: boolean;
  onChanged: () => Promise<void>;
}) {
  const t = useTranslations('vouchers');
  const tc = useTranslations('common');
  const { toast, confirm } = useFeedback();
  const voucherTable = useTable(
    vouchers,
    (v) => `${v.voucherNo} ${v.type} ${v.narration ?? ''} ${v.lines.map((l) => l.ledgerName).join(' ')}`,
  );
  const [showForm, setShowForm] = useState(false);
  const [type, setType] = useState<string>('JOURNAL');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [narration, setNarration] = useState('');
  const [lines, setLines] = useState<DraftLine[]>([
    { ...EMPTY_LINE },
    { ...EMPTY_LINE, type: 'CREDIT' },
  ]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [aiText, setAiText] = useState('');
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState('');
  const [aiNotes, setAiNotes] = useState<string[]>([]);

  async function onAiDraft(e: React.FormEvent) {
    e.preventDefault();
    await runAiDraft({ text: aiText });
  }

  async function runAiDraft(input: { text?: string; audio?: string }) {
    setAiError('');
    setAiNotes([]);
    setAiBusy(true);
    try {
      const draft = await parseVoucherAi(companyId, input);
      setType(draft.type);
      setDate(draft.date);
      setNarration(draft.narration);
      // Unmatched ledgers come back with ledgerId null — leave the select
      // empty so the user must consciously pick (or create) one.
      setLines(
        draft.lines.map((l) => ({
          ledgerId: l.ledgerId ?? '',
          type: l.type,
          amount: String(l.amount),
        })),
      );
      const notes = [...draft.warnings];
      if (draft.unmatchedLedgers.length > 0) {
        notes.push(t('ai.unmatched', { names: draft.unmatchedLedgers.join(', ') }));
      }
      setAiNotes(notes);
      setShowForm(true);
      setAiText('');
      toast(t('ai.drafted'));
    } catch (err) {
      setAiError(err instanceof ApiError ? err.message : tc('somethingWentWrong'));
    } finally {
      setAiBusy(false);
    }
  }

  const totals = useMemo(() => {
    let debit = 0;
    let credit = 0;
    for (const line of lines) {
      const amount = Number(line.amount) || 0;
      if (line.type === 'DEBIT') debit += amount;
      else credit += amount;
    }
    return { debit, credit, balanced: debit > 0 && Math.abs(debit - credit) < 0.005 };
  }, [lines]);

  function updateLine(index: number, patch: Partial<DraftLine>) {
    setLines((prev) => prev.map((l, i) => (i === index ? { ...l, ...patch } : l)));
  }

  async function onPost(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await api.post(`/companies/${companyId}/vouchers`, {
        type,
        date,
        narration: narration || undefined,
        lines: lines.map((l) => ({
          ledgerId: l.ledgerId,
          type: l.type,
          amount: Number(l.amount),
        })),
      });
      setNarration('');
      setLines([{ ...EMPTY_LINE }, { ...EMPTY_LINE, type: 'CREDIT' }]);
      setShowForm(false);
      await onChanged();
      toast(t('posted'));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : tc('somethingWentWrong'));
    } finally {
      setBusy(false);
    }
  }

  async function onCancel(voucherId: string) {
    const ok = await confirm({
      title: t('cancelTitle'),
      body: t('cancelBody'),
      confirmLabel: t('cancelConfirm'),
      danger: true,
    });
    if (!ok) return;
    await api.post(`/companies/${companyId}/vouchers/${voucherId}/cancel`);
    await onChanged();
    toast(t('cancelled'), 'info');
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SearchInput
          value={voucherTable.query}
          onChange={voucherTable.setQuery}
          placeholder={t('searchPlaceholder')}
        />
        {canPost && (
          <Button
            variant={showForm ? 'secondary' : 'primary'}
            onClick={() => setShowForm(!showForm)}
          >
            {showForm ? tc('close') : t('newVoucher')}
          </Button>
        )}
      </div>

      {canPost && aiEnabled && (
        <div className="rounded-md border border-line bg-surface shadow-sm">
          <div className="rounded-md bg-surface p-4">
            <form onSubmit={onAiDraft} className="space-y-2">
              <div className="flex items-center gap-2 text-sm font-medium text-ink">
                <AiSparkle className="h-4 w-4 text-brand-600" />
                {t('ai.title')}
                <HelpTip text={t('ai.hint')} />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  value={aiText}
                  onChange={(e) => setAiText(e.target.value)}
                  placeholder={t('ai.placeholder')}
                  maxLength={1000}
                  className="min-w-64 flex-1"
                  disabled={aiBusy}
                />
                <MicButton
                  disabled={aiBusy}
                  onAudio={(audio) => runAiDraft({ audio })}
                />
                <Button type="submit" disabled={aiBusy || aiText.trim().length < 5}>
                  {aiBusy ? t('ai.drafting') : t('ai.draft')}
                </Button>
              </div>
              <ErrorText>{aiError}</ErrorText>
            </form>
          </div>
        </div>
      )}

      {aiNotes.length > 0 && showForm && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <p className="mb-1 font-medium">{t('ai.reviewTitle')}</p>
          <ul className="list-disc space-y-0.5 pl-5">
            {aiNotes.map((note, i) => (
              <li key={i}>{note}</li>
            ))}
          </ul>
        </div>
      )}

      {showForm && (
        <Card>
          <form onSubmit={onPost} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <Label>{tc('type')}</Label>
                <Select value={type} onChange={(e) => setType(e.target.value)}>
                  {VOUCHER_TYPES.map((vt) => (
                    <option key={vt} value={vt}>
                      {t(`types.${vt}`)}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label>{tc('date')}</Label>
                <Input type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
              <div>
                <Label>{t('narration')}</Label>
                <Input
                  value={narration}
                  onChange={(e) => setNarration(e.target.value)}
                  placeholder={t('narrationPlaceholder')}
                />
              </div>
            </div>

            <div className="space-y-2">
              {lines.map((line, i) => (
                <div key={i} className="flex flex-wrap items-center gap-2">
                  <Select
                    required
                    value={line.ledgerId}
                    onChange={(e) => updateLine(i, { ledgerId: e.target.value })}
                    className="min-w-48 flex-1"
                  >
                    <option value="">{t('selectLedger')}</option>
                    {ledgers.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.name}
                      </option>
                    ))}
                  </Select>
                  <Select
                    value={line.type}
                    onChange={(e) => updateLine(i, { type: e.target.value as 'DEBIT' | 'CREDIT' })}
                    className="w-20"
                  >
                    <option value="DEBIT">{tc('dr')}</option>
                    <option value="CREDIT">{tc('cr')}</option>
                  </Select>
                  <Input
                    type="number"
                    step="0.01"
                    min="0.01"
                    required
                    value={line.amount}
                    onChange={(e) => updateLine(i, { amount: e.target.value })}
                    placeholder={tc('amount')}
                    className="w-32"
                  />
                  {lines.length > 2 && (
                    <button
                      type="button"
                      onClick={() => setLines((prev) => prev.filter((_, j) => j !== i))}
                      className="text-faint hover:text-red-500"
                      aria-label={t('removeLine')}
                    >
                      ✕
                    </button>
                  )}
                </div>
              ))}
              <Button
                type="button"
                variant="secondary"
                onClick={() => setLines((prev) => [...prev, { ...EMPTY_LINE }])}
              >
                {t('addLine')}
              </Button>
            </div>

            <div className="flex items-center justify-between border-t border-line pt-3 text-sm">
              <span className="tabular-nums">
                {tc('dr')} ₹{inr(totals.debit)} · {tc('cr')} ₹{inr(totals.credit)}
                <HelpTip text={t('helpDoubleEntry')} />{' '}
                {totals.balanced ? (
                  <span className="text-emerald-600">{t('balanced')}</span>
                ) : (
                  <span className="text-amber-600">{t('notBalanced')}</span>
                )}
              </span>
              <Button type="submit" disabled={busy || !totals.balanced}>
                {busy ? t('posting') : t('postVoucher')}
              </Button>
            </div>
            <ErrorText>{error}</ErrorText>
          </form>
        </Card>
      )}

      <Card>
        {vouchers.length === 0 ? (
          <p className="text-sm text-muted">{t('noVouchers')}</p>
        ) : (
          <div className="overflow-x-auto"><table className="w-full min-w-[600px] text-sm">
            <thead>
              <tr className="border-b border-line bg-subtle text-left text-[11px] font-semibold uppercase tracking-wide text-muted">
                <th className="py-2">{t('colNo')}</th>
                <th className="py-2">{tc('date')}</th>
                <th className="py-2">{t('colParticulars')}</th>
                <th className="py-2 text-right">{tc('amount')}</th>
                <th className="py-2 text-right">{tc('status')}</th>
              </tr>
            </thead>
            <tbody>
              {voucherTable.rows.map((v) => (
                <tr key={v.id} className="border-b border-line align-top last:border-0 hover:bg-subtle">
                  <td className="py-2 font-mono text-xs">{v.voucherNo}</td>
                  <td className="py-2 whitespace-nowrap">
                    {new Date(v.date).toLocaleDateString('en-IN')}
                  </td>
                  <td className="py-2">
                    <div className="space-y-0.5">
                      {v.lines.map((l) => (
                        <div key={l.lineNo} className="text-xs">
                          <span className={l.type === 'CREDIT' ? 'pl-4' : ''}>
                            {l.ledgerName}{' '}
                            <span className="text-faint">
                              {l.type === 'DEBIT' ? tc('dr') : tc('cr')} ₹{inr(l.amount)}
                            </span>
                          </span>
                        </div>
                      ))}
                      {v.narration && (
                        <p className="text-xs italic text-faint">{v.narration}</p>
                      )}
                    </div>
                  </td>
                  <td className="py-2 text-right tabular-nums">₹{inr(v.totalAmount)}</td>
                  <td className="py-2 text-right">
                    {v.status === 'CANCELLED' ? (
                      <span className="text-xs text-red-500">{tc('cancelled')}</span>
                    ) : canCancel ? (
                      <button
                        onClick={() => onCancel(v.id)}
                        className="text-xs text-faint hover:text-red-500"
                      >
                        {t('cancelAction')}
                      </button>
                    ) : (
                      <span className="text-xs text-emerald-600">{tc('active')}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
        <Pagination
          page={voucherTable.page}
          pageCount={voucherTable.pageCount}
          total={voucherTable.total}
          onPage={voucherTable.setPage}
        />
      </Card>
    </div>
  );
}
