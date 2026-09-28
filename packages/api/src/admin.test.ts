import { afterEach, describe, expect, it } from 'vitest'
import { generateEd25519KeyPair } from '@swag-money/crypto'
import { maskDestination, maskEmail, maskUpi, maskWallet, toCsv } from './admin-mask.ts'
import { createApp, type AppEnv, type Clock } from './app.ts'
import { openDatabase } from './db.ts'
import { adminAuditLog, adminNotifications, users } from './schema.ts'
import { seedCrmDemo } from './seed.ts'
import { signSession } from './session.ts'
import { eq } from 'drizzle-orm'

const SECRET = 'admin-session-secret-value'

function testEnv(overrides: Partial<AppEnv> = {}): AppEnv {
  return {
    allowDemo: false,
    minViewMs: 5_000,
    payoutMinCents: 1_000,
    impressionTtlMs: 120_000,
    sessionSecret: SECRET,
    adminEmails: ['owner@swagmoney.test'],
    ...overrides,
  }
}

function clock(): Clock & { t: number } {
  return { t: 1_700_000_000_000, now() { return this.t } }
}

async function appWith(env: Partial<AppEnv> = {}) {
  const opened = await openDatabase()
  const signing = generateEd25519KeyPair()
  const app = createApp({
    db: opened.db,
    clock: clock(),
    env: testEnv(env),
    signingPrivateKey: signing.privateKey,
    signingPublicKey: signing.publicKey,
  })
  return { app, db: opened.db, close: opened.close }
}

async function signup(app: ReturnType<typeof createApp>, email: string, role: 'developer' | 'advertiser', name = 'Owner') {
  const response = await app.request('/v1/auth/signup', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, name, password: 'local-demo-pass', role }),
  })
  expect(response.status).toBe(201)
  return (await response.json()) as { token: string; user: { id: string; email: string } }
}

