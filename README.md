# RGS Technology ERP

RGS Technology ERP — an AI-powered, GST-ready accounting & ERP platform for Indian
SMEs (built for Tiruppur textile manufacturers) — a modern alternative to
TallyPrime / Vyapar / Zoho Books.

> Branding note: the customer-facing product is **RGS Technology ERP** (shown as
> "RGS" in-app). Internal npm package scope (`@bookly/*`) and the database name are
> unchanged from earlier names (Bookly / Nexora) — renaming those is deliberately
> out of scope.

## What it does

- **Double-entry accounting** — ledgers, vouchers, trial balance, P&L, balance sheet
  (balanced, integer-paise checked).
- **GST compliance** — tax invoices with CGST/SGST/IGST + round-off, **e-invoice (IRN)**
  and **e-way bills** via a real GSP (Sandbox.co.in). E-invoice and e-way bill both
  authenticate **per taxpayer (per-GSTIN)** using each customer's own NIC credentials.
- **Full sales & purchase lifecycle** — 8 document types (invoice, estimate, proforma,
  sales order, delivery challan, purchase bill, purchase estimate, purchase order),
  payments + payment-linking, credit/debit notes.
- **Payroll** — salary, ESI, PF, LOP, bank-advice + salary-register CSV exports.
- **Inventory / parties** — stock, batches, customers/vendors, per-party outstanding.
- **No-code print designer** — drag-and-drop PDF/template editor for every document type.
- **Auditor marketplace** — CAs list services; owners hire and grant revocable, read-only
  access to their books.
- **Multi-tenant** — companies × branches × team roles; licensing/plans/trials with
  fail-closed feature gating.
- **Localised** — English, Tamil, Hindi (enforced translation parity).

## Stack

- **API** — NestJS 11 + TypeScript + Prisma 6 (PostgreSQL) + Redis (ioredis)
- **Web** — Next.js 15 (App Router) + React 19 + Tailwind CSS 4
- **Infra** — Docker Compose; deploys identically to a laptop, local server, or any cloud VM

## Repository layout

```
apps/api          NestJS REST API (multi-tenant, double-entry accounting)
apps/web          Next.js web app
packages/shared   Types/constants shared between api and web
docker/           Dockerfiles + nginx config for production
```

## Development setup

Prerequisites: Node.js ≥ 20, Docker + Docker Compose.

```bash
cp .env.example .env       # defaults work for local dev
npm install
npm run infra:up           # Postgres + Redis + Mailpit in Docker
npm run db:migrate         # apply database migrations
npm run dev                # API on :4000, web on :3000
```

- Web app: http://localhost:3000
- API: http://localhost:4000/api/v1
- API docs (Swagger): http://localhost:4000/api/docs
- Mailpit (catches all dev email): http://localhost:8025

> Note: local Postgres runs on port **5433** (see `.env`), not the default 5432.

## Production deployment

Deployment is automated via GitHub Actions:

1. Push to `main` → **CI** workflow builds all workspaces and runs the test suite
   (unit + e2e) on a GitHub-hosted runner.
2. On CI success → **Deploy** workflow runs on the self-hosted runner on the EC2
   host: `docker compose -f docker-compose.prod.yml up -d --build`, then health-checks
   `https://localhost/api/v1/health`.

The API container applies database migrations automatically on startup
(`prisma migrate deploy` runs before the server boots), so schema changes ship safely
with the code. Secrets live in `~/bookly-secrets/.env` on the host (never in git);
TLS certs come from the host's `/etc/letsencrypt`.

To stand it up manually on any Docker host:

```bash
cp .env.example .env       # set strong secrets! (openssl rand -hex 32)
docker compose -f docker-compose.prod.yml up -d --build
```

Nightly `pg_dump` backups land in `./backups` on the host (retention configurable via
`BACKUP_RETENTION_DAYS`). To use a managed Postgres/Redis instead of the bundled
containers, point `DATABASE_URL` / `REDIS_URL` at them and remove those services from
the compose file — no code changes needed.

### E-invoice / e-way bill configuration

- Set `SANDBOX_API_KEY` / `SANDBOX_API_SECRET` (the GSP account) in the server `.env`.
  In **production**, if these are absent the app refuses to issue e-invoices rather than
  returning a simulated IRN; without them dev/test transparently use a local simulator.
- Each customer enters their own NIC e-invoice + e-way bill API username/password under
  **Settings → E-Invoice Portal** / **E-Way Bill Portal** (stored encrypted at rest).

## Useful commands

| Command | What it does |
|---|---|
| `npm run infra:up` / `infra:down` | Start/stop dev infrastructure |
| `npm run infra:reset` | Wipe dev database and start fresh |
| `npm run db:migrate` | Create/apply a migration after schema changes |
| `npm run db:studio` | Prisma Studio — browse the database |
| `npm run build` | Build all workspaces |
| `npm test -w apps/api` | Run the API test suite (unit + e2e) |
