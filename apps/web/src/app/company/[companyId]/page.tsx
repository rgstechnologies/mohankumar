'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ThemeToggle } from '@/components/theme';
import {
  fetchInvoices,
  fetchEstimates,
  fetchItems,
  fetchLedgers,
  fetchParties,
  fetchStock,
  type InvoiceView,
  type EstimateView,
  type ItemRow,
  type LedgerRow,
  type PartyRow,
  type StockRow,
} from '@/lib/accounting';
import { api, isAuthenticated, logout, type Me } from '@/lib/api';
import { LanguageSwitcher } from '@/components/language-switcher';

const COMPANY_TITLE = process.env.NEXT_PUBLIC_COMPANY_TITLE || 'RGS Technologies';
const COMPANY_LOGO_URL = process.env.NEXT_PUBLIC_COMPANY_LOGO_URL || '/rgs-logo.jpeg';
import { InvoicesTab } from './invoices-tab';
import { EstimatesTab } from './estimates-tab';
import { PaymentPage } from './payment-page';
import { ItemsTab } from './items-tab';
import { OverviewTab } from './overview-tab';
import { PartiesTab } from './parties-tab';
import { ReportsTab } from './reports-tab';
import { StockTab } from './stock-tab';

type Tab =
  | 'overview'
  | 'estimates'
  | 'invoices'
  | 'estimate-payments'
  | 'invoice-payments'
  | 'stock'
  | 'items'
  | 'parties'
  | 'reports'

function NavIcon({ name }: { name: Tab }) {
  const paths: Record<Tab, React.ReactNode> = {
    overview: <path d="M3 12l9-9 9 9M5 10v10h5v-6h4v6h5V10" />,
    estimates: <path d="M9 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8l-5-5H9zM14 3v5h5M9 13h6M9 17h4" />,
    invoices: <path d="M7 3h7l5 5v13H7V3zM14 3v5h5M10 13h6M10 17h6" />,
    'estimate-payments': (
      <path d="M3 9l9-6 9 6M4 9v11M20 9v11M2 20h20M8 13v4M16 13v4M12 12l2 2 3-3" />
    ),
    'invoice-payments': (
      <path d="M3 9l9-6 9 6M4 9v11M20 9v11M2 20h20M8 13v4M12 13v4M16 13v4" />
    ),
    stock: <path d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3zM12 12l8-4.5M12 12v9M12 12L4 7.5" />,
    items: (
      <path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82zM7 7h.01" />
    ),
    parties: (
      <path d="M17 21v-2a4 4 0 00-4-4H7a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />
    ),
    reports: <path d="M5 20v-6M10 20V8M15 20v-10M20 20V13M3 20h18" />,

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
      { key: 'invoices', label: 'invoices' },
      // The two banking screens: money settled against estimates, and against
      // GST invoices. A customer is tracked by one or the other, never both.
      { key: 'estimate-payments', label: 'estimatePayments' },
      { key: 'invoice-payments', label: 'invoicePayments' },
    ],
  },

  {
    group: 'inventory',
    items: [
      { key: 'stock', label: 'stock' },
      { key: 'items', label: 'items' },
    ],
  },
  {
    group: 'accounting',
    items: [
      { key: 'reports', label: 'reports' },
    ],
  },
  { group: 'contacts', items: [{ key: 'parties', label: 'parties' }] },
];