describe('admin CRM', () => {
  let close: (() => Promise<void>) | undefined

  afterEach(async () => {
    await close?.()
    close = undefined
  })

  it('masks emails, UPI ids, and wallet addresses', () => {
    expect(maskEmail('ada@dev.swagmoney.test')).toBe('a***@dev.swagmoney.test')
    expect(maskUpi('ada.okafor@okhdfcbank')).toBe('ad***@okhdfcbank')
    expect(maskWallet('7xKXk1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6')).toMatch(/^7xKX…/)
    expect(maskDestination('ada.okafor@okhdfcbank', 'upi')).toBe('ad***@okhdfcbank')
    expect(maskDestination('ada@dev.swagmoney.test', 'lightning')).toBe('a***@dev.swagmoney.test')
    expect(maskDestination('acct_1234567890', 'stripe_connect')).toBe('acct…7890')
    const csv = toCsv(['email'], [['a***@dev.swagmoney.test']])
    expect(csv).toBe('email\na***@dev.swagmoney.test\n')
  })

  it('returns 404 for anonymous and non-admin sessions', async () => {
    const opened = await appWith()
    close = opened.close
    const anon = await opened.app.request('/v1/admin/me')
    expect(anon.status).toBe(404)
    const developer = await signup(opened.app, 'dev@example.test', 'developer', 'Dev')
    const denied = await opened.app.request('/v1/admin/developers', {
      headers: { authorization: `Bearer ${developer.token}` },
    })
    expect(denied.status).toBe(404)
    const write = await opened.app.request('/v1/admin/notes', {
      method: 'POST',
      headers: { authorization: `Bearer ${developer.token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ subjectType: 'developer', subjectId: developer.user.id, body: 'nope' }),
    })
    expect(write.status).toBe(404)
  })

  it('lets an allowlisted email in, changes pipeline stage, and exports a masked CSV', async () => {
    const opened = await appWith()
    close = opened.close
    const admin = await signup(opened.app, 'Owner@SwagMoney.test', 'developer', 'Owner')
    const advertiser = await signup(opened.app, 'buyer@example.test', 'advertiser', 'Buyer Co')
    const me = await opened.app.request('/v1/admin/me', { headers: { authorization: `Bearer ${admin.token}` } })
    expect(me.status).toBe(200)
    expect(((await me.json()) as { email: string }).email).toBe('owner@swagmoney.test')

    const listed = await opened.app.request('/v1/admin/advertisers', {
      headers: { authorization: `Bearer ${admin.token}` },
    })
    const list = (await listed.json()) as { rows: Array<{ email: string; stage: string }> }
    expect(list.rows[0]?.email).toBe('b***@example.test')
    expect(list.rows[0]?.email).not.toContain('buyer@')

    const stage = await opened.app.request(`/v1/admin/advertisers/${advertiser.user.id}/pipeline`, {
      method: 'POST',
      headers: { authorization: `Bearer ${admin.token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ stage: 'contacted', ownerEmail: 'sales@swagmoney.test', followUpAt: '2026-10-01' }),
    })
    expect(stage.status).toBe(200)
    const detail = await opened.app.request(`/v1/admin/advertisers/${advertiser.user.id}`, {
      headers: { authorization: `Bearer ${admin.token}` },
    })
    const body = (await detail.json()) as { stage: string; email: string; ownerEmail: string }
    expect(body.stage).toBe('contacted')
    expect(body.email).toBe('buyer@example.test')
    expect(body.ownerEmail).toBe('sales@swagmoney.test')
    const audits = await opened.db.select().from(adminAuditLog)
    expect(audits.some((row) => row.action === 'pipeline' && row.actorEmail === 'owner@swagmoney.test')).toBe(true)

    const csv = await opened.app.request('/v1/admin/export/advertisers', {
      headers: { authorization: `Bearer ${admin.token}` },
    })
    expect(csv.status).toBe(200)
    expect(csv.headers.get('content-type')).toContain('text/csv')
    const text = await csv.text()
    expect(text.split('\n')[0]).toContain('company')
    expect(text).toContain('b***@example.test')
    expect(text).not.toContain('buyer@example.test')

    const outsider = signSession('nope', SECRET)
    expect((await opened.app.request('/v1/admin/export/advertisers', { headers: { authorization: `Bearer ${outsider}` } })).status).toBe(404)
  })

  it('records a mock advertiser notice only when the flag is on', async () => {
    const quiet = await appWith({ notifyAdvertiserSignups: false })
    close = quiet.close
    await signup(quiet.app, 'quiet@example.test', 'advertiser', 'Quiet')
    expect(await quiet.db.select().from(adminNotifications)).toHaveLength(0)
    await quiet.close()
    close = undefined

    const loud = await appWith({ notifyAdvertiserSignups: true, notifyTo: 'ops@swagmoney.test' })
    close = loud.close
    await signup(loud.app, 'loud@example.test', 'advertiser', 'Loud')
    const notes = await loud.db.select().from(adminNotifications)
    expect(notes).toHaveLength(1)
    expect(notes[0]?.adapter).toBe('mock')
    expect(notes[0]?.toEmail).toBe('ops@swagmoney.test')
    expect(notes[0]?.body).toContain('No message was sent')
  })

  it('refuses demo CRM seed in production and shows a developer detail email in full', async () => {
    const opened = await appWith()
    close = opened.close
    await expect(seedCrmDemo(opened.db, 1, { SWAG_ENV: 'production' })).rejects.toThrow(/production/)
    const admin = await signup(opened.app, 'owner@swagmoney.test', 'developer', 'Owner')
    const dev = await signup(opened.app, 'earn@example.test', 'developer', 'Earnest')
    const detail = await opened.app.request(`/v1/admin/developers/${dev.user.id}`, {
      headers: { authorization: `Bearer ${admin.token}` },
    })
    expect(detail.status).toBe(200)
    expect(((await detail.json()) as { email: string }).email).toBe('earn@example.test')
    const listed = await opened.app.request('/v1/admin/developers', {
      headers: { authorization: `Bearer ${admin.token}` },
    })
    const emails = ((await listed.json()) as { rows: Array<{ email: string }> }).rows.map((row) => row.email)
    expect(emails.every((email) => email.includes('***'))).toBe(true)
    const [stored] = await opened.db.select().from(users).where(eq(users.email, 'earn@example.test'))
    expect(stored?.signupMethod).toBe('email')
  })
})
