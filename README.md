# Swag-Money

Swag-Money (swagmoney.ai) is a developer-tool ad marketplace. While Claude Code, Cursor, or a chat assistant is thinking, the spinner line becomes one sponsored sentence. Advertisers bid for that wait in an English auction. The developer whose machine rendered the line earns half, after a render challenge says the line was actually on screen.

It is aimed at the same inventory as Kickbacks.ai, with four constraints that product treats as architecture rather than copy:

1. The client only accepts a signed, string-only payload. It does not download or execute remote code, and it does not weaken Content Security Policy.
2. An impression is payable only after a server-issued nonce is answered with a device signature over read-backs from the render surface, and only after five seconds of server time.
3. One client core, several adapters. Claude Code works end to end. VS Code (and therefore Cursor and Windsurf), the browser, and JetBrains share that core; JetBrains is an explicit stub.
4. Payouts go through one interface: Stripe Connect, Solana, Lightning, or AI API credits with a 10% bonus.

## Architecture

```text
packages/shared        auction, configurable share, block quotes, tool catalog
packages/crypto        Ed25519 payloads, display-string rules, render transcripts
packages/api           Hono API, auction, ledger, checkout, API keys, payouts
packages/client-core   verify, render, sample, sign, restore
packages/integrations  official config writers (tips, hooks, status lines)
packages/installer     `swag-money detect|apply`
packages/adapters
  claude-code          working CLI. spinnerVerbs, plus tips and statusLine via the installer
  vscode               status bar for VS Code, Cursor, Windsurf, Cline, and Kiro
  browser              MV3 content script for the web assistants and app builders
  jetbrains            scaffold. StatusBarWidgetFactory, runtime still fails closed
packages/web           Next.js site, dashboards, install pages, advertiser checkout
```

The database is Postgres, embedded with PGlite so `pnpm dev` does not need a server. The schema is ordinary Postgres SQL. This MVP opens PGlite at `data/pg` (or `$SWAG_DATA_DIR/pg`). The signing key and session secret are files next to that directory, not inside it, and all of `data/` is gitignored. Pointing the process at an external database is a driver swap in `packages/api/src/db.ts`.

```text
adapter  --signed request-->  API auction
adapter  <-- { payload, signature } --   (no code, no signing key)
adapter  verifies signature against the pinned Ed25519 key
adapter  writes the string, reads it back at 0s / 2.5s / 5s
adapter  --device signature over that transcript-->  API
API      checks samples, device key, and its own clock, then splits the price
```

## Zero-trust client

A served ad is exactly this object. `v` is the number `1`. Every other field is a string:

```json
{
  "advertiser": "Northwind",
  "expiresAt": "2026-09-27T21:00:00.000Z",
  "impressionId": "…uuid…",
  "nonce": "…32 hex chars…",
  "surface": "claude-code",
  "text": "Northwind CI: ephemeral environments for every PR",
  "v": 1
}
```

`packages/crypto` rejects unknown keys, non-strings, newlines, and any byte outside printable ASCII. That blocks ANSI escapes and HTML in the terminal and in the browser. The signature is Ed25519 over a canonical JSON form of those fields.

The client pins the server public key. The ad response does not carry a key the client will trust. `swag-claude once` requires `--pin`. The local `demo` command prints that it is trusting the key of the API it just started (TOFU for a local process only).

The Claude Code adapter writes `spinnerVerbs` as `{ "mode": "replace", "verbs": ["<the verified string>"] }` in the settings file you pass. Before the write it stores the original file bytes in `settings.json.swag-backup.json`. Restore and the end of every impression put those bytes back. If the adapter created the file, restore deletes it. A second ad is refused while a backup is still present, so a crash cannot clobber the original.

The VS Code extension only assigns `StatusBarItem.text`. The browser extension only assigns `textContent`, and its manifest keeps the extension-page CSP at `script-src 'self'; object-src 'self'`. Neither adapter injects a script from the network.

## Render challenges

Each impression gets a fresh nonce at auction time. The payable proof is an Ed25519 signature from the **device** key (registered at install, private key stays on the machine) over:

```text
swag-money/render-proof/v1
<impressionId>
<nonce>
<surface>
<text>
<offsetMs> <readBack>
…
```

The client core is the only signer. It writes the string, then reads the surface back at the start, the midpoint, and five seconds. If any read-back differs, it does not sign.

The server accepts the proof only when all of these hold:

- The impression is still `served` (a second success is `409 replay` and does not credit the ledger again).
- There are at least three samples, offsets strictly increase, the first is at the write, and the span is at least five seconds.
- Every read-back equals the served text.
- The device signature verifies against the install's registered public key.
- Server time since the nonce was issued is at least five seconds and inside the two-minute TTL.

