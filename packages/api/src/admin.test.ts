import { eq } from 'drizzle-orm'
import { afterEach, describe, expect, it } from 'vitest'
import { generateEd25519KeyPair } from '@swag-money/crypto'
import { createApp, type AppEnv, type Clock } from './app.ts'
import { maskCredential, maskEmail } from './mask.ts'
import { openDatabase } from './db.ts'
import { adminAuditLog, crmMailOutbox, users } from './schema.ts'
import { buildOverview } from './admin-read.ts'
import { crmSeedAllowed, seedCrmDemo } from './seed-crm.ts'
import { signSession } from './session.ts'

const SECRET = 'admin-session-secret-value'
const ADMIN_EMAIL = 'ops@swagmoney.test'
const ADMIN_ID = '00000000-0000-4000-8000-00000000aa01'
const DEV_ID = '00000000-0000-4000-8000-00000000aa02'
const DEV_EMAIL = 'priya.shah@dev.swagmoney.test'
const UPI = 'priya.shah@okhdfcbank'
const WALLET = 'So11111111111111111111111111111111111111112'
const HASH = 'secret-hash-do-not-leak'

function testEnv(overrides: Partial<AppEnv> = {}): AppEnv {
  return {
    allowDemo: true,
    minViewMs: 5_000,
    payoutMinCents: 1_000,
    impressionTtlMs: 120_000,
    sessionSecret: SECRET,
    adminEmails: [ADMIN_EMAIL],
    ...overrides,
  }
}

function clock(): Clock & { t: number } {
  return { t: 1_700_000_000_000, now() { return this.t } }
}

async function harness(env: Partial<AppEnv> = {}) {
  const opened = await openDatabase()
  const signing = generateEd25519KeyPair()
  const now = clock()
  const app = createApp({
    db: opened.db,
    clock: now,
    env: testEnv(env),
    signingPrivateKey: signing.privateKey,
    signingPublicKey: signing.publicKey,
  })
  return { ...opened, app, now }
}

function auth(id: string) {
  return { authorization: `Bearer ${signSession(id, SECRET)}` }
}

