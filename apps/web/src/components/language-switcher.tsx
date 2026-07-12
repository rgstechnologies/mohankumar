'use client';

import { useLocale } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

const LOCALE_COOKIE = 'sa.locale';

const LANGUAGES = [
  { code: 'en', label: 'English', short: 'EN' },
  { code: 'ta', label: 'தமிழ்', short: 'த' },
  { code: 'hi', label: 'हिन्दी', short: 'हि' },
] as const;

/**
 * EN ⇄ தமிழ் toggle. Persists the choice in a cookie and re-renders the
 * tree server-side so every translated string switches in place — the
 * URL never changes.
 */
export function LanguageSwitcher({ variant = 'light' }: { variant?: 'light' | 'dark' }) {
  const locale = useLocale();
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  function switchTo(code: string) {
    if (code === locale || busy) return;
    setBusy(true);
    document.cookie = `${LOCALE_COOKIE}=${code}; path=/; max-age=31536000; samesite=lax`;
    router.refresh();
    // refresh() resolves the new tree asynchronously; re-enable shortly after.
    setTimeout(() => setBusy(false), 500);
  }

  const base =
    'rounded-md px-2 py-1 text-xs font-semibold transition-colors disabled:opacity-50';
  const active =
    variant === 'dark' ? 'bg-surface/15 text-white' : 'bg-brand-600 text-white';
  const inactive =
    variant === 'dark'
      ? 'text-faint hover:bg-surface/10 hover:text-white'
      : 'text-muted hover:bg-subtle hover:text-ink';

  return (
    <div
      className={`flex items-center gap-0.5 rounded-lg p-0.5 ${
        variant === 'dark' ? 'bg-surface/5' : 'border border-line bg-surface'
      }`}
      role="group"
      aria-label="Language"
    >
      {LANGUAGES.map((lang) => (
        <button
          key={lang.code}
          type="button"
          disabled={busy}
          onClick={() => switchTo(lang.code)}
          title={lang.label}
          lang={lang.code}
          className={`${base} ${locale === lang.code ? active : inactive}`}
        >
          {lang.short}
        </button>
      ))}
    </div>
  );
}