A replayed HTTP request fails the single-use impression. A script that posts a forged body without the device key fails the signature. A script that has the device key but submits immediately fails the server clock, even if it invents sample timestamps of 0, 2500, and 5000. Budget reserved at serve time is released on expiry.

### Honest limits

This is not a TPM quote, a screenshot oracle, or remote attestation. The read-back is whatever the adapter on that machine returns. A person who patches the open-source client and possesses the device private key can sign a transcript for text that never appeared. Swag-Money stops the fraud that currently drains this kind of inventory: unsigned curls, replays, sub-five-second views, and payloads that are not the signed string. It does not stop a modified client.

Rate limiting (60 signed requests per install per minute) is a backstop, not a proof.

## Auction, split, payouts

Proxy English auction, one impression at a time:

- Campaigns declare a max bid in cents and the surfaces they want.
- The winner is the highest max bid that can afford the clearing price. Earlier campaigns win ties.
- Clearing price is the 2¢ reserve when there is no rival, otherwise `min(winner max, second max + 1¢)`.
- A high bidder who cannot afford that price is skipped and does not set the price for everyone else.
- The price is reserved when the ad is served and spent only when the challenge verifies. Failed and expired challenges release the reserve.

The developer share is one parameter, `SWAG_DEVELOPER_SHARE_BPS`, default `5000` (50%). The developer gets `floor(price * bps / 10000)`. The platform keeps the remainder, so a 51¢ impression at 50% pays 25¢ and 26¢. At 70% (`7000`) the same impression pays 35¢ and 16¢. Payouts require a verified balance of at least $10 and are on demand. There is no two-week batch.

Campaigns can restrict placement (`terminal`, `editor`, `browser`) and up to 20 country codes. An empty country list matches everyone. A listed country matches only a request that sends that code. The client does not look up IP.

Advertisers can prepay blocks of 1,000 impression credits (minimum $0.50 per block) through `POST /v1/checkout`. Country targeting adds $0.75 per block to the mock invoice, not to the auction bid. Checkout in this build is a mock card charge.

API credits convert the withdrawn cents at 110% (`amount + floor(amount / 10)`). $10 of earnings becomes $11 of credit. The bonus is credit value, not extra withdrawable cash.

Stripe Connect, Solana, Lightning, and UPI (RazorpayX) implement the same `settlePayout` interface:

| Credentials | Mode | What happens |
| --- | --- | --- |
| Unset | mock | A local receipt id. No network call. |
| Stripe `sk_test_…`, Solana/Lightning endpoints, or RazorpayX `rzp_test_…` | sandbox | Receipt describes the transfer. Still no network call. |
| Stripe `sk_live_…` or RazorpayX `rzp_live_…` | refused | This build will not use a live secret. |

UPI destinations are VPAs such as `ada@okaxis`. That rail exists so a developer in a country Stripe Connect does not pay is not stuck.

No provider key is shipped in the repo. Leave the variables empty.

## Local setup

Requires Node 22+ and pnpm 10.

```bash
pnpm install
pnpm test
pnpm dev
```

`pnpm dev` starts the API on `http://127.0.0.1:8787` and the site on `http://127.0.0.1:3000`. The first boot writes a signing key and a session secret under `data/` (gitignored) and seeds demo books:

| Who | Email | What you see |
| --- | --- | --- |
| Ada Okafor | ada@dev.swagmoney.test | 48 verified impressions, $12.00 balance, two rejected proofs |
| Lin Zhao | lin@ads.swagmoney.test | Northwind (max 80¢) and Helio (max 50¢) clearing at 51¢, plus a paused campaign |

On the landing page, use **I'm a developer** or **I'm an advertiser**. Those are local demo sessions. The same accounts also log in at `/login` with the local fixture password `swag-demo`. Sign-up at `/signup` creates a scrypt-hashed password. Neither is a production identity system.

Detect installed tools and write official config:

```bash
pnpm swag-money
pnpm swag-money apply
```

`pnpm swag-money` is the in-repo form of `npx swag-money`. This repository does not publish the package.

Public pages: `/` (ledger strip from `GET /v1/public/stats`, a short Kickbacks comparison, and the buy form), `/compare`, `/integrations`, `/install` and `/install/[tool]`, `/advertise` (mock block checkout), `/surface-pricing`, `/api-docs`, `/faq`, `/login`, `/signup`, `/terms`, `/privacy`, `/privacy-choices`, `/contact`, `/security`. Comparison claims are dated September 2026 and link to public sources. Beta and scaffold tools stay labeled. Form posts are stored locally; card checkout, magic-link mail, and Google sign-in are not live.

