'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { useFeedback } from '@/components/feedback';
import { LanguageSwitcher } from '@/components/language-switcher';
import { Button, Card, ErrorText, Input, Label } from '@/components/ui';
import { ApiError, resetPassword } from '@/lib/api';
import { APP_NAME } from '@/lib/brand';

export default function ResetPasswordPage() {
  const t = useTranslations('auth.reset');
  const tAuth = useTranslations('auth.common');
  const tc = useTranslations('common');
  const { token } = useParams<{ token: string }>();
  const router = useRouter();
  const { toast } = useFeedback();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (password !== confirm) {
      setError(t('passwordsMismatch'));
      return;
    }
    setBusy(true);
    try {
      await resetPassword(token, password);
      toast(t('toastUpdated'));
      router.push('/login');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : tc('somethingWentWrong'));
      setBusy(false);
    }
  }

  return (
    <main className="relative mx-auto flex min-h-screen max-w-md flex-col justify-center p-6">
      <div className="absolute right-4 top-4"><LanguageSwitcher /></div>
      <h1 className="mb-1 text-center text-2xl font-bold">{APP_NAME}</h1>
      <p className="mb-8 text-center text-sm text-muted">{t('subtitle')}</p>
      <Card>
        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <Label>{t('newPassword')}</Label>
            <Input
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={tAuth('passwordMinPlaceholder')}
            />
          </div>
          <div>
            <Label>{t('confirmNewPassword')}</Label>
            <Input
              type="password"
              required
              minLength={8}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </div>
          <ErrorText>{error}</ErrorText>
          <Button type="submit" disabled={busy} className="w-full">
            {busy ? t('updating') : t('setNewPassword')}
          </Button>
          <p className="text-center text-xs text-faint">
            {t('sessionsNote')}
          </p>
          <p className="text-center text-sm">
            <Link href="/login" className="text-brand-600 hover:underline">
              {tAuth('backToSignIn')}
            </Link>
          </p>
        </form>
      </Card>
    </main>
  );
}
