'use client';

import { useEffect } from 'react';

/**
 * Global guard: stop mouse-wheel / trackpad scrolling AND arrow-key presses
 * from changing the value of a focused `<input type="number">` anywhere in
 * the app.
 *
 * Mounted once at the root layout, it attaches document-level listeners so it
 * covers every numeric field automatically — existing, dynamically generated,
 * modal/popup, inline table editors, filters, and any future component — with
 * no per-field code.
 *
 * Wheel: blur the focused number input so the browser won't step the value.
 * Arrow keys: preventDefault on ArrowUp / ArrowDown so the value is unchanged.
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

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        const el = document.activeElement;
        if (el instanceof HTMLInputElement && el.type === 'number') {
          e.preventDefault();
        }
      }
    };

    // Capture phase + passive: runs before the input's default action, and
    // since we don't preventDefault, scrolling stays smooth.
    document.addEventListener('wheel', onWheel, { capture: true, passive: true });
    // Non-passive so we can preventDefault on arrow keys.
    document.addEventListener('keydown', onKeyDown, { capture: true });
    return () => {
      document.removeEventListener('wheel', onWheel, { capture: true });
      document.removeEventListener('keydown', onKeyDown, { capture: true });
    };
  }, []);

  return null;
}
