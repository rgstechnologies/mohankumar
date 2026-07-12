# ERP — Mohan Kumar

A GST accounting ERP for a single business. Built from the RGS Technology ERP
platform, stripped to the modules this client bought.

> **New here? Read [CONTRIBUTING.md](./CONTRIBUTING.md) before your first pull
> request.** This app keeps a real business's books — a bug is a wrong tax
> figure, not a broken page.

## What it does

- **Estimates** → convert to a GST invoice in one click.
- **GST invoices** — CGST/SGST/IGST with round-off, PDF, payment tracking.
- **Purchase bills** — vendor bills with input tax credit; brings stock in.
- **Estimate Banking / Invoice Banking** — two payment screens. Money is settled
  against estimates, or against GST invoices. Each customer is tracked by one or
  the other, never both.
- **Customers & vendors** — with a document-based statement: every bill, every
  payment in and out, and what is still pending.
- **Items & stock** — stock on hand derived from the documents (opening +
  purchased − sold + returns), with valuation and low-stock flags.
- **Credit/debit notes** — sales and purchase returns, which GSTR-1 requires.
- **Vouchers & ledgers** — full double-entry, so rent, wages, electricity and
  bank charges can be recorded too.
- **Reports** — GSTR-1 (+ portal JSON), GSTR-3B, trial balance, P&L, balance sheet.
- **English / தமிழ் / हिन्दी.**

## Two things worth understanding

**Financial year at login.** You pick the year when you sign in. It decides which
year's documents you see and how new ones are numbered. The books underneath are
one continuous ledger: there is no year-end close, no opening-balance import, and
stock and customer dues carry across 1 April on their own. Next year appears in
the picker by itself. A document dated outside the year you're working in is
refused rather than posted somewhere you'd never find it.

**One business, one login.** There is no sign-up page and no create-company
screen. The business and its login exist because an operator ran `npm run db:seed`.
That is deliberate — an open sign-up route on a single-client install is just a
way in for strangers.

## Stack

- **API** — NestJS 11 + TypeScript + Prisma 6 (PostgreSQL) + Redis
- **Web** — Next.js 15 (App Router) + React 19 + Tailwind 4
- **Infra** — Docker Compose; runs the same on a laptop or any cloud VM

```
apps/api          REST API — double-entry accounting, GST, auth
apps/web          Next.js web app
packages/shared   Types shared by both
```

## Getting started

```bash
cp .env.example .env      # then change SEED_PASSWORD
npm install
npm run infra:up          # Postgres + Redis + Mailpit in Docker
npm run db:migrate
npm run db:seed           # creates the business + its single login
npm run dev               # API :4000, web :3000
```

- Web: http://localhost:3000
- API docs (Swagger): http://localhost:4000/api/docs
- Mailpit (catches dev email): http://localhost:8025

> Local Postgres runs on port **5433**, not 5432.

## Commands

| Command | What it does |
|---|---|
| `npm run verify` | lint + typecheck + build + tests — **run before every PR** |
| `npm run dev` | API + web, watch mode |
| `npm run db:migrate` | Create/apply a migration after a schema change |
| `npm run db:seed` | Create the business and its login |
| `npm run db:studio` | Browse the database |
| `npm test -w apps/api` | The test suite (unit + e2e) |

## Deployment

Not yet wired — the hosting target hasn't been chosen. `docker-compose.prod.yml`
runs the whole stack (api, web, nginx, postgres, redis, nightly backups) on any
Docker host; the CD workflow gets added once the host is decided.

The API applies migrations on boot (`prisma migrate deploy` runs before the
server starts), so schema changes ship with the code.
