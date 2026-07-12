'use client';

/**
 * App-wide feedback primitives: toast notifications and a promise-based
 * confirmation dialog — replaces window.alert / window.confirm.
 */

import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
} from 'react';
import { useTranslations } from 'next-intl';

// ----------------------------------------------------------------
// Types
// ----------------------------------------------------------------

type ToastTone = 'success' | 'error' | 'info';

interface Toast {
  id: number;
  tone: ToastTone;
  message: string;
}

interface ConfirmOptions {
  title: string;
  body?: string;
  confirmLabel?: string;
  danger?: boolean;
}

interface FeedbackContextValue {
  toast: (message: string, tone?: ToastTone) => void;
  confirm: (options: ConfirmOptions) => Promise<boolean>;
}

const FeedbackContext = createContext<FeedbackContextValue | null>(null);

export function useFeedback(): FeedbackContextValue {
  const ctx = useContext(FeedbackContext);
  if (!ctx) throw new Error('useFeedback must be used inside <FeedbackProvider>');
  return ctx;
}

// ----------------------------------------------------------------
// Provider
// ----------------------------------------------------------------

const TONE_STYLE: Record<ToastTone, string> = {
  success: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  error: 'border-red-200 bg-red-50 text-red-700',
  info: 'border-line bg-surface text-ink',
};

const TONE_ICON: Record<ToastTone, string> = {
  success: '✓',
  error: '✕',
  info: 'ℹ',
};

export function FeedbackProvider({ children }: { children: React.ReactNode }) {
  const t = useTranslations('feedback');
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [confirmState, setConfirmState] = useState<
    (ConfirmOptions & { resolve: (ok: boolean) => void }) | null
  >(null);
  const nextId = useRef(1);

  const toast = useCallback((message: string, tone: ToastTone = 'success') => {
    const id = nextId.current++;
    setToasts((prev) => [...prev, { id, tone, message }]);
    setTimeout(
      () => setToasts((prev) => prev.filter((t) => t.id !== id)),
      4500,
    );
  }, []);

  const confirm = useCallback(
    (options: ConfirmOptions) =>
      new Promise<boolean>((resolve) => setConfirmState({ ...options, resolve })),
    [],
  );

  const settle = (ok: boolean) => {
    confirmState?.resolve(ok);
    setConfirmState(null);
  };

  return (
    <FeedbackContext.Provider value={{ toast, confirm }}>
      {children}

      {/* Toast stack */}
      <div className="pointer-events-none fixed bottom-5 right-5 z-50 flex w-80 flex-col gap-2">
        {toasts.map((item) => (
          <div
            key={item.id}
            className={`pointer-events-auto flex items-start gap-2.5 rounded-xl border px-4 py-3 text-sm shadow-lg ${TONE_STYLE[item.tone]}`}
            role="status"
          >
            <span className="mt-0.5 text-xs font-bold">{TONE_ICON[item.tone]}</span>
            <span className="flex-1">{item.message}</span>
            <button
              onClick={() => setToasts((prev) => prev.filter((x) => x.id !== item.id))}
              className="text-xs opacity-50 hover:opacity-100"
              aria-label={t('dismiss')}
            >
              ✕
            </button>
          </div>
        ))}
      </div>

      {/* Confirm dialog */}
      {confirmState && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm"
          onClick={() => settle(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-surface p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <h3 className="text-lg font-bold text-ink">{confirmState.title}</h3>
            {confirmState.body && (
              <p className="mt-2 text-sm leading-relaxed text-muted">
                {confirmState.body}
              </p>
            )}
            <div className="mt-6 flex justify-end gap-2">
              <button
                onClick={() => settle(false)}
                className="rounded-lg border border-line-strong bg-surface px-4 py-2 text-sm font-medium text-ink hover:bg-subtle"
              >
                {t('cancel')}
              </button>
              <button
                onClick={() => settle(true)}
                autoFocus
                className={`rounded-lg px-4 py-2 text-sm font-medium text-white shadow-sm ${
                  confirmState.danger
                    ? 'bg-red-600 hover:bg-red-700'
                    : 'bg-brand-600 hover:bg-brand-700'
                }`}
              >
                {confirmState.confirmLabel ?? t('confirm')}
              </button>
            </div>
          </div>
        </div>
      )}
    </FeedbackContext.Provider>
  );
}
