import { afterEach, describe, expect, it } from 'vitest'
import { generateEd25519KeyPair } from '@swag-money/crypto'
import { createApp, type AppEnv, type Clock } from './app.ts'
import { openDatabase } from './db.ts'
import { contactMessages, privacyRequests, users } from './schema.ts'
import { eq } from 'drizzle-orm'

const SECRET = 'intake-session-secret'

function testEnv(overrides: Partial<AppEnv> = {}): AppEnv {
  return {
    allowDemo: true,
    minViewMs: 5_000,
    payoutMinCents: 1_000,
    impressionTtlMs: 120_000,
    sessionSecret: SECRET,
    ...overrides,
  }
}

function clock(): Clock & { t: number } {
  return { t: 1_700_000_000_000, now() { return this.t } }
}

const PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

describe('magic link, privacy, contact, and strict checkout', () => {
  let close: (() => Promise<void>) | undefined

  afterEach(async () => {
    await close?.()
    close = undefined
  })

  it('requires the age confirmation, then finishes country and payout setup', async () => {
    const opened = await openDatabase()
    close = opened.close
    const signing = generateEd25519KeyPair()
    const app = createApp({
      db: opened.db,
      clock: clock(),
      env: testEnv(),
      signingPrivateKey: signing.privateKey,
      signingPublicKey: signing.publicKey,
    })
    const refused = await app.request('/v1/auth/magic-link', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'nora@dev.swagmoney.test' }),
    })
    expect(refused.status).toBe(400)

    const sent = await app.request('/v1/auth/magic-link', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'nora@dev.swagmoney.test', adult: true }),
    })
    expect(sent.status).toBe(200)
    const link = (await sent.json()) as { devToken?: string; delivery: string }
    expect(link.delivery).toBe('mock')
    expect(link.devToken?.startsWith('sm_link_')).toBe(true)

    const consumed = await app.request('/v1/auth/magic-link/consume', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: link.devToken }),
    })
    expect(consumed.status).toBe(200)
    const session = (await consumed.json()) as { token: string; user: { setupComplete: boolean; deletionScheduledAtMs: number | null } }
    expect(session.user.setupComplete).toBe(false)

    const again = await app.request('/v1/auth/magic-link/consume', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: link.devToken }),
    })
    expect(again.status).toBe(401)

    const setup = await app.request('/v1/auth/setup', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${session.token}` },
      body: JSON.stringify({ country: 'IN', payoutPreference: 'upi', newsOptIn: true }),
    })
    expect(setup.status).toBe(200)
    const ready = (await setup.json()) as { user: { setupComplete: boolean; residenceCountry: string; payoutPreference: string } }
    expect(ready.user.setupComplete).toBe(true)
    expect(ready.user.residenceCountry).toBe('IN')
    expect(ready.user.payoutPreference).toBe('upi')

    const scheduled = await app.request('/v1/account/deletion', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${session.token}` },
      body: JSON.stringify({ action: 'schedule' }),
    })
    expect(scheduled.status).toBe(200)
    const me = await app.request('/v1/me', { headers: { authorization: `Bearer ${session.token}` } })
    const profile = (await me.json()) as { deletionScheduledAtMs: number | null }
    expect(profile.deletionScheduledAtMs).toBeGreaterThan(0)
    const back = await app.request('/v1/account/deletion', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${session.token}` },
      body: JSON.stringify({ action: 'reactivate' }),
    })
    expect(back.status).toBe(200)
  })

  it('hides the magic token when demo auth is off', async () => {
    const opened = await openDatabase()
    close = opened.close
    const signing = generateEd25519KeyPair()
    const app = createApp({
      db: opened.db,
      clock: clock(),
      env: testEnv({ allowDemo: false }),
      signingPrivateKey: signing.privateKey,
      signingPublicKey: signing.publicKey,
    })
    const sent = await app.request('/v1/auth/magic-link', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'quiet@dev.swagmoney.test', adult: true }),
    })
    const body = (await sent.json()) as { devToken?: string }
    expect(body.devToken).toBeUndefined()
  })

  it('stores privacy and contact submissions and drops honeypots', async () => {
    const opened = await openDatabase()
    close = opened.close
    const signing = generateEd25519KeyPair()
    const app = createApp({
      db: opened.db,
      clock: clock(),
      env: testEnv(),
      signingPrivateKey: signing.privateKey,
      signingPublicKey: signing.publicKey,
    })
    const spam = await app.request('/v1/privacy-requests', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        kind: 'delete',
        email: 'spam@example.test',
        path: 'email',
        companyWebsite: 'http://spam.example',
      }),
    })
    expect(spam.status).toBe(200)
    expect(((await spam.json()) as { stored: boolean }).stored).toBe(false)
    expect(await opened.db.select().from(privacyRequests)).toHaveLength(0)

    const missing = await app.request('/v1/privacy-requests', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ kind: 'delete', email: 'not-an-email', path: 'email' }),
    })
    expect(missing.status).toBe(400)

    const saved = await app.request('/v1/privacy-requests', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        kind: 'do-not-sell',
        email: 'ada@dev.swagmoney.test',
        path: 'email',
        region: 'IN',
        details: 'Please record the opt-out.',
        authorizedAgent: false,
      }),
    })
    expect(saved.status).toBe(201)
    const rows = await opened.db.select().from(privacyRequests)
    expect(rows).toHaveLength(1)
    expect(rows[0]?.kind).toBe('do-not-sell')
    expect(rows[0]?.verification).toBe('email_pending')

    const contactSpam = await app.request('/v1/contact', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'Bot',
        email: 'bot@example.test',
        topic: 'security',
        message: 'ignore',
        companyWebsite: 'filled',
      }),
    })
    expect(((await contactSpam.json()) as { stored: boolean }).stored).toBe(false)
    const note = await app.request('/v1/contact', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'Ada Okafor',
        email: 'ada@dev.swagmoney.test',
        topic: 'developer',
        message: 'Question about UPI.',
      }),
    })
    expect(note.status).toBe(201)
    const messages = await opened.db.select().from(contactMessages)
    expect(messages).toHaveLength(1)
    expect(messages[0]?.topic).toBe('developer')
  })

  it('rejects a strict checkout that skips the acknowledgement, and ignores pace in the price', async () => {
    const opened = await openDatabase()
    close = opened.close
    const signing = generateEd25519KeyPair()
    const app = createApp({
      db: opened.db,
      clock: clock(),
      env: testEnv({ allowDemo: false }),
      signingPrivateKey: signing.privateKey,
      signingPublicKey: signing.publicKey,
    })
    const signup = await app.request('/v1/auth/signup', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'buyer2@example.test', name: 'Buyer', password: 'local-demo-pass', role: 'advertiser' }),
    })
    const { token } = (await signup.json()) as { token: string }
    const skipped = await app.request('/v1/checkout', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({
        strict: true,
        text: 'Northwind - ephemeral CI for every pull request',
        destinationUrl: 'https://northwind.example/ci',
        companyName: 'Northwind',
        blocks: 1,
        bid: '2.00',
        placement: 'tool',
        tool: 'claude-code',
        pace: 'fast',
        audience: 'countries',
        countries: ['IN'],
        acknowledgeDelivery: false,
        emailInvoice: true,
        brandIconDataUrl: PNG,
      }),
    })
    expect(skipped.status).toBe(400)
    const fast = await app.request('/v1/checkout', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({
        strict: true,
        text: 'Northwind - ephemeral CI for every pull request',
        destinationUrl: 'https://northwind.example/ci',
        companyName: 'Northwind',
        blocks: 1,
        bid: '2.00',
        placement: 'tool',
        tool: 'claude-code',
        pace: 'fast',
        audience: 'countries',
        countries: ['IN'],
        acknowledgeDelivery: true,
        emailInvoice: true,
        brandIconDataUrl: PNG,
      }),
    })
    expect(fast.status).toBe(201)
    const paid = (await fast.json()) as { totalCents: number; pace: string; countrySurchargeCents: number }
    expect(paid.totalCents).toBe(275)
    expect(paid.countrySurchargeCents).toBe(75)
    expect(paid.pace).toBe('fast')
    const [buyer] = await opened.db.select().from(users).where(eq(users.email, 'buyer2@example.test'))
    expect(buyer?.setupComplete).toBe(0)
  })
})
