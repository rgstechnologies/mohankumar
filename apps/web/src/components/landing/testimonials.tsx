'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';

const CARDS = [
  { q: 'We replaced Tally + three spreadsheets with RGS. GST filing went from a two-day scramble to a click.', n: 'Rahul Sharma', r: 'Owner · Sharma Textiles, Surat' },
  { q: 'My accountant in Chennai and my shop in Coimbatore finally work off the same live books. No more emailing files.', n: 'Priya Venkatesh', r: 'Director · Velan Traders' },
  { q: 'Estimates, invoices and payments flow on their own. Our outstanding dropped 30% in two months.', n: 'Imran Khan', r: 'Founder · Anand Distributors' },
  { q: 'The POS and inventory are fast enough for a busy counter, and the reports are exactly what my CA asks for.', n: 'Meera Nair', r: 'Partner · Coimbatore Mills' },
  { q: 'Cleanest accounting UI I have used in India. It feels like Zoho but understands how we actually bill.', n: 'Arjun Patel', r: 'CFO · Patel Agro Foods' },
];

export function Testimonials() {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused) return;
    const id = setInterval(() => setActive((a) => (a + 1) % CARDS.length), 4000);
    return () => clearInterval(id);
  }, [paused]);

  return (
    <section
      className="relative overflow-hidden border-t border-[#2a2a2a] bg-[#121212] py-24"
      style={{ fontFamily: 'var(--font-dm-sans), sans-serif' }}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div className="pointer-events-none absolute left-1/2 top-1/2 h-72 w-[700px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#FF7A00]/10 blur-[120px]" />
      <div className="relative mx-auto w-full max-w-7xl px-6">
        <div className="mb-14 text-center">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#FF7A00]">Loved by businesses</p>
          <h2 className="mt-3 text-3xl font-bold tracking-tight text-white sm:text-4xl">
            Trusted across India
          </h2>
        </div>

        {/* coverflow track */}
        <div className="relative h-64 overflow-hidden">
          <motion.div
            className="flex h-full items-center gap-6"
            animate={{ x: `calc(50% - 180px - ${active * 384}px)` }}
            transition={{ type: 'spring', stiffness: 60, damping: 18 }}
          >
            {CARDS.map((c, i) => {
              const isActive = i === active;
              return (
                <motion.figure
                  key={i}
                  animate={{
                    scale: isActive ? 1 : 0.86,
                    opacity: isActive ? 1 : 0.4,
                    filter: isActive ? 'blur(0px)' : 'blur(2px)',
                  }}
                  transition={{ duration: 0.5 }}
                  onClick={() => setActive(i)}
                  className={`flex h-56 w-[360px] shrink-0 cursor-pointer flex-col justify-between rounded-2xl border p-7 ${
                    isActive ? 'border-[#FF7A00]/40 bg-[#1E1E1E] shadow-2xl shadow-[#FF7A00]/10' : 'border-[#2a2a2a] bg-[#161616]'
                  }`}
                >
                  <div>
                    <span className="text-3xl leading-none text-[#FF7A00]">&ldquo;</span>
                    <p className="mt-2 text-sm leading-relaxed text-white/90">{c.q}</p>
                  </div>
                  <figcaption className="mt-4 flex items-center gap-3">
                    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#FF7A00]/15 text-sm font-bold text-[#FF7A00]">
                      {c.n.charAt(0)}
                    </span>
                    <span>
                      <span className="block text-sm font-semibold text-white">{c.n}</span>
                      <span className="block text-xs text-[#9CA3AF]">{c.r}</span>
                    </span>
                  </figcaption>
                </motion.figure>
              );
            })}
          </motion.div>
        </div>

        {/* dots */}
        <div className="mt-8 flex justify-center gap-2">
          {CARDS.map((_, i) => (
            <button
              key={i}
              onClick={() => setActive(i)}
              aria-label={`Testimonial ${i + 1}`}
              className={`h-2 rounded-full transition-all ${i === active ? 'w-6 bg-[#FF7A00]' : 'w-2 bg-[#3a3a3a] hover:bg-[#555]'}`}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
