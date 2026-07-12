'use client';

import { motion } from 'framer-motion';

/**
 * 21st.dev-style animated border beam: a conic-gradient light rotates around
 * the element's 1px border. The child supplies its own solid background, so
 * only the ring shows the travelling beam.
 */
export function BorderBeam({
  children,
  className = '',
  duration = 7,
  radius = 'rounded-2xl',
}: {
  children: React.ReactNode;
  className?: string;
  duration?: number;
  radius?: string;
}) {
  return (
    <div className={`relative h-full overflow-hidden p-px ${radius} ${className}`}>
      <motion.div
        aria-hidden
        className="absolute left-1/2 top-1/2 h-[160%] w-[160%] -translate-x-1/2 -translate-y-1/2"
        style={{
          background:
            'conic-gradient(from 0deg, transparent 0deg, rgba(255,122,0,0.9) 45deg, transparent 130deg)',
        }}
        animate={{ rotate: 360 }}
        transition={{ duration, repeat: Infinity, ease: 'linear' }}
      />
      <div className={`relative h-full ${radius}`}>{children}</div>
    </div>
  );
}
