'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';

const STEPS = [
  'Creating your company',
  'Setting up financial year',
  'Configuring GST defaults',
  'Preparing inventory',
  'Building your dashboard',
  'Ready!',
];

/**
 * Premium onboarding flourish shown right after a business signup: a vertical
 * timeline that ticks through setup steps (~3.5s) with spinners → checkmarks,
 * a filling progress bar and a final success glow, then calls onDone.
 */
export function CompanyCreationSequence({ onDone }: { onDone: () => void }) {
  const [active, setActive] = useState(0);

  useEffect(() => {
    if (active >= STEPS.length) {
      const t = setTimeout(onDone, 800);
      return () => clearTimeout(t);
    }
    const last = active === STEPS.length - 1;
    const t = setTimeout(() => setActive((a) => a + 1), last ? 900 : 580);
    return () => clearTimeout(t);
  }, [active, onDone]);

  const pct = Math.min(100, (active / (STEPS.length - 1)) * 100);
  const finished = active >= STEPS.length - 1;

  return (
    <motion.main
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden bg-[#121212]"
      style={{ fontFamily: 'var(--font-dm-sans), sans-serif' }}
    >
      {/* glow that intensifies on completion */}
      <motion.div
        className="pointer-events-none absolute left-1/2 top-1/2 h-[520px] w-[520px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#FF7A00]/15 blur-[120px]"
        animate={{ opacity: finished ? 0.9 : 0.4, scale: finished ? 1.1 : 1 }}
        transition={{ duration: 0.8 }}
      />

      <div className="relative w-full max-w-sm px-6">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-8 flex items-center gap-2.5"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-[#FF7A00] to-[#c2410c] text-lg font-black text-white shadow-lg shadow-[#FF7A00]/40">
            N
          </span>
          <span className="text-lg font-bold tracking-tight text-white">RGS ERP</span>
        </motion.div>

        <h2 className="text-xl font-bold text-white">Setting up your workspace</h2>
        <p className="mt-1 text-sm text-[#9CA3AF]">This only takes a moment.</p>

        {/* progress bar */}
        <div className="mt-6 h-1 overflow-hidden rounded-full bg-[#1E1E1E]">
          <motion.div
            className="h-full rounded-full bg-[#FF7A00]"
            animate={{ width: `${pct}%` }}
            transition={{ duration: 0.5, ease: 'easeInOut' }}
          />
        </div>

        {/* steps */}
        <div className="mt-7 space-y-4">
          {STEPS.map((s, i) => {
            const done = i < active;
            const isActive = i === active;
            const isReady = i === STEPS.length - 1;
            return (
              <motion.div
                key={s}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: i <= active ? 1 : 0.35, x: 0 }}
                transition={{ duration: 0.3 }}
                className="flex items-center gap-3"
              >
                <span className="relative flex h-6 w-6 shrink-0 items-center justify-center">
                  {done || (isActive && isReady) ? (
                    <motion.span
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ type: 'spring', stiffness: 320, damping: 16 }}
                      className="flex h-6 w-6 items-center justify-center rounded-full bg-[#FF7A00] text-white"
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M20 6 9 17l-5-5" />
                      </svg>
                    </motion.span>
                  ) : isActive ? (
                    <span className="h-5 w-5 animate-spin rounded-full border-2 border-[#FF7A00]/30 border-t-[#FF7A00]" />
                  ) : (
                    <span className="h-2 w-2 rounded-full bg-[#3a3a3a]" />
                  )}
                </span>
                <span className={`text-sm font-medium ${done || isActive ? 'text-white' : 'text-[#9CA3AF]'} ${isReady && (done || isActive) ? 'font-bold' : ''}`}>
                  {s}
                </span>
              </motion.div>
            );
          })}
        </div>
      </div>
    </motion.main>
  );
}
