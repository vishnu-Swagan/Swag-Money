import { afterEach, describe, expect, it } from 'vitest'
import { PayoutProviderError, settlePayout } from './payouts.ts'
import { createApp, type AppEnv } from './app.ts'
import { openDatabase } from './db.ts'
import { ledger, users } from './schema.ts'
import { signSession } from './session.ts'
import { generateEd25519KeyPair } from '@swag-money/crypto'

describe('payout providers', () => {
  it('keeps Stripe, Solana, and Lightning local, and adds a 10% API-credit bonus', () => {
    const stripe = settlePayout({ provider: 'stripe_connect', amountCents: 1000, destination: 'acct_12345678' }, {})
    expect(stripe.mode).toBe('mock')
    expect(stripe.externalId.startsWith('mock_stripe_')).toBe(true)

    const sandbox = settlePayout(
      { provider: 'stripe_connect', amountCents: 1000, destination: 'acct_12345678' },
      { stripeSecretKey: 'sk_test_123' },
    )
    expect(sandbox.mode).toBe('sandbox')
    expect(sandbox.detail).toContain('not sent')

    expect(() =>
      settlePayout(
        { provider: 'stripe_connect', amountCents: 1000, destination: 'acct_12345678' },
        { stripeSecretKey: 'sk_live_nope' },
      ),
    ).toThrow(PayoutProviderError)

    const credits = settlePayout({ provider: 'api_credits', amountCents: 2500, destination: 'anthropic' }, {})
    expect(credits.creditBonusCents).toBe(250)
    expect(credits.creditValueCents).toBe(2750)

    const solana = settlePayout(
      { provider: 'solana', amountCents: 1000, destination: 'So11111111111111111111111111111111111111112' },
      { solanaRpcUrl: 'https://api.devnet.solana.com', solanaPayoutSecret: 'present' },
    )
    expect(solana.mode).toBe('sandbox')
    expect(solana.detail).toContain('not broadcast')

    const lightning = settlePayout(
      { provider: 'lightning', amountCents: 1000, destination: 'ada@pay.example.com' },
      {},
    )
    expect(lightning.mode).toBe('mock')
    expect(lightning.schedule).toBe('on_demand')

    const upi = settlePayout({ provider: 'upi', amountCents: 1000, destination: 'ada@okaxis' }, {})
    expect(upi.mode).toBe('mock')
    expect(upi.detail).toContain('On demand')
    expect(upi.schedule).toBe('on_demand')

    const upiSandbox = settlePayout(
      { provider: 'upi', amountCents: 1000, destination: 'ada@okaxis' },
      { razorpayxKeyId: 'rzp_test_demo', razorpayxKeySecret: 'present' },
    )
    expect(upiSandbox.mode).toBe('sandbox')
    expect(upiSandbox.detail).toContain('not sent')

    expect(() =>
      settlePayout(
        { provider: 'upi', amountCents: 1000, destination: 'ada@okaxis' },
        { razorpayxKeyId: 'rzp_live_nope', razorpayxKeySecret: 'nope' },
      ),
    ).toThrow(PayoutProviderError)
    expect(() => settlePayout({ provider: 'upi', amountCents: 1000, destination: 'not an upi' }, {})).toThrow(
      PayoutProviderError,
    )
  })
})

describe('payout route', () => {
  let close: (() => Promise<void>) | undefined

  afterEach(async () => {
    await close?.()
    close = undefined
  })

  it('pays down the ledger and refuses anything under $10', async () => {
    const opened = await openDatabase()
    close = opened.close
    const env: AppEnv = {
      allowDemo: false,
      minViewMs: 5000,
      payoutMinCents: 1000,
      impressionTtlMs: 120_000,
      sessionSecret: 'payout-secret',
    }
    const signing = generateEd25519KeyPair()
    const userId = '00000000-0000-4000-8000-00000000aa11'
    await opened.db.insert(users).values({
      id: userId,
      email: 'dev@example.test',
      name: 'Dev',
      role: 'developer',
      createdAtMs: 1,
    })
    await opened.db.insert(ledger).values({
      id: '00000000-0000-4000-8000-00000000ee11',
      userId,
      impressionId: null,
      payoutId: null,
      kind: 'earn',
      amountCents: 2_000,
      createdAtMs: 1,
    })
    const app = createApp({
      db: opened.db,
      clock: { now: () => 50 },
      env,
      signingPrivateKey: signing.privateKey,
      signingPublicKey: signing.publicKey,
    })
    const auth = { authorization: `Bearer ${signSession(userId, env.sessionSecret)}`, 'content-type': 'application/json' }

    const tooSmall = await app.request('/v1/payouts', {
      method: 'POST',
      headers: auth,
      body: JSON.stringify({ provider: 'api_credits', amountCents: 999, destination: 'openai' }),
    })
    expect(tooSmall.status).toBe(409)

    const paid = await app.request('/v1/payouts', {
      method: 'POST',
      headers: auth,
      body: JSON.stringify({ provider: 'api_credits', amountCents: 1000, destination: 'openai' }),
    })
    expect(paid.status).toBe(200)
    const body = (await paid.json()) as { creditValueCents: number; balanceCents: number; mode: string }
    expect(body.creditValueCents).toBe(1100)
    expect(body.balanceCents).toBe(1000)
    expect(body.mode).toBe('mock')

    const rows = await opened.db.select().from(ledger)
    expect(rows.reduce((sum, row) => sum + row.amountCents, 0)).toBe(1000)
  })
})
