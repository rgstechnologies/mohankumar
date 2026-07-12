'use client';

/* eslint-disable @next/next/no-img-element */

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useFeedback } from '@/components/feedback';
import { Button, ErrorText, Input, Label } from '@/components/ui';
import { ApiError, mfaDisable, mfaEnable, mfaSetup } from '@/lib/api';

/** Two-factor authentication management (TOTP authenticator apps). */
export function SecurityDialog({
  totpEnabled,
  onClose,
  onChanged,
}: {
  totpEnabled: boolean;
  onClose: () => void;
  onChanged: () => Promise<void>;
}) {
  const t = useTranslations('mfa');
  const { toast } = useFeedback();
  const [qr, setQr] = useState<{ qrDataUrl: string; secret: string } | null>(null);
  const [code, setCode] = useState('');
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function startSetup() {
    setBusy(true);
    setError('');
    try {
      const setup = await mfaSetup();
      setQr({ qrDataUrl: setup.qrDataUrl, secret: setup.secret });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('failed'));
    } finally {
      setBusy(false);
    }
  }

  async function confirmEnable(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const result = await mfaEnable(code.trim());
      setRecoveryCodes(result.recoveryCodes);
      setCode('');
      await onChanged();
      toast(t('enabledToast'));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('failed'));
    } finally {
      setBusy(false);
    }
  }

  async function disable(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await mfaDisable(code.trim());
      await onChanged();
      toast(t('disabledToast'), 'info');
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('failed'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-surface p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-1 text-lg font-bold text-ink">{t('title')}</h2>

        {recoveryCodes ? (
          <div className="space-y-3">
            <p className="text-sm text-amber-700">{t('recoveryIntro')}</p>
            <div className="grid grid-cols-2 gap-1 rounded-lg bg-subtle p-3 font-mono text-sm">
              {recoveryCodes.map((c) => (
                <span key={c}>{c}</span>
              ))}
            </div>
            <Button
              variant="secondary"
              className="w-full"
              onClick={() => {
                void navigator.clipboard?.writeText(recoveryCodes.join('\n'));
                toast(t('copied'));
              }}
            >
              {t('copy')}
            </Button>
            <Button className="w-full" onClick={onClose}>
              {t('done')}
            </Button>
          </div>
        ) : totpEnabled ? (
          <form onSubmit={disable} className="space-y-3">
            <p className="text-sm text-emerald-700">{t('statusOn')}</p>
            <p className="text-xs text-muted">{t('disableHint')}</p>
            <div>
              <Label>{t('codeLabel')}</Label>
              <Input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="123456"
                maxLength={20}
                required
              />
            </div>
            <Button type="submit" variant="danger" disabled={busy} className="w-full">
              {busy ? '…' : t('disable')}
            </Button>
            <ErrorText>{error}</ErrorText>
          </form>
        ) : qr ? (
          <form onSubmit={confirmEnable} className="space-y-3">
            <p className="text-sm text-muted">{t('scanHint')}</p>
            <div className="flex justify-center">
              <img src={qr.qrDataUrl} alt="TOTP QR" className="h-44 w-44" />
            </div>
            <p className="break-all text-center font-mono text-xs text-faint">
              {qr.secret}
            </p>
            <div>
              <Label>{t('codeLabel')}</Label>
              <Input
                autoFocus
                inputMode="numeric"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="123456"
                maxLength={6}
                required
              />
            </div>
            <Button type="submit" disabled={busy || code.trim().length !== 6} className="w-full">
              {busy ? '…' : t('confirm')}
            </Button>
            <ErrorText>{error}</ErrorText>
          </form>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-muted">{t('intro')}</p>
            <Button onClick={() => void startSetup()} disabled={busy} className="w-full">
              {busy ? '…' : t('start')}
            </Button>
            <ErrorText>{error}</ErrorText>
          </div>
        )}
      </div>
    </div>
  );
}
