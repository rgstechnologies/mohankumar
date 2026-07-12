'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { LanguageSwitcher } from '@/components/language-switcher';
import { useFeedback } from '@/components/feedback';
import { Badge, Button, Card } from '@/components/ui';
import { inr } from '@/lib/accounting';
import { api, downloadFile, printFile, isAuthenticated, logout, type Me } from '@/lib/api';

interface Employment {
  employeeId: string;
  company: string;
  branch: string | null;
  code: string;
  name: string;
  designation: string | null;
  joinDate: string;
  exitDate: string | null;
  isActive: boolean;
}

interface PortalPayslip {
  lineId: string;
  company: string;
  period: string;
  status: 'POSTED' | 'PAID';
  workingDays: number;
  lopDays: number;
  gross: number;
  totalDeductions: number;
  netPay: number;
}

/** Employee self-service: my employments + payslips. No company data here. */
export default function PortalPage() {
  const t = useTranslations('portal');
  const tc = useTranslations('common');
  const router = useRouter();
  const { toast } = useFeedback();
  const [employments, setEmployments] = useState<Employment[] | null>(null);
  const [payslips, setPayslips] = useState<PortalPayslip[]>([]);
  const [hasCompanies, setHasCompanies] = useState(false);

  useEffect(() => {
    if (!isAuthenticated()) {
      router.push('/login');
      return;
    }
    Promise.all([
      api.get<Employment[]>('/portal/me'),
      api.get<PortalPayslip[]>('/portal/payslips'),
      api.get<Me>('/auth/me'),
    ])
      .then(([me, slips, account]) => {
        setEmployments(me);
        setPayslips(slips);
        setHasCompanies(account.memberships.length > 0);
      })
      .catch(() => router.push('/login'));
  }, [router]);

  async function download(lineId: string) {
    try {
      await downloadFile(`/portal/payslips/${lineId}/pdf`);
    } catch {
      toast(t('downloadFailed'), 'error');
    }
  }

  async function print(lineId: string) {
    try {
      await printFile(`/portal/payslips/${lineId}/pdf`);
    } catch {
      toast(t('downloadFailed'), 'error');
    }
  }

  if (employments === null) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-subtle text-sm text-muted">
        {tc('loading')}
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-subtle">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-4">
          <span className="flex items-center gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/rgs-logo.jpeg" alt="RGS" className="h-8 w-8 rounded-lg bg-white object-contain" />
            <span className="text-lg font-bold tracking-tight">RGS</span>
          </span>
          <div className="flex items-center gap-3">
            <LanguageSwitcher />
            {hasCompanies ? (
              <Link href="/dashboard">
                <Button variant="secondary">{t('backToDashboard')}</Button>
              </Link>
            ) : (
              <Button
                variant="secondary"
                onClick={async () => {
                  await logout();
                  router.push('/login');
                }}
              >
                {t('signOut')}
              </Button>
            )}
          </div>
        </div>
      </header>

      <div className="mx-auto w-full max-w-5xl px-6 py-10">
        <h1 className="text-2xl font-bold tracking-tight text-ink">{t('title')}</h1>
        <p className="mt-1 mb-8 text-sm text-muted">{t('subtitle')}</p>

        {employments.length === 0 ? (
          <Card>
            <p className="text-sm text-muted">{t('noEmployments')}</p>
          </Card>
        ) : (
          <>
            <div className="mb-6 grid gap-4 sm:grid-cols-2">
              {employments.map((e) => (
                <Card key={e.employeeId}>
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-sm font-semibold text-ink">{e.company}</p>
                      <p className="text-xs text-muted">
                        {e.code}
                        {e.designation ? ` · ${e.designation}` : ''}
                        {e.branch ? ` · ${e.branch}` : ''}
                      </p>
                      <p className="mt-1 text-xs text-faint">
                        {t('joined')} {new Date(e.joinDate).toLocaleDateString('en-IN')}
                      </p>
                    </div>
                    <Badge tone={e.isActive ? 'good' : 'neutral'}>
                      {e.isActive ? t('active') : t('exited')}
                    </Badge>
                  </div>
                </Card>
              ))}
            </div>

            <Card title={t('payslipsTitle')}>
              {payslips.length === 0 ? (
                <p className="text-sm text-muted">{t('noPayslips')}</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-line bg-subtle text-left text-[11px] font-semibold uppercase tracking-wide text-muted">
                      <th className="py-2">{t('colPeriod')}</th>
                      <th className="py-2">{t('colCompany')}</th>
                      <th className="py-2 text-right">{t('colDays')}</th>
                      <th className="py-2 text-right">{t('colGross')}</th>
                      <th className="py-2 text-right">{t('colDeductions')}</th>
                      <th className="py-2 text-right">{t('colNet')}</th>
                      <th className="py-2 text-right">{tc('actions')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payslips.map((p) => (
                      <tr key={p.lineId} className="border-b border-line last:border-0 hover:bg-subtle">
                        <td className="py-2 font-medium">{p.period}</td>
                        <td className="py-2 text-muted">{p.company}</td>
                        <td className="py-2 text-right tabular-nums">
                          {p.workingDays - p.lopDays}/{p.workingDays}
                        </td>
                        <td className="py-2 text-right tabular-nums">₹{inr(p.gross)}</td>
                        <td className="py-2 text-right tabular-nums text-red-500">
                          −₹{inr(p.totalDeductions)}
                        </td>
                        <td className="py-2 text-right font-semibold tabular-nums">
                          ₹{inr(p.netPay)}
                        </td>
                        <td className="py-2 text-right">
                          <button
                            onClick={() => void download(p.lineId)}
                            className="text-xs text-brand-600 hover:underline"
                          >
                            PDF
                          </button>
                          <button
                            onClick={() => void print(p.lineId)}
                            className="ml-2 text-xs text-brand-600 hover:underline"
                          >
                            {tc('print')}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Card>
          </>
        )}
      </div>
    </main>
  );
}
