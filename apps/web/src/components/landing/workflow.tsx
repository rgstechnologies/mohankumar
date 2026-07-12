'use client';

import { useEffect, useRef, useState } from 'react';
import { motion, useInView } from 'framer-motion';

const STAGES = [
  { label: 'Customer', icon: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM3 21v-1a6 6 0 0112 0v1' },
  { label: 'Estimate', icon: 'M9 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8l-5-5H9zM14 3v5h5M9 13h6M9 17h4' },
  { label: 'Invoice', icon: 'M7 3h7l5 5v13H7V3zM14 3v5h5M10 13h6M10 17h6' },
  { label: 'Payment Link', icon: 'M10 13a5 5 0 007 0l3-3a5 5 0 00-7-7l-1 1M14 11a5 5 0 00-7 0l-3 3a5 5 0 007 7l1-1' },
  { label: 'Payment Received', icon: 'M12 1v22M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6' },
  { label: 'Accounting Entry', icon: 'M12 6.5C10 5 7 5 4 6.5v13c3-1.5 6-1.5 8 0 2-1.5 5-1.5 8 0v-13c-3-1.5-6-1.5-8 0zM12 6.5v13' },
];

export function Workflow() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: false, margin: '-80px' });
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (!inView) return;
    const id = setInterval(() => setStep((s) => (s + 1) % (STAGES.length + 1)), 1100);
    return () => clearInterval(id);
  }, [inView]);

  const progress = step / (STAGES.length - 1); // leading edge 0..1+

  return (
    <section ref={ref} className="relative overflow-hidden bg-[#121212] py-24" style={{ fontFamily: 'var(--font-dm-sans), sans-serif' }}>
      <div className="mx-auto w-full max-w-7xl px-6">
        <div className="mb-14 text-center">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#FF7A00]">How it flows</p>
          <h2 className="mt-3 text-3xl font-bold tracking-tight text-white sm:text-4xl">
            From quote to books — automatically
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-[#9CA3AF]">
            Every transaction flows end to end. No re-entry, no reconciliation chaos.
          </p>
        </div>

        <div className="scrollbar-light overflow-x-auto pb-4">
          <div className="relative mx-auto flex min-w-[760px] items-start justify-between gap-2">
            {/* base line */}
            <div className="absolute left-[7%] right-[7%] top-7 h-0.5 rounded bg-[#2a2a2a]" />
            {/* glowing progress line */}
            <motion.div
              className="absolute left-[7%] top-7 h-0.5 rounded bg-[#FF7A00] shadow-[0_0_12px_#FF7A00]"
              initial={{ width: '0%' }}
              animate={{ width: `${Math.min(1, Math.max(0, progress)) * 86}%` }}
              transition={{ duration: 0.9, ease: 'easeInOut' }}
            />
            {/* traveling data packet */}
            <motion.span
              className="absolute top-[22px] z-10 h-3 w-3 rounded-full bg-white shadow-[0_0_16px_4px_#FF7A00]"
              initial={{ left: '7%' }}
              animate={{ left: `${7 + Math.min(1, Math.max(0, progress)) * 86}%` }}
              transition={{ duration: 0.9, ease: 'easeInOut' }}
            />

            {STAGES.map((s, i) => {
              const done = i < step;
              return (
                <div key={s.label} className="relative z-10 flex w-1/6 flex-col items-center gap-3 text-center">
                  <motion.span
                    animate={{
                      backgroundColor: done ? '#FF7A00' : '#1E1E1E',
                      borderColor: done ? '#FF7A00' : '#2a2a2a',
                      boxShadow: done ? '0 0 22px rgba(255,122,0,0.5)' : '0 0 0 rgba(0,0,0,0)',
                      scale: i === step - 1 ? 1.12 : 1,
                    }}
                    transition={{ duration: 0.4 }}
                    className="flex h-14 w-14 items-center justify-center rounded-2xl border"
                  >
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={done ? '#fff' : '#9CA3AF'} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                      <path d={s.icon} />
                    </svg>
                  </motion.span>
                  <span className={`text-xs font-semibold ${done ? 'text-white' : 'text-[#9CA3AF]'}`}>{s.label}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
