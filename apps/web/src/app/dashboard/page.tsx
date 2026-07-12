'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { api, isAuthenticated, type Me } from '@/lib/api';

/**
 * There is exactly one business in this install, so there is nothing to choose
 * between: sign-in lands straight in its workspace. Kept as a route (rather than
 * redirecting from /login) because the company id is only known after /auth/me.
 */
export default function DashboardPage() {
  const t = useTranslations('dashboardPage');
  const tc = useTranslations('common');
  const router = useRouter();
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isAuthenticated()) {
      router.replace('/login');
      return;
    }
    api
      .get<Me>('/auth/me')
      .then((me) => {
        const companyId = me.memberships[0]?.company.id;
        if (companyId) {
          router.replace(`/company/${companyId}`);
        } else {
          // Only reachable if the database was never seeded.
          setError(t('noCompany'));
        }
      })
      .catch(() => router.replace('/login'));
  }, [router, t]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas p-6 text-sm">
      {error ? (
        <p className="max-w-md text-center text-danger">{error}</p>
      ) : (
        <p className="text-muted">{tc('loading')}</p>
      )}
    </main>
  );
}
