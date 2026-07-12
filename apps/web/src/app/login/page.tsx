'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { AuthShell } from '@/components/auth-shell';
import { FloatingInput } from '@/components/auth/floating-input';
import { MagneticButton } from '@/components/auth/magnetic-button';
import { Button, ErrorText, Input, Label } from '@/components/ui';
import { ApiError, login, mfaVerifyLogin } from '@/lib/api';

export default function LoginPage() {
  const t = useTranslations('auth.login');
  const tAuth = useTranslations('auth.common');
  const tc = useTranslations('common');
  const router = useRouter();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [success, setSuccess] = useState(false);
  const [mfaToken, setMfaToken] = useState('');
  const [mfaCode, setMfaCode] = useState('');

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const result = await login(identifier, password);
      if ('mfaRequired' in result) {
        setMfaToken(result.mfaToken);
        setBusy(false);
        return;
      }
      // brief success morph before the dashboard transition
      setBusy(false);
      setSuccess(true);
      setTimeout(() => router.push('/dashboard'), 650);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : tc('somethingWentWrong'));
      setBusy(false);
    }
  }

  async function onMfaSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await mfaVerifyLogin(mfaToken, mfaCode);
      router.push('/dashboard');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : tc('somethingWentWrong'));
      setBusy(false);
    }
  }

  return (
    <AuthShell
      title={tAuth('signIn')}
      subtitle={t('subtitle')}
      footer={
        <>
          {t('newHere')}{' '}
          <Link href="/register" className="font-semibold text-brand-600 hover:underline">
            {t('createAccount')}
          </Link>
        </>
      }
    >
        {mfaToken ? (
          <form onSubmit={onMfaSubmit} className="space-y-4">
            <div>
              <Label>{t('mfaCode')}</Label>
              <Input
                autoFocus
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={20}
                required
                value={mfaCode}
                onChange={(e) => setMfaCode(e.target.value)}
                placeholder="123456"
              />
              <p className="mt-1 text-xs text-muted">{t('mfaHint')}</p>
            </div>
            <Button type="submit" disabled={busy || mfaCode.trim().length < 6} className="w-full">
              {busy ? '…' : t('mfaVerify')}
            </Button>
            <button
              type="button"
              onClick={() => {
                setMfaToken('');
                setMfaCode('');
                setError('');
              }}
              className="w-full text-center text-xs text-faint hover:text-muted"
            >
              {t('mfaBack')}
            </button>
            <ErrorText>{error}</ErrorText>
          </form>
        ) : (
        <form onSubmit={onSubmit} className="space-y-4">
          <FloatingInput
            label={tAuth('emailOrPhone')}
            type="text"
            required
            autoComplete="username"
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
          />
          <FloatingInput
            label={tAuth('password')}
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <ErrorText>{error}</ErrorText>
          <MagneticButton type="submit" loading={busy} success={success}>
            {tAuth('signIn')}
          </MagneticButton>
          <p className="text-center text-sm">
            <Link href="/forgot-password" className="text-brand-600 hover:underline">
              {t('forgotPassword')}
            </Link>
          </p>
        </form>
        )}
    </AuthShell>
  );
}
