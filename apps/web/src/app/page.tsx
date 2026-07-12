import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { HealthResponse } from '@bookly/shared';
import { LanguageSwitcher } from '@/components/language-switcher';
import { AnimatedHero } from '@/components/landing/animated-hero';
import { Workflow } from '@/components/landing/workflow';
import { FeatureCards } from '@/components/landing/feature-cards';
import { Testimonials } from '@/components/landing/testimonials';
import { LogoMarquee } from '@/components/landing/marquee';
import { Integrations, Pricing, Faq, CtaBand } from '@/components/landing/more-sections';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

async function getHealth(): Promise<HealthResponse | null> {
  try {
    const res = await fetch(`${API_URL}/api/v1/health`, { cache: 'no-store' });
    if (!res.ok) return null;
    return (await res.json()) as HealthResponse;
  } catch {
    return null;
  }
}

function Logo({ dark = false }: { dark?: boolean }) {
  return (
    <span className="flex items-center gap-2.5">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/rgs-logo.jpeg" alt="RGS ERP" className="h-9 w-9 rounded-xl bg-white object-contain shadow-lg shadow-black/10" />
      <span className={`text-xl font-bold tracking-tight ${dark ? 'text-white' : 'text-ink'}`}>
        RGS ERP
      </span>
    </span>
  );
}

const FEATURES = [
  {
    // Voice-based voucher entry
    key: 'voice',
    icon: (
      <path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3zM19 10v2a7 7 0 01-14 0v-2M12 19v4M8 23h8" />
    ),
  },
  {
    // AI accounting assistant
    key: 'aiAssistant',
    icon: (
      <path d="M12 3l1.8 4.2L18 9l-4.2 1.8L12 15l-1.8-4.2L6 9l4.2-1.8L12 3zM18 14l.9 2.1L21 17l-2.1.9L18 20l-.9-2.1L15 17l2.1-.9L18 14z" />
    ),
  },
  {
    // GST filing support
    key: 'gstFiling',
    icon: <path d="M7 3h7l5 5v13H7V3zM14 3v5h5M10 13h6M10 17h6" />,
  },
  {
    // WhatsApp invoices
    key: 'whatsapp',
    icon: (
      <path d="M21 11.5a8.5 8.5 0 01-12.6 7.4L3 21l2.1-5.4A8.5 8.5 0 1121 11.5zM9 9c0 4 2 6 6 6" />
    ),
  },
  {
    // Inventory management
    key: 'inventory',
    icon: (
      <path d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3zM12 12l8-4.5M12 12v9M12 12L4 7.5" />
    ),
  },
  {
    // Payroll automation
    key: 'payroll',
    icon: (
      <path d="M12 1v22M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" />
    ),
  },
  {
    // Multi-company support
    key: 'multiCompany',
    icon: (
      <path d="M3 21h18M5 21V7l7-4v18M19 21V11l-7-4M9 9h.01M9 13h.01M9 17h.01M15 13h.01M15 17h.01" />
    ),
  },
  {
    // Cloud + local server deployment
    key: 'deployment',
    icon: (
      <path d="M7 18a4 4 0 01-.5-7.97A6 6 0 0118 9a4.5 4.5 0 011 8.9M9 21h6M12 13v8" />
    ),
  },
] as const;

// [value, label key] — values are numeric/acronym and locale-independent
const STATS: [string, string][] = [
  ['< 2s', 'pdf'],
  ['7', 'roles'],
  ['100%', 'integrity'],
  ['1', 'deploy'],
];

const PREVIEW_MENU = ['overview', 'salesInvoices', 'purchases', 'stock', 'reports'] as const;

// [label key, value, tone class]
const PREVIEW_CARDS: [string, string, string][] = [
  ['sales', '₹4,82,330', 'text-emerald-600'],
  ['purchases', '₹2,86,700', 'text-ink'],
  ['cashBank', '₹3,75,118', 'text-ink'],
  ['receivables', '₹1,42,430', 'text-ink'],
];

const WHY_POINTS = ['everywhere', 'correct', 'noLockIn'] as const;

// [step number, key]
const STEPS: [string, string][] = [
  ['01', 'create'],
  ['02', 'bill'],
  ['03', 'returns'],
];

export default async function Home() {
  const health = await getHealth();
  return <Landing health={health} />;
}

