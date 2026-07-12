'use client';

import Link from 'next/link';
import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { BorderBeam } from './border-beam';
import { submitLead } from '@/lib/leads';

const FONT = { fontFamily: 'var(--font-dm-sans), sans-serif' } as const;

/* ============================ Integrations beam ============================ */
const LEFT = ['GST Portal', 'Razorpay', 'Bank feeds'];
const RIGHT = ['WhatsApp', 'Tally import', 'E-invoice IRP'];

function Node({ label }: { label: string }) {
  return (
    <div className="rounded-xl border border-[#2a2a2a] bg-[#1E1E1E] px-4 py-2.5 text-center text-xs font-semibold text-white/90 shadow-lg">
      {label}
    </div>
  );
}

export function Integrations() {
  // y positions (%) for the three rows on each side
  const ys = [26, 50, 74];
  return (
    <section className="relative overflow-hidden bg-[#121212] py-24" style={FONT}>
      <div className="mx-auto w-full max-w-7xl px-6">
        <div className="mb-14 text-center">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#FF7A00]">Works with your stack</p>
          <h2 className="mt-3 text-3xl font-bold tracking-tight text-white sm:text-4xl">Connected to everything you use</h2>
        </div>

        <div className="relative mx-auto h-[300px] max-w-3xl">
          {/* animated beams */}
          <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden>
            {ys.map((y, i) => (
              <g key={`l${i}`}>
                <line x1="18" y1={y} x2="50" y2="50" stroke="#2a2a2a" strokeWidth="0.4" />
                <motion.line
                  x1="18" y1={y} x2="50" y2="50" stroke="#FF7A00" strokeWidth="0.5"
                  strokeDasharray="4 8"
                  animate={{ strokeDashoffset: [0, -24] }}
                  transition={{ duration: 1.6, repeat: Infinity, ease: 'linear', delay: i * 0.2 }}
                />
              </g>
            ))}
            {ys.map((y, i) => (
              <g key={`r${i}`}>
                <line x1="82" y1={y} x2="50" y2="50" stroke="#2a2a2a" strokeWidth="0.4" />
                <motion.line
                  x1="82" y1={y} x2="50" y2="50" stroke="#FF7A00" strokeWidth="0.5"
                  strokeDasharray="4 8"
                  animate={{ strokeDashoffset: [0, -24] }}
                  transition={{ duration: 1.6, repeat: Infinity, ease: 'linear', delay: 0.3 + i * 0.2 }}
                />
              </g>
            ))}
          </svg>

          {/* center hub */}
          <motion.div
            animate={{ boxShadow: ['0 0 30px rgba(255,122,0,0.3)', '0 0 50px rgba(255,122,0,0.55)', '0 0 30px rgba(255,122,0,0.3)'] }}
            transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
            className="absolute left-1/2 top-1/2 flex h-20 w-20 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-2xl bg-gradient-to-br from-[#FF7A00] to-[#c2410c] text-lg font-black text-white"
          >
            RGS
          </motion.div>

          {/* side nodes */}
          {LEFT.map((l, i) => (
            <div key={l} className="absolute -translate-y-1/2" style={{ left: '2%', top: `${ys[i]}%` }}>
              <Node label={l} />
            </div>
          ))}
          {RIGHT.map((l, i) => (
            <div key={l} className="absolute -translate-y-1/2" style={{ right: '2%', top: `${ys[i]}%` }}>
              <Node label={l} />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ================================ Pricing ================================ */
type PlanCard = {
  name: string;
  price: string;
  per: string;
  cta: string;
  popular: boolean;
  feats: string[];
  /** 'link' navigates to href; 'sales' opens the Contact-sales enquiry modal. */
  action: 'link' | 'sales';
  href?: string;
};

const PLANS: PlanCard[] = [
  { name: 'Free Trial', price: '₹0', per: 'for 3 months', cta: 'Start free', popular: false,
    action: 'link', href: '/register',
    feats: ['1 company', 'GST invoicing & books', 'Inventory & POS', 'Up to 3 users'] },
  { name: 'Business', price: '₹599', per: '/ month', cta: 'Choose Business', popular: true,
    action: 'link', href: '/register?plan=business',
    feats: ['Everything in Free', 'Multi-branch', 'Payroll & e-invoicing', 'Priority support'] },
  { name: 'Enterprise', price: "Let's talk", per: 'custom', cta: 'Contact sales', popular: false,
    action: 'sales',
    feats: ['Unlimited companies', 'Open API access', 'Dedicated success manager', 'Onboarding & training'] },
];

export function Pricing() {
  const [salesOpen, setSalesOpen] = useState(false);
  return (
    <section id="pricing" className="relative bg-[#121212] py-24" style={FONT}>
      <div className="mx-auto w-full max-w-7xl px-6">
        <div className="mb-14 text-center">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#FF7A00]">Simple pricing</p>
          <h2 className="mt-3 text-3xl font-bold tracking-tight text-white sm:text-4xl">Start free. Scale when ready.</h2>
        </div>
        <div className="grid gap-6 md:grid-cols-3">
          {PLANS.map((p, i) => {
            const card = (
              <motion.div
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: i * 0.08 }}
                whileHover={{ y: -6 }}
                className={`flex h-full flex-col rounded-2xl border p-7 ${p.popular ? 'border-transparent bg-[#1E1E1E]' : 'border-[#2a2a2a] bg-[#161616]'}`}
              >
                {p.popular && (
                  <span className="mb-3 inline-flex w-max rounded-full bg-[#FF7A00]/15 px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-[#FF7A00]">
                    Most popular
                  </span>
                )}
                <h3 className="text-lg font-bold text-white">{p.name}</h3>
                <div className="mt-3 flex items-end gap-1">
                  <span className="text-3xl font-extrabold text-white">{p.price}</span>
                  <span className="mb-1 text-xs text-[#9CA3AF]">{p.per}</span>
                </div>
                <ul className="mt-6 flex-1 space-y-3">
                  {p.feats.map((f) => (
                    <li key={f} className="flex items-center gap-2 text-sm text-white/80">
                      <span className="flex h-4 w-4 items-center justify-center rounded-full bg-[#FF7A00]/20 text-[#FF7A00]">
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
                      </span>
                      {f}
                    </li>
                  ))}
                </ul>
                {p.action === 'sales' ? (
                  <button
                    type="button"
                    onClick={() => setSalesOpen(true)}
                    className={`mt-7 rounded-full py-3 text-center text-sm font-semibold transition-colors ${p.popular ? 'bg-[#FF7A00] text-white hover:bg-[#EA580C]' : 'border border-[#2a2a2a] text-white hover:border-[#FF7A00]/40'}`}
                  >
                    {p.cta}
                  </button>
                ) : (
                  <Link
                    href={p.href ?? '/register'}
                    className={`mt-7 rounded-full py-3 text-center text-sm font-semibold transition-colors ${p.popular ? 'bg-[#FF7A00] text-white hover:bg-[#EA580C]' : 'border border-[#2a2a2a] text-white hover:border-[#FF7A00]/40'}`}
                  >
                    {p.cta}
                  </Link>
                )}
              </motion.div>
            );
            return p.popular ? (
              <BorderBeam key={p.name} duration={6}>{card}</BorderBeam>
            ) : (
              <div key={p.name}>{card}</div>
            );
          })}
        </div>
      </div>
      <AnimatePresence>
        {salesOpen && <ContactSalesModal onClose={() => setSalesOpen(false)} />}
      </AnimatePresence>
    </section>
  );
}

/* ============================ Contact sales modal ============================ */
function ContactSalesModal({ onClose }: { onClose: () => void }) {
  const [form, setForm] = useState({
    name: '',
    companyName: '',
    email: '',
    phone: '',
    requirements: '',
  });
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await submitLead({ ...form, plan: 'ENTERPRISE' });
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
      setBusy(false);
    }
  }

  const field =
    'w-full rounded-lg border border-[#2a2a2a] bg-[#161616] px-3.5 py-2.5 text-sm text-white placeholder-[#6b7280] outline-none focus:border-[#FF7A00]/60';

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      style={FONT}
    >
      <motion.div
        initial={{ opacity: 0, y: 24, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 24, scale: 0.98 }}
        transition={{ duration: 0.25 }}
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-md rounded-2xl border border-[#2a2a2a] bg-[#121212] p-7 shadow-2xl"
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-4 top-4 text-xl leading-none text-[#9CA3AF] hover:text-white"
        >
          ×
        </button>
        {done ? (
          <div className="py-6 text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-[#FF7A00]/15 text-[#FF7A00]">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
            </div>
            <h3 className="text-lg font-bold text-white">Thanks — we&apos;ll be in touch</h3>
            <p className="mt-2 text-sm text-[#9CA3AF]">
              Our team has received your enquiry and will reach out shortly to set up your Enterprise plan.
            </p>
            <button
              type="button"
              onClick={onClose}
              className="mt-6 rounded-full bg-[#FF7A00] px-6 py-2.5 text-sm font-semibold text-white hover:bg-[#EA580C]"
            >
              Done
            </button>
          </div>
        ) : (
          <>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#FF7A00]">Enterprise</p>
            <h3 className="mt-2 text-xl font-bold text-white">Talk to sales</h3>
            <p className="mt-1 text-sm text-[#9CA3AF]">
              Tell us about your business and what you need — we&apos;ll get back to you with a custom plan.
            </p>
            <form onSubmit={onSubmit} className="mt-5 space-y-3">
              <input className={field} placeholder="Your name" value={form.name} onChange={set('name')} required maxLength={120} />
              <input className={field} placeholder="Company name" value={form.companyName} onChange={set('companyName')} required maxLength={160} />
              <input className={field} type="email" placeholder="Work email" value={form.email} onChange={set('email')} required />
              <input className={field} type="tel" placeholder="Phone" value={form.phone} onChange={set('phone')} required />
              <textarea className={field} rows={3} placeholder="What do you need? (branches, users, integrations…)" value={form.requirements} onChange={set('requirements')} maxLength={2000} />
              {error && <p className="text-sm text-red-400">{error}</p>}
              <button
                type="submit"
                disabled={busy}
                className="w-full rounded-full bg-[#FF7A00] py-3 text-sm font-semibold text-white transition-colors hover:bg-[#EA580C] disabled:opacity-60"
              >
                {busy ? 'Sending…' : 'Submit enquiry'}
              </button>
            </form>
          </>
        )}
      </motion.div>
    </motion.div>
  );
}

/* ================================== FAQ ================================== */
const FAQS = [
  { q: 'Is my financial data safe?', a: 'Yes. Your books are encrypted, access is role-based, and vouchers are immutable — cancelled, never deleted, with a full audit trail. You can also self-host with your own database.' },
  { q: 'Can I import my data from Tally?', a: 'Yes — import masters and balances from Tally so you can switch without re-keying everything. Your CA keeps working the way they expect.' },
  { q: 'Does it handle GST and e-invoicing?', a: 'Fully. GST is computed per line, GSTR-1/3B are export-ready, and e-invoice + e-way bills are generated in a couple of clicks.' },
  { q: 'Can my team and branches use it together?', a: 'Yes. Add unlimited users with role-based access, run multiple branches, and everyone works off the same live books.' },
  { q: 'What happens after the free trial?', a: 'Nothing breaks — you keep read access to your data and can upgrade any time. No lock-in: your data is always exportable.' },
];

export function Faq() {
  const [open, setOpen] = useState(0);
  return (
    <section id="faq" className="relative bg-[#121212] py-24" style={FONT}>
      <div className="mx-auto w-full max-w-3xl px-6">
        <div className="mb-12 text-center">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#FF7A00]">Questions</p>
          <h2 className="mt-3 text-3xl font-bold tracking-tight text-white sm:text-4xl">Frequently asked</h2>
        </div>
        <div className="space-y-3">
          {FAQS.map((f, i) => {
            const isOpen = i === open;
            return (
              <div key={f.q} className="overflow-hidden rounded-xl border border-[#2a2a2a] bg-[#161616]">
                <button
                  onClick={() => setOpen(isOpen ? -1 : i)}
                  className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left"
                >
                  <span className="text-sm font-semibold text-white">{f.q}</span>
                  <motion.span animate={{ rotate: isOpen ? 45 : 0 }} className="shrink-0 text-xl leading-none text-[#FF7A00]">
                    +
                  </motion.span>
                </button>
                <AnimatePresence initial={false}>
                  {isOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.3 }}
                    >
                      <p className="px-5 pb-5 text-sm leading-relaxed text-[#9CA3AF]">{f.a}</p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/* ================================ CTA band ================================ */
export function CtaBand() {
  return (
    <section className="relative overflow-hidden bg-[#121212] py-20" style={FONT}>
      <div className="mx-auto w-full max-w-6xl px-6">
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#FF7A00] via-[#EA580C] to-[#c2410c] px-8 py-16 text-center sm:px-16">
          <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-white/15 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-20 -left-10 h-56 w-56 rounded-full bg-black/15 blur-3xl" />
          <motion.h2
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="relative text-3xl font-extrabold tracking-tight text-white sm:text-4xl"
          >
            Ready to run your business on RGS ERP?
          </motion.h2>
          <p className="relative mx-auto mt-3 max-w-xl text-white/85">
            Start free for 3 months. No card required. Your books, billing and GST — sorted.
          </p>
          <div className="relative mt-8 flex flex-wrap items-center justify-center gap-4">
            <Link href="/register">
              <motion.span whileHover={{ y: -3 }} whileTap={{ scale: 0.97 }} className="inline-flex rounded-full bg-white px-8 py-3.5 text-sm font-bold text-[#c2410c] shadow-xl">
                Start free trial
              </motion.span>
            </Link>
            <Link href="/login">
              <motion.span whileHover={{ y: -3 }} whileTap={{ scale: 0.97 }} className="inline-flex rounded-full border border-white/40 px-8 py-3.5 text-sm font-semibold text-white">
                Sign in
              </motion.span>
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
