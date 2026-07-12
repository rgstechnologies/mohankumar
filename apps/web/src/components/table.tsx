'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';

/**
 * Client-side search + pagination over an already-fetched list.
 * Lists are currently capped at 200 rows by the API; when server-side
 * pagination lands, this hook keeps the same interface.
 */
export function useTable<T>(rows: T[], searchText: (row: T) => string, pageSize = 25) {
  const [query, setQueryState] = useState('');
  const [page, setPage] = useState(1);

  const q = query.trim().toLowerCase();
  const filtered = q ? rows.filter((row) => searchText(row).toLowerCase().includes(q)) : rows;

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const current = Math.min(page, pageCount);
  const pageRows = filtered.slice((current - 1) * pageSize, current * pageSize);

  return {
    query,
    setQuery: (value: string) => {
      setQueryState(value);
      setPage(1);
    },
    rows: pageRows,
    total: filtered.length,
    page: current,
    pageCount,
    setPage,
  };
}

export function SearchInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  const tc = useTranslations('common');
  return (
    <div className="relative">
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
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder ?? tc('search')}
        className="w-64 rounded-lg border border-line-strong bg-surface py-2 pl-9 pr-3 text-sm outline-none transition-colors placeholder:text-faint focus:border-brand-600 focus:ring-2 focus:ring-brand-100"
      />
    </div>
  );
}

export function Pagination({
  page,
  pageCount,
  total,
  onPage,
}: {
  page: number;
  pageCount: number;
  total: number;
  onPage: (page: number) => void;
}) {
  const t = useTranslations('table');
  if (total === 0) return null;
  return (
    <div className="flex items-center justify-between border-t border-line pt-3 text-sm text-muted">
      <span className="text-xs">
        {t('records', { count: total })}
        {pageCount > 1 ? t('pageOf', { page, pageCount }) : ''}
      </span>
      {pageCount > 1 && (
        <div className="flex gap-1">
          <button
            onClick={() => onPage(page - 1)}
            disabled={page <= 1}
            className="rounded-lg border border-line-strong bg-surface px-3 py-1.5 text-xs font-medium text-muted transition-colors hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {t('prev')}
          </button>
          <button
            onClick={() => onPage(page + 1)}
            disabled={page >= pageCount}
            className="rounded-lg border border-line-strong bg-surface px-3 py-1.5 text-xs font-medium text-muted transition-colors hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {t('next')}
          </button>
        </div>
      )}
    </div>
  );
}

/** CSV / Excel / PDF download buttons for an export endpoint. */
export function ExportButtons({
  companyId,
  report,
  params = {},
}: {
  companyId: string;
  report: string;
  params?: Record<string, string | undefined>;
}) {
  const t = useTranslations('table');
  const [busy, setBusy] = useState<string | null>(null);

  async function download(format: 'csv' | 'xlsx' | 'pdf') {
    setBusy(format);
    try {
      const query = new URLSearchParams({ format });
      for (const [key, value] of Object.entries(params)) {
        if (value) query.set(key, value);
      }
      const { downloadFile } = await import('@/lib/api');
      await downloadFile(`/companies/${companyId}/exports/${report}?${query}`);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex items-center gap-1">
      <span className="mr-1 text-xs font-medium text-faint">{t('exportLabel')}</span>
      {(['csv', 'xlsx', 'pdf'] as const).map((format) => (
        <button
          key={format}
          onClick={() => download(format)}
          disabled={busy !== null}
          className="rounded-lg border border-line-strong bg-surface px-2.5 py-1.5 text-xs font-medium uppercase text-muted transition-colors hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700 disabled:opacity-50"
        >
          {busy === format ? '…' : format === 'xlsx' ? 'Excel' : format}
        </button>
      ))}
    </div>
  );
}

/** Standard empty state with a call to action. */
export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-50 text-brand-500">
        <svg
          className="h-7 w-7"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8z" />
          <path d="M14 3v5h5M9 13h6M9 17h6" />
        </svg>
      </div>
      <h3 className="text-base font-bold text-brand-900">{title}</h3>
      <p className="mt-1 max-w-sm text-sm text-muted">{body}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
