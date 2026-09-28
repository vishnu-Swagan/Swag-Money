import {
  DEFAULT_DEVELOPER_SHARE_BPS,
  IMPRESSION_TTL_MS,
  MIN_VIEW_MS,
  PAYOUT_MIN_CENTS,
} from '@swag-money/shared'
import { createApp } from './app.ts'
import { assertProductionEnv, isHosted } from './config.ts'
import { loadSigningKeyFromEnv } from './keys-env.ts'
import { withDatabase } from './pg-db.ts'

type App = ReturnType<typeof createApp>

export async function handleApi(request: Request): Promise<Response> {
  try {
    assertProductionEnv()
    if (!process.env.DATABASE_URL?.trim()) {
      throw new Error('DATABASE_URL is required for the in-process API. Set SWAG_API_URL to use the local API instead. See DEPLOY.md.')
    }
    return await withDatabase(async (db) => {
      const app = buildApp(db)
      return await app.fetch(request)
    })
  } catch (error) {
    const path = new URL(request.url).pathname
    if (path === '/v1/health' || path === '/health') {
      return Response.json({ ok: false, service: 'swag-money', database: 'down' }, { status: 503 })
    }
    return Response.json({ ok: false, error: publicError(error) }, { status: 500 })
  }
}

function buildApp(db: Parameters<typeof createApp>[0]['db']): App {
  const signing = loadSigningKeyFromEnv(process.env.SWAG_SIGNING_PRIVATE_KEY)
  const sessionSecret = process.env.SWAG_SESSION_SECRET?.trim() ?? ''
  if (sessionSecret.length < 16 || sessionSecret === 'replace-with-a-long-random-string') {
    throw new Error('SWAG_SESSION_SECRET must be at least 16 characters. Generate one with pnpm -s keys. See DEPLOY.md.')
  }
  return createApp({
    db,
    clock: { now: () => Date.now() },
    signingPrivateKey: signing.privateKey,
    signingPublicKey: signing.publicKey,
    env: {
      allowDemo: isHosted() ? false : process.env.SWAG_ALLOW_DEMO !== '0',
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
}

function publicError(error: unknown): string {
  const message = error instanceof Error ? error.message : 'API failed to start'
  if (/postgres(ql)?:\/\//i.test(message) || /password authentication/i.test(message)) {
    return 'Database connection failed. See DEPLOY.md.'
  }
  return message
}

function intEnv(name: string, fallback: number): number {
  const raw = process.env[name]
  if (!raw || !raw.trim()) return fallback
  const value = Number(raw)
  if (!Number.isInteger(value) || value < 0) throw new Error(`${name} must be a non-negative integer`)
  return value
}

function emptyToUndefined(value: string | undefined): string | undefined {
  const trimmed = value?.trim()
  return trimmed ? trimmed : undefined
}
