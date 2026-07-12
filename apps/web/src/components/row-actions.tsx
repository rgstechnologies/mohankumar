'use client';

import { createPortal } from 'react-dom';
import { useEffect, useRef, useState } from 'react';

export type RowAction = {
  /** Visible label. */
  label: string;
  /** Click handler — the menu closes automatically afterwards. */
  onClick: () => void;
  /** Colour intent. */
  tone?: 'default' | 'primary' | 'success' | 'danger';
  /** Render a thin divider above this item. */
  divider?: boolean;
};

const TONE: Record<NonNullable<RowAction['tone']>, string> = {
  default: 'text-ink',
  primary: 'text-brand-700',
  success: 'text-emerald-700',
  danger: 'text-red-600',
};

const MENU_W = 184;

/**
 * A compact per-row actions control: one primary button (optional) plus a
 * "⋮" overflow menu holding the rest. The menu renders in a portal with fixed
 * positioning so it floats above the table (never clipped by overflow), and
 * flips above/below based on available space.
 */
export function RowActions({
  actions,
  primary,
  menuLabel = 'Actions',
}: {
  actions: RowAction[];
  /** Optionally surface one action as an always-visible button. */
  primary?: RowAction;
  menuLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const menuItems = actions.filter(Boolean);

  const reposition = () => {
    const r = btnRef.current?.getBoundingClientRect();
    if (!r) return;
    const estH = menuItems.length * 30 + 10;
    const spaceBelow = window.innerHeight - r.bottom;
    const openUp = spaceBelow < estH + 8 && r.top > estH + 8;
    const left = Math.max(8, Math.min(r.right - MENU_W, window.innerWidth - MENU_W - 8));
    const top = openUp ? Math.max(8, r.top - estH - 4) : r.bottom + 4;
    setCoords({ top, left });
  };

  useEffect(() => {
    if (!open) return;
    reposition();
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!btnRef.current?.contains(t) && !menuRef.current?.contains(t)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    const onMove = () => reposition();
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onMove, true);
    window.addEventListener('resize', onMove);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onMove, true);
      window.removeEventListener('resize', onMove);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!primary && menuItems.length === 0) return <span className="text-faint">—</span>;

  return (
    <div className="inline-flex items-center justify-end gap-1">
      {primary && (
        <button
          type="button"
          onClick={primary.onClick}
          className={`rounded px-2 py-1 text-xs font-medium hover:bg-subtle ${
            TONE[primary.tone ?? 'primary']
          }`}
        >
          {primary.label}
        </button>
      )}
      {menuItems.length > 0 && (
        <button
          ref={btnRef}
          type="button"
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label={menuLabel}
          onClick={() => setOpen((v) => !v)}
          className={`flex h-7 w-7 items-center justify-center rounded text-muted transition-colors hover:bg-subtle hover:text-ink ${
            open ? 'bg-subtle text-ink' : ''
          }`}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
            <circle cx="8" cy="3" r="1.4" />
            <circle cx="8" cy="8" r="1.4" />
            <circle cx="8" cy="13" r="1.4" />
          </svg>
        </button>
      )}
      {open &&
        coords &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            style={{ position: 'fixed', top: coords.top, left: coords.left, width: MENU_W, zIndex: 70 }}
            className="overflow-hidden rounded-lg border border-line bg-surface py-1 text-left shadow-xl"
          >
            {menuItems.map((a, i) => (
              <button
                key={`${a.label}-${i}`}
                role="menuitem"
                type="button"
                onClick={() => {
                  setOpen(false);
                  a.onClick();
                }}
                className={`block w-full px-3 py-1.5 text-left text-xs font-medium transition-colors hover:bg-subtle ${
                  a.divider ? 'border-t border-line' : ''
                } ${TONE[a.tone ?? 'default']}`}
              >
                {a.label}
              </button>
            ))}
          </div>,
          document.body,
        )}
    </div>
  );
}
