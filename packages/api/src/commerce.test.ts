import { afterEach, describe, expect, it } from 'vitest'
import { bytesToB64Url, canonicalAdRequest, generateEd25519KeyPair, signBytes } from '@swag-money/crypto'
import { createApp, type AppEnv, type Clock } from './app.ts'
import { openDatabase } from './db.ts'
import { campaigns, impressions, installs, ledger, users } from './schema.ts'
import { signSession } from './session.ts'

const SECRET = 'commerce-session-secret'

function testEnv(overrides: Partial<AppEnv> = {}): AppEnv {
  return {
    allowDemo: false,
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

describe('accounts, checkout, keys, and public stats', () => {
  let close: (() => Promise<void>) | undefined

  afterEach(async () => {
    await close?.()
    close = undefined
  })

  it('signs up, rejects a bad password, and sells a targeted block without calling a card network', async () => {
    const opened = await openDatabase()
    close = opened.close
    const signing = generateEd25519KeyPair()
    const now = clock()
    const app = createApp({
      db: opened.db,
      clock: now,
      env: testEnv(),
      signingPrivateKey: signing.privateKey,
      signingPublicKey: signing.publicKey,
    })

    const signup = await app.request('/v1/auth/signup', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: 'Buyer@Example.test',
        name: 'Buyer',
        password: 'local-demo-pass',
        role: 'advertiser',
      }),
    })
    expect(signup.status).toBe(201)
    const created = (await signup.json()) as { token: string }
    const bad = await app.request('/v1/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'buyer@example.test', password: 'wrong-password' }),
    })
    expect(bad.status).toBe(401)

    const checkout = await app.request('/v1/checkout', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${created.token}` },
      body: JSON.stringify({
        name: 'Northwind block',
        advertiserName: 'Northwind',
        text: 'Northwind CI: ephemeral environments for every PR',
        destinationUrl: 'https://northwind.example/ci',
        blocks: 1,
        bidPerBlockCents: 500,
        surfaces: ['claude-code'],
        placement: 'terminal',
        countries: ['in'],
      }),
    })
    expect(checkout.status).toBe(201)
    const paid = (await checkout.json()) as {
      mode: string
      totalCents: number
      countrySurchargeCents: number
      destinationUrl?: string
    }
    expect(paid.mode).toBe('mock')
    expect(paid.countrySurchargeCents).toBe(75)
    expect(paid.totalCents).toBe(575)
    expect(paid.destinationUrl).toBeUndefined()

    const listed = await app.request('/v1/advertiser/v1/campaigns', {
      headers: { authorization: `Bearer ${created.token}` },
    })
    const listBody = (await listed.json()) as { campaigns: Array<{ destinationUrl: string; countries: string[] }> }
    expect(listBody.campaigns[0]?.destinationUrl).toBe('https://northwind.example/ci')
    expect(listBody.campaigns[0]?.countries).toEqual(['IN'])

    const device = generateEd25519KeyPair()
    const developerId = '00000000-0000-4000-8000-00000000aa21'
    const installId = '00000000-0000-4000-8000-00000000dd21'
    await opened.db.insert(users).values({
      id: developerId,
      email: 'dev-commerce@example.test',
      name: 'Dev',
      role: 'developer',
      createdAtMs: 1,
    })
    await opened.db.insert(installs).values({
      id: installId,
      userId: developerId,
      label: 'cli',
      devicePublicKey: bytesToB64Url(device.publicKey),
      createdAtMs: 1,
    })

    const missed = await app.request('/v1/ads/request', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(signedRequest(device.privateKey, installId, 'claude-code', now.t, 'n-miss')),
    })
    expect(missed.status).toBe(404)

    const hit = await app.request('/v1/ads/request', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ...signedRequest(device.privateKey, installId, 'claude-code', now.t, 'n-hit'),
        country: 'IN',
      }),
    })
    expect(hit.status).toBe(200)
    const ad = await hit.json()
    expect(JSON.stringify(ad)).not.toContain('northwind.example')
    expect(JSON.stringify(ad)).not.toContain('destinationUrl')
  })

  it('accepts an API key and rejects a missing or wrong one', async () => {
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
    const signup = await app.request('/v1/auth/signup', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'api@example.test', name: 'Api', password: 'local-demo-pass', role: 'advertiser' }),
    })
    const { token } = (await signup.json()) as { token: string }
    const minted = await app.request('/v1/advertiser/api-keys', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ label: 'ci' }),
    })
    expect(minted.status).toBe(201)
    const key = (await minted.json()) as { key: string; prefix: string }
    expect(key.key.startsWith('sm_test_')).toBe(true)

    const anonymous = await app.request('/v1/advertiser/v1/stats')
    expect(anonymous.status).toBe(401)
    const wrong = await app.request('/v1/advertiser/v1/stats', {
      headers: { authorization: 'Bearer sm_test_not-a-real-key' },
    })
    expect(wrong.status).toBe(401)
    const ok = await app.request('/v1/advertiser/v1/stats', {
      headers: { authorization: `Bearer ${key.key}` },
    })
    expect(ok.status).toBe(200)
    const stats = (await ok.json()) as { campaigns: number }
    expect(stats.campaigns).toBe(0)

    const listed = await app.request('/v1/advertiser/api-keys', {
      headers: { authorization: `Bearer ${token}` },
    })
    const keys = (await listed.json()) as { keys: Array<{ prefix: string; key?: string }> }
    expect(keys.keys[0]?.prefix).toBe(key.prefix)
    expect(JSON.stringify(keys)).not.toContain(key.key)
  })

  it('reports ledger totals and the configured share, with no hardcoded counter', async () => {
    const opened = await openDatabase()
    close = opened.close
    const signing = generateEd25519KeyPair()
    const app = createApp({
      db: opened.db,
      clock: clock(),
      env: testEnv({ developerShareBps: 7000 }),
      signingPrivateKey: signing.privateKey,
      signingPublicKey: signing.publicKey,
    })
    const developerId = '00000000-0000-4000-8000-00000000aa31'
    const advertiserId = '00000000-0000-4000-8000-00000000bb31'
    await opened.db.insert(users).values([
      { id: developerId, email: 'earn@example.test', name: 'Earn', role: 'developer', createdAtMs: 1 },
      { id: advertiserId, email: 'buy@example.test', name: 'Buy', role: 'advertiser', createdAtMs: 1 },
    ])
    await opened.db.insert(campaigns).values([
      {
        id: '00000000-0000-4000-8000-00000000cc31',
        advertiserId,
        name: 'Northwind',
        advertiserName: 'Northwind',
        status: 'active',
        adText: 'Northwind CI: ephemeral environments for every PR',
        maxBidCents: 80,
        budgetCents: 10_000,
        spentCents: 0,
        reservedCents: 0,
        surfaces: JSON.stringify(['claude-code']),
        createdAtMs: 10,
      },
      {
        id: '00000000-0000-4000-8000-00000000cc32',
        advertiserId,
        name: 'Helio',
        advertiserName: 'Helio',
        status: 'active',
        adText: 'Helio: evals and traces for agents in production',
        maxBidCents: 50,
        budgetCents: 10_000,
        spentCents: 0,
        reservedCents: 0,
        surfaces: JSON.stringify(['claude-code']),
        createdAtMs: 20,
      },
    ])
    const installId = '00000000-0000-4000-8000-00000000dd31'
    await opened.db.insert(installs).values({
      id: installId,
      userId: developerId,
      label: 'cli',
      devicePublicKey: 'not-used',
      createdAtMs: 1,
    })
    await opened.db.insert(ledger).values({
      id: '00000000-0000-4000-8000-00000000ee31',
      userId: developerId,
      impressionId: null,
      payoutId: null,
      kind: 'earn',
      amountCents: 250,
      createdAtMs: 1,
    })
    await opened.db.insert(impressions).values({
      id: '00000000-0000-4000-8000-00000000ff31',
      campaignId: '00000000-0000-4000-8000-00000000cc31',
      developerId,
      installId,
      surface: 'claude-code',
      nonce: 'n',
      adText: 'Northwind CI: ephemeral environments for every PR',
      priceCents: 51,
      developerShareCents: 25,
      platformShareCents: 26,
      status: 'verified',
      servedAtMs: 1,
      verifiedAtMs: 2,
      lastError: null,
    })

    const stats = await app.request('/v1/public/stats')
    expect(stats.status).toBe(200)
    const body = (await stats.json()) as {
      verifiedImpressions: number
      developerEarningsCents: number
      developerCount: number
      developerShareBps: number
      source: string
    }
    expect(body).toMatchObject({
      verifiedImpressions: 1,
      developerEarningsCents: 250,
      developerCount: 1,
      developerShareBps: 7000,
      source: 'ledger',
    })

    const preview = await app.request('/v1/advertiser/campaigns', {
      headers: { authorization: `Bearer ${signSession(advertiserId, SECRET)}` },
    })
    const desk = (await preview.json()) as {
      previews: Array<{ surface: string; winner: { priceCents: number; developerShareCents: number } | null }>
    }
    const claude = desk.previews.find((row) => row.surface === 'claude-code')
    expect(claude?.winner?.priceCents).toBe(51)
    expect(claude?.winner?.developerShareCents).toBe(35)
  })
})

function signedRequest(privateKey: Uint8Array, installId: string, surface: string, signedAt: number, requestNonce: string) {
  const message = canonicalAdRequest({ installId, surface, requestNonce, signedAt })
  return {
    installId,
    surface,
    requestNonce,
    signedAt,
    signature: bytesToB64Url(signBytes(new TextEncoder().encode(message), privateKey)),
  }
}
