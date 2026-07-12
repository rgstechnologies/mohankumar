'use client';

import { useRef } from 'react';
import { motion, useMotionValue, useSpring } from 'framer-motion';

/**
 * Submit button that's subtly "magnetic" — it eases toward the cursor on hover
 * — and morphs through loading (spinner) and success (checkmark) states.
 */
export function MagneticButton({
  children,
  loading = false,
  success = false,
  className = '',
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  loading?: boolean;
  success?: boolean;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const sx = useSpring(x, { stiffness: 220, damping: 16 });
  const sy = useSpring(y, { stiffness: 220, damping: 16 });

  return (
    <motion.button
      ref={ref}
      {...(props as React.ComponentProps<typeof motion.button>)}
      style={{ x: sx, y: sy }}
      onMouseMove={(e) => {
        const r = ref.current?.getBoundingClientRect();
        if (!r) return;
        x.set(((e.clientX - r.left) / r.width - 0.5) * 14);
        y.set(((e.clientY - r.top) / r.height - 0.5) * 10);
      }}
      onMouseLeave={() => {
        x.set(0);
        y.set(0);
      }}
      whileTap={{ scale: 0.97 }}
      disabled={loading || success || props.disabled}
      className={`relative flex w-full items-center justify-center gap-2 overflow-hidden rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-brand-600/30 transition-colors hover:bg-brand-700 disabled:opacity-90 ${className}`}
    >
      {success ? (
        <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 320, damping: 14 }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 6 9 17l-5-5" />
          </svg>
        </motion.span>
      ) : loading ? (
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
      ) : (
        children
      )}
    </motion.button>
  );
}
