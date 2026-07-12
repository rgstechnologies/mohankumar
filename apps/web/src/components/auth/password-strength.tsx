'use client';

import { motion } from 'framer-motion';

function score(p: string): number {
  let s = 0;
  if (p.length >= 8) s++;
  if (/[a-z]/.test(p) && /[A-Z]/.test(p)) s++;
  if (/\d/.test(p)) s++;
  if (/[^A-Za-z0-9]/.test(p)) s++;
  return Math.min(4, s);
}

const LABELS = ['', 'Weak', 'Fair', 'Good', 'Strong'];
const COLORS = ['', 'bg-red-500', 'bg-amber-500', 'bg-yellow-400', 'bg-emerald-500'];
const TEXT = ['', 'text-red-500', 'text-amber-500', 'text-yellow-500', 'text-emerald-500'];

export function PasswordStrength({ value }: { value: string }) {
  if (!value) return null;
  const s = score(value);
  return (
    <div className="mt-2">
      <div className="flex gap-1.5">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-1 flex-1 overflow-hidden rounded-full bg-line">
            <motion.div
              initial={false}
              animate={{ width: i <= s ? '100%' : '0%' }}
              transition={{ duration: 0.3 }}
              className={`h-full rounded-full ${i <= s ? COLORS[s] : ''}`}
            />
          </div>
        ))}
      </div>
      <p className={`mt-1 text-[11px] font-medium ${TEXT[s]}`}>{LABELS[s]} password</p>
    </div>
  );
}
