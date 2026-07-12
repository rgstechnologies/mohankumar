/**
 * Shared line-SVG glyphs — professional replacements for emoji.
 * All inherit `currentColor` and take an optional className for sizing.
 */

type IconProps = { className?: string };

const base = (className = 'h-4 w-4') => ({
  className,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.7,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
});

/** AI / smart-assist marker (replaces ✨). */
export function AiSparkle({ className = 'h-4 w-4' }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6z" />
      <path d="M18 14l.8 2.2L21 17l-2.2.8L18 20l-.8-2.2L15 17l2.2-.8z" />
    </svg>
  );
}

export function IconParty({ className = 'h-4 w-4' }: IconProps) {
  return (
    <svg {...base(className)}>
      <circle cx="12" cy="8" r="3.2" />
      <path d="M5.5 20a6.5 6.5 0 0113 0" />
    </svg>
  );
}

export function IconItem({ className = 'h-4 w-4' }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="M20.6 13.4L13.4 20.6a2 2 0 01-2.8 0l-7.2-7.2a2 2 0 01-.6-1.4V4.5a1.5 1.5 0 011.5-1.5h7.5a2 2 0 011.4.6l7.4 7.4a2 2 0 010 2.8z" />
      <circle cx="7.5" cy="7.5" r="1.2" />
    </svg>
  );
}

export function IconLedger({ className = 'h-4 w-4' }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="M4 5a2 2 0 012-2h12v18H6a2 2 0 01-2-2z" />
      <path d="M8 3v18M18 8h-6M18 12h-6" />
    </svg>
  );
}

export function IconInvoice({ className = 'h-4 w-4' }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="M6 2h9l3 3v15l-2.2-1.3L13.5 20l-2.3-1.3L8.9 20l-2.3-1.3L4.4 20V4a2 2 0 011.6-2z" />
      <path d="M8 8h7M8 12h7" />
    </svg>
  );
}

export function IconPurchase({ className = 'h-4 w-4' }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="M3 4h2l2.2 11.2a1.5 1.5 0 001.5 1.2h8.1a1.5 1.5 0 001.5-1.2L21 7H6" />
      <circle cx="9.5" cy="20" r="1.2" />
      <circle cx="17" cy="20" r="1.2" />
    </svg>
  );
}

export function IconVoucher({ className = 'h-4 w-4' }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="M4 5a1 1 0 011-1h14a1 1 0 011 1v3a2 2 0 000 4v3a1 1 0 01-1 1H5a1 1 0 01-1-1v-3a2 2 0 000-4z" />
      <path d="M14 4v16" strokeDasharray="2 2" />
    </svg>
  );
}

export function IconLock({ className = 'h-4 w-4' }: IconProps) {
  return (
    <svg {...base(className)}>
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V8a4 4 0 018 0v3" />
    </svg>
  );
}

export function IconMic({ className = 'h-4 w-4' }: IconProps) {
  return (
    <svg {...base(className)}>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0014 0M12 18v3" />
    </svg>
  );
}

export function IconDoc({ className = 'h-4 w-4' }: IconProps) {
  return (
    <svg {...base(className)}>
      <path d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8z" />
      <path d="M14 3v5h5M9 13h6M9 17h6" />
    </svg>
  );
}
