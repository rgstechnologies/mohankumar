'use client';

import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

const SERIES = [
  [40, 62, 52, 74, 64, 86, 78],
  [56, 48, 72, 62, 82, 72, 94],
  [48, 68, 58, 80, 70, 92, 84],
  [60, 54, 76, 66, 88, 78, 96],
];
const PAYMENTS = [
  { amt: '₹24,500', via: 'UPI · Sharma Textiles' },
  { amt: '₹1,12,000', via: 'Bank · Coimbatore Mills' },
  { amt: '₹8,750', via: 'Card · Anand Traders' },
  { amt: '₹56,300', via: 'UPI · Velan & Co' },
];
const INVOICES = [
  { no: 'INV-1042', party: 'Sharma Textiles', amt: '₹48,200' },
  { no: 'INV-1043', party: 'Coimbatore Mills', amt: '₹1,12,000' },
  { no: 'INV-1044', party: 'Anand Traders', amt: '₹8,750' },
  { no: 'INV-1045', party: 'Velan & Co', amt: '₹56,300' },
];

export function LiveDashboard() {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 2600);
    return () => clearInterval(id);
  }, []);

  const bars = SERIES[tick % SERIES.length];
  const pay = PAYMENTS[tick % PAYMENTS.length];
  const inv = INVOICES[tick % INVOICES.length];
  const revenue = (42.3 + (tick % 14) * 0.6).toFixed(1);

  return (
    <div className="relative w-full max-w-sm rounded-2xl border border-white/10 bg-black/25 p-5 backdrop-blur-sm">
      <div className="mb-4 flex items-center justify-between">
        <span className="text-xs font-semibold text-white/90">Live overview</span>
        <span className="flex items-center gap-1.5 text-[10px] font-medium text-white/60">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
          real-time
        </span>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-white/10 bg-white/5 p-3">
          <p className="text-[10px] uppercase tracking-wide text-white/50">Revenue · FY</p>
          <AnimatePresence mode="popLayout">
            <motion.p
              key={revenue}
              initial={{ y: 8, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -8, opacity: 0 }}
              transition={{ duration: 0.4 }}
              className="mt-1 text-lg font-bold tabular-nums text-white"
            >
              ₹{revenue}L
            </motion.p>
          </AnimatePresence>
          <p className="text-[10px] font-semibold text-emerald-300">▲ 18%</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/5 p-3">
          <p className="text-[10px] uppercase tracking-wide text-white/50">Invoices</p>
          <p className="mt-1 text-lg font-bold tabular-nums text-white">{1240 + (tick % 60)}</p>
          <p className="text-[10px] font-semibold text-emerald-300">▲ 6%</p>
        </div>
      </div>

      {/* moving bar chart */}
      <div className="mt-3 rounded-xl border border-white/10 bg-white/5 p-3">
        <p className="mb-2 text-[10px] uppercase tracking-wide text-white/50">Sales · this week</p>
        <div className="flex h-20 items-end gap-1.5">
          {bars.map((h, i) => (
            <motion.div
              key={i}
              className="flex-1 rounded-t bg-gradient-to-t from-white/30 to-white"
              animate={{ height: `${h}%` }}
              transition={{ duration: 0.7, ease: 'easeInOut' }}
            />
          ))}
        </div>
      </div>

      {/* sliding latest invoice */}
      <div className="mt-3 h-12 overflow-hidden rounded-xl border border-white/10 bg-white/5 px-3">
        <AnimatePresence mode="popLayout">
          <motion.div
            key={inv.no}
            initial={{ y: 24, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -24, opacity: 0 }}
            transition={{ duration: 0.45 }}
            className="flex h-12 items-center justify-between"
          >
            <span className="text-xs">
              <span className="block font-semibold text-white">{inv.no}</span>
              <span className="text-white/60">{inv.party}</span>
            </span>
            <span className="text-sm font-bold tabular-nums text-white">{inv.amt}</span>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* payment notification appearing */}
      <AnimatePresence>
        <motion.div
          key={pay.amt + tick}
          initial={{ opacity: 0, x: 24, scale: 0.95 }}
          animate={{ opacity: 1, x: 0, scale: 1 }}
          exit={{ opacity: 0, x: 24 }}
          transition={{ duration: 0.45 }}
          className="absolute -right-3 top-28 flex items-center gap-2 rounded-xl border border-emerald-400/30 bg-[#10241b] px-3 py-2 shadow-xl"
        >
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-300">✓</span>
          <span className="text-xs">
            <span className="block font-semibold text-white">Payment received</span>
            <span className="text-white/60">{pay.amt} · {pay.via}</span>
          </span>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