/** Top-bar account button with a dropdown (profile, admin, log out). */
function ProfileMenu({
  name,
  email,
  labels,
  onLogout,
}: {
  name: string;
  email: string;
  labels: { signOut: string };
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
  const [user, setUser] = useState<{ name: string; email: string }>({
    name: '',
    email: '',
  });
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
  const [ledgers, setLedgers] = useState<LedgerRow[]>([]);
  const [parties, setParties] = useState<PartyRow[]>([]);
  const [items, setItems] = useState<ItemRow[]>([]);
  const [invoices, setInvoices] = useState<InvoiceView[]>([]);
  const [estimates, setEstimates] = useState<EstimateView[]>([]);
  const [stock, setStock] = useState<StockRow[]>([]);

  // Open a specific tab when arriving with ?tab=… (e.g. returning from a
  // full-screen entry page like /invoices/new).
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const q = new URLSearchParams(window.location.search).get('tab');
    if (q) setTab(q as Tab);
  }, []);

  const reload = useCallback(async () => {
    const [l, p, i, inv, est, st] = await Promise.all([
      fetchLedgers(companyId),
      fetchParties(companyId),
      fetchItems(companyId),
      fetchInvoices(companyId),
      fetchEstimates(companyId),
      fetchStock(companyId),
    ]);
    setLedgers(l);
    setParties(p);
    setItems(i);
    setInvoices(inv);
    setEstimates(est);
    setStock(st);
  }, [companyId]);

  useEffect(() => {
    if (!isAuthenticated()) {
      router.push('/login');
      return;
    }
    api
      .get<Me>('/auth/me')
      .then(async (me) => {
        setUser({ name: me.name, email: me.email });
        const membership = me.memberships.find((m) => m.company.id === companyId);
        if (!membership) {
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
  const currentGroup = NAV_GROUPS.find((g) => g.items.some((i) => i.key === tab));

  if (!companyName) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-canvas text-sm text-muted">
        {tc('loading')}
      </main>
    );
  }

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
            <img src={COMPANY_LOGO_URL} alt={COMPANY_TITLE} className="h-9 w-9 shrink-0 rounded-xl bg-white object-contain shadow-sm" />
            {!collapsed && (
              <span className="truncate text-lg font-bold tracking-tight text-ink">{COMPANY_TITLE}</span>
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
            const items = group.items;
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

          <LanguageSwitcher />
          <ThemeToggle />
          <ProfileMenu
            name={user.name}
            email={user.email}
            labels={{ signOut: t('signOut') }}
            onLogout={async () => {
              await logout();
              router.push('/login');
            }}
          />
        </header>

        {/* Page title band */}
        {tab !== 'estimate-payments' && tab !== 'invoice-payments' && tab !== 'payment-out' && (
          <div className="flex items-center justify-between gap-3 border-b border-line bg-surface px-4 py-4 lg:px-6">
            <h1 className="truncate text-xl font-bold text-ink">{t(`titles.${tab}`)}</h1>
            {role === 'AUDITOR' ? (
              <span className="shrink-0 rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700 ring-1 ring-inset ring-amber-200">
                {t('readOnlyAuditor')}
              </span>
            ) : null}
          </div>
        )}

        <main className="space-y-6 p-4 lg:p-6">
          {tab === 'overview' && <OverviewTab companyId={companyId} />}

          {tab === 'estimates' && (
            <EstimatesTab
              companyId={companyId}
              estimates={estimates}
              canBill={canPostVouchers}
              canCancel={canManageLedgers}
              onChanged={reload}
            />
          )}
          {tab === 'invoices' && (
            <InvoicesTab
              companyId={companyId}
              ledgers={ledgers}
              invoices={invoices}
              canBill={canPostVouchers}
              canCancel={canManageLedgers}
              onChanged={reload}
            />
          )}

          {/* The two banking screens. Same engine, different document: a customer
              is tracked against estimates OR invoices (never both), so each screen
              shows only the customers it settles for. */}
          {tab === 'estimate-payments' && (
            <PaymentPage
              companyId={companyId}
              mode="in"
              docKind="estimate"
              parties={parties}
              ledgers={ledgers}
              canManage={canPostVouchers}
              onChanged={reload}
            />
          )}
          {tab === 'invoice-payments' && (
            <PaymentPage
              companyId={companyId}
              mode="in"
              docKind="invoice"
              parties={parties}
              ledgers={ledgers}
              canManage={canPostVouchers}
              onChanged={reload}
            />
          )}

          {tab === 'stock' && (
            <StockTab
              companyId={companyId}
              stock={stock}
              items={items}
              canManage={canManageLedgers}
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

          {tab === 'reports' && <ReportsTab companyId={companyId} />}

          {tab === 'parties' && (
            <PartiesTab
              companyId={companyId}
              parties={parties}
              ledgers={ledgers}
              canManage={canManageLedgers}
              onChanged={reload}
            />
          )}

        </main>
      </div>
    </div>
  );
}


