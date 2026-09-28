# Deploy Swag-Money on Vercel

One Vercel project serves the Next.js site and the API. `/v1/...` is a Next.js route that calls the same Hono app the local API uses. You do not create a second project.

After this, the owner still has to connect the GitHub repo, add Neon, paste four secrets, and point DNS. The repo cannot do those clicks.

## 1. Import the repository

1. Sign in at [vercel.com/new](https://vercel.com/new).
2. Choose **Import Git Repository** and pick this GitHub repo.
3. Framework Preset: **Next.js**. Vercel reads `packages/web/vercel.json` for the commands below. If the form shows different commands, replace them with these.
4. **Root Directory**: `packages/web`. Click **Edit**, set it, and turn **on** “Include source files outside of the Root Directory in the Build Step”. The install step has to see the pnpm workspace at the repo root.
5. Node.js version: **22.x** (also pinned by `packages/web/.node-version`).
6. **Install Command**:

   ```bash
   cd ../.. && corepack enable && corepack prepare pnpm@10.33.3 --activate && pnpm install --frozen-lockfile
   ```

7. **Build Command**:

   ```bash
   cd ../.. && corepack enable && corepack prepare pnpm@10.33.3 --activate && pnpm db:migrate && pnpm --filter @swag-money/web build
   ```

8. **Output Directory**: leave the default. Next.js writes `packages/web/.next`.
9. Do not set `SWAG_API_URL`.

Do not deploy yet. The build runs migrations and fails until `DATABASE_URL` exists.

## 2. Add Postgres (Neon)

1. In the new project, open the **Storage** tab, or **Integrations → Browse Marketplace**.
2. Choose **Neon** (Postgres) and accept the install. Create a database when asked.
3. Neon adds `DATABASE_URL`. Use the **pooled** URL. The host contains `-pooler` (Neon) or the port is `6543` (Supabase transaction pooler). A direct URL works for a single long-lived server and will exhaust connections on Vercel.
4. Open **Project → Settings → Environment Variables** and confirm `DATABASE_URL` is enabled for **Production**, **Preview**, and **Build**. The build command runs `pnpm db:migrate`. If Build is unchecked, the deploy fails with `DATABASE_URL is required to migrate`.
5. Supabase is the same variable: paste the transaction-pooler URI into `DATABASE_URL` for Production, Preview, and Build. Do not also run the local PGlite files in production.

`pnpm db:migrate` applies `packages/api/src/migration-sql.ts`. The SQL is idempotent (`IF NOT EXISTS`). The first request on a cold isolate runs it again. There is no separate migration host.

## 3. Environment variables

Generate the two secrets on your machine, from a checkout of this repo:

```bash
pnpm install
pnpm keys
```

The command prints `SWAG_SIGNING_PRIVATE_KEY` and `SWAG_SESSION_SECRET` to the terminal. It does not write a file. Paste each value into Vercel. Do not commit them. Do not put them in GitHub Actions.

In **Settings → Environment Variables**, add these for Production, Preview, and Build:

| Name | Value |
| --- | --- |
| `DATABASE_URL` | Pooled Neon or Supabase URL, from the integration |
| `SWAG_SIGNING_PRIVATE_KEY` | Line printed by `pnpm keys` |
| `SWAG_SESSION_SECRET` | Line printed by `pnpm keys` |
| `SWAG_DEVELOPER_SHARE_BPS` | `5000` (50%). Any integer from 0 to 10000 |
| `SWAG_PUBLIC_SITE_URL` | `https://swagmoney.ai` after the domain is attached. Until then, `https://<project>.vercel.app` |

Leave these unset. The site stays on mock payouts, and live payment keys are refused:

`STRIPE_SECRET_KEY`, `STRIPE_CONNECT_CLIENT_ID`, `SOLANA_RPC_URL`, `SOLANA_PAYOUT_SECRET_KEY`, `LIGHTNING_NODE_URL`, `LIGHTNING_MACAROON`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `RAZORPAYX_KEY_ID`, `RAZORPAYX_KEY_SECRET`

Also leave unset: `SWAG_API_URL`, `SWAG_ALLOW_DEMO`, `SWAG_DATA_DIR`, `SWAG_ENV`. Vercel sets `VERCEL` itself. That flag turns off demo seeding (Ada, Lin, Northwind) even if `SWAG_ALLOW_DEMO=1`.

If a required variable is missing, the first API request returns HTTP 500 and names the variables. The message points back at this file.

## 4. Deploy and check health

1. **Deployments → Redeploy** (or push a commit). The build log should contain `Migrations applied.`
2. Open `https://<project>.vercel.app/v1/health`. A ready database looks like:

   ```json
   { "ok": true, "service": "swag-money", "database": "up" }
   ```

   `/api/health` returns the same JSON. `database: "down"` is HTTP 503.
3. Open `/`. The ledger strip shows **0** verified impressions, **$0.00** earned, **$0.00** paid out, and **0** developers. Those zeros come from the empty ledger. The page does not invent a number if the API is down; it says the ledger is unreachable.
4. Open `/compare`. Submit the contact form once. The row is stored in Postgres. No email is sent.

Local demo data is only `pnpm dev` (or an explicit seed on a machine that is not Vercel and does not have `SWAG_ENV=production`).

## 5. Point swagmoney.ai at the deployment

Do this after `/v1/health` is ok on the `*.vercel.app` URL.

1. Vercel → **Project → Settings → Domains**.
2. Add `swagmoney.ai`. Add `www.swagmoney.ai` as well.
3. At the registrar, set the records Vercel shows. They are:

   | Host | Type | Value |
   | --- | --- | --- |
   | `@` (apex) | A | `76.76.21.21` |
   | `www` | CNAME | `cname.vercel-dns.com` |

   If the registrar supports ALIAS or ANAME, the apex can be `cname.vercel-dns.com` instead of the A record. Use one of those, not both, unless Vercel lists both as required.
4. Wait until Vercel marks the domain valid and provisions TLS.
5. Set `SWAG_PUBLIC_SITE_URL` to `https://swagmoney.ai` and redeploy so metadata uses that origin.

## Local production check

Against a Postgres you run yourself:

```bash
export DATABASE_URL=postgres://...
export SWAG_ENV=production
export SWAG_DEVELOPER_SHARE_BPS=5000
export SWAG_PUBLIC_SITE_URL=http://127.0.0.1:3000
eval "$(pnpm keys | sed 's/^/export /')"
unset SWAG_API_URL
pnpm db:migrate
pnpm --filter @swag-money/web build
pnpm --filter @swag-money/web start
```

Then request `/v1/health`, `/`, and `/compare`. `pnpm dev` is the separate local path: it keeps PGlite, demo users, and `SWAG_API_URL`.
