'use client';

import { useEffect } from 'react';

/**
 * Global guard: stop mouse-wheel / trackpad scrolling from changing the value
 * of a focused `<input type="number">` anywhere in the app.
 *
 * Mounted once at the root layout, it attaches a single document-level listener,
 * so it covers every numeric field automatically — existing, dynamically
 * generated, modal/popup, inline table editors, filters, and any future
 * component — with no per-field code.
 *
 * How it works: when a focused number input receives a wheel event, we blur it.
 * The browser only increments/decrements a number input while it's focused, so
 * blurring cancels the value change — and because we never call preventDefault,
 * normal page/container scrolling continues unaffected. Focus is restored as
 * soon as the user clicks or tabs back in.
 */
export function NoScrollNumber() {
  useEffect(() => {
    const onWheel = (e: WheelEvent) => {
      const el = document.activeElement;
      if (
        el instanceof HTMLInputElement &&
        el.type === 'number' &&
        el === e.target
      ) {
        // Drop focus so the browser won't apply the wheel as a step change.
        el.blur();
      }
    };
    // Capture phase + passive: runs before the input's default action, and
    // since we don't preventDefault, scrolling stays smooth.
    document.addEventListener('wheel', onWheel, { capture: true, passive: true });
    return () => document.removeEventListener('wheel', onWheel, { capture: true });
  }, []);

  return null;
}
