'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { LanguageSwitcher } from '@/components/language-switcher';
import { Button, Card, ErrorText, Input, Label } from '@/components/ui';
import { ApiError, forgotPassword } from '@/lib/api';

export default function ForgotPasswordPage() {
  const t = useTranslations('auth.forgot');
  const tAuth = useTranslations('auth.common');
  const tc = useTranslations('common');
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await forgotPassword(email);
      setSent(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : tc('somethingWentWrong'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="relative mx-auto flex min-h-screen max-w-md flex-col justify-center p-6">
      <div className="absolute right-4 top-4"><LanguageSwitcher /></div>
      <h1 className="mb-1 text-center text-2xl font-bold">RGS ERP</h1>
      <p className="mb-8 text-center text-sm text-muted">{t('subtitle')}</p>
      <Card>
        {sent ? (
          <div className="space-y-4 text-center">
            <p className="text-sm leading-relaxed text-muted">
              {t('sentInfo', { email })}
            </p>
            <Link href="/login" className="text-sm font-medium text-brand-600 hover:underline">
              {t('backToSignInArrow')}
            </Link>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="space-y-4">
            <p className="text-sm text-muted">
              {t('intro')}
            </p>
            <div>
              <Label>{tAuth('email')}</Label>
              <Input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={tAuth('emailPlaceholder')}
              />
            </div>
            <ErrorText>{error}</ErrorText>
            <Button type="submit" disabled={busy} className="w-full">
              {busy ? t('sending') : t('sendResetLink')}
            </Button>
            <p className="text-center text-sm">
              <Link href="/login" className="text-brand-600 hover:underline">
                {tAuth('backToSignIn')}
              </Link>
            </p>
          </form>
        )}
      </Card>
    </main>
  );
}
