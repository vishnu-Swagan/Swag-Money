import { serve } from '@hono/node-server'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { bytesToB64Url, fingerprint } from '@swag-money/crypto'
import { DEFAULT_DEVELOPER_SHARE_BPS, IMPRESSION_TTL_MS, MIN_VIEW_MS, PAYOUT_MIN_CENTS } from '@swag-money/shared'
import { createApp } from './app.ts'
import { isHosted } from './config.ts'
import { openDatabase } from './db.ts'
import { loadSessionSecret, loadSigningKey } from './keys.ts'
import { DEMO_ADVERTISER, DEMO_DEVELOPER, DEMO_PASSWORD, ensureDemoPasswords, seedIfEmpty } from './seed.ts'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
loadDotEnv(path.join(repoRoot, '.env'))

if (isHosted()) {
  throw new Error(
    'packages/api/src/main.ts is the local PGlite server. Production serves /v1 from the Next.js app. See DEPLOY.md.',
  )
}

const dataDir = path.resolve(process.env.SWAG_DATA_DIR ?? path.join(repoRoot, 'data'))
const port = Number(process.env.SWAG_API_PORT ?? 8787)
const signing = loadSigningKey(dataDir, process.env.SWAG_SIGNING_PRIVATE_KEY)
const sessionSecret = loadSessionSecret(dataDir, process.env.SWAG_SESSION_SECRET)
// PGlite owns this directory. Signing keys stay in the parent so initdb does not see them.
const database = await openDatabase(path.join(dataDir, 'pg'))
const clock = { now: () => Date.now() }
await seedIfEmpty(database.db, clock.now())
await ensureDemoPasswords(database.db)

const app = createApp({
  db: database.db,
  clock,
  signingPrivateKey: signing.privateKey,
  signingPublicKey: signing.publicKey,
  env: {
    allowDemo: process.env.SWAG_ALLOW_DEMO !== '0',
    minViewMs: intEnv('SWAG_MIN_VIEW_MS', MIN_VIEW_MS),
    payoutMinCents: intEnv('SWAG_PAYOUT_MIN_CENTS', PAYOUT_MIN_CENTS),
    impressionTtlMs: intEnv('SWAG_IMPRESSION_TTL_MS', IMPRESSION_TTL_MS),
    developerShareBps: intEnv('SWAG_DEVELOPER_SHARE_BPS', DEFAULT_DEVELOPER_SHARE_BPS),
    sessionSecret,
    stripeSecretKey: emptyToUndefined(process.env.STRIPE_SECRET_KEY),
    solanaRpcUrl: emptyToUndefined(process.env.SOLANA_RPC_URL),
    solanaPayoutSecret: emptyToUndefined(process.env.SOLANA_PAYOUT_SECRET_KEY),
    lightningNodeUrl: emptyToUndefined(process.env.LIGHTNING_NODE_URL),
    lightningMacaroon: emptyToUndefined(process.env.LIGHTNING_MACAROON),
    openaiApiKey: emptyToUndefined(process.env.OPENAI_API_KEY),
    anthropicApiKey: emptyToUndefined(process.env.ANTHROPIC_API_KEY),
    razorpayxKeyId: emptyToUndefined(process.env.RAZORPAYX_KEY_ID),
    razorpayxKeySecret: emptyToUndefined(process.env.RAZORPAYX_KEY_SECRET),
  },
})

serve({ fetch: app.fetch, port }, () => {
  console.log(`Swag-Money API listening on http://127.0.0.1:${port}`)
  console.log(`Pinned Ed25519 fingerprint ${fingerprint(signing.publicKey)}`)
  console.log(`Public key ${bytesToB64Url(signing.publicKey)}`)
  console.log(`Demo developer ${DEMO_DEVELOPER.email}`)
  console.log(`Demo advertiser ${DEMO_ADVERTISER.email}`)
  console.log(`Demo password ${DEMO_PASSWORD} (local fixture, not a production secret)`)
  console.log(`Developer share ${intEnv('SWAG_DEVELOPER_SHARE_BPS', DEFAULT_DEVELOPER_SHARE_BPS)} bps`)
})

function intEnv(name: string, fallback: number): number {
  const raw = process.env[name]
  if (!raw) return fallback
  const value = Number(raw)
  if (!Number.isInteger(value) || value < 0) throw new Error(`${name} must be a non-negative integer`)
  return value
}

function emptyToUndefined(value: string | undefined): string | undefined {
  const trimmed = value?.trim()
  return trimmed ? trimmed : undefined
}

function loadDotEnv(file: string) {
  if (!existsSync(file)) return
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq < 1) continue
    const key = trimmed.slice(0, eq).trim()
    let value = trimmed.slice(eq + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    if (process.env[key] === undefined) process.env[key] = value
  }
}
