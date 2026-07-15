'use client';

import { motion } from 'framer-motion';
import { LanguageSwitcher } from './language-switcher';
import { ThemeToggle } from './theme';
import { LiveDashboard } from './auth/live-dashboard';
import { APP_NAME, APP_LOGO } from '@/lib/brand';

const STATS = [
  { k: '3-month', v: 'free trial' },
  { k: '100%', v: 'GST compliant' },
  { k: 'All-in-one', v: 'books to billing' },
];

/**
 * Premium split-screen auth layout: an animated RGS ERP brand/marketing panel
 * on the left (desktop) and the form on the right. Responsive (form-only on
 * mobile), theme-aware, with restrained Framer Motion entrance + ambient motion.
 */
export function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <main className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      {/* ---- Brand / marketing panel ---- */}
      <aside className="relative hidden overflow-hidden bg-gradient-to-br from-brand-500 via-brand-600 to-orange-700 p-10 text-white lg:flex lg:flex-col xl:p-14">
        <motion.div
          aria-hidden
          className="pointer-events-none absolute -left-24 -top-24 h-80 w-80 rounded-full bg-white/10 blur-3xl"
          animate={{ y: [0, 24, 0] }}
          transition={{ duration: 9, repeat: Infinity, ease: 'easeInOut' }}
        />
        <motion.div
          aria-hidden
          className="pointer-events-none absolute -bottom-24 -right-16 h-96 w-96 rounded-full bg-orange-900/30 blur-3xl"
          animate={{ y: [0, -28, 0] }}
          transition={{ duration: 11, repeat: Infinity, ease: 'easeInOut' }}
        />

        <div className="relative z-10 flex items-center gap-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={APP_LOGO} alt={APP_NAME} className="h-10 w-10 rounded-xl bg-white object-contain" />
          <span className="text-xl font-bold tracking-tight">{APP_NAME}</span>
        </div>

        <div className="relative z-10 mt-auto">
          <motion.h2
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="max-w-md text-3xl font-bold leading-tight xl:text-4xl"
          >
            Run your whole business on one platform.
          </motion.h2>
          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="mt-3 max-w-md text-sm text-white/80"
          >
            GST invoicing, estimates, purchases, stock and double-entry
            accounting — built for Indian businesses.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.25 }}
            className="mt-8"
          >
            <LiveDashboard />
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.55 }}
            className="mt-9 flex gap-8 border-t border-white/15 pt-5"
          >
            {STATS.map((s) => (
              <div key={s.v}>
                <p className="text-lg font-bold">{s.k}</p>
                <p className="text-xs text-white/70">{s.v}</p>
              </div>
            ))}
          </motion.div>
        </div>
      </aside>

      {/* ---- Form panel ---- */}
      <section className="relative flex flex-col bg-canvas">
        <div className="absolute right-4 top-4 z-10 flex items-center gap-2">
          <ThemeToggle />
          <LanguageSwitcher />
        </div>
        <div className="flex flex-1 items-center justify-center p-6">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="w-full max-w-sm"
          >
            <div className="mb-6 flex items-center gap-2 lg:hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={APP_LOGO} alt={APP_NAME} className="h-9 w-9 rounded-xl bg-white object-contain" />
              <span className="text-lg font-bold tracking-tight text-ink">{APP_NAME}</span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-ink">{title}</h1>
            {subtitle && <p className="mt-1.5 text-sm text-muted">{subtitle}</p>}
            <div className="mt-6">{children}</div>
            {footer && <div className="mt-6 text-center text-sm text-muted">{footer}</div>}
          </motion.div>
        </div>
      </section>
    </main>
  );
}
