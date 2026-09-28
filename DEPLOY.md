# Deploy Swag-Money on Cloudflare Workers

One Worker serves the Next.js site and the API. `/v1/...` is a route inside that Worker. There is no second service and no Vercel project.

The Worker name is `swag-money`.

After this, you still connect the Cloudflare account, paste secrets, run migrations against Neon, and point `swagmoney.ai` at Cloudflare. The repo cannot do those clicks.

Local `pnpm dev` is unchanged: embedded Postgres, demo users, port 3000. `pnpm preview` is the production build, running in workerd against `DATABASE_URL`.

## 1. Cloudflare account and API token

1. Sign in at [dash.cloudflare.com](https://dash.cloudflare.com).
2. Open **Workers & Pages**. If this account has never used Workers, accept the Workers free or paid plan. See the size and CPU notes at the bottom before you pick.
3. Copy the **Account ID** from the Workers overview (right side). That value is `CLOUDFLARE_ACCOUNT_ID`.
4. Open **My Profile → API Tokens → Create Token → Create Custom Token**.
5. Permissions:
   - Account / **Workers Scripts** / Edit
   - Account / **Account Settings** / Read
   - Zone / **Workers Routes** / Edit
   - Zone / **DNS** / Edit
   - Zone / **Zone** / Read
6. Account resources: your account. Zone resources: **All zones** (the `swagmoney.ai` zone does not exist yet).
7. Create the token and copy it once. That value is `CLOUDFLARE_API_TOKEN`.

For GitHub Actions, add repository secrets `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, and `DATABASE_URL` (the Neon URL). If the two Cloudflare secrets are missing, the deploy workflow skips and stays green. If they are set and `DATABASE_URL` is missing, the workflow stops before deploy and says so.

## 2. Create the Worker

From a checkout, with the token in the environment if you deploy from a laptop:

```bash
pnpm install
cd packages/web
npx wrangler login
```

`npx wrangler deploy` after a build creates the Worker named `swag-money` if it does not exist. You can also create an empty Worker in the dashboard with that name first. The first successful deploy prints `https://swag-money.<your-subdomain>.workers.dev`.

Do not deploy until the secrets and the migration below are done. A deploy without them comes up, then `/v1/health` returns `database: "down"` or the API returns the missing variable names.

## 3. Secrets and plain variables

Generate a keypair on your machine. This prints three lines and does not write a file:

```bash
pnpm -s keys
```

Put these in the Worker. From `packages/web`, each `secret put` prompts for the value (paste, then Enter):

```bash
npx wrangler secret put DATABASE_URL
npx wrangler secret put SWAG_SIGNING_PRIVATE_KEY
npx wrangler secret put SWAG_SESSION_SECRET
```

`DATABASE_URL` is the Neon connection string Neon shows as **direct** (host does not contain `-pooler`). The Worker driver speaks WebSocket and opens one connection per request. The pooled Neon URL is for long-lived TCP clients and will be warned about.

Plain variables are already in `packages/web/wrangler.jsonc` and ride along with deploy:

| Name | Value |
| --- | --- |
| `SWAG_ENV` | `production` |
| `SWAG_DEVELOPER_SHARE_BPS` | `5000` (50%). Any integer from 0 to 10000 |
| `SWAG_PUBLIC_SITE_URL` | `https://swagmoney.ai` |

Add the public key in the dashboard so it is not committed. **Workers & Pages → swag-money → Settings → Variables and Secrets → Add variable** (not a secret):

| Name | Value |
| --- | --- |
| `SWAG_SIGNING_PUBLIC_KEY` | The public line from `pnpm -s keys` |

It must be the public key for that private seed. A mismatch refuses to boot.

Deploys use `wrangler deploy --keep-vars` so a later deploy does not delete dashboard variables.

Leave payment variables unset. Payouts stay mocked. `STRIPE_SECRET_KEY` starting with `sk_live_` and `RAZORPAYX_KEY_ID` starting with `rzp_live_` are refused.

Optional Hyperdrive: create a Hyperdrive config pointed at the same Neon database, then add a binding named `HYPERDRIVE` to `wrangler.jsonc` with that id. When the binding is present, the Worker uses `HYPERDRIVE.connectionString` instead of `DATABASE_URL`. For local preview of that binding, set `localConnectionString` or `CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE`. Hyperdrive is not required.

There is no cron trigger. Nothing in this app sweeps payouts or rolls up stats on a timer. Those totals are computed from the ledger when a page asks for them.

## 4. Migrations

Migrations run in Node, against `DATABASE_URL`. They do not run when the Worker starts.

```bash
export DATABASE_URL='postgres://...neon host.../neondb'
pnpm db:migrate
```

The SQL is idempotent (`IF NOT EXISTS`). Run it again after a schema change, before or as part of deploy. GitHub Actions does this when the Cloudflare secrets and `DATABASE_URL` are set.

## 5. First deploy

```bash
pnpm --filter @swag-money/web exec opennextjs-cloudflare build
cd packages/web
npx wrangler deploy --keep-vars
```

Or, with the API token and account id exported, `pnpm deploy` from the repo root (migrate, then build, then deploy).

Check:

1. `https://swag-money.<subdomain>.workers.dev/v1/health` returns `{"ok":true,"service":"swag-money","database":"up"}`. `/api/health` is the same JSON.
2. `/` shows **0** verified impressions and **$0.00**. An empty ledger is honest zeros. If the API is down the strip says the ledger is unreachable and does not invent a number.
3. `/compare` loads. The contact form stores a row. No email is sent.
4. Sign-up creates an account. Ada, Lin, and Northwind are not in the database. The homepage links to **Create an account**, not the demo sessions.

## 6. swagmoney.ai

Do this after health is ok on `*.workers.dev`.

1. Cloudflare dashboard → **Add a domain** → `swagmoney.ai`. On the free plan this is a full zone.
2. Cloudflare shows two nameservers. At the registrar, replace the existing nameservers with those two. Wait until the zone is **Active**.
3. **Workers & Pages → swag-money → Settings → Domains & Routes → Add → Custom Domain**. Enter `swagmoney.ai`. Cloudflare creates the DNS record and the certificate. You do not add an A record yourself for the apex.
4. `www` is a different hostname. Add a proxied DNS record so Cloudflare can redirect it:
   - Type **A**, name `www`, IPv4 `192.0.2.0`, proxy **on** (orange cloud).
   - **Rules → Redirect Rules → Create rule**. Match hostname `www.swagmoney.ai`. Then **Dynamic** redirect to `concat("https://swagmoney.ai", http.request.uri.path)` with status 301. Preserve the query string.
5. Set `SWAG_PUBLIC_SITE_URL` to `https://swagmoney.ai` if it is not already, and redeploy with `--keep-vars`.

## 7. Local preview

`pnpm preview` migrates, builds the Worker, and serves it at `http://127.0.0.1:8788`.

1. Copy `.dev.vars.example` to `packages/web/.dev.vars`.
2. Set `DATABASE_URL` to a local Postgres URL.
3. Paste `SWAG_SIGNING_PRIVATE_KEY`, `SWAG_SIGNING_PUBLIC_KEY`, and `SWAG_SESSION_SECRET` from `pnpm -s keys`.
4. `pnpm preview`.

`SWAG_ENV=production` comes from `wrangler.jsonc`, so the preview does not seed demo users.

## 8. Rollback

Dashboard: **Workers & Pages → swag-money → Deployments →** the previous deployment **→ Rollback**.

CLI, from `packages/web`:

```bash
npx wrangler rollback
```

Rollback does not undo a migration. The SQL only adds tables and columns.

## 9. GitHub Actions or Workers Builds

`.github/workflows/ci.yml` runs install, typecheck, lint, and tests on pull requests and on pushes to `main`.

`.github/workflows/deploy.yml` runs on pushes to `main`. It migrates, builds with OpenNext, then `cloudflare/wrangler-action` deploys. It skips when `CLOUDFLARE_API_TOKEN` or `CLOUDFLARE_ACCOUNT_ID` is unset.

Workers Builds is the dashboard alternative. **Workers & Pages → swag-money → Settings → Builds → Connect** this GitHub repo.

- Root directory: the repository root
- Build command: `pnpm install --frozen-lockfile && pnpm db:migrate && pnpm --filter @swag-money/web exec opennextjs-cloudflare build`
- Deploy command: `pnpm --filter @swag-money/web exec wrangler deploy --keep-vars`

Put `DATABASE_URL` in the build environment so migrate can run. Runtime secrets stay the Worker secrets from step 3. Use one of the two deploy paths, not both, or every push deploys twice.

## Limits

Measure the bundle from `packages/web` after a build:

```bash
npx wrangler deploy --dry-run --outdir /tmp/swag-worker-bundle --keep-vars
```

Wrangler prints `Total Upload` (uncompressed, the current limit) and `gzip`. As of 4 September 2026 Cloudflare dropped the old 3 MB free / 10 MB paid compressed caps. The limit is now **64 MiB uncompressed** on every plan. The gzip figure is still worth reading.

CPU time is separate. The free plan allows **10 ms of CPU per request**. Waiting on Neon does not count. Workers Paid allows 30 seconds by default (up to 5 minutes). Password checks use Node `scrypt`, which is slower than 10 ms, and a Next.js render is heavier than a tiny Worker. Plan on **Workers Paid** for sign-in and for server-rendered pages. Static files under the assets binding do not spend that CPU budget.

What would shrink the Worker: drop unused Next routes, or move the API to a second smaller Worker. This repo keeps one Worker on purpose.
