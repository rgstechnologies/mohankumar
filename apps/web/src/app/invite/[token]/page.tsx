'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { LanguageSwitcher } from '@/components/language-switcher';
import { Button, Card, ErrorText, Input, Label } from '@/components/ui';
import { api, ApiError } from '@/lib/api';

interface InvitePreview {
  email: string;
  role: string;
  companyName: string;
  invitedBy: string;
  userExists: boolean;
}

export default function InvitePage() {
  const t = useTranslations('auth.invite');
  const tAuth = useTranslations('auth.common');
  const tc = useTranslations('common');
  const { token } = useParams<{ token: string }>();
  const router = useRouter();
  const [preview, setPreview] = useState<InvitePreview | null>(null);
  const [loadError, setLoadError] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    api
      .get<InvitePreview>(`/invites/${token}`)
      .then(setPreview)
      .catch((err) =>
        setLoadError(
          err instanceof ApiError ? err.message : t('loadFailed'),
        ),
      );
  }, [token, t]);

  async function onAccept(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const body = preview?.userExists ? {} : { name, password };
      await api.post(`/invites/${token}/accept`, body);
      setDone(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : tc('somethingWentWrong'));
      setBusy(false);
    }
  }

  return (
    <main className="relative mx-auto flex min-h-screen max-w-md flex-col justify-center p-6">
      <div className="absolute right-4 top-4"><LanguageSwitcher /></div>
      <h1 className="mb-8 text-center text-2xl font-bold">RGS ERP</h1>
      <Card>
        {loadError ? (
          <p className="text-center text-sm text-red-600">{loadError}</p>
        ) : !preview ? (
          <p className="text-center text-sm text-muted">{t('loading')}</p>
        ) : done ? (
          <div className="space-y-4 text-center">
            <p className="text-sm">
              {t('joined', { company: preview.companyName, role: preview.role })}
            </p>
            <Button onClick={() => router.push('/login')} className="w-full">
              {t('signInToContinue')}
            </Button>
          </div>
        ) : (
          <form onSubmit={onAccept} className="space-y-4">
            <p className="text-sm text-muted">
              {t('invitedLine', {
                invitedBy: preview.invitedBy,
                email: preview.email,
                company: preview.companyName,
                role: preview.role,
              })}
            </p>
            {!preview.userExists && (
              <>
                <div>
                  <Label>{t('fullName')}</Label>
                  <Input required value={name} onChange={(e) => setName(e.target.value)} />
                </div>
                <div>
                  <Label>{t('choosePassword')}</Label>
                  <Input
                    type="password"
                    required
                    minLength={8}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>
              </>
            )}
            <ErrorText>{error}</ErrorText>
            <Button type="submit" disabled={busy} className="w-full">
              {busy ? t('joining') : t('acceptInvitation')}
            </Button>
          </form>
        )}
      </Card>
      <p className="mt-4 text-center text-sm text-muted">
        <Link href="/login" className="font-medium text-brand-600">
          {tAuth('backToSignIn')}
        </Link>
      </p>
    </main>
  );
}
