'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';

import { ThemeToggle } from '@/components/theme';

import {
  fetchGroups,
  fetchInvoices,
  fetchEstimates,
  fetchItems,
  fetchLedgers,
  fetchNotes,
  fetchParties,
  fetchPurchaseBills,
  fetchStock,
  fetchVouchers,

  type AccountGroup,
  type InvoiceView,
  type EstimateView,
  type ItemRow,
  type LedgerRow,
  type NoteView,
  type PartyRow,
  type PurchaseBillView,
  type StockRow,
  type VoucherView,
} from '@/lib/accounting';
import { APP_NAME, APP_LOGO } from '@/lib/brand';
import { api, isAuthenticated, logout, type Me } from '@/lib/api';

import { LanguageSwitcher } from '@/components/language-switcher';

import { InvoicesTab } from './invoices-tab';
import { EstimatesTab } from './estimates-tab';
import { ProfileTab } from './profile-tab';
import { PrintSettingsTab } from './print-settings-tab';
import { PaymentPage } from './payment-page';
import { ItemsTab } from './items-tab';
import { OverviewTab } from './overview-tab';
import { PartiesTab } from './parties-tab';
import { ActivityTab } from './activity-tab';

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
  | 'activity'
  | 'print-settings'
  | 'profile';

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
    activity: <path d="M22 12h-4l-3 9L9 3l-3 9H2" />,
    'print-settings': (
      <path d="M6 9V3h12v6M6 18H4a2 2 0 01-2-2v-4a2 2 0 012-2h16a2 2 0 012 2v4a2 2 0 01-2 2h-2M6 14h12v7H6z" />
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
  {
    group: 'settings',
    items: [
      { key: 'activity', label: 'activity' },
      { key: 'print-settings', label: 'printSettings' },
      { key: 'profile', label: 'profile' },
    ],
  },
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
  const [, setGroups] = useState<AccountGroup[]>([]);
  const [ledgers, setLedgers] = useState<LedgerRow[]>([]);
  const [, setVouchers] = useState<VoucherView[]>([]);
  const [parties, setParties] = useState<PartyRow[]>([]);
  const [items, setItems] = useState<ItemRow[]>([]);
  const [invoices, setInvoices] = useState<InvoiceView[]>([]);
  const [estimates, setEstimates] = useState<EstimateView[]>([]);
  const [, setBills] = useState<PurchaseBillView[]>([]);

  const [, setNotes] = useState<NoteView[]>([]);
  const [stock, setStock] = useState<StockRow[]>([]);

  // Open a specific tab when arriving with ?tab=… (e.g. returning from a
  // full-screen entry page like /invoices/new).
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const q = new URLSearchParams(window.location.search).get('tab');
    if (q) setTab(q as Tab);
  }, []);

  const reload = useCallback(async () => {
    const [g, l, v, p, i, inv, est, pb, st, nt] = await Promise.all([
      fetchGroups(companyId),
      fetchLedgers(companyId),
      fetchVouchers(companyId),
      fetchParties(companyId),
      fetchItems(companyId),
      fetchInvoices(companyId),
      fetchEstimates(companyId),
      fetchPurchaseBills(companyId),
      fetchStock(companyId),
      fetchNotes(companyId),
    ]);
    setGroups(g);
    setLedgers(l);
    setVouchers(v);
    setParties(p);
    setItems(i);
    setInvoices(inv);
    setEstimates(est);
    setBills(pb);
    setStock(st);
    setNotes(nt);
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
  const isAdminRole = ['OWNER', 'ADMIN'].includes(role);
  const currentGroup = NAV_GROUPS.find((g) => g.items.some((i) => i.key === tab));

  if (!companyName) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-canvas text-sm text-muted">
        {tc('loading')}
      </main>
    );
  }

  const canSee = (key: Tab) =>
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
        className={`fixed inset-y-0 left-0 z-40 flex w-[260px] flex-col border-r border-line bg-surface text-muted transition-[width,transform] duration-200 lg:translate-x-0 ${collapsed ? 'lg:w-[76px]' : 'lg:w-[260px]'
          } ${mobileNav ? 'translate-x-0' : '-translate-x-full'}`}
      >
        <div className="flex h-[70px] items-center gap-2.5 border-b border-line px-4">
          <Link href="/dashboard" className="flex min-w-0 items-center gap-2.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={APP_LOGO} alt={APP_NAME} className="h-9 w-9 shrink-0 rounded-xl bg-white object-contain shadow-sm" />
            {!collapsed && (
              <span className="truncate text-lg font-bold tracking-tight text-ink">{APP_NAME}</span>
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
                      className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors ${collapsed ? 'justify-center' : ''
                        } ${tab === item.key
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
        <div className="flex items-center justify-between gap-3 border-b border-line bg-surface px-4 py-4 lg:px-6">
          <h1 className="truncate text-xl font-bold text-ink">{t(`titles.${tab}`)}</h1>
          {role === 'AUDITOR' ? (
            <span className="shrink-0 rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700 ring-1 ring-inset ring-amber-200">
              {t('readOnlyAuditor')}
            </span>
          ) : null}
        </div>

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
              canCustomize={isAdminRole}
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

          {tab === 'activity' && isAdminRole && <ActivityTab companyId={companyId} />}
          {tab === 'print-settings' && isAdminRole && (
            <PrintSettingsTab companyId={companyId} canManage={isAdminRole} />
          )}
          {tab === 'profile' && isAdminRole && (
            <ProfileTab companyId={companyId} canManage={isAdminRole} />
          )}
        </main>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------
// Ledgers
// ----------------------------------------------------------------

// function LedgersTab({
//   companyId,
//   groups,
//   ledgers,
//   canManage,
//   onChanged,
// }: {
//   companyId: string;
//   groups: AccountGroup[];
//   ledgers: LedgerRow[];
//   canManage: boolean;
//   onChanged: () => Promise<void>;
// }) {
//   const t = useTranslations('ledgers');
//   const tc = useTranslations('common');
//   const groupOptions = useMemo(() => flattenGroups(groups), [groups]);
//   const ledgerTable = useTable(ledgers, (l) => `${l.name} ${l.group.name}`);
//   const [showForm, setShowForm] = useState(false);
//   const [name, setName] = useState('');
//   const [groupId, setGroupId] = useState('');
//   const [opening, setOpening] = useState('');
//   const [openingType, setOpeningType] = useState<'DEBIT' | 'CREDIT'>('DEBIT');
//   const [error, setError] = useState('');
//   const [busy, setBusy] = useState(false);

//   async function onCreate(e: React.FormEvent) {
//     e.preventDefault();
//     setError('');
//     setBusy(true);
//     try {
//       await api.post(`/companies/${companyId}/ledgers`, {
//         name,
//         groupId,
//         openingBalance: opening ? Number(opening) : undefined,
//         openingType,
//       });
//       setName('');
//       setOpening('');
//       setShowForm(false);
//       await onChanged();
//     } catch (err) {
//       setError(err instanceof ApiError ? err.message : tc('somethingWentWrong'));
//     } finally {
//       setBusy(false);
//     }
//   }

//   return (
//     <div className="space-y-4">
//       <div className="flex flex-wrap items-center justify-between gap-3">
//         <SearchInput
//           value={ledgerTable.query}
//           onChange={ledgerTable.setQuery}
//           placeholder={t('searchPlaceholder')}
//         />
//         {canManage && (
//           <Button
//             variant={showForm ? 'secondary' : 'primary'}
//             onClick={() => setShowForm(!showForm)}
//           >
//             {showForm ? tc('close') : t('newLedger')}
//           </Button>
//         )}
//       </div>

//       {showForm && (
//         <Card>
//           <form onSubmit={onCreate} className="grid grid-cols-1 items-end gap-4 sm:grid-cols-5">
//             <div className="sm:col-span-2">
//               <Label>{t('ledgerName')}</Label>
//               <Input required value={name} onChange={(e) => setName(e.target.value)} />
//             </div>
//             <div>
//               <Label>{t('group')}</Label>
//               <Select required value={groupId} onChange={(e) => setGroupId(e.target.value)}>
//                 <option value="">{t('select')}</option>
//                 {groupOptions.map((g) => (
//                   <option key={g.id} value={g.id}>
//                     {g.label}
//                   </option>
//                 ))}
//               </Select>
//             </div>
//             <div>
//               <Label>{t('openingBalance')}</Label>
//               <Input
//                 type="number"
//                 step="0.01"
//                 min="0"
//                 value={opening}
//                 onChange={(e) => setOpening(e.target.value)}
//                 placeholder="0.00"
//               />
//             </div>
//             <div className="flex gap-2">
//               <Select
//                 value={openingType}
//                 onChange={(e) => setOpeningType(e.target.value as 'DEBIT' | 'CREDIT')}
//               >
//                 <option value="DEBIT">{tc('dr')}</option>
//                 <option value="CREDIT">{tc('cr')}</option>
//               </Select>
//               <Button type="submit" disabled={busy}>
//                 {busy ? '…' : tc('add')}
//               </Button>
//             </div>
//             <div className="sm:col-span-5">
//               <ErrorText>{error}</ErrorText>
//             </div>
//           </form>
//         </Card>
//       )}

//       <Card>
//         <div className="overflow-x-auto"><table className="w-full min-w-[600px] text-sm">
//           <thead>
//             <tr className="border-b border-line bg-subtle text-left text-[11px] font-semibold uppercase tracking-wide text-muted">
//               <th className="py-2">{t('colLedger')}</th>
//               <th className="py-2">{t('colGroup')}</th>
//               <th className="py-2 text-right">{tc('balance')}</th>
//             </tr>
//           </thead>
//           <tbody>
//             {ledgerTable.rows.map((l) => (
//               <tr key={l.id} className="border-b border-line last:border-0 hover:bg-subtle">
//                 <td className="py-2 font-medium">
//                   {l.name}
//                   {l.isSystem && (
//                     <span className="ml-2 rounded bg-subtle px-1.5 py-0.5 text-[10px] text-muted">
//                       {t('system')}
//                     </span>
//                   )}
//                 </td>
//                 <td className="py-2 text-muted">{l.group.name}</td>
//                 <td className="py-2 text-right tabular-nums">
//                   ₹{inr(l.balance)}{' '}
//                   <span className="text-xs text-faint">
//                     {l.balanceType === 'DEBIT' ? tc('dr') : tc('cr')}
//                   </span>
//                 </td>
//               </tr>
//             ))}
//           </tbody>
//         </table></div>
//         <Pagination
//           page={ledgerTable.page}
//           pageCount={ledgerTable.pageCount}
//           total={ledgerTable.total}
//           onPage={ledgerTable.setPage}
//         />
//       </Card>
//     </div>
//   );
// }

// ----------------------------------------------------------------
// Vouchers
// ----------------------------------------------------------------





// function VouchersTab({
//   companyId,
//   ledgers,
//   vouchers,
//   canPost,
//   canCancel,
//   onChanged,
// }: {
//   companyId: string;
//   ledgers: LedgerRow[];
//   vouchers: VoucherView[];
//   canPost: boolean;
//   canCancel: boolean;
//   onChanged: () => Promise<void>;
// }) {
//   const t = useTranslations('vouchers');
//   const tc = useTranslations('common');
//   const { toast, confirm } = useFeedback();
//   const voucherTable = useTable(
//     vouchers,
//     (v) => `${v.voucherNo} ${v.type} ${v.narration ?? ''} ${v.lines.map((l) => l.ledgerName).join(' ')}`,
//   );
//   const [showForm, setShowForm] = useState(false);
//   const [type, setType] = useState<string>('JOURNAL');
//   const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
//   const [narration, setNarration] = useState('');
//   const [lines, setLines] = useState<DraftLine[]>([
//     { ...EMPTY_LINE },
//     { ...EMPTY_LINE, type: 'CREDIT' },
//   ]);
//   const [error, setError] = useState('');
//   const [busy, setBusy] = useState(false);
//   const totals = useMemo(() => {
//     let debit = 0;
//     let credit = 0;
//     for (const line of lines) {
//       const amount = Number(line.amount) || 0;
//       if (line.type === 'DEBIT') debit += amount;
//       else credit += amount;
//     }
//     return { debit, credit, balanced: debit > 0 && Math.abs(debit - credit) < 0.005 };
//   }, [lines]);

//   function updateLine(index: number, patch: Partial<DraftLine>) {
//     setLines((prev) => prev.map((l, i) => (i === index ? { ...l, ...patch } : l)));
//   }

//   async function onPost(e: React.FormEvent) {
//     e.preventDefault();
//     setError('');
//     setBusy(true);
//     try {
//       await api.post(`/companies/${companyId}/vouchers`, {
//         type,
//         date,
//         narration: narration || undefined,
//         lines: lines.map((l) => ({
//           ledgerId: l.ledgerId,
//           type: l.type,
//           amount: Number(l.amount),
//         })),
//       });
//       setNarration('');
//       setLines([{ ...EMPTY_LINE }, { ...EMPTY_LINE, type: 'CREDIT' }]);
//       setShowForm(false);
//       await onChanged();
//       toast(t('posted'));
//     } catch (err) {
//       setError(err instanceof ApiError ? err.message : tc('somethingWentWrong'));
//     } finally {
//       setBusy(false);
//     }
//   }

//   async function onCancel(voucherId: string) {
//     const ok = await confirm({
//       title: t('cancelTitle'),
//       body: t('cancelBody'),
//       confirmLabel: t('cancelConfirm'),
//       danger: true,
//     });
//     if (!ok) return;
//     await api.post(`/companies/${companyId}/vouchers/${voucherId}/cancel`);
//     await onChanged();
//     toast(t('cancelled'), 'info');
//   }

//   return (
//     <div className="space-y-4">
//       <div className="flex flex-wrap items-center justify-between gap-3">
//         <SearchInput
//           value={voucherTable.query}
//           onChange={voucherTable.setQuery}
//           placeholder={t('searchPlaceholder')}
//         />
//         {canPost && (
//           <Button
//             variant={showForm ? 'secondary' : 'primary'}
//             onClick={() => setShowForm(!showForm)}
//           >
//             {showForm ? tc('close') : t('newVoucher')}
//           </Button>
//         )}
//       </div>

//       {showForm && (
//         <Card>
//           <form onSubmit={onPost} className="space-y-4">
//             <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
//               <div>
//                 <Label>{tc('type')}</Label>
//                 <Select value={type} onChange={(e) => setType(e.target.value)}>
//                   {VOUCHER_TYPES.map((vt) => (
//                     <option key={vt} value={vt}>
//                       {t(`types.${vt}`)}
//                     </option>
//                   ))}
//                 </Select>
//               </div>
//               <div>
//                 <Label>{tc('date')}</Label>
//                 <Input type="date" required value={date} onChange={(e) => setDate(e.target.value)} />
//               </div>
//               <div>
//                 <Label>{t('narration')}</Label>
//                 <Input
//                   value={narration}
//                   onChange={(e) => setNarration(e.target.value)}
//                   placeholder={t('narrationPlaceholder')}
//                 />
//               </div>
//             </div>

//             <div className="space-y-2">
//               {lines.map((line, i) => (
//                 <div key={i} className="flex flex-wrap items-center gap-2">
//                   <Select
//                     required
//                     value={line.ledgerId}
//                     onChange={(e) => updateLine(i, { ledgerId: e.target.value })}
//                     className="min-w-48 flex-1"
//                   >
//                     <option value="">{t('selectLedger')}</option>
//                     {ledgers.map((l) => (
//                       <option key={l.id} value={l.id}>
//                         {l.name}
//                       </option>
//                     ))}
//                   </Select>
//                   <Select
//                     value={line.type}
//                     onChange={(e) => updateLine(i, { type: e.target.value as 'DEBIT' | 'CREDIT' })}
//                     className="w-20"
//                   >
//                     <option value="DEBIT">{tc('dr')}</option>
//                     <option value="CREDIT">{tc('cr')}</option>
//                   </Select>
//                   <Input
//                     type="number"
//                     step="0.01"
//                     min="0.01"
//                     required
//                     value={line.amount}
//                     onChange={(e) => updateLine(i, { amount: e.target.value })}
//                     placeholder={tc('amount')}
//                     className="w-32"
//                   />
//                   {lines.length > 2 && (
//                     <button
//                       type="button"
//                       onClick={() => setLines((prev) => prev.filter((_, j) => j !== i))}
//                       className="text-faint hover:text-red-500"
//                       aria-label={t('removeLine')}
//                     >
//                       ✕
//                     </button>
//                   )}
//                 </div>
//               ))}
//               <Button
//                 type="button"
//                 variant="secondary"
//                 onClick={() => setLines((prev) => [...prev, { ...EMPTY_LINE }])}
//               >
//                 {t('addLine')}
//               </Button>
//             </div>

//             <div className="flex items-center justify-between border-t border-line pt-3 text-sm">
//               <span className="tabular-nums">
//                 {tc('dr')} ₹{inr(totals.debit)} · {tc('cr')} ₹{inr(totals.credit)}
//                 <HelpTip text={t('helpDoubleEntry')} />{' '}
//                 {totals.balanced ? (
//                   <span className="text-emerald-600">{t('balanced')}</span>
//                 ) : (
//                   <span className="text-amber-600">{t('notBalanced')}</span>
//                 )}
//               </span>
//               <Button type="submit" disabled={busy || !totals.balanced}>
//                 {busy ? t('posting') : t('postVoucher')}
//               </Button>
//             </div>
//             <ErrorText>{error}</ErrorText>
//           </form>
//         </Card>
//       )}

//       <Card>
//         {vouchers.length === 0 ? (
//           <p className="text-sm text-muted">{t('noVouchers')}</p>
//         ) : (
//           <div className="overflow-x-auto"><table className="w-full min-w-[600px] text-sm">
//             <thead>
//               <tr className="border-b border-line bg-subtle text-left text-[11px] font-semibold uppercase tracking-wide text-muted">
//                 <th className="py-2">{t('colNo')}</th>
//                 <th className="py-2">{tc('date')}</th>
//                 <th className="py-2">{t('colParticulars')}</th>
//                 <th className="py-2 text-right">{tc('amount')}</th>
//                 <th className="py-2 text-right">{tc('status')}</th>
//               </tr>
//             </thead>
//             <tbody>
//               {voucherTable.rows.map((v) => (
//                 <tr key={v.id} className="border-b border-line align-top last:border-0 hover:bg-subtle">
//                   <td className="py-2 font-mono text-xs">{v.voucherNo}</td>
//                   <td className="py-2 whitespace-nowrap">
//                     {new Date(v.date).toLocaleDateString('en-IN')}
//                   </td>
//                   <td className="py-2">
//                     <div className="space-y-0.5">
//                       {v.lines.map((l) => (
//                         <div key={l.lineNo} className="text-xs">
//                           <span className={l.type === 'CREDIT' ? 'pl-4' : ''}>
//                             {l.ledgerName}{' '}
//                             <span className="text-faint">
//                               {l.type === 'DEBIT' ? tc('dr') : tc('cr')} ₹{inr(l.amount)}
//                             </span>
//                           </span>
//                         </div>
//                       ))}
//                       {v.narration && (
//                         <p className="text-xs italic text-faint">{v.narration}</p>
//                       )}
//                     </div>
//                   </td>
//                   <td className="py-2 text-right tabular-nums">₹{inr(v.totalAmount)}</td>
//                   <td className="py-2 text-right">
//                     {v.status === 'CANCELLED' ? (
//                       <span className="text-xs text-red-500">{tc('cancelled')}</span>
//                     ) : canCancel ? (
//                       <button
//                         onClick={() => onCancel(v.id)}
//                         className="text-xs text-faint hover:text-red-500"
//                       >
//                         {t('cancelAction')}
//                       </button>
//                     ) : (
//                       <span className="text-xs text-emerald-600">{tc('active')}</span>
//                     )}
//                   </td>
//                 </tr>
//               ))}
//             </tbody>
//           </table></div>
//         )}
//         <Pagination
//           page={voucherTable.page}
//           pageCount={voucherTable.pageCount}
//           total={voucherTable.total}
//           onPage={voucherTable.setPage}
//         />
//       </Card>
//     </div>
//   );
// }
