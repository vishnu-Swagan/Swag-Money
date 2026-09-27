import { eq } from 'drizzle-orm'
import { afterEach, describe, expect, it } from 'vitest'
import { runImpression, type RenderSurface } from '@swag-money/client-core'
import { bytesToB64Url, generateEd25519KeyPair, signTranscript } from '@swag-money/crypto'
import { createApp, type AppEnv, type Clock } from './app.ts'
import { openDatabase } from './db.ts'
import { campaigns, impressions, installs, ledger, users } from './schema.ts'
import { signSession } from './session.ts'
import { seedIfEmpty } from './seed.ts'

const SECRET = 'test-session-secret'

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

function memorySurface(): RenderSurface & { writes: string[] } {
  let text = ''
  const writes: string[] = []
  return {
    kind: 'claude-code',
    writes,
    async write(next) {
      writes.push(next)
      text = next
    },
    async readBack() {
      return text
    },
    async restore() {
      text = ''
    },
  }
}

async function boot(env = testEnv()) {
  const opened = await openDatabase()
  const signing = generateEd25519KeyPair()
  const device = generateEd25519KeyPair()
  const clock = {
    t: 1_700_000_000_000,
    now() {
      return this.t
    },
  }
  const developerId = '00000000-0000-4000-8000-00000000aa01'
  const advertiserId = '00000000-0000-4000-8000-00000000bb01'
  const northwind = '00000000-0000-4000-8000-00000000cc01'
  const helio = '00000000-0000-4000-8000-00000000cc02'
  const installId = '00000000-0000-4000-8000-00000000dd01'
  await opened.db.insert(users).values([
    { id: developerId, email: 'dev@example.test', name: 'Dev', role: 'developer', createdAtMs: 1 },
    { id: advertiserId, email: 'ads@example.test', name: 'Ads', role: 'advertiser', createdAtMs: 1 },
  ])
  await opened.db.insert(campaigns).values([
    {
      id: northwind,
      advertiserId,
      name: 'Northwind CI',
      advertiserName: 'Northwind',
      status: 'active',
      adText: 'Northwind CI: ephemeral environments for every PR',
      maxBidCents: 80,
      budgetCents: 10_000,
      spentCents: 0,
      reservedCents: 0,
      surfaces: JSON.stringify(['claude-code', 'vscode']),
      createdAtMs: 10,
    },
    {
      id: helio,
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
  await opened.db.insert(installs).values({
    id: installId,
    userId: developerId,
    label: 'test',
    devicePublicKey: bytesToB64Url(device.publicKey),
    createdAtMs: 1,
  })
  const app = createApp({
    db: opened.db,
    clock,
    env,
    signingPrivateKey: signing.privateKey,
    signingPublicKey: signing.publicKey,
  })
  return { ...opened, app, clock, signing, device, installId, developerId, northwind, helio }
}

function appFetch(app: { request: (input: string, init?: RequestInit) => Promise<Response> | Response }): typeof fetch {
  return async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url
    const parsed = new URL(url)
    return app.request(`${parsed.pathname}${parsed.search}`, init)
  }
}

async function jsonOf(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>
}

describe('impression challenge', () => {
  let opened: Awaited<ReturnType<typeof boot>> | undefined

  afterEach(async () => {
    await opened?.close()
    opened = undefined
  })

  it('pays 50/50 only after a real render hold, and rejects replays', async () => {
    opened = await boot()
    const view = memorySurface()
    const result = await runImpression({
      apiUrl: 'http://127.0.0.1',
      installId: opened.installId,
      devicePrivateKey: opened.device.privateKey,
      pinnedPublicKey: opened.signing.publicKey,
      surface: view,
      clock: {
        now: () => opened!.clock.now(),
        sleep: async (ms) => {
          opened!.clock.t += ms
        },
      },
      fetchImpl: appFetch(opened.app),
    })

    expect(view.writes).toEqual(['Northwind CI: ephemeral environments for every PR'])
    expect(result.priceCents).toBe(51)
    expect(result.developerShareCents).toBe(25)
    expect(result.platformShareCents).toBe(26)
    expect(result.samples).toHaveLength(3)

    const rows = await opened.db.select().from(impressions)
    expect(rows).toHaveLength(1)
    expect(rows[0]?.status).toBe('verified')
    const credits = await opened.db.select().from(ledger)
    expect(credits).toHaveLength(1)
    expect(credits[0]?.amountCents).toBe(25)

    const replay = await opened.app.request('/v1/ads/verify', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        impressionId: result.impressionId,
        samples: result.samples,
        signature: 'not-a-signature',
      }),
    })
    expect(replay.status).toBe(409)
    expect((await jsonOf(replay)).code).toBe('replay')
    const creditsAfter = await opened.db.select().from(ledger)
    expect(creditsAfter).toHaveLength(1)
  })

  it('rejects a scripted verify that never waited on the server clock', async () => {
    opened = await boot()
    const request = await requestAd(opened)
    const body = request.body
    const payload = body.payload as { impressionId: string; nonce: string; text: string; surface: string }
    const samples = [0, 2500, 5000].map((offsetMs) => ({ offsetMs, readBack: payload.text }))
    const signature = signTranscript(
      {
        impressionId: payload.impressionId,
        nonce: payload.nonce,
        surface: payload.surface,
        text: payload.text,
        samples,
      },
      opened.device.privateKey,
    )
    const tooFast = await opened.app.request('/v1/ads/verify', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ impressionId: payload.impressionId, samples, signature }),
    })
    expect(tooFast.status).toBe(422)
    expect((await jsonOf(tooFast)).code).toBe('view_too_short')

    const forged = await opened.app.request('/v1/ads/verify', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        impressionId: payload.impressionId,
        samples,
        signature: bytesToB64Url(new Uint8Array(64)),
      }),
    })
    expect(forged.status).toBe(422)
    expect((await jsonOf(forged)).code).toBe('bad_proof')

    const [row] = await opened.db.select().from(impressions)
    expect(row?.status).toBe('served')
    const credits = await opened.db.select().from(ledger)
    expect(credits).toHaveLength(0)
  })

  it('closes the impression when a device signs a mismatched read-back', async () => {
    opened = await boot()
    const request = await requestAd(opened)
    const payload = request.body.payload as { impressionId: string; nonce: string; text: string; surface: string }
    const samples = [
      { offsetMs: 0, readBack: payload.text },
      { offsetMs: 2500, readBack: payload.text },
      { offsetMs: 5000, readBack: 'a headless script' },
    ]
    const signature = signTranscript(
      { impressionId: payload.impressionId, nonce: payload.nonce, surface: payload.surface, text: payload.text, samples },
      opened.device.privateKey,
    )
    opened.clock.t += 5_000
    const response = await opened.app.request('/v1/ads/verify', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ impressionId: payload.impressionId, samples, signature }),
    })
    expect(response.status).toBe(422)
    const [row] = await opened.db.select().from(impressions)
    expect(row?.status).toBe('rejected')
    const [campaign] = await opened.db.select().from(campaigns).where(eq(campaigns.id, opened.northwind))
    expect(campaign?.reservedCents).toBe(0)
  })

  it('serves only string payload fields and reserves budget for the clearing price', async () => {
    opened = await boot()
    const first = await requestAd(opened)
    expect(Object.keys(first.body.payload as object).sort()).toEqual([
      'advertiser',
      'expiresAt',
      'impressionId',
      'nonce',
      'surface',
      'text',
      'v',
    ])
    expect(JSON.stringify(first.body)).not.toContain('://')
    const [campaign] = await opened.db.select().from(campaigns).where(eq(campaigns.id, opened.northwind))
    expect(campaign?.reservedCents).toBe(51)

    await opened.db
      .update(campaigns)
      .set({ budgetCents: 51, reservedCents: 51, spentCents: 0 })
      .where(eq(campaigns.id, opened.northwind))
    const second = await requestAd(opened)
    const payload = second.body.payload as { text: string }
    expect(payload.text).toContain('Helio')
    const clearing = second.body.clearing as { priceCents: number }
    expect(clearing.priceCents).toBe(2)
  })

  it('expires an unanswered challenge and releases the reservation', async () => {
    opened = await boot(testEnv({ impressionTtlMs: 10_000 }))
    await requestAd(opened)
    opened.clock.t += 10_001
    const follow = await requestAd(opened)
    expect(follow.response.status).toBe(200)
    const rows = await opened.db.select().from(impressions)
    expect(rows.map((row) => row.status).sort()).toEqual(['expired', 'served'])
  })
})