Claude Code, end to end, against that API:

```bash
pnpm demo
```

That command registers a throwaway device key, pins the local server key, writes a temporary `spinnerVerbs` file, holds the signed line for five seconds, submits the render proof, checks the developer share, and deletes the temp file after the original bytes are restored. It does not touch `~/.claude/settings.json`.

To point it at a real settings file, register a device and pass the pin yourself:

```bash
pnpm --filter @swag-money/claude-code install --email ada@dev.swagmoney.test --out ./swag-device.json
pnpm --filter @swag-money/claude-code once \
  --device ./swag-device.json \
  --settings ~/.claude/settings.json \
  --pin '<base64url public key from the developer dashboard>'
pnpm --filter @swag-money/claude-code restore --settings ~/.claude/settings.json
```

`swag-device.json` contains a private key. It is gitignored. Do not commit it.

Copy `.env.example` to `.env` only if you want to override ports or provider modes. Empty secrets mean "generate locally" or "stay in mock mode".

## Integration status

Statuses are honest about what ran in this environment.

| Tool | Status | Mechanism |
| --- | --- | --- |
| Claude Code CLI | working | `spinnerVerbs` impression loop is demonstrated. Installer also writes `spinnerTipsOverride` with label `Sponsored` and a `statusLine` script. The Claude binary was not required for the verb path. |
| Claude Code in VS Code | beta | Same settings file, per Anthropic’s docs. The extension was not installed here. We do not patch it or its CSP. |
| Codex CLI | beta | Hooks for turn start/stop. The hook script does not read stdin. No custom spinner API. |
| Gemini CLI, Qwen Code | beta | `ui.customWittyPhrases`. Config merge is unit-tested. Binaries were not run. |
| Copilot CLI | beta | Experimental `statusLine` command. |
| Antigravity CLI | beta | `statusLine` script reads stdin only for `agent_state`, then discards the object. |
| VS Code, Cursor, Windsurf, Cline, Kiro | beta | Status-bar extension (`swagMoney.surface`) plus hook JSON writers. The extension typechecks. It was not loaded in an editor here. |
| ChatGPT, Claude.ai, Gemini, Grok, Perplexity, DeepSeek, Mistral Le Chat, v0, Bolt, Lovable, Replit | beta | MV3 content script. Host selectors are unit-tested against a fake DOM. Live sites were not driven. |
| OpenCode, Kilo, Goose | scaffold | Plugin or status-hook source is written. The host does not load it. |
| JetBrains | scaffold | `plugin.xml` registers `StatusBarWidgetFactory`. The Kotlin widget throws. Not compiled against the IntelliJ SDK. |

`pnpm --filter @swag-money/vscode build` emits `dist/extension.js`. `pnpm --filter @swag-money/browser build` emits the content script. Load the browser folder unpacked. It sets `textContent` only and does not change page CSP.

Advertiser API keys (`sm_test_…`) authorize `POST /v1/checkout`, `GET /v1/advertiser/v1/campaigns`, and `GET /v1/advertiser/v1/stats`. Missing and unknown keys get 401. The destination URL is stored for the advertiser and is absent from the signed ad payload.

## Tests

```bash
pnpm test
pnpm build
```

Coverage is the logic the product claims, not a screenshot of the UI:

- Sign, verify, tamper, extra fields, non-strings, escape bytes.
- Render transcripts: five-second span, mismatched read-back, device signature.
- The client refuses to write a string whose signature does not match the pinned key.
- English auction: second price, reserve, ties, targeting, bidders who cannot afford the price.
- 50/50 split including the odd cent, a 70% basis-point override, the $10 gate, and the 10% credit bonus.
- Country and placement targeting, block quotes, UPI destination checks, signup, checkout, and API-key auth.
- HTTP: a full render against the API pays once; an immediate scripted verify does not; a replay does not; a signed mismatched read-back releases budget.

## What is real and what is mocked

Real in this repo: Ed25519 sign and verify, the string-only parser, the Claude Code settings backup and restore, the English auction, placement and country filters, reservation and the configurable ledger split, the five-second server clock, device-signed render transcripts, the $10 on-demand threshold, the 10% credit math, scrypt passwords, and API-key hashes.

Mocked or sandbox-only: Stripe transfers, Solana broadcasts, Lightning payments, RazorpayX UPI payouts, card checkout, and the actual grant of Anthropic or OpenAI credit. There is no hardware proof of what was on the screen. The homepage counter is the ledger query, not a baked-in total.
