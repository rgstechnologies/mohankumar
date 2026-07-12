# Bookly — Production Deployment & Go-Live Checklist

One server (any VPS/cloud VM/on-prem box) with Docker is enough. Everything —
Postgres, Redis, API, web app, nginx, nightly backups — runs from
`docker-compose.prod.yml`.

## 1. Server prerequisites

- Linux with Docker Engine + Compose v2 (`docker compose version`)
- 2 vCPU / 4 GB RAM minimum; 20 GB+ disk
- Ports 80 and 443 open; nothing else exposed
- A domain name pointed (A record) at the server — required for HTTPS

## 2. Configure `.env`

```bash
git clone <your-repo> bookly && cd bookly
cp .env.example .env
```

Then edit `.env`. The non-negotiables:

| Variable | Production value |
|---|---|
| `NODE_ENV` | `production` |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` | two different values from `openssl rand -hex 32` |
| `POSTGRES_PASSWORD` | `openssl rand -hex 16` |
| `WEB_ORIGIN` | `https://yourdomain.com` |
| `NEXT_PUBLIC_API_URL` | `https://yourdomain.com/api/v1` |
| `SUPER_ADMIN_EMAIL` | your staff account's email (flagged on boot once registered) |
| `SMTP_*` | a real SMTP provider (SES/Brevo/Zoho — Mailpit is dev-only) |
| `AI_PROVIDER` + `GEMINI_API_KEY` | a **paid-tier** key for production (free tier rate limits + trains on data) |
| `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` | **live**-mode keys from the Razorpay dashboard |
| `RAZORPAY_WEBHOOK_SECRET` | the secret you set on the webhook (step 5) |

Never commit `.env`. Keep a copy of it with your backups.

## 3. First start

```bash
docker compose -f docker-compose.prod.yml up -d --build
curl -s http://localhost/api/v1/health   # {"status":"ok","db":"up","redis":"up",...}
```

Database migrations run automatically on every API start (`prisma migrate deploy`).

## 4. HTTPS

Follow `docker/nginx-ssl.conf.example` (certbot + cert mount + nginx.conf swap).
Verify `https://yourdomain.com` loads and plain HTTP redirects.

## 5. Razorpay webhook

Razorpay dashboard → Settings → Webhooks → Add:

- URL: `https://yourdomain.com/api/v1/billing/webhook`
- Active events: `payment.captured`
- Secret: generate one, put the same value in `.env` as `RAZORPAY_WEBHOOK_SECRET`,
  then `docker compose -f docker-compose.prod.yml up -d api` to reload.

Do a ₹1 test purchase end-to-end before announcing.

## 6. Super admin

Register the `SUPER_ADMIN_EMAIL` account in the app, then restart the API once
(`docker compose -f docker-compose.prod.yml restart api`) — the boot hook
flags it. Confirm `/admin` opens.

## 7. Backups — verify before you trust them

The `backup` sidecar dumps nightly to `./backups/` (gzip, 14-day retention —
tune with `BACKUP_INTERVAL_HOURS` / `BACKUP_RETENTION_DAYS` in `.env`).

- Check one exists: `ls -lh backups/`
- **Copy off the server** (cron this): `rsync -a backups/ user@other-host:bookly-backups/`
  or `rclone sync backups/ remote:bookly-backups`
- **Do one restore drill now**, not during an emergency:
  `./scripts/pg-restore.sh backups/bookly-<latest>.sql.gz`

## 8. Built-in protections (already on)

- Rate limiting: 300 req/min/IP global; login & register 10/min, forgot-password 5/min
- httpOnly cookies, Secure in production, SameSite=Lax; helmet headers; CORS pinned to `WEB_ORIGIN`
- Postgres/Redis not exposed outside the Docker network; Swagger disabled in production
- Webhook + payment signatures verified server-side

## 9. Updating to a new version

```bash
git pull
docker compose -f docker-compose.prod.yml up -d --build   # migrations run on boot
curl -s https://yourdomain.com/api/v1/health
```

Take a manual backup first for big releases — restarting the sidecar dumps immediately:
`docker compose -f docker-compose.prod.yml restart backup && sleep 10 && ls -lt backups/ | head -3`

## 10. Monitoring (minimum viable)

- Point a free uptime monitor (UptimeRobot/BetterStack) at `https://yourdomain.com/api/v1/health`
- Logs: `docker compose -f docker-compose.prod.yml logs -f --tail=100 api`
- Disk: backups + Postgres grow; alert at 80% full

## Go-live checklist (print me)

- [ ] `.env` secrets regenerated, `NODE_ENV=production`
- [ ] HTTPS live, HTTP redirects
- [ ] `/api/v1/health` returns ok via the domain
- [ ] SMTP works (trigger a password-reset email to yourself)
- [ ] Razorpay LIVE keys + webhook configured; ₹1 test purchase activates a plan
- [ ] Super admin account registered and `/admin` reachable
- [ ] A backup file exists in `backups/` and a restore drill succeeded
- [ ] Off-server backup copy scheduled (cron rsync/rclone)
- [ ] Uptime monitor watching `/health`
- [ ] Demo/test accounts removed from the production database
