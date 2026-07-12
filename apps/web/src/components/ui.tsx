'use client';

import { Children, isValidElement, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

/** Flatten a React node into its plain-text content (for option labels). */
function nodeText(node: React.ReactNode): string {
  if (node == null || node === false || node === true) return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(nodeText).join('');
  if (isValidElement(node)) {
    return nodeText((node.props as { children?: React.ReactNode }).children);
  }
  return '';
}

/** Shared UI primitives — consistent across the whole app (Hostinger-style: soft, rounded, violet). */

export function Input({ value, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      // Coerce null → '' so a controlled input never gets `value={null}`
      // (React warns); leave undefined alone so uncontrolled inputs still work.
      value={value === null ? '' : value}
      className={`w-full rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm text-ink outline-none transition-colors placeholder:text-faint focus:border-brand-600 focus:ring-2 focus:ring-brand-100 disabled:bg-subtle disabled:text-faint ${props.className ?? ''}`}
    />
  );
}

/**
 * Drop-in replacement for a native <select> that renders the app's custom
 * Combobox (searchable, portal menu, theme-aware). Parses its <option> children
 * so existing call sites — `<Select value onChange><option/>…</Select>` — work
 * unchanged; onChange receives a synthetic `{ target: { value } }`.
 */
export function Select({
  value,
  onChange,
  disabled,
  className,
  children,
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  const options: ComboOption[] = [];
  let placeholder = 'Select…';
  let first = true;
  Children.forEach(children, (c) => {
    if (!isValidElement(c) || c.type !== 'option') return;
    const props = c.props as { value?: string | number | readonly string[]; children?: React.ReactNode };
    const v = props.value == null ? '' : String(props.value);
    const label = nodeText(props.children);
    if (first && v === '') placeholder = label || 'Select…';
    first = false;
    options.push({ value: v, label });
  });
  return (
    <Combobox
      value={value == null ? '' : String(value)}
      onChange={(v) =>
        onChange?.({ target: { value: v } } as unknown as React.ChangeEvent<HTMLSelectElement>)
      }
      options={options}
      placeholder={placeholder}
      disabled={disabled ?? false}
      className={className ?? ''}
    />
  );
}

export interface ComboOption {
  value: string;
  label: string;
  /** Optional muted secondary text shown on the right (e.g. GSTIN, balance). */
  hint?: string;
}

/**
 * Searchable single-select dropdown (combobox) — type to filter, arrow keys to
 * navigate, Enter to pick, Esc/click-away to close. Drop-in replacement for a
 * native <Select> when the option list is long (parties, items, banks…).
 */
export function Combobox({
  value,
  onChange,
  options,
  placeholder = 'Select…',
  searchPlaceholder = 'Search…',
  emptyText = 'No matches',
  disabled = false,
  className = '',
}: {
  value: string;
  onChange: (value: string) => void;
  options: ComboOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  disabled?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [coords, setCoords] = useState<{ top: number; left: number; width: number } | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = options.find((o) => o.value === value) ?? null;
  const showSearch = options.length > 6;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) =>
      `${o.label} ${o.hint ?? ''}`.toLowerCase().includes(q),
    );
  }, [options, query]);

  // Position the menu in fixed/viewport coords so it escapes any overflow
  // (the line-items table scrolls horizontally and would otherwise clip it).
  const reposition = () => {
    const r = rootRef.current?.getBoundingClientRect();
    if (!r) return;
    const width = Math.max(r.width, 224);
    const left = Math.max(8, Math.min(r.left, window.innerWidth - width - 8));
    setCoords({ top: r.bottom + 4, left, width });
  };

  useEffect(() => {
    if (!open) return;
    reposition();
    setQuery('');
    setActive(0);
    requestAnimationFrame(() => (showSearch ? inputRef.current : panelRef.current)?.focus());
    const onDoc = (e: MouseEvent) => {
      const target = e.target as Node;
      if (!rootRef.current?.contains(target) && !panelRef.current?.contains(target)) {
        setOpen(false);
      }
    };
    const onMove = () => reposition();
    document.addEventListener('mousedown', onDoc);
    window.addEventListener('scroll', onMove, true);
    window.addEventListener('resize', onMove);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      window.removeEventListener('scroll', onMove, true);
      window.removeEventListener('resize', onMove);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const choose = (o: ComboOption) => {
    onChange(o.value);
    setOpen(false);
  };

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const o = filtered[active];
      if (o) choose(o);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
    }
  };

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className={`flex w-full items-center justify-between gap-2 rounded-lg border border-line-strong bg-surface px-3 py-2 text-left text-sm outline-none transition-colors focus:border-brand-600 focus:ring-2 focus:ring-brand-100 disabled:bg-subtle ${selected ? 'text-ink' : 'text-faint'}`}
      >
        <span className="truncate">{selected ? selected.label : placeholder}</span>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 text-faint">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {open &&
        coords &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={panelRef}
            tabIndex={-1}
            onKeyDown={handleKey}
            style={{ position: 'fixed', top: coords.top, left: coords.left, width: coords.width, zIndex: 60 }}
            className="overflow-hidden rounded-lg border border-line bg-elevated shadow-lg outline-none"
          >
            {showSearch && (
              <div className="border-b border-line p-2">
                <input
                  ref={inputRef}
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setActive(0);
                  }}
                  onKeyDown={handleKey}
                  placeholder={searchPlaceholder}
                  className="w-full rounded-md border border-line bg-surface px-2.5 py-1.5 text-sm text-ink outline-none focus:border-brand-600"
                />
              </div>
            )}
            <ul className="max-h-60 overflow-y-auto py-1">
              {filtered.length === 0 ? (
                <li className="px-3 py-2 text-sm text-faint">{emptyText}</li>
              ) : (
                filtered.map((o, i) => (
                  <li key={o.value}>
                    <button
                      type="button"
                      onMouseEnter={() => setActive(i)}
                      onClick={() => choose(o)}
                      className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm ${i === active ? 'bg-brand-50 text-brand-700' : 'text-ink'} ${o.value === value ? 'font-semibold' : ''}`}
                    >
                      <span className="truncate">{o.label}</span>
                      {o.hint && <span className="shrink-0 text-xs text-faint">{o.hint}</span>}
                    </button>
                  </li>
                ))
              )}
            </ul>
          </div>,
          document.body,
        )}
    </div>
  );
}

export function Button({
  variant = 'primary',
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'danger';
}) {
  const styles = {
    primary:
      'bg-brand-600 text-white shadow-sm shadow-brand-600/25 hover:bg-brand-700 disabled:bg-brand-300 disabled:shadow-none',
    secondary:
      'border border-line-strong bg-surface text-ink hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700 disabled:text-faint',
    danger: 'bg-red-600 text-white shadow-sm shadow-red-600/25 hover:bg-red-700 disabled:bg-red-300',
  }[variant];
  return (
    <button
      {...props}
      className={`inline-flex items-center justify-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold transition-colors disabled:cursor-not-allowed ${styles} ${props.className ?? ''}`}
    />
  );
}

export function Label({ children }: { children: React.ReactNode }) {
  return (
    <label className="mb-1 block text-xs font-semibold text-muted">{children}</label>
  );
}

/**
 * Inline "?" tooltip for accounting jargon — hover or focus to reveal.
 * Usage: <Label>GSTIN <HelpTip text="15-character GST registration number…" /></Label>
 */
export function HelpTip({ text }: { text: string }) {
  return (
    <span className="group relative ml-1 inline-flex align-middle">
      <span
        tabIndex={0}
        className="flex h-3.5 w-3.5 cursor-help items-center justify-center rounded-full bg-subtle text-[9px] font-bold text-muted outline-none transition-colors hover:bg-brand-100 hover:text-brand-600 focus:bg-brand-100 focus:text-brand-600"
        aria-label={text}
      >
        ?
      </span>
      <span
        role="tooltip"
        className="pointer-events-none invisible absolute bottom-full left-1/2 z-30 mb-2 w-56 -translate-x-1/2 rounded bg-slate-900 px-3 py-2 text-xs font-normal normal-case leading-relaxed text-slate-100 opacity-0 shadow-xl transition-opacity group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100"
      >
        {text}
        <span className="absolute left-1/2 top-full -translate-x-1/2 border-4 border-transparent border-t-slate-900" />
      </span>
    </span>
  );
}

export function ErrorText({ children }: { children: React.ReactNode }) {
  if (!children) return null;
  return <p className="text-sm text-red-600">{children}</p>;
}

export function Card({
  children,
  className = '',
  title,
  action,
}: {
  children: React.ReactNode;
  className?: string;
  title?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className={`rounded-xl border border-line bg-surface p-5 shadow-[0_1px_2px_rgba(16,24,40,0.04),0_1px_3px_rgba(16,24,40,0.06)] ${className}`}>
      {(title || action) && (
        <div className="-mx-5 -mt-5 mb-4 flex items-center justify-between gap-3 border-b border-line px-5 py-3">
          {title && (
            <h3 className="text-sm font-bold text-ink">{title}</h3>
          )}
          {action}
        </div>
      )}
      {children}
    </div>
  );
}

export function Badge({
  children,
  tone = 'neutral',
}: {
  children: React.ReactNode;
  tone?: 'neutral' | 'good' | 'warn' | 'bad';
}) {
  const styles = {
    neutral: 'bg-subtle text-muted ring-line',
    good: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
    warn: 'bg-amber-50 text-amber-700 ring-amber-200',
    bad: 'bg-red-50 text-red-700 ring-red-200',
  }[tone];
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${styles}`}
    >
      {children}
    </span>
  );
}
