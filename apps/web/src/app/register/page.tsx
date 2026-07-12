'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { AuthShell } from '@/components/auth-shell';
import { CompanyCreationSequence } from '@/components/auth/company-creation';
import { FloatingInput } from '@/components/auth/floating-input';
import { MagneticButton } from '@/components/auth/magnetic-button';
import { PasswordStrength } from '@/components/auth/password-strength';
import { ErrorText, Label } from '@/components/ui';
import { ApiError, register } from '@/lib/api';

export default function RegisterPage() {
  const t = useTranslations('auth.register');
  const tAuth = useTranslations('auth.common');
  const tc = useTranslations('common');
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [accountType, setAccountType] = useState<'BUSINESS' | 'AUDITOR'>('BUSINESS');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [creating, setCreating] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await register(name, email, phone, password, accountType);
      // Auditors go straight to their workspace; businesses get the animated
      // workspace-setup sequence before landing on the dashboard.
      if (accountType === 'AUDITOR') {
        router.push('/auditor');
        return;
      }
      setCreating(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : tc('somethingWentWrong'));
      setBusy(false);
    }
  }

  if (creating) {
    // Carry a "Choose Business" intent from the pricing page through signup so the
    // dashboard opens the upgrade dialog right after the workspace is created.
    const plan = new URLSearchParams(window.location.search).get('plan');
    const dest = plan === 'business' ? '/dashboard?upgrade=business' : '/dashboard';
    return <CompanyCreationSequence onDone={() => router.push(dest)} />;
  }

  return (
    <AuthShell
      title={t('createAccount')}
      subtitle={t('subtitle')}
      footer={
        <>
          {t('haveAccount')}{' '}
          <Link href="/login" className="font-semibold text-brand-600 hover:underline">
            {tAuth('signIn')}
          </Link>
        </>
      }
    >
        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <Label>{t('accountTypeLabel')}</Label>
            <div className="grid grid-cols-2 gap-2">
              {(['BUSINESS', 'AUDITOR'] as const).map((tp) => (
                <button
                  key={tp}
                  type="button"
                  onClick={() => setAccountType(tp)}
                  className={`rounded-lg border px-3 py-2 text-sm font-semibold transition-colors ${
                    accountType === tp
                      ? 'border-brand-500 bg-brand-50 text-brand-700'
                      : 'border-line text-muted hover:bg-subtle'
                  }`}
                >
                  {t(`accountType.${tp}`)}
                </button>
              ))}
            </div>
            <p className="mt-1 text-xs text-faint">
              {accountType === 'AUDITOR' ? t('accountTypeAuditorHint') : t('accountTypeBusinessHint')}
            </p>
          </div>
          <FloatingInput
            label={t('fullName')}
            required
            autoComplete="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <FloatingInput
            label={tAuth('email')}
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <FloatingInput
            label={tAuth('phone')}
            type="tel"
            required
            autoComplete="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
          <div>
            <FloatingInput
              label={tAuth('password')}
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <PasswordStrength value={password} />
          </div>
          <ErrorText>{error}</ErrorText>
          <MagneticButton type="submit" loading={busy}>
            {t('createAccount')}
          </MagneticButton>
        </form>
    </AuthShell>
  );
}