async function requestAd(opened: {
  app: { request: (input: string, init?: RequestInit) => Promise<Response> | Response }
  clock: Clock & { t: number }
  device: { privateKey: Uint8Array }
  installId: string
}) {
  const { canonicalAdRequest, bytesToB64Url, signBytes, randomHex } = await import('@swag-money/crypto')
  const requestNonce = randomHex(16)
  const signedAt = opened.clock.now()
  const message = canonicalAdRequest({
    installId: opened.installId,
    surface: 'claude-code',
    requestNonce,
    signedAt,
  })
  const signature = bytesToB64Url(signBytes(new TextEncoder().encode(message), opened.device.privateKey))
  const response = await opened.app.request('/v1/ads/request', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      installId: opened.installId,
      surface: 'claude-code',
      requestNonce,
      signedAt,
      signature,
    }),
  })
  const body = await jsonOf(response)
  expect(response.status).toBe(200)
  return { response, body }
}

describe('seed ledger', () => {
  it('creates a $12 developer balance from the 50/50 split', async () => {
    const opened = await openDatabase()
    try {
      await seedIfEmpty(opened.db, 1_700_000_000_000)
      const rows = await opened.db.select().from(ledger)
      const balance = rows.reduce((sum, row) => sum + row.amountCents, 0)
      expect(balance).toBe(1_200)
      expect(rows).toHaveLength(48)
    } finally {
      await opened.close()
    }
  })
})
