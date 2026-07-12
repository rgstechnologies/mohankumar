'use client';

import { useState } from 'react';

/**
 * Input with a floating label and a focus glow. The label rests inside the
 * field and animates up on focus or when filled. Theme-aware via tokens.
 */
export function FloatingInput({
  label,
  value,
  onChange,
  type = 'text',
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  const [focused, setFocused] = useState(false);
  const floated = focused || (value != null && String(value).length > 0);

  return (
    <div className="relative">
      <input
        {...props}
        type={type}
        value={value ?? ''}
        onChange={onChange}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder=" "
        className="peer w-full rounded-lg border border-line-strong bg-surface px-3 pb-2 pt-5 text-sm text-ink outline-none transition-all focus:border-brand-600 focus:ring-4 focus:ring-brand-100"
      />
      <label
        className={`pointer-events-none absolute left-3 font-medium transition-all duration-200 ${
          floated ? 'top-1.5 text-[10px] uppercase tracking-wide text-brand-600' : 'top-3.5 text-sm text-faint'
        }`}
      >
        {label}
      </label>
    </div>
  );
}
