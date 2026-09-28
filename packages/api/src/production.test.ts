import { afterEach, describe, expect, it } from 'vitest'
import { bytesToB64Url, canonicalAdRequest, generateEd25519KeyPair, signBytes } from '@swag-money/crypto'
import { createApp, type AppEnv, type Clock } from './app.ts'
import { assertProductionEnv, productionProblems } from './config.ts'
import { openDatabase } from './db.ts'
import { installs, users } from './schema.ts'
import { seedIfEmpty } from './seed.ts'

const SECRET = 'production-session-secret'

function testEnv(): AppEnv {
  return {
    allowDemo: false,
    minViewMs: 5_000,
    payoutMinCents: 1_000,
    impressionTtlMs: 120_000,
    sessionSecret: SECRET,
    developerShareBps: 5000,
  }
}

function clock(): Clock & { t: number } {
  return {
    t: 1_700_000_000_000,
    now() {
      return this.t
    },
  }
}

describe('production configuration', () => {
  let close: (() => Promise<void>) | undefined

  afterEach(async () => {
    await close?.()
    close = undefined
  })

  it('does not require secrets outside a hosted environment', () => {
    expect(productionProblems({})).toEqual([])
    expect(() => assertProductionEnv({})).not.toThrow()
  })

  it('names every missing production variable', () => {
    expect(productionProblems({ SWAG_ENV: 'production' })).toEqual([
      'DATABASE_URL',
      'SWAG_SIGNING_PRIVATE_KEY',
      'SWAG_SIGNING_PUBLIC_KEY',
      'SWAG_SESSION_SECRET',
      'SWAG_DEVELOPER_SHARE_BPS',
      'SWAG_PUBLIC_SITE_URL',
    ])
    expect(() => assertProductionEnv({ SWAG_ENV: 'production' })).toThrow(/DATABASE_URL/)
    expect(() => assertProductionEnv({ SWAG_ENV: 'production' })).toThrow(/DEPLOY.md/)
  })

  it('accepts a complete hosted environment and rejects a public key that does not match', () => {
    const pair = generateEd25519KeyPair()
    const complete = {
      SWAG_ENV: 'production',
      DATABASE_URL: 'postgres://user:pass@ep-example.neon.tech/neondb',
      SWAG_SIGNING_PRIVATE_KEY: bytesToB64Url(pair.privateKey),
      SWAG_SIGNING_PUBLIC_KEY: bytesToB64Url(pair.publicKey),
      SWAG_SESSION_SECRET: 'session-secret-value',
      SWAG_DEVELOPER_SHARE_BPS: '5000',
      SWAG_PUBLIC_SITE_URL: 'https://swagmoney.ai',
    }
    expect(productionProblems(complete)).toEqual([])
    expect(productionProblems({ ...complete, SWAG_SIGNING_PUBLIC_KEY: bytesToB64Url(generateEd25519KeyPair().publicKey) })).toEqual([
      'SWAG_SIGNING_PUBLIC_KEY',
    ])
  })

  it('refuses to seed demo users when hosted', async () => {
    const opened = await openDatabase()
    close = opened.close
    await expect(seedIfEmpty(opened.db, 1, { SWAG_ENV: 'production' })).rejects.toThrow(/production/)
  })

  it('returns zeros from an empty ledger and reports the database as up', async () => {
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
    const stats = await app.request('/v1/public/stats')
    expect(stats.status).toBe(200)
    expect(await stats.json()).toEqual({
      verifiedImpressions: 0,
      developerEarningsCents: 0,
      paidOutCents: 0,
      developerCount: 0,
      advertiserCount: 0,
      developerShareBps: 5000,
      source: 'ledger',
    })
    const health = await app.request('/v1/health')
    expect(health.status).toBe(200)
    expect(await health.json()).toEqual({ ok: true, service: 'swag-money', database: 'up' })
    expect(await opened.db.select({ id: users.id }).from(users)).toEqual([])
  })

  it('rejects a reused ad-request nonce from the database', async () => {
    const opened = await openDatabase()
    close = opened.close
    const signing = generateEd25519KeyPair()
    const device = generateEd25519KeyPair()
    const now = clock()
    const app = createApp({
      db: opened.db,
      clock: now,
      env: testEnv(),
      signingPrivateKey: signing.privateKey,
      signingPublicKey: signing.publicKey,
    })
    const developerId = '00000000-0000-4000-8000-0000000000e1'
    const installId = '00000000-0000-4000-8000-0000000000e2'
    await opened.db.insert(users).values({
      id: developerId,
      email: 'dev@example.test',
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
    const message = canonicalAdRequest({
      installId,
      surface: 'claude-code',
      requestNonce: 'nonce-once',
      signedAt: now.t,
    })
    const body = {
      installId,
      surface: 'claude-code',
      requestNonce: 'nonce-once',
      signedAt: now.t,
      signature: bytesToB64Url(signBytes(new TextEncoder().encode(message), device.privateKey)),
    }
    const first = await app.request('/v1/ads/request', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
    expect(first.status).toBe(404)
    const second = await app.request('/v1/ads/request', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
    expect(second.status).toBe(409)
    expect(((await second.json()) as { code: string }).code).toBe('replay')
  })
})
