'use client';

/**
 * App-wide "Contact us" widget — a floating button on every authenticated
 * screen. Opens a query form (emailed to the admin inbox) plus direct
 * call / WhatsApp options. Hidden on public pages (landing, auth).
 */

import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useFeedback } from '@/components/feedback';
import { ApiError, isAuthenticated } from '@/lib/api';
import { sendContactQuery } from '@/lib/support';

const PHONE_DISPLAY = '+91 82487 81991';
const PHONE_TEL = '+918248781991';
const WHATSAPP = 'https://wa.me/918248781991';

const PUBLIC_PREFIXES = [
  '/login',
  '/register',
  '/forgot-password',
  '/reset-password',
  '/invite',
];

function isPublicPath(pathname: string): boolean {
  if (pathname === '/') return true;
  return PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export function ContactWidget() {
  const t = useTranslations('contactWidget');
  const tc = useTranslations('common');
  const { toast } = useFeedback();
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => setMounted(true), []);

  // Only on authenticated app screens.
  if (!mounted || isPublicPath(pathname) || !isAuthenticated()) return null;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await sendContactQuery(message.trim(), subject.trim() || undefined);
      toast(t('sent'), 'success');
      setOpen(false);
      setSubject('');
      setMessage('');
    } catch (err) {
      toast(err instanceof ApiError ? err.message : tc('somethingWentWrong'), 'error');
    } finally {
      setBusy(false);
    }
  }

  const field =
    'w-full rounded-lg border border-line-strong bg-surface px-3 py-2 text-sm text-ink outline-none transition-colors placeholder:text-faint focus:border-brand-600 focus:ring-2 focus:ring-brand-100';

  return (
    <>
      {/* Floating launcher */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t('button')}
        className="fixed bottom-5 right-5 z-40 flex h-12 items-center gap-2 rounded-full bg-brand-600 pl-3.5 pr-4 text-sm font-semibold text-white shadow-lg shadow-brand-600/30 transition-colors hover:bg-brand-700"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
        </svg>
        <span className="hidden sm:inline">{t('button')}</span>
      </button>

      {open && (
        <div
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 backdrop-blur-sm sm:items-center"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-2xl border border-line bg-surface p-6 shadow-2xl"
          >
            <div className="mb-1 flex items-start justify-between gap-3">
              <h2 className="text-lg font-bold text-ink">{t('title')}</h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label={tc('close')}
                className="-mr-1 -mt-1 rounded-md p-1 text-xl leading-none text-faint hover:bg-subtle hover:text-ink"
              >
                ×
              </button>
            </div>
            <p className="mb-4 text-sm text-muted">{t('subtitle')}</p>

            <form onSubmit={onSubmit} className="space-y-3">
              <input
                className={field}
                placeholder={t('subjectPlaceholder')}
                value={subject}
                maxLength={160}
                onChange={(e) => setSubject(e.target.value)}
              />
              <textarea
                className={`${field} resize-none`}
                rows={4}
                required
                maxLength={4000}
                placeholder={t('messagePlaceholder')}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
              />
              <button
                type="submit"
                disabled={busy || !message.trim()}
                className="w-full rounded-lg bg-brand-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-brand-300"
              >
                {busy ? t('sending') : t('send')}
              </button>
            </form>

            <div className="my-4 flex items-center gap-3 text-xs text-faint">
              <span className="h-px flex-1 bg-line" />
              {t('orReach')}
              <span className="h-px flex-1 bg-line" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <a
                href={`tel:${PHONE_TEL}`}
                className="flex items-center justify-center gap-2 rounded-lg border border-line-strong bg-surface py-2.5 text-sm font-semibold text-ink transition-colors hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z" />
                </svg>
                {t('call')}
              </a>
              <a
                href={WHATSAPP}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 rounded-lg border border-line-strong bg-surface py-2.5 text-sm font-semibold text-ink transition-colors hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M17.5 14.4c-.3-.15-1.77-.87-2.04-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.17-.17.2-.35.22-.65.07-.3-.15-1.26-.46-2.4-1.48-.89-.79-1.49-1.77-1.66-2.07-.17-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.08-.15-.67-1.62-.92-2.21-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.79.37-.27.3-1.04 1.02-1.04 2.48 0 1.46 1.06 2.88 1.21 3.08.15.2 2.1 3.2 5.08 4.49.71.31 1.26.49 1.69.62.71.23 1.36.2 1.87.12.57-.08 1.77-.72 2.02-1.42.25-.7.25-1.29.17-1.42-.07-.13-.27-.2-.57-.35zM12 2a10 10 0 0 0-8.6 15.06L2 22l5.06-1.33A10 10 0 1 0 12 2z" />
                </svg>
                {t('whatsapp')}
              </a>
            </div>
            <p className="mt-3 text-center text-xs text-faint">{PHONE_DISPLAY}</p>
          </div>
        </div>
      )}
    </>
  );
}
