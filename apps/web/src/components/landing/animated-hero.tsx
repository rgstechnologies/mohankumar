'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import {
  motion,
  useInView,
  useMotionValue,
  useSpring,
  useTransform,
} from 'framer-motion';
import { BorderBeam } from './border-beam';

/* ------------------------------------------------------------------ */
/* Count-up — animates 0 → target once in view (requestAnimationFrame, */
/* so it stays buttery on low-end devices and respects reduced-motion). */
/* ------------------------------------------------------------------ */
function useCountUp(target: number, durationMs = 1600, run = true) {
  const [val, setVal] = useState(0);
  useEffect(() => {
    if (!run) return;
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setVal(target);
      return;
    }
    let raf = 0;
    let start = 0;
    const tick = (t: number) => {
      if (!start) start = t;
      const p = Math.min(1, (t - start) / durationMs);
      // easeOutCubic
      setVal(target * (1 - Math.pow(1 - p, 3)));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, durationMs, run]);
  return val;
}

function Stat({ value, suffix, label, prefix = '' }: { value: number; suffix?: string; label: string; prefix?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: '-40px' });
  const n = useCountUp(value, 1600, inView);
  return (
    <div ref={ref}>
      <p className="text-2xl font-bold tracking-tight text-white sm:text-3xl">
        {prefix}
        {Math.round(n).toLocaleString('en-IN')}
        {suffix}
      </p>
      <p className="mt-0.5 text-xs font-medium text-[#9CA3AF]">{label}</p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Animated ERP dashboard mock — floating, with count-up KPIs, growing  */
/* revenue bars, and a live invoice counter. Parallax follows the mouse. */
/* ------------------------------------------------------------------ */
const BARS = [38, 52, 44, 66, 58, 80, 72, 95];

function DashboardMock() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true });
  const revenue = useCountUp(4825000, 1800, inView);
  const invoices = useCountUp(1284, 1800, inView);

  return (
    <div ref={ref} className="relative w-full max-w-lg rounded-2xl bg-[#1E1E1E] p-5 shadow-2xl">
      {/* window chrome */}
      <div className="mb-4 flex items-center gap-1.5">
        <span className="h-2.5 w-2.5 rounded-full bg-[#FF7A00]/80" />
        <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
        <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
        <span className="ml-3 text-xs font-medium text-[#9CA3AF]">RGS · Overview</span>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 gap-3">
        {[
          { l: 'Revenue (FY)', v: `₹${(revenue / 100000).toFixed(1)}L`, up: '+18%' },
          { l: 'Invoices', v: Math.round(invoices).toLocaleString('en-IN'), up: '+6%' },
        ].map((k, i) => (
          <motion.div
            key={k.l}
            initial={{ opacity: 0, y: 10 }}
            animate={inView ? { opacity: 1, y: 0 } : {}}
            transition={{ delay: 0.3 + i * 0.12, duration: 0.5 }}
            className="rounded-xl border border-[#2a2a2a] bg-[#161616] p-3"
          >
            <p className="text-[10px] font-medium uppercase tracking-wide text-[#9CA3AF]">{k.l}</p>
            <p className="mt-1 text-lg font-bold tabular-nums text-white">{k.v}</p>
            <p className="text-[10px] font-semibold text-emerald-400">{k.up}</p>
          </motion.div>
        ))}
      </div>

      {/* revenue chart */}
      <div className="mt-4 rounded-xl border border-[#2a2a2a] bg-[#161616] p-3">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-[10px] font-medium uppercase tracking-wide text-[#9CA3AF]">Sales · last 8 months</p>
          <span className="text-[10px] font-semibold text-[#FF7A00]">▲ trending</span>
        </div>
        <div className="flex h-24 items-end gap-1.5">
          {BARS.map((h, i) => (
            <motion.div
              key={i}
              initial={{ height: 0 }}
              animate={inView ? { height: `${h}%` } : {}}
              transition={{ delay: 0.5 + i * 0.07, duration: 0.6, ease: 'easeOut' }}
              className="flex-1 rounded-t bg-gradient-to-t from-[#FF7A00]/40 to-[#FF7A00]"
            />
          ))}
        </div>
      </div>

      {/* floating "payment received" toast */}
      <motion.div
        initial={{ opacity: 0, x: 20 }}
        animate={inView ? { opacity: 1, x: 0 } : {}}
        transition={{ delay: 1.4, duration: 0.5 }}
        className="absolute -right-4 top-24 flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-[#1E1E1E] px-3 py-2 shadow-xl"
      >
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400">✓</span>
        <span className="text-xs">
          <span className="block font-semibold text-white">Payment received</span>
          <span className="text-[#9CA3AF]">₹24,500 · UPI</span>
        </span>
      </motion.div>
    </div>
  );
}

const HEADLINE = 'RGS ERP';

