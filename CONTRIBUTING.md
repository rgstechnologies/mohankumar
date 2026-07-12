# How we work on this codebase

This app keeps a real business's books. A bug here is not a broken page — it is
a wrong tax figure on a filed return, or a customer's balance that doesn't tie
out. The rules below exist for that reason, not for ceremony.

Read this once before your first pull request.

---

## The five rules

1. **Never push to `main`.** Not even a one-line fix. `main` is protected and
   always deployable. Work on a branch, open a pull request.
2. **All money maths goes through `apps/api/src/invoices/gst-calculator.ts`.**
   Do not compute a tax, a rounding, or a total anywhere else. If you think you
   need to, you have found a bug in the calculator — fix it there, with a test.
3. **Never touch the CGST/SGST/IGST split** unless the task is explicitly about
   it, and then only with a test that proves the new numbers.
4. **Every database query stays company-scoped.** Every `where` clause includes
   `companyId`. This is the wall between tenants; a query without it is a data
   leak, even today when there is only one company.
5. **Secrets never enter git.** They live in `.env`, which is gitignored.
   `.env.example` holds the *names* with blank values. CI scans every diff for
   secrets and will fail the build.

---

## What this build is — and isn't

One business, one login, a deliberately small feature set:

Estimates · GST invoices · Purchase bills · Customers & vendors · Items · Stock ·
Estimate Banking + Invoice Banking (the two payment screens) · Credit/debit notes ·
Vouchers & ledgers · Reports (GSTR-1, GSTR-3B, trial balance, P&L, balance sheet) ·
Profile.

**Deliberately absent.** These were removed on purpose. Do not add them back
because a page looks like it's missing something:

payroll · POS · e-invoice (IRN) · e-way bill · auditor marketplace ·
plans/billing/subscriptions · print designer · loyalty · expenses module ·
data import · bank reconciliation · sales orders · delivery challans ·
proforma invoices · purchase orders · branches · public sign-up ·
public invoice-share links.

If a client asks for one of these, it is a scope conversation, not a quick PR.

---

## Branching

Trunk-based. Short-lived branches, merged quickly. No long-running `develop`
branch — that is where merge disasters come from.

```
main ──●───────●───────●──        ← protected, always deployable
        \     / \     /
         ●───●   ●───●            ← feat/… fix/… branches, hours-to-days old
```

Branch names: `feat/estimate-pdf-logo`, `fix/gstr1-hsn-total`,
`chore/bump-prisma`. Lowercase, hyphens, one topic.

```bash
git checkout main && git pull
git checkout -b fix/gstr1-hsn-total
# … work …
git commit -m "fix(reports): HSN summary was double-counting credit notes"
git push -u origin fix/gstr1-hsn-total
gh pr create
```

## Commits

`type(scope): what changed and why`, in the imperative.

Types: `feat`, `fix`, `chore`, `docs`, `refactor`, `test`.

A good message says what a reviewer can't see from the diff:

```
fix(stock): sales returns were leaving stock instead of re-entering it

The credit-note quantity was subtracted rather than added, so every return
pushed on-hand further negative. Adds a regression test.
```

## Pull requests

- One topic per PR. If you can't describe it in one sentence, split it.
- Fill in the template. The "how did you check this" box is not optional.
- **CI must be green** and **one approval** is required. Both are enforced —
  you cannot merge around them.
- Squash-merge. `main` keeps one commit per change, and stays readable.

## Before you open a PR

```bash
npm run verify        # lint + typecheck + build + tests. Run it. It's ~3 min.
```

If `npm run verify` is green, CI will be green.

---

## Working on the money code

The test suite (`apps/api/test/api.e2e-spec.ts`) walks a full business flow and
asserts exact rupee figures at every step: a ₹2,000 intra-state sale must produce
CGST ₹50 + SGST ₹50, a ₹20,000 purchase must produce ₹1,800 + ₹1,800 input
credit, and the trial balance must balance.

**If those tests fail, you have changed what the business owes the government.**
Do not "fix" the test to match your code. Work out which one is wrong.

## The financial year

Documents are scoped to the year chosen at login. The books underneath are one
continuous ledger — there is no year-end close, and stock and customer dues carry
across the boundary on their own.

Two things follow, and both are easy to get wrong:

- A document's year comes from **its date**, not from the session. Posting a
  document dated outside the open year is refused (`assertActiveYear`).
- Stock and outstanding balances are **never** filtered by year. An unpaid bill
  from last year is still owed today.

## Adding a user-facing string

Every string lives in `apps/web/messages/{en,ta,hi}.json`. All three must have
the same keys — a missing key is a crash at runtime, not a fallback. Add to all
three, or the build is lying to you.

---

## Getting set up

```bash
cp .env.example .env      # then change SEED_PASSWORD
npm install
npm run infra:up          # Postgres + Redis + Mailpit in Docker
npm run db:migrate
npm run db:seed           # creates the business + its single login
npm run dev               # API on :4000, web on :3000
```

Local Postgres is on **5433**, not 5432 — check `.env` if a connection fails.

## When you're stuck

Ask before guessing, especially on anything touching tax, rounding, or balances.
A question costs ten minutes. A wrong GST return costs the client a penalty and
us the account.
