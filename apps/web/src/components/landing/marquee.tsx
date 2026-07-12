'use client';

import { motion } from 'framer-motion';

const LOGOS = [
  'Sharma Textiles', 'Velan Traders', 'Anand Distributors', 'Coimbatore Mills',
  'Patel Agro', 'Nila Exports', 'SriRam Steels', 'Kovai Foods',
];

/**
 * Infinite, seamless logo marquee (21st.dev style). Two identical rows slide
 * left continuously; edges fade via a mask. Pauses on hover.
 */
export function LogoMarquee() {
  return (
    <section className="relative overflow-hidden border-y border-[#2a2a2a] bg-[#121212] py-10" style={{ fontFamily: 'var(--font-dm-sans), sans-serif' }}>
      <p className="mb-6 text-center text-xs font-semibold uppercase tracking-[0.2em] text-[#9CA3AF]">
        Trusted by growing businesses across India
      </p>
      <div
        className="group relative flex overflow-hidden"
        style={{ maskImage: 'linear-gradient(to right, transparent, black 12%, black 88%, transparent)', WebkitMaskImage: 'linear-gradient(to right, transparent, black 12%, black 88%, transparent)' }}
      >
        {[0, 1].map((row) => (
          <motion.div
            key={row}
            className="flex shrink-0 items-center gap-12 pr-12 group-hover:[animation-play-state:paused]"
            animate={{ x: ['0%', '-100%'] }}
            transition={{ duration: 26, repeat: Infinity, ease: 'linear' }}
          >
            {LOGOS.map((l) => (
              <span key={l} className="whitespace-nowrap text-lg font-bold tracking-tight text-white/35 transition-colors hover:text-white/70">
                {l}
              </span>
            ))}
          </motion.div>
        ))}
      </div>
    </section>
  );
}