export function AnimatedHero() {
  // Mouse parallax for the dashboard mock.
  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const rx = useSpring(useTransform(my, [-0.5, 0.5], [8, -8]), { stiffness: 120, damping: 18 });
  const ry = useSpring(useTransform(mx, [-0.5, 0.5], [-10, 10]), { stiffness: 120, damping: 18 });

  function onMouse(e: React.MouseEvent<HTMLDivElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    mx.set((e.clientX - r.left) / r.width - 0.5);
    my.set((e.clientY - r.top) / r.height - 0.5);
  }

  return (
    <section
      onMouseMove={onMouse}
      className="relative overflow-hidden bg-[#121212]"
      style={{ fontFamily: 'var(--font-dm-sans), sans-serif' }}
    >
      {/* ambient glows */}
      <div className="pointer-events-none absolute -top-40 left-1/4 h-[520px] w-[520px] rounded-full bg-[#FF7A00]/20 blur-[120px]" />
      <div className="pointer-events-none absolute bottom-0 right-10 h-80 w-80 rounded-full bg-[#FF7A00]/10 blur-[100px]" />
      {/* animated grid backdrop (21st.dev style) */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage:
            'linear-gradient(#ffffff 1px, transparent 1px), linear-gradient(90deg, #ffffff 1px, transparent 1px)',
          backgroundSize: '52px 52px',
          maskImage: 'radial-gradient(ellipse 75% 65% at 50% 30%, #000 30%, transparent 75%)',
          WebkitMaskImage: 'radial-gradient(ellipse 75% 65% at 50% 30%, #000 30%, transparent 75%)',
        }}
      />
      {/* slow floating particles */}
      {[...Array(6)].map((_, i) => (
        <motion.span
          key={i}
          className="pointer-events-none absolute h-1 w-1 rounded-full bg-white/30"
          style={{ left: `${12 + i * 14}%`, top: `${20 + (i % 3) * 22}%` }}
          animate={{ y: [0, -18, 0], opacity: [0.2, 0.6, 0.2] }}
          transition={{ duration: 6 + i, repeat: Infinity, ease: 'easeInOut' }}
        />
      ))}

      {/* top nav */}
      <header className="relative z-20 mx-auto flex h-20 w-full max-w-7xl items-center justify-between px-6">
        <span className="flex items-center gap-2.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/rgs-logo.jpeg" alt="RGS ERP" className="h-9 w-9 rounded-xl bg-white object-contain shadow-lg shadow-black/30" />
          <span className="text-lg font-bold tracking-tight text-white">RGS ERP</span>
        </span>
        <div className="flex items-center gap-3">
          <Link href="/login" className="rounded-full px-4 py-2 text-sm font-medium text-[#9CA3AF] transition-colors hover:text-white">
            Sign in
          </Link>
          <Link href="/register" className="rounded-full bg-[#FF7A00] px-5 py-2 text-sm font-semibold text-white shadow-sm shadow-[#FF7A00]/30 transition-colors hover:bg-[#EA580C]">
            Get started
          </Link>
        </div>
      </header>

      <div className="relative z-10 mx-auto grid w-full max-w-7xl items-center gap-12 px-6 pb-20 pt-8 lg:grid-cols-2 lg:pb-28">
        {/* ---- Left: copy ---- */}
        <div>
          <motion.span
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="inline-flex items-center gap-2 rounded-full border border-[#FF7A00]/30 bg-[#FF7A00]/10 px-4 py-1.5 text-xs font-semibold text-[#FF7A00]"
          >
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#FF7A00]" />
            GST-ready ERP for Indian businesses
          </motion.span>

          {/* headline: letter-by-letter + gradient sweep */}
          <h1 className="mt-6 text-5xl font-extrabold leading-[1.05] tracking-tight sm:text-6xl">
            <span className="sr-only">{HEADLINE}</span>
            <span aria-hidden className="relative inline-block bg-gradient-to-r from-white via-[#FF7A00] to-white bg-[length:200%_100%] bg-clip-text text-transparent animate-[sweep_5s_linear_infinite]">
              {HEADLINE.split('').map((ch, i) => (
                <motion.span
                  key={i}
                  initial={{ opacity: 0, y: 24, rotateX: -40 }}
                  animate={{ opacity: 1, y: 0, rotateX: 0 }}
                  transition={{ delay: 0.15 + i * 0.05, duration: 0.5, ease: 'easeOut' }}
                  className="inline-block"
                >
                  {ch === ' ' ? ' ' : ch}
                </motion.span>
              ))}
            </span>
            <motion.span
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.7, duration: 0.5 }}
              className="mt-2 block text-3xl font-bold text-white sm:text-4xl"
            >
              Run your entire business on one platform.
            </motion.span>
          </h1>

          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.85, duration: 0.5 }}
            className="mt-6 max-w-xl text-lg leading-relaxed text-[#9CA3AF]"
          >
            GST invoicing, double-entry accounting, inventory, POS, payroll and
            real-time reports — the power of Tally, the ease of Zoho Books.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1, duration: 0.5 }}
            className="mt-9 flex flex-wrap items-center gap-4"
          >
            <Link href="/register">
              <motion.span
                whileHover={{ y: -3 }}
                whileTap={{ scale: 0.97 }}
                className="inline-flex rounded-full bg-[#FF7A00] px-8 py-3.5 text-sm font-semibold text-white shadow-lg shadow-[#FF7A00]/30 transition-shadow hover:shadow-[#FF7A00]/50"
              >
                Start free — 3-month trial
              </motion.span>
            </Link>
            <Link href="/login">
              <motion.span
                whileHover={{ y: -3 }}
                whileTap={{ scale: 0.97 }}
                className="inline-flex rounded-full border border-[#2a2a2a] bg-[#1E1E1E] px-8 py-3.5 text-sm font-semibold text-white transition-colors hover:border-[#FF7A00]/40"
              >
                Sign in
              </motion.span>
            </Link>
          </motion.div>

          {/* stats */}
          <div className="mt-12 flex flex-wrap gap-10 border-t border-[#2a2a2a] pt-6">
            <Stat value={100000} suffix="+" label="Invoices raised" />
            <Stat value={10000} suffix="+" label="Businesses" />
            <Stat value={500} prefix="₹" suffix="Cr+" label="Transactions" />
          </div>
        </div>

        {/* ---- Right: floating dashboard (parallax) ---- */}
        <motion.div
          style={{ rotateX: rx, rotateY: ry, transformPerspective: 1000 }}
          className="flex justify-center lg:justify-end"
        >
          <motion.div animate={{ y: [0, -14, 0] }} transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}>
            <BorderBeam>
              <DashboardMock />
            </BorderBeam>
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}
