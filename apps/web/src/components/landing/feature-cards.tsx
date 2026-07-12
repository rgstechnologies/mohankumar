'use client';

import { useRef } from 'react';
import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion';
import { BorderBeam } from './border-beam';

type Feature = { t: string; d: string; icon: string; span?: string };

const SMALL: Feature[] = [
  { t: 'Billing', d: 'GST invoices, e-invoice & e-way bills in clicks.', icon: 'M7 3h7l5 5v13H7V3zM14 3v5h5M10 13h6M10 17h6', span: 'lg:col-span-2' },
  { t: 'GST', d: 'Auto tax, GSTR-ready, e-invoicing built in.', icon: 'M9 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8l-5-5H9zM14 3v5h5M9 13h6' },
  { t: 'Reports', d: 'P&L, balance sheet, GST & stock reports.', icon: 'M5 20v-6M10 20V8M15 20v-10M20 20V13M3 20h18' },
  { t: 'Accounting', d: 'Real-time double-entry ledgers & vouchers.', icon: 'M12 6.5C10 5 7 5 4 6.5v13c3-1.5 6-1.5 8 0 2-1.5 5-1.5 8 0v-13c-3-1.5-6-1.5-8 0zM12 6.5v13', span: 'lg:col-span-2' },
  { t: 'Inventory', d: 'Stock, batches, low-stock alerts, transfers.', icon: 'M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3zM12 12l8-4.5M12 12v9' },
  { t: 'CRM', d: 'Parties, balances, follow-ups, statements.', icon: 'M17 21v-2a4 4 0 00-4-4H7a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8z' },
  { t: 'Payroll', d: 'Salaries, pay runs and employee records — all reconciled to your books.', icon: 'M9 11a4 4 0 100-8 4 4 0 000 8zM3 21v-2a4 4 0 014-4h4M16 14v7M19.5 15.5c0-.83-1.12-1.5-2.5-1.5', span: 'lg:col-span-4' },
];

const SIGNALS = [
  { tone: 'text-emerald-400', text: 'Revenue up 18% vs last month' },
  { tone: 'text-amber-400', text: '3 invoices overdue · ₹1.2L' },
  { tone: 'text-[#FF7A00]', text: 'Reorder Cotton 40s — stock low' },
];

function TiltCard({ f, i }: { f: Feature; i: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const rx = useSpring(useTransform(my, [-0.5, 0.5], [7, -7]), { stiffness: 200, damping: 20 });
  const ry = useSpring(useTransform(mx, [-0.5, 0.5], [-7, 7]), { stiffness: 200, damping: 20 });

  return (
    <motion.div
      variants={{ hidden: { opacity: 0, y: 24 }, show: { opacity: 1, y: 0, transition: { duration: 0.5, delay: i * 0.05 } } }}
      className={f.span ?? ''}
      onMouseMove={(e) => {
        const el = ref.current;
        const r = el?.getBoundingClientRect();
        if (!el || !r) return;
        mx.set((e.clientX - r.left) / r.width - 0.5);
        my.set((e.clientY - r.top) / r.height - 0.5);
        el.style.setProperty('--mx', `${e.clientX - r.left}px`);
        el.style.setProperty('--my', `${e.clientY - r.top}px`);
      }}
      onMouseLeave={() => {
        mx.set(0);
        my.set(0);
      }}
    >
      <motion.div
        ref={ref}
        style={{ rotateX: rx, rotateY: ry, transformPerspective: 800 }}
        whileHover={{ y: -4 }}
        className="group relative flex h-full min-h-[150px] flex-col overflow-hidden rounded-2xl border border-[#2a2a2a] bg-[#1E1E1E] p-6"
      >
        <div className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-[#FF7A00]/0 blur-2xl transition-all duration-500 group-hover:bg-[#FF7A00]/25" />
        <div
          className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
          style={{ background: 'radial-gradient(240px circle at var(--mx, 50%) var(--my, 50%), rgba(255,122,0,0.16), transparent 60%)' }}
        />
        <span className="relative flex h-11 w-11 items-center justify-center rounded-xl bg-[#FF7A00]/15 text-[#FF7A00] transition-transform duration-300 group-hover:scale-110">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d={f.icon} />
          </svg>
        </span>
        <h3 className="relative mt-4 text-base font-bold text-white">{f.t}</h3>
        <p className="relative mt-1.5 max-w-md text-sm leading-relaxed text-[#9CA3AF]">{f.d}</p>
      </motion.div>
    </motion.div>
  );
}

function AiBentoCard() {
  return (
    <motion.div
      variants={{ hidden: { opacity: 0, y: 24 }, show: { opacity: 1, y: 0, transition: { duration: 0.5 } } }}
      className="lg:col-span-2 lg:row-span-2"
    >
      <BorderBeam className="h-full" duration={6}>
        <div className="relative flex h-full min-h-[316px] flex-col justify-between overflow-hidden rounded-2xl bg-[#1E1E1E] p-7">
          <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-[#FF7A00]/15 blur-3xl" />
          <div>
            <motion.span
              animate={{ scale: [1, 1.12, 1], opacity: [0.85, 1, 0.85] }}
              transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
              className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#FF7A00]/15 text-[#FF7A00]"
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 3l1.9 4.6L18.5 9l-4.6 1.9L12 15l-1.9-4.1L5.5 9l4.6-1.4z" />
              </svg>
            </motion.span>
            <h3 className="mt-4 text-xl font-bold text-white">AI Insights</h3>
            <p className="mt-2 max-w-sm text-sm leading-relaxed text-[#9CA3AF]">
              Speak a voucher, get smart alerts, and surface what needs attention —
              built into your books, not bolted on.
            </p>
          </div>
          <div className="mt-6 space-y-2.5">
            {SIGNALS.map((s, i) => (
              <motion.div
                key={s.text}
                initial={{ opacity: 0, x: -10 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 0.4 + i * 0.15, duration: 0.4 }}
                className="flex items-center gap-2.5 rounded-lg border border-[#2a2a2a] bg-[#161616] px-3 py-2"
              >
                <span className={`text-sm ${s.tone}`}>●</span>
                <span className="text-xs text-white/85">{s.text}</span>
              </motion.div>
            ))}
          </div>
        </div>
      </BorderBeam>
    </motion.div>
  );
}

export function FeatureCards() {
  return (
    <section id="features" className="relative bg-[#121212] py-24" style={{ fontFamily: 'var(--font-dm-sans), sans-serif' }}>
      <div className="mx-auto w-full max-w-7xl px-6">
        <div className="mb-14 text-center">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#FF7A00]">Everything in one place</p>
          <h2 className="mt-3 text-3xl font-bold tracking-tight text-white sm:text-4xl">One platform. Every workflow.</h2>
        </div>
        <motion.div
          variants={{ hidden: {}, show: { transition: { staggerChildren: 0.06 } } }}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, margin: '-60px' }}
          className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 lg:auto-rows-[172px]"
        >
          <AiBentoCard />
          {SMALL.map((f, i) => (
            <TiltCard key={f.t} f={f} i={i} />
          ))}
        </motion.div>
      </div>
    </section>
  );
}