describe('admin CRM', () => {
  let close: (() => Promise<void>) | undefined

  afterEach(async () => {
    await close?.()
    close = undefined
    delete process.env.ADMIN_NOTIFY_ADVERTISERS
    delete process.env.ADMIN_NOTIFY_EMAIL
  })

  it('returns 404 for anonymous and non-admin sessions', async () => {
    const opened = await harness()
    close = opened.close
    await opened.db.insert(users).values([
      { id: ADMIN_ID, email: ADMIN_EMAIL, name: 'Ops', role: 'operator', passwordHash: HASH, createdAtMs: 1 },
      { id: DEV_ID, email: DEV_EMAIL, name: 'Priya Shah', role: 'developer', passwordHash: HASH, createdAtMs: 2 },
    ])
    const anon = await opened.app.request('/v1/admin/overview')
    expect(anon.status).toBe(404)
    const stranger = await opened.app.request('/v1/admin/overview', { headers: auth(DEV_ID) })
    expect(stranger.status).toBe(404)
    const wrongList = await opened.app.request('/v1/admin/developers', { headers: auth(DEV_ID) })
    expect(wrongList.status).toBe(404)
    const exportDenied = await opened.app.request('/v1/admin/export/developers')
    expect(exportDenied.status).toBe(404)
    const allowed = await opened.app.request('/v1/admin/overview', { headers: auth(ADMIN_ID) })
    expect(allowed.status).toBe(200)
    const mixedCase = createApp({
      db: opened.db,
      clock: opened.now,
      env: testEnv({ adminEmails: ['OPS@swagmoney.test'] }),
      signingPrivateKey: generateEd25519KeyPair().privateKey,
      signingPublicKey: generateEd25519KeyPair().publicKey,
    })
    const cased = await mixedCase.request('/v1/admin/overview', { headers: auth(ADMIN_ID) })
    expect(cased.status).toBe(200)
  })

  it('shows zeros on an empty database', async () => {
    const opened = await harness()
    close = opened.close
    const overview = await buildOverview(opened.db, opened.now.now())
    expect(overview.developers).toBe(0)
    expect(overview.advertisers).toBe(0)
    expect(overview.signups).toEqual({
      today: 0,
      days7: 0,
      days30: 0,
      days: overview.signups.days,
    })
    expect(overview.signups.days).toHaveLength(30)
    expect(overview.signups.days.every((day) => day.count === 0)).toBe(true)
    expect(overview.integrations).toEqual([])
    expect(overview.impressionsServed).toBe(0)
    expect(overview.verifiedViews).toBe(0)
    expect(overview.advertiserSpendCents).toBe(0)
    expect(overview.blocksBought).toBe(0)
    expect(overview.earningsOwedCents).toBe(0)
    expect(overview.earningsPaidCents).toBe(0)
    expect(overview.pendingPayouts).toBe(0)
    expect(overview.pendingPayoutCents).toBe(0)
    expect(overview.database.ok).toBe(true)
    expect(overview.database.migrationVersion).toBe('0002-crm')
    expect(overview.database.tables.find((table) => table.name === 'users')?.rows).toBe(0)

    await opened.db.insert(users).values({
      id: ADMIN_ID,
      email: ADMIN_EMAIL,
      name: 'Ops',
      role: 'operator',
      createdAtMs: opened.now.now(),
    })
    const response = await opened.app.request('/v1/admin/overview', { headers: auth(ADMIN_ID) })
    const body = (await response.json()) as { developers: number; advertisers: number; impressionsServed: number; earningsOwedCents: number; database: { ok: boolean } }
    expect(body.developers).toBe(0)
    expect(body.advertisers).toBe(0)
    expect(body.impressionsServed).toBe(0)
    expect(body.earningsOwedCents).toBe(0)
    expect(body.database.ok).toBe(true)
  })

  it('masks payout credentials and emails on lists and reveals them on the detail page', async () => {
    const opened = await harness()
    close = opened.close
    await opened.db.insert(users).values([
      { id: ADMIN_ID, email: ADMIN_EMAIL, name: 'Ops', role: 'operator', passwordHash: HASH, createdAtMs: 1 },
      {
        id: DEV_ID,
        email: DEV_EMAIL,
        name: 'Priya Shah',
        role: 'developer',
        passwordHash: HASH,
        residenceCountry: 'IN',
        payoutPreference: 'upi',
        signupMethod: 'magic_link',
        createdAtMs: 2,
      },
    ])
    const { payouts } = await import('./schema.ts')
    await opened.db.insert(payouts).values([
      {
        id: '00000000-0000-4000-8000-00000000aa10',
        userId: DEV_ID,
        provider: 'upi',
        mode: 'mock',
        amountCents: 1000,
        creditBonusCents: 0,
        creditValueCents: 1000,
        destination: UPI,
        externalId: 'mock_upi',
        detail: 'Mock UPI payout. No network call was made.',
        status: 'pending',
        createdAtMs: 3,
      },
      {
        id: '00000000-0000-4000-8000-00000000aa11',
        userId: DEV_ID,
        provider: 'solana',
        mode: 'mock',
        amountCents: 500,
        creditBonusCents: 0,
        creditValueCents: 500,
        destination: WALLET,
        externalId: 'mock_sol',
        detail: 'Mock Solana transfer. Nothing was broadcast.',
        status: 'completed',
        createdAtMs: 4,
      },
    ])

    const list = await opened.app.request('/v1/admin/developers', { headers: auth(ADMIN_ID) })
    const listText = await list.text()
    expect(listText).not.toContain(DEV_EMAIL)
    expect(listText).not.toContain(HASH)
    expect(listText).toContain(maskEmail(DEV_EMAIL))

    const payoutList = await opened.app.request('/v1/admin/payouts', { headers: auth(ADMIN_ID) })
    const payoutText = await payoutList.text()
    expect(payoutText).not.toContain(UPI)
    expect(payoutText).not.toContain(WALLET)
    expect(payoutText).toContain(maskCredential(UPI))
    expect(payoutText).toContain(maskCredential(WALLET))

    const detail = await opened.app.request(`/v1/admin/developers/${DEV_ID}`, { headers: auth(ADMIN_ID) })
    const detailText = await detail.text()
    expect(detailText).toContain(DEV_EMAIL)
    expect(detailText).toContain(UPI)
    expect(detailText).toContain(WALLET)
    expect(detailText).not.toContain(HASH)

    const csv = await opened.app.request('/v1/admin/export/developers', { headers: auth(ADMIN_ID) })
    expect(csv.headers.get('content-type')).toContain('text/csv')
    const csvText = await csv.text()
    expect(csvText).toContain('name,email,')
    expect(csvText).toContain(maskEmail(DEV_EMAIL))
    expect(csvText).not.toContain(DEV_EMAIL)
    expect(csvText).not.toContain(HASH)

    const payoutCsv = await opened.app.request('/v1/admin/export/payouts', { headers: auth(ADMIN_ID) })
    const payoutCsvText = await payoutCsv.text()
    expect(payoutCsvText).not.toContain(UPI)
    expect(payoutCsvText).not.toContain(WALLET)
    expect(payoutCsvText).toContain(maskCredential(UPI))

    const table = await opened.app.request('/v1/admin/database/users', { headers: auth(ADMIN_ID) })
    const tableText = await table.text()
    expect(tableText).not.toContain(HASH)
    expect(tableText).toContain('[redacted]')
    expect(tableText).not.toContain(DEV_EMAIL)
  })

  it('records pipeline changes in the audit log', async () => {
    const opened = await harness()
    close = opened.close
    const advertiserId = '00000000-0000-4000-8000-00000000aa21'
    await opened.db.insert(users).values([
      { id: ADMIN_ID, email: ADMIN_EMAIL, name: 'Ops', role: 'operator', createdAtMs: 1 },
      { id: advertiserId, email: 'mina.chen@ads.swagmoney.test', name: 'Mina Chen', role: 'advertiser', createdAtMs: 2 },
    ])
    const moved = await opened.app.request(`/v1/admin/advertisers/${advertiserId}`, {
      method: 'POST',
      headers: { ...auth(ADMIN_ID), 'content-type': 'application/json' },
      body: JSON.stringify({ pipelineStage: 'onboarding', owner: 'ops@swagmoney.test', company: 'Helio Labs', followUpAt: '2026-10-02' }),
    })
    expect(moved.status).toBe(200)
    const listed = await opened.app.request('/v1/admin/advertisers', { headers: auth(ADMIN_ID) })
    const body = (await listed.json()) as { advertisers: Array<{ id: string; pipelineStage: string; owner: string; company: string }> }
    expect(body.advertisers.find((row) => row.id === advertiserId)).toMatchObject({
      pipelineStage: 'onboarding',
      owner: 'ops@swagmoney.test',
      company: 'Helio Labs',
    })
    const audit = await opened.db.select().from(adminAuditLog)
    expect(audit).toHaveLength(1)
    expect(audit[0]).toMatchObject({ actorEmail: ADMIN_EMAIL, action: 'advertiser.pipeline', subjectId: advertiserId })
    expect(audit[0]?.detail).toContain('onboarding')
    expect(audit[0]?.detail).not.toContain(HASH)
  })

  it('puts contact, advertiser, and privacy submissions in the inbox newest first', async () => {
    const opened = await harness()
    close = opened.close
    await opened.db.insert(users).values({ id: ADMIN_ID, email: ADMIN_EMAIL, name: 'Ops', role: 'operator', createdAtMs: opened.now.t })
    opened.now.t += 1_000

    const honeypot = await opened.app.request('/v1/contact', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Bot', email: 'bot@example.test', topic: 'security', message: 'ignore', companyWebsite: 'http://spam.example' }),
    })
    expect(((await honeypot.json()) as { stored: boolean }).stored).toBe(false)

    const contact = await opened.app.request('/v1/contact', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Nia Okonkwo', email: 'nia@press.example', topic: 'press', message: 'Interview request about the auction.' }),
    })
    expect(contact.status).toBe(201)
    opened.now.t += 1_000

    const privacy = await opened.app.request('/v1/privacy-requests', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ kind: 'access', email: 'ada@dev.swagmoney.test', path: 'email', region: 'CA', details: 'Export please.' }),
    })
    expect(privacy.status).toBe(201)
    opened.now.t += 1_000

    const signup = await opened.app.request('/v1/auth/signup', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'buyer.crm@example.test', name: 'Buyer', password: 'local-demo-pass', role: 'advertiser' }),
    })
    expect(signup.status).toBe(201)
    const { token } = (await signup.json()) as { token: string }
    opened.now.t += 1_000

    const bought = await opened.app.request('/v1/checkout', {
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
        pace: 'medium',
        audience: 'everywhere',
        countries: [],
        acknowledgeDelivery: true,
        emailInvoice: false,
      }),
    })
    expect(bought.status).toBe(201)

    const inbox = await opened.app.request('/v1/admin/leads', { headers: auth(ADMIN_ID) })
    const body = (await inbox.json()) as { leads: Array<{ kind: string; emailMasked: string; summary: string; createdAtMs: number; status: string; id: string }> }
    const kinds = body.leads.map((row) => row.kind)
    expect(kinds).toContain('contact')
    expect(kinds).toContain('privacy')
    expect(kinds).toContain('advertiser')
    expect(kinds).toContain('signup')
    expect(JSON.stringify(body)).not.toContain('nia@press.example')
    expect(JSON.stringify(body)).not.toContain('ada@dev.swagmoney.test')
    expect(JSON.stringify(body)).toContain(maskEmail('nia@press.example'))
    expect(JSON.stringify(body)).toContain(maskEmail('ada@dev.swagmoney.test'))
    const times = body.leads.map((row) => row.createdAtMs)
    expect([...times].sort((a, b) => b - a)).toEqual(times)
    expect(body.leads.some((row) => row.summary.toLowerCase().includes('ignore'))).toBe(false)

    const advertiserLead = body.leads.find((row) => row.kind === 'advertiser')
    expect(advertiserLead?.summary).toContain('Bought 1 impression block')
    const reviewed = await opened.app.request(`/v1/admin/leads/${advertiserLead?.id}/status`, {
      method: 'POST',
      headers: { ...auth(ADMIN_ID), 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'reviewed' }),
    })
    expect(reviewed.status).toBe(200)
    const detail = await opened.app.request(`/v1/admin/leads/${advertiserLead?.id}`, { headers: auth(ADMIN_ID) })
    const full = (await detail.json()) as { email: string; status: string }
    expect(full.email).toBe('buyer.crm@example.test')
    expect(full.status).toBe('reviewed')

    const csv = await opened.app.request('/v1/admin/export/leads', { headers: auth(ADMIN_ID) })
    const csvText = await csv.text()
    expect(csvText.split('\n')[0]).toContain('email')
    expect(csvText).not.toContain('nia@press.example')
    expect(csvText).toContain(maskEmail('nia@press.example'))
  })

  it('keeps advertiser signup mail mocked and off by default', async () => {
    const opened = await harness()
    close = opened.close
    const silent = await opened.app.request('/v1/auth/signup', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'quiet.ads@example.test', name: 'Quiet', password: 'local-demo-pass', role: 'advertiser' }),
    })
    expect(silent.status).toBe(201)
    expect(await opened.db.select().from(crmMailOutbox)).toHaveLength(0)

    process.env.ADMIN_NOTIFY_ADVERTISERS = '1'
    process.env.ADMIN_NOTIFY_EMAIL = 'owner@swagmoney.test'
    const sent = await opened.app.request('/v1/auth/signup', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'loud.ads@example.test', name: 'Loud', password: 'local-demo-pass', role: 'advertiser' }),
    })
    expect(sent.status).toBe(201)
    const mail = await opened.db.select().from(crmMailOutbox)
    expect(mail).toHaveLength(1)
    expect(mail[0]).toMatchObject({ toEmail: 'owner@swagmoney.test', delivery: 'mock' })
    expect(mail[0]?.body).toContain('was not sent')
  })

  it('refuses CRM demo seed in production and inserts it for local and preview', async () => {
    expect(crmSeedAllowed({ SWAG_ENV: 'production' })).toBe(false)
    expect(crmSeedAllowed({ VERCEL_ENV: 'production', VERCEL: '1' })).toBe(false)
    expect(crmSeedAllowed({ VERCEL: '1' })).toBe(false)
    expect(crmSeedAllowed({ VERCEL: '1', VERCEL_ENV: 'preview' })).toBe(true)
    expect(crmSeedAllowed({})).toBe(true)

    const opened = await harness({ adminEmails: [] })
    close = opened.close
    await expect(seedCrmDemo(opened.db, 1_700_000_000_000, { VERCEL_ENV: 'production' })).rejects.toThrow(/production/)
    await seedCrmDemo(opened.db, 1_700_000_000_000, {})
    const rows = await opened.db.select({ id: users.id }).from(users).where(eq(users.email, 'priya.shah@dev.swagmoney.test'))
    expect(rows).toHaveLength(1)
    await seedCrmDemo(opened.db, 1_700_000_000_000, { VERCEL: '1', VERCEL_ENV: 'preview' })
    const again = await opened.db.select({ id: users.id }).from(users).where(eq(users.email, 'priya.shah@dev.swagmoney.test'))
    expect(again).toHaveLength(1)
  })
})
