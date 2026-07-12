'use client';

/** Workspace top-bar tools: universal search + notification bell. */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { api } from '@/lib/api';
import {
  IconInvoice,
  IconItem,
  IconLedger,
  IconParty,
  IconPurchase,
  IconVoucher,
} from '@/components/icons';

interface SearchResult {
  type: string;
  id: string;
  title: string;
  subtitle: string;
  tab: string;
}

const TYPE_ICON: Record<string, (props: { className?: string }) => React.ReactNode> = {
  party: IconParty,
  item: IconItem,
  ledger: IconLedger,
  invoice: IconInvoice,
  purchase: IconPurchase,
  voucher: IconVoucher,
};

export function UniversalSearch({
  companyId,
  onNavigate,
}: {
  companyId: string;
  onNavigate: (tab: string) => void;
}) {
  const t = useTranslations('topbar');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Debounced search
  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      return;
    }
    setLoading(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      try {
        const found = await api.get<SearchResult[]>(
          `/companies/${companyId}/search?q=${encodeURIComponent(query)}`,
        );
        setResults(found);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => clearTimeout(timer.current);
  }, [query, companyId]);

  // Close on outside click
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  return (
    <div ref={boxRef} className="relative hidden w-72 md:block lg:w-96">
      <svg
        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      >
        <circle cx="11" cy="11" r="7" />
        <path d="M21 21l-4.35-4.35" />
      </svg>
      <input
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder={t('searchPlaceholder')}
        className="w-full rounded-lg border border-line bg-subtle py-2 pl-9 pr-3 text-sm text-ink outline-none transition-colors placeholder:text-faint focus:border-brand-400 focus:bg-surface focus:ring-2 focus:ring-brand-100"
      />

      {open && query.trim().length >= 2 && (
        <div className="absolute left-0 right-0 top-full z-30 mt-2 max-h-96 overflow-y-auto rounded-xl border border-line bg-elevated py-2 shadow-xl">
          {loading && results.length === 0 ? (
            <p className="px-4 py-3 text-sm text-faint">{t('searching')}</p>
          ) : results.length === 0 ? (
            <p className="px-4 py-3 text-sm text-faint">
              {t('noMatches', { query })}
            </p>
          ) : (
            results.map((result) => (
              <button
                key={`${result.type}-${result.id}`}
                onClick={() => {
                  onNavigate(result.tab);
                  setOpen(false);
                  setQuery('');
                }}
                className="flex w-full items-center gap-3 px-4 py-2 text-left hover:bg-brand-50"
              >
                {(() => {
                  const Glyph = TYPE_ICON[result.type];
                  return (
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-subtle text-muted">
                      {Glyph ? <Glyph className="h-4 w-4" /> : '•'}
                    </span>
                  );
                })()}
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-ink">
                    {result.title}
                  </span>
                  <span className="block truncate text-xs text-faint">
                    {result.subtitle}
                  </span>
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ----------------------------------------------------------------
// Notifications bell
// ----------------------------------------------------------------

interface Notification {
  id: string;
  severity: 'info' | 'warning' | 'urgent';
  title: string;
  detail: string;
  tab: string;
  read?: boolean;
}

const SEVERITY_DOT: Record<string, string> = {
  urgent: 'bg-red-500',
  warning: 'bg-amber-500',
  info: 'bg-brand-400',
};

export function NotificationsBell({
  companyId,
  onNavigate,
}: {
  companyId: string;
  onNavigate: (tab: string) => void;
}) {
  const t = useTranslations('topbar');
  const [items, setItems] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  const load = useCallback(() => {
    api
      .get<Notification[]>(`/companies/${companyId}/notifications`)
      .then(setItems)
      .catch(() => {});
  }, [companyId]);

  useEffect(() => {
    load();
    const interval = setInterval(load, 120_000); // refresh every 2 min
    return () => clearInterval(interval);
  }, [load]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const markRead = useCallback(
    (id: string) => {
      // Optimistic: flip locally first, then let the server return the truth.
      setItems((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
      api
        .post<Notification[]>(`/companies/${companyId}/notifications/read`, { id })
        .then(setItems)
        .catch(() => {});
    },
    [companyId],
  );

  const markAllRead = useCallback(() => {
    setItems((prev) => prev.map((n) => ({ ...n, read: true })));
    api
      .post<Notification[]>(`/companies/${companyId}/notifications/read-all`)
      .then(setItems)
      .catch(() => {});
  }, [companyId]);

  const unread = items.filter((n) => !n.read);
  const unreadCount = unread.length;
  const urgentCount = unread.filter((n) => n.severity === 'urgent').length;

  return (
    <div ref={boxRef} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="relative flex h-9 w-9 items-center justify-center rounded-lg text-muted transition-colors hover:bg-subtle hover:text-ink"
        aria-label={t('notificationsAria', { count: unreadCount })}
      >
        <svg
          className="h-5 w-5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M18 8a6 6 0 00-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 01-3.4 0" />
        </svg>
        {unreadCount > 0 && (
          <span
            className={`absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[9px] font-bold text-white ${
              urgentCount > 0 ? 'bg-red-500' : 'bg-amber-500'
            }`}
          >
            {unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-30 mt-2 w-96 rounded-xl border border-line bg-elevated py-2 shadow-xl">
          <div className="flex items-center justify-between border-b border-line px-4 pb-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">
              {t('notifications')}
            </p>
            {unreadCount > 0 && (
              <button
                onClick={markAllRead}
                className="text-xs font-medium text-brand-600 hover:text-brand-700"
              >
                {t('markAllRead')}
              </button>
            )}
          </div>
          {items.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-faint">
              {t('allClear')}
            </p>
          ) : (
            items.map((n) => (
              <button
                key={n.id}
                onClick={() => {
                  if (!n.read) markRead(n.id);
                  onNavigate(n.tab);
                  setOpen(false);
                }}
                className={`flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-subtle ${
                  n.read ? 'opacity-55' : ''
                }`}
              >
                <span
                  className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                    n.read ? 'bg-line-strong' : SEVERITY_DOT[n.severity]
                  }`}
                />
                <span>
                  <span
                    className={`block text-sm ${
                      n.read ? 'font-normal text-muted' : 'font-medium text-ink'
                    }`}
                  >
                    {n.title}
                  </span>
                  <span className="mt-0.5 block text-xs leading-relaxed text-muted">
                    {n.detail}
                  </span>
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