function Landing({ health }: { health: HealthResponse | null }) {
  const t = useTranslations('landing');

  return (
    <div className="flex min-h-screen flex-col bg-[#121212]" style={{ fontFamily: 'var(--font-dm-sans), sans-serif' }}>
      {/* ================= Hero (animated · dark · premium) ================= */}
      <AnimatedHero />

      {/* legacy hero kept disabled (superseded by AnimatedHero) */}
      {false && (
      <div className="relative overflow-hidden bg-gradient-to-b from-brand-50 via-white to-white">
        {/* soft lavender glow accents */}
        <div className="pointer-events-none absolute -top-40 left-1/2 h-[480px] w-[800px] -translate-x-1/2 rounded-full bg-brand-200/40 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 right-0 h-72 w-72 rounded-full bg-brand-200/40 blur-3xl" />

        <header className="relative z-10">
          <div className="mx-auto flex h-20 w-full max-w-7xl items-center justify-between px-6">
            <Logo />
            <nav className="hidden items-center gap-8 text-sm font-medium text-muted md:flex">
              <a href="#features" className="transition-colors hover:text-brand-700">
                {t('nav.features')}
              </a>
              <a href="#why" className="transition-colors hover:text-brand-700">
                {t('nav.why')}
              </a>
              <a href={`${API_URL}/api/docs`} className="transition-colors hover:text-brand-700">
                {t('nav.developers')}
              </a>
            </nav>
            <div className="flex items-center gap-3">
              <LanguageSwitcher />
              <Link
                href="/login"
                className="rounded-full px-4 py-2 text-sm font-medium text-ink transition-colors hover:bg-subtle"
              >
                {t('nav.signIn')}
              </Link>
              <Link
                href="/register"
                className="rounded-full bg-brand-600 px-5 py-2 text-sm font-semibold text-white shadow-sm shadow-brand-600/30 transition-colors hover:bg-brand-700"
              >
                {t('nav.startFree')}
              </Link>
            </div>
          </div>
        </header>

        <section className="relative z-10 mx-auto w-full max-w-7xl px-6 pb-24 pt-16 text-center lg:pt-24">
          <p className="mx-auto mb-6 inline-flex items-center gap-2 rounded-full border border-brand-100 bg-brand-50 px-4 py-1.5 text-xs font-semibold text-brand-700">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-brand-500" />
            {t('hero.badge')}
          </p>
          <h1 className="mx-auto max-w-4xl text-5xl font-extrabold leading-[1.1] tracking-tight text-brand-900 sm:text-6xl">
            {t('hero.titleStart')}{' '}
            <span className="bg-gradient-to-r from-brand-600 via-brand-500 to-brand-600 bg-clip-text text-transparent">
              {t('hero.titleHighlight')}
            </span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-muted">
            {t('hero.subtitle')}
          </p>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
            <Link
              href="/register"
              className="rounded-full bg-brand-600 px-8 py-3.5 text-sm font-semibold text-white shadow-xl shadow-brand-600/30 transition-all hover:bg-brand-700 hover:shadow-brand-600/40"
            >
              {t('hero.ctaPrimary')}
            </Link>
            <Link
              href="/login"
              className="rounded-full border border-line bg-surface px-8 py-3.5 text-sm font-semibold text-ink transition-colors hover:border-brand-200 hover:bg-brand-50"
            >
              {t('hero.ctaSignIn')}
            </Link>
          </div>

          {/* Product preview */}
          <div className="relative mx-auto mt-16 max-w-5xl">
            <div className="rounded-3xl border border-line bg-surface p-2 shadow-2xl shadow-brand-200/50">
              <div className="rounded-2xl bg-subtle p-1">
                <div className="flex items-center gap-1.5 px-3 py-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-red-400" />
                  <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
                  <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
                  <span className="ml-3 rounded-md bg-surface px-3 py-0.5 text-[10px] text-faint">
                    bookly.app/company/overview
                  </span>
                </div>
                <div className="flex gap-2 rounded-xl bg-surface p-3 text-left">
                  {/* mini sidebar (light, matches the app shell) */}
                  <div className="hidden w-36 shrink-0 rounded-xl border border-line bg-subtle p-3 sm:block">
                    <div className="mb-3 flex items-center gap-1.5">
                      <span className="flex h-5 w-5 items-center justify-center rounded-md bg-gradient-to-br from-brand-500 to-brand-600 text-[10px] font-black text-white">
                        B
                      </span>
                      <span className="text-[10px] font-bold text-brand-900">RGS</span>
                    </div>
                    {PREVIEW_MENU.map((key, i) => (
                      <div
                        key={key}
                        className={`mb-1 rounded-md px-2 py-1.5 text-[9px] font-medium ${
                          i === 0 ? 'bg-brand-600 text-white' : 'text-muted'
                        }`}
                      >
                        {t(`preview.menu.${key}`)}
                      </div>
                    ))}
                  </div>
                  {/* mini dashboard */}
                  <div className="flex-1 space-y-2">
                    <div className="grid grid-cols-4 gap-2">
                      {PREVIEW_CARDS.map(([key, v, tone]) => (
                        <div key={key} className="rounded-xl border border-line bg-subtle/80 p-2.5">
                          <p className="text-[8px] font-medium uppercase tracking-wide text-faint">
                            {t(`preview.cards.${key}`)}
                          </p>
                          <p className={`mt-0.5 text-sm font-bold tabular-nums ${tone}`}>{v}</p>
                        </div>
                      ))}
                    </div>
                    <div className="flex h-32 items-end gap-2 rounded-xl border border-line p-3">
                      {[35, 55, 42, 70, 62, 88].map((h, i) => (
                        <div key={i} className="flex flex-1 items-end gap-1">
                          <div
                            className="flex-1 rounded-t bg-brand-600"
                            style={{ height: `${h}%` }}
                          />
                          <div
                            className="flex-1 rounded-t bg-brand-200"
                            style={{ height: `${h * 0.6}%` }}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Stats strip */}
        <div className="relative z-10 border-t border-line/70">
          <div className="mx-auto grid w-full max-w-7xl grid-cols-2 gap-6 px-6 py-10 text-center md:grid-cols-4">
            {STATS.map(([value, key]) => (
              <div key={key}>
                <p className="text-3xl font-extrabold text-brand-900">{value}</p>
                <p className="mt-1 text-xs font-medium uppercase tracking-wide text-muted">
                  {t(`stats.${key}`)}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
      )}

      {/* ================= Social proof + Workflow + Features ================= */}
      <LogoMarquee />
      <Workflow />
      <FeatureCards />
      <Integrations />
      <Pricing />

      {/* ================= Why ================= */}
      <section id="why" className="border-t border-[#2a2a2a] bg-[#161616] py-24" style={{ fontFamily: 'var(--font-dm-sans), sans-serif' }}>
        <div className="mx-auto grid w-full max-w-7xl items-center gap-14 px-6 lg:grid-cols-2">
          <div>
            <p className="mb-3 text-sm font-semibold uppercase tracking-wider text-[#FF7A00]">
              {t('why.kicker')}
            </p>
            <h2 className="text-4xl font-extrabold tracking-tight text-white">
              {t('why.title')}
            </h2>
            <p className="mt-4 leading-relaxed text-[#9CA3AF]">{t('why.body')}</p>
            <ul className="mt-8 space-y-4">
              {WHY_POINTS.map((key) => (
                <li key={key} className="flex gap-3">
                  <span className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-100">
                    <svg className="h-3 w-3 text-emerald-600" viewBox="0 0 20 20" fill="currentColor">
                      <path
                        fillRule="evenodd"
                        d="M16.704 5.29a1 1 0 010 1.415l-7.5 7.5a1 1 0 01-1.415 0l-3.5-3.5a1 1 0 111.415-1.415l2.792 2.793 6.793-6.793a1 1 0 011.415 0z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </span>
                  <div>
                    <p className="font-semibold text-white">{t(`why.points.${key}.title`)}</p>
                    <p className="text-sm text-[#9CA3AF]">{t(`why.points.${key}.body`)}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-3xl bg-brand-900 p-10 shadow-2xl shadow-brand-900/20">
            <h3 className="text-2xl font-bold text-white">{t('why.stepsTitle')}</h3>
            <div className="mt-8 space-y-6">
              {STEPS.map(([n, key]) => (
                <div key={n} className="flex gap-4">
                  <span className="font-mono text-sm font-bold text-brand-300">{n}</span>
                  <div>
                    <p className="font-semibold text-white">{t(`why.steps.${key}.title`)}</p>
                    <p className="mt-0.5 text-sm text-brand-200/80">{t(`why.steps.${key}.body`)}</p>
                  </div>
                </div>
              ))}
            </div>
            <Link
              href="/register"
              className="mt-10 block rounded-full bg-surface py-3.5 text-center text-sm font-semibold text-brand-700 shadow-lg transition-colors hover:bg-brand-50"
            >
              {t('why.cta')}
            </Link>
          </div>
        </div>
      </section>

      {/* ================= Testimonials + FAQ + CTA ================= */}
      <Testimonials />
      <Faq />
      <CtaBand />

      {/* ================= Footer ================= */}
      <footer className="mt-auto border-t border-[#2a2a2a] bg-[#161616] py-12">
        <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-6 px-6">
          <div>
            <Logo dark />
            <p className="mt-2 text-xs text-brand-200/80">{t('footer.tagline')}</p>
          </div>
          <div className="flex items-center gap-8 text-xs text-faint">
            <a href="#features" className="hover:text-white">
              {t('footer.features')}
            </a>
            <a href={`${API_URL}/api/docs`} className="hover:text-white">
              {t('footer.apiDocs')}
            </a>
            <span className="flex items-center gap-1.5">
              <span
                className={`inline-block h-2 w-2 rounded-full ${
                  health?.status === 'ok' ? 'bg-emerald-400' : 'bg-red-400'
                }`}
              />
              {health?.status === 'ok' ? t('footer.statusOk') : t('footer.statusDown')}
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
