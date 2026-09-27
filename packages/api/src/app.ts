import { and, eq, isNull, sql } from 'drizzle-orm'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import {
  PayloadError,
  b64UrlToBytes,
  bytesToB64Url,
  canonicalAdRequest,
  fingerprint,
  openSignedPayload,
  randomHex,
  signPayload,
  validateContinuousView,
  verifyBytes,
  verifyTranscript,
  type AdPayload,
  type RenderSample,
} from '@swag-money/crypto'
import {
  ADVERTISER_MAX,
  AD_TEXT_MAX,
  AUCTION_RESERVE_CENTS,
  DEFAULT_DEVELOPER_SHARE_BPS,
  DomainError,
  NAME_MAX,
  SURFACES,
  assertPayoutAmount,
  isSurface,
  placementForSurface,
  runEnglishAuction,
  splitRevenue,
  type AuctionCandidate,
} from '@swag-money/shared'
import { registerCommerce } from './commerce.ts'
import type { SwagDb } from './db.ts'
import { hashApiKey } from './passwords.ts'
import { settlePayout, PayoutProviderError, type PayoutEnv, type PayoutProviderId } from './payouts.ts'
import { apiKeys, campaigns, impressions, installs, ledger, payouts, users } from './schema.ts'
import { readSession, signSession } from './session.ts'

type UserRow = typeof users.$inferSelect
type ImpressionRow = typeof impressions.$inferSelect

export type Clock = { now(): number }

export type AppEnv = PayoutEnv & {
  allowDemo: boolean
  minViewMs: number
  payoutMinCents: number
  impressionTtlMs: number
  sessionSecret: string
  developerShareBps?: number
}

type Vars = { user: UserRow | undefined }

const PROVIDERS: readonly PayoutProviderId[] = ['stripe_connect', 'solana', 'lightning', 'api_credits', 'upi']

function asNumber(value: unknown): number {
  const number = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(number)) throw new Error('Unexpected non-numeric database value')
  return number
}

function utf8(value: string): Uint8Array {
  return new TextEncoder().encode(value)
}

function parseSurfaces(value: string): string[] {
  try {
    const parsed = JSON.parse(value) as unknown
    if (!Array.isArray(parsed) || parsed.some((item) => typeof item !== 'string')) return []
    return parsed
  } catch {
    return []
  }
}

async function balanceOf(db: SwagDb, userId: string): Promise<number> {
  const rows = await db.select({ amountCents: ledger.amountCents }).from(ledger).where(eq(ledger.userId, userId))
  return rows.reduce((sum, row) => sum + row.amountCents, 0)
}

export function createApp(deps: {
  db: SwagDb
  clock: Clock
  env: AppEnv
  signingPrivateKey: Uint8Array
  signingPublicKey: Uint8Array
}) {
  const { db, clock, env, signingPrivateKey, signingPublicKey } = deps
  const developerShareBps = env.developerShareBps ?? DEFAULT_DEVELOPER_SHARE_BPS
  if (!Number.isInteger(developerShareBps) || developerShareBps < 0 || developerShareBps > 10_000) {
    throw new Error('developerShareBps must be an integer from 0 to 10000')
  }
  const app = new Hono<{ Variables: Vars }>()
  const seenRequests = new Set<string>()
  const requestHits = new Map<string, number[]>()

  app.use('*', async (c, next) => {
    c.set('user', undefined)
    const header = c.req.header('authorization') ?? ''
    if (header.startsWith('Bearer ')) {
      const userId = readSession(header.slice('Bearer '.length), env.sessionSecret)
      const token = header.slice('Bearer '.length)
      if (userId) {
        const [user] = await db.select().from(users).where(eq(users.id, userId))
        if (user) c.set('user', user)
      } else if (token.startsWith('sm_test_')) {
        const [key] = await db
          .select()
          .from(apiKeys)
          .where(and(eq(apiKeys.keyHash, hashApiKey(token)), isNull(apiKeys.revokedAtMs)))
        if (key) {
          const [user] = await db.select().from(users).where(eq(users.id, key.advertiserId))
          if (user) c.set('user', user)
        }
      }
    }
    await next()
  })

  const publicCors = cors({
    origin: '*',
    allowHeaders: ['Authorization', 'Content-Type'],
    allowMethods: ['GET', 'POST', 'OPTIONS'],
  })
  app.use('/v1/public-key', publicCors)
  app.use('/v1/public/*', publicCors)
  app.use('/v1/ads/*', publicCors)

  app.get('/', (c) => c.json({ service: 'swag-money', publicKey: '/v1/public-key' }))

  app.get('/health', async (c) => {
    await db.execute(sql`select 1 as ok`)
    return c.json({ ok: true, service: 'swag-money' })
  })

  app.get('/v1/public-key', (c) =>
    c.json({
      algorithm: 'Ed25519',
      publicKey: bytesToB64Url(signingPublicKey),
      fingerprint: fingerprint(signingPublicKey),
      note: 'Pin this key in the client. Ad responses do not carry a trusted key.',
    }),
  )

  app.get('/v1/demo/users', async (c) => {
    if (!env.allowDemo) return c.json({ error: 'Demo auth is disabled', code: 'demo_disabled' }, 404)
    const rows = await db.select().from(users)
    return c.json({
      users: rows.map((user) => ({ id: user.id, email: user.email, name: user.name, role: user.role })),
    })
  })

  app.post('/v1/demo/session', async (c) => {
    if (!env.allowDemo) return c.json({ error: 'Demo auth is disabled', code: 'demo_disabled' }, 404)
    const body = await readBody(c)
    const email = typeof body.email === 'string' ? body.email : ''
    const [user] = await db.select().from(users).where(eq(users.email, email))
    if (!user) return c.json({ error: 'Unknown demo user', code: 'not_found' }, 404)
    return c.json({
      token: signSession(user.id, env.sessionSecret),
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
    })
  })

  app.get('/v1/me', (c) => {
    const user = c.get('user')
    if (!user) return c.json({ error: 'Sign in required', code: 'unauthorized' }, 401)
    return c.json({ id: user.id, email: user.email, name: user.name, role: user.role })
  })

  app.post('/v1/installs', async (c) => {
    const user = c.get('user')
    if (!user) return c.json({ error: 'Sign in required', code: 'unauthorized' }, 401)
    if (user.role !== 'developer') return c.json({ error: 'Developer account required', code: 'forbidden' }, 403)
    const body = await readBody(c)
    const label = body.label
    const publicKey = body.publicKey
    if (typeof label !== 'string' || typeof publicKey !== 'string') {
      return c.json({ error: 'label and publicKey are required', code: 'bad_request' }, 400)
    }
    try {
      assertLabel(label)
      const bytes = b64UrlToBytes(publicKey)
      if (bytes.length !== 32) throw new PayloadError('device public key must be 32 bytes')
    } catch (error) {
      return c.json({ error: messageOf(error), code: 'bad_request' }, 400)
    }
    const id = crypto.randomUUID()
    await db.insert(installs).values({
      id,
      userId: user.id,
      label,
      devicePublicKey: publicKey,
      createdAtMs: clock.now(),
    })
    return c.json({ installId: id, fingerprint: fingerprint(b64UrlToBytes(publicKey)) })
  })

  app.get('/v1/developer/summary', async (c) => {
    const user = c.get('user')
    if (!user) return c.json({ error: 'Sign in required', code: 'unauthorized' }, 401)
    if (user.role !== 'developer') return c.json({ error: 'Developer account required', code: 'forbidden' }, 403)
    const [installRows, impressionRows, payoutRows, balanceCents] = await Promise.all([
      db.select().from(installs).where(eq(installs.userId, user.id)),
      db.select().from(impressions).where(eq(impressions.developerId, user.id)),
      db.select().from(payouts).where(eq(payouts.userId, user.id)),
      balanceOf(db, user.id),
    ])
    const count = (status: string) => impressionRows.filter((row) => row.status === status).length
    return c.json({
      user: { id: user.id, name: user.name, email: user.email },
      balanceCents,
      payoutMinCents: env.payoutMinCents,
      payoutSchedule: 'on_demand',
      developerShareBps,
      minViewMs: env.minViewMs,
      verifiedImpressions: count('verified'),
      rejectedImpressions: count('rejected'),
      pendingImpressions: count('served'),
      expiredImpressions: count('expired'),
      lifetimeEarnedCents: impressionRows
        .filter((row) => row.status === 'verified')
        .reduce((sum, row) => sum + row.developerShareCents, 0),
      serverPublicKey: {
        publicKey: bytesToB64Url(signingPublicKey),
        fingerprint: fingerprint(signingPublicKey),
      },
      installs: installRows.map((row) => ({
        id: row.id,
        label: row.label,
        fingerprint: fingerprint(b64UrlToBytes(row.devicePublicKey)),
        createdAtMs: asNumber(row.createdAtMs),
      })),
      payouts: payoutRows
        .map(presentPayout)
        .sort((a, b) => b.createdAtMs - a.createdAtMs),
    })
  })

  app.get('/v1/developer/impressions', async (c) => {
    const user = c.get('user')
    if (!user) return c.json({ error: 'Sign in required', code: 'unauthorized' }, 401)
    const limit = Math.min(Number(c.req.query('limit') ?? 12), 50)
    const rows = await db.select().from(impressions).where(eq(impressions.developerId, user.id))
    const recent = rows
      .slice()
      .sort((a, b) => asNumber(b.servedAtMs) - asNumber(a.servedAtMs))
      .slice(0, Number.isFinite(limit) ? limit : 12)
      .map(presentImpression)
    return c.json({ impressions: recent, total: rows.length })
  })

  app.get('/v1/advertiser/campaigns', async (c) => {
    const user = c.get('user')
    if (!user) return c.json({ error: 'Sign in required', code: 'unauthorized' }, 401)
    if (user.role !== 'advertiser') return c.json({ error: 'Advertiser account required', code: 'forbidden' }, 403)
    const rows = await db.select().from(campaigns).where(eq(campaigns.advertiserId, user.id))
    const impressionRows = await db.select().from(impressions)
    const presented = rows
      .map((row) => {
        const mine = impressionRows.filter((impression) => impression.campaignId === row.id)
        return {
          ...presentCampaign(row),
          verifiedImpressions: mine.filter((impression) => impression.status === 'verified').length,
          pendingImpressions: mine.filter((impression) => impression.status === 'served').length,
        }
      })
      .sort((a, b) => b.createdAtMs - a.createdAtMs)
    const previews = ['claude-code', 'vscode', 'browser', 'jetbrains'].map((surface) => ({
      surface,
      winner: preview(rows, surface),
    }))
    return c.json({ campaigns: presented, previews, reserveCents: AUCTION_RESERVE_CENTS })
  })

  app.post('/v1/campaigns', async (c) => {
    const user = c.get('user')
    if (!user) return c.json({ error: 'Sign in required', code: 'unauthorized' }, 401)
    if (user.role !== 'advertiser') return c.json({ error: 'Advertiser account required', code: 'forbidden' }, 403)
    const body = await readBody(c)
    try {
      const created = parseCampaign(body)
      const id = crypto.randomUUID()
      await db.insert(campaigns).values({
        id,
        advertiserId: user.id,
        name: created.name,
        advertiserName: created.advertiserName,
        status: 'active',
        adText: created.text,
        maxBidCents: created.maxBidCents,
        budgetCents: created.budgetCents,
        spentCents: 0,
        reservedCents: 0,
        surfaces: JSON.stringify(created.surfaces),
        createdAtMs: clock.now(),
      })
      return c.json({ id }, 201)
    } catch (error) {
      return c.json({ error: messageOf(error), code: 'bad_request' }, 400)
    }
  })

  app.patch('/v1/campaigns/:id', async (c) => {
    const user = c.get('user')
    if (!user) return c.json({ error: 'Sign in required', code: 'unauthorized' }, 401)
    const [row] = await db.select().from(campaigns).where(eq(campaigns.id, c.req.param('id')))
    if (!row || row.advertiserId !== user.id) return c.json({ error: 'Campaign not found', code: 'not_found' }, 404)
    const body = await readBody(c)
    const patch: Partial<typeof campaigns.$inferInsert> = {}
    if (body.status !== undefined) {
      if (body.status !== 'active' && body.status !== 'paused') {
        return c.json({ error: 'status must be active or paused', code: 'bad_request' }, 400)
      }
      patch.status = body.status
    }
    if (body.maxBidCents !== undefined) {
      if (typeof body.maxBidCents !== 'number' || !Number.isInteger(body.maxBidCents) || body.maxBidCents < AUCTION_RESERVE_CENTS) {
        return c.json({ error: 'maxBidCents must be an integer at or above the reserve', code: 'bad_request' }, 400)
      }
      patch.maxBidCents = body.maxBidCents
    }
    if (Object.keys(patch).length === 0) return c.json({ error: 'No changes', code: 'bad_request' }, 400)
    await db.update(campaigns).set(patch).where(eq(campaigns.id, row.id))
    return c.json({ id: row.id, ...patch })
  })

  app.post('/v1/payouts', async (c) => {
    const user = c.get('user')
    if (!user) return c.json({ error: 'Sign in required', code: 'unauthorized' }, 401)
    if (user.role !== 'developer') return c.json({ error: 'Developer account required', code: 'forbidden' }, 403)
    const body = await readBody(c)
    const provider = body.provider
    const destination = body.destination
    const amountCents = body.amountCents
    if (typeof provider !== 'string' || !PROVIDERS.includes(provider as PayoutProviderId)) {
      return c.json({ error: 'Unknown payout provider', code: 'bad_provider' }, 400)
    }
    if (typeof destination !== 'string' || typeof amountCents !== 'number' || !Number.isInteger(amountCents)) {
      return c.json({ error: 'destination and integer amountCents are required', code: 'bad_request' }, 400)
    }
    try {
      const balance = await balanceOf(db, user.id)
      assertPayoutAmount(balance, amountCents, env.payoutMinCents)
      const receipt = settlePayout(
        { provider: provider as PayoutProviderId, amountCents, destination },
        env,
      )
      const payoutId = crypto.randomUUID()
      const now = clock.now()
      await db.transaction(async (tx) => {
        await tx.insert(payouts).values({
          id: payoutId,
          userId: user.id,
          provider: receipt.provider,
          mode: receipt.mode,
          amountCents: receipt.amountCents,
          creditBonusCents: receipt.creditBonusCents,
          creditValueCents: receipt.creditValueCents,
          destination,
          externalId: receipt.externalId,
          detail: receipt.detail,
          status: 'completed',
          createdAtMs: now,
        })
        await tx.insert(ledger).values({
          id: crypto.randomUUID(),
          userId: user.id,
          impressionId: null,
          payoutId,
          kind: 'payout',
          amountCents: -receipt.amountCents,
          createdAtMs: now,
        })
      })
      return c.json({ ...receipt, payoutId, balanceCents: balance - receipt.amountCents })
    } catch (error) {
      if (error instanceof DomainError || error instanceof PayoutProviderError) {
        const status = error.code === 'below_minimum' || error.code === 'insufficient' ? 409 : 400
        return c.json({ error: error.message, code: error.code }, status)
      }
      throw error
    }
  })

  app.post('/v1/ads/request', async (c) => {
    const body = await readBody(c)
    const installId = body.installId
    const surface = body.surface
    const requestNonce = body.requestNonce
    const signedAt = body.signedAt
    const signature = body.signature
    if (
      typeof installId !== 'string' ||
      typeof surface !== 'string' ||
      typeof requestNonce !== 'string' ||
      typeof signature !== 'string' ||
      typeof signedAt !== 'number'
    ) {
      return c.json({ error: 'installId, surface, requestNonce, signedAt, and signature are required', code: 'bad_request' }, 400)
    }
    if (!isSurface(surface)) return c.json({ error: 'Unknown surface', code: 'bad_surface' }, 400)
    if (Math.abs(clock.now() - signedAt) > 60_000) {
      return c.json({ error: 'signedAt is outside the allowed skew', code: 'skew' }, 401)
    }
    if (seenRequests.has(requestNonce)) {
      return c.json({ error: 'Request nonce already used', code: 'replay' }, 409)
    }
    const [install] = await db.select().from(installs).where(eq(installs.id, installId))
    if (!install) return c.json({ error: 'Unknown install', code: 'not_found' }, 404)
    const requestMessage = canonicalAdRequest({ installId, surface, requestNonce, signedAt })
    let deviceKey: Uint8Array
    try {
      deviceKey = b64UrlToBytes(install.devicePublicKey)
    } catch {
      return c.json({ error: 'Stored device key is corrupt', code: 'bad_install' }, 500)
    }
    if (!verifyBytes(b64UrlToBytesOrEmpty(signature), utf8(requestMessage), deviceKey)) {
      return c.json(
        { error: 'Device signature did not verify. Unsigned HTTP requests are not inventory.', code: 'bad_device_signature' },
        401,
      )
    }
    const hits = (requestHits.get(installId) ?? []).filter((at) => clock.now() - at < 60_000)
    if (hits.length >= 60) return c.json({ error: 'Install rate limit exceeded', code: 'rate_limit' }, 429)
    hits.push(clock.now())
    requestHits.set(installId, hits)
    seenRequests.add(requestNonce)
    if (seenRequests.size > 5_000) {
      const [first] = seenRequests
      if (first) seenRequests.delete(first)
    }

    await releaseExpired()

    const active = await db.select().from(campaigns).where(eq(campaigns.status, 'active'))
    const country = typeof body.country === 'string' ? body.country : undefined
    const placement = typeof body.placement === 'string' ? body.placement : placementForSurface(surface)
    const candidates = active.map(toCandidate)
    const winner = runEnglishAuction(candidates, surface, { country, placement })
    if (!winner) return c.json({ error: 'No eligible campaign for this surface', code: 'no_fill' }, 404)
    const campaign = active.find((row) => row.id === winner.campaignId)
    if (!campaign) return c.json({ error: 'Winning campaign disappeared', code: 'no_fill' }, 404)

    const split = splitRevenue(winner.priceCents, developerShareBps)
    const impressionId = crypto.randomUUID()
    const nonce = randomHex(16)
    const expiresAt = new Date(clock.now() + env.impressionTtlMs).toISOString()
    const payload: AdPayload = {
      v: 1,
      impressionId,
      text: campaign.adText,
      advertiser: campaign.advertiserName,
      nonce,
      surface,
      expiresAt,
    }
    // Sign only after the payload passes the string-only parser.
    openSignedPayload(payload, signPayload(payload, signingPrivateKey), signingPublicKey)
    const signatureOut = signPayload(payload, signingPrivateKey)

    const reserved = await db
      .update(campaigns)
      .set({
        reservedCents: sql`${campaigns.reservedCents} + ${winner.priceCents}`,
      })
      .where(
        and(
          eq(campaigns.id, campaign.id),
          sql`${campaigns.budgetCents} - ${campaigns.spentCents} - ${campaigns.reservedCents} >= ${winner.priceCents}`,
        ),
      )
      .returning({ id: campaigns.id })
    if (reserved.length === 0) {
      return c.json({ error: 'Winning campaign ran out of budget', code: 'no_fill' }, 404)
    }

    await db.insert(impressions).values({
      id: impressionId,
      campaignId: campaign.id,
      developerId: install.userId,
      installId: install.id,
      surface,
      nonce,
      adText: campaign.adText,
      priceCents: winner.priceCents,
      developerShareCents: split.developerCents,
      platformShareCents: split.platformCents,
      status: 'served',
      servedAtMs: clock.now(),
      verifiedAtMs: null,
      lastError: null,
    })

    return c.json({
      payload,
      signature: signatureOut,
      attention: { minViewMs: env.minViewMs, minSamples: 3 },
      clearing: {
        priceCents: winner.priceCents,
        developerShareCents: split.developerCents,
        platformShareCents: split.platformCents,
      },
    })
  })

  app.post('/v1/ads/verify', async (c) => {
    const body = await readBody(c)
    const impressionId = body.impressionId
    const signature = body.signature
    const samples = body.samples
    if (typeof impressionId !== 'string' || typeof signature !== 'string' || !Array.isArray(samples)) {
      return c.json({ error: 'impressionId, samples, and signature are required', code: 'bad_request' }, 400)
    }
    const [row] = await db.select().from(impressions).where(eq(impressions.id, impressionId))
    if (!row) return c.json({ error: 'Unknown impression', code: 'not_found' }, 404)
    if (row.status === 'verified') {
      return c.json({ error: 'This impression was already paid', code: 'replay' }, 409)
    }
    if (row.status !== 'served') {
      return c.json({ error: `Impression is ${row.status}`, code: 'closed' }, 409)
    }

    const now = clock.now()
    if (now - asNumber(row.servedAtMs) > env.impressionTtlMs) {
      await closeImpression(row, 'expired', 'expired')
      return c.json({ error: 'Render challenge expired', code: 'expired' }, 422)
    }

    const [install] = await db.select().from(installs).where(eq(installs.id, row.installId))
    if (!install) return c.json({ error: 'Install missing', code: 'bad_install' }, 500)
    const transcript = {
      impressionId: row.id,
      nonce: row.nonce,
      surface: row.surface,
      text: row.adText,
      samples: samples as RenderSample[],
    }

    try {
      validateContinuousView(transcript.samples, row.adText, env.minViewMs)
    } catch (error) {
      const reason = messageOf(error)
      let deviceKey: Uint8Array
      try {
        deviceKey = b64UrlToBytes(install.devicePublicKey)
      } catch {
        return c.json({ error: 'Stored device key is corrupt', code: 'bad_install' }, 500)
      }
      if (reason.includes('read-back') && verifyTranscript(transcript, signature, deviceKey)) {
        await closeImpression(row, 'rejected', 'sample_mismatch')
      } else {
        await db.update(impressions).set({ lastError: reason }).where(eq(impressions.id, row.id))
      }
      return c.json({ error: reason, code: 'bad_samples' }, 422)
    }

    let deviceKey: Uint8Array
    try {
      deviceKey = b64UrlToBytes(install.devicePublicKey)
    } catch {
      return c.json({ error: 'Stored device key is corrupt', code: 'bad_install' }, 500)
    }
    if (!verifyTranscript(transcript, signature, deviceKey)) {
      await db.update(impressions).set({ lastError: 'bad_device_signature' }).where(eq(impressions.id, row.id))
      return c.json(
        {
          error: 'Device signature did not verify. A scripted HTTP request without the install key cannot earn a payout.',
          code: 'bad_proof',
        },
        422,
      )
    }

    if (now - asNumber(row.servedAtMs) < env.minViewMs) {
      await db.update(impressions).set({ lastError: 'view_too_short' }).where(eq(impressions.id, row.id))
      return c.json(
        {
          error: 'Server clock says this view has not been continuous for the attention threshold',
          code: 'view_too_short',
        },
        422,
      )
    }

    const claimed = await db
      .update(impressions)
      .set({ status: 'verified', verifiedAtMs: now, lastError: null })
      .where(and(eq(impressions.id, row.id), eq(impressions.status, 'served')))
      .returning()
    if (claimed.length === 0) {
      return c.json({ error: 'This impression was already paid', code: 'replay' }, 409)
    }

    await db.insert(ledger).values({
      id: crypto.randomUUID(),
      userId: row.developerId,
      impressionId: row.id,
      payoutId: null,
      kind: 'earn',
      amountCents: row.developerShareCents,
      createdAtMs: now,
    })
    await db
      .update(campaigns)
      .set({
        reservedCents: sql`${campaigns.reservedCents} - ${row.priceCents}`,
        spentCents: sql`${campaigns.spentCents} + ${row.priceCents}`,
      })
      .where(eq(campaigns.id, row.campaignId))
    await db.execute(sql`
      UPDATE campaigns
      SET impression_credits = impression_credits - 1,
          status = CASE WHEN impression_credits - 1 <= 0 THEN 'paused' ELSE status END
      WHERE id = ${row.campaignId} AND impression_credits > 0
    `)

    return c.json({
      status: 'verified',
      impressionId: row.id,
      priceCents: row.priceCents,
      developerShareCents: row.developerShareCents,
      platformShareCents: row.platformShareCents,
    })
  })

  async function releaseExpired() {
    const rows = await db.select().from(impressions).where(eq(impressions.status, 'served'))
    for (const row of rows) {
      if (clock.now() - asNumber(row.servedAtMs) > env.impressionTtlMs) {
        await closeImpression(row, 'expired', 'expired')
      }
    }
  }

  async function closeImpression(row: ImpressionRow, status: 'expired' | 'rejected', reason: string) {
    const updated = await db
      .update(impressions)
      .set({ status, lastError: reason })
      .where(and(eq(impressions.id, row.id), eq(impressions.status, 'served')))
      .returning()
    if (updated.length === 0) return
    await db
      .update(campaigns)
      .set({ reservedCents: sql`${campaigns.reservedCents} - ${row.priceCents}` })
      .where(eq(campaigns.id, row.campaignId))
  }

  function preview(rows: Array<typeof campaigns.$inferSelect>, surface: string) {
    const candidates = rows.filter((row) => row.status === 'active').map(toCandidate)
    const winner = runEnglishAuction(candidates, surface, { placement: placementForSurface(surface) })
    if (!winner) return null
    const campaign = rows.find((row) => row.id === winner.campaignId)
    const split = splitRevenue(winner.priceCents, developerShareBps)
    return {
      campaignId: winner.campaignId,
      name: campaign?.name ?? 'Unknown',
      priceCents: winner.priceCents,
      developerShareCents: split.developerCents,
      platformShareCents: split.platformCents,
      secondMaxBidCents: winner.secondMaxBidCents,
    }
  }

  registerCommerce(app, {
    db,
    clock,
    sessionSecret: env.sessionSecret,
    developerShareBps,
  })

  return app
}

function presentImpression(row: ImpressionRow) {
  return {
    id: row.id,
    surface: row.surface,
    adText: row.adText,
    status: row.status,
    priceCents: row.priceCents,
    developerShareCents: row.developerShareCents,
    platformShareCents: row.platformShareCents,
    servedAtMs: asNumber(row.servedAtMs),
    verifiedAtMs: row.verifiedAtMs === null ? null : asNumber(row.verifiedAtMs),
    lastError: row.lastError,
  }
}

function presentCampaign(row: typeof campaigns.$inferSelect) {
  return {
    id: row.id,
    name: row.name,
    advertiserName: row.advertiserName,
    status: row.status,
    text: row.adText,
    maxBidCents: row.maxBidCents,
    budgetCents: row.budgetCents,
    spentCents: row.spentCents,
    reservedCents: row.reservedCents,
    remainingCents: row.budgetCents - row.spentCents - row.reservedCents,
    surfaces: parseSurfaces(row.surfaces),
    placement: row.placement,
    countries: parseSurfaces(row.countries),
    impressionCredits: row.impressionCredits,
    createdAtMs: asNumber(row.createdAtMs),
  }
}

function toCandidate(row: typeof campaigns.$inferSelect): AuctionCandidate {
  return {
    campaignId: row.id,
    maxBidCents: row.maxBidCents,
    budgetRemainingCents: row.budgetCents - row.spentCents - row.reservedCents,
    createdAtMs: asNumber(row.createdAtMs),
    surfaces: parseSurfaces(row.surfaces),
    countries: parseSurfaces(row.countries),
    placement: row.placement,
  }
}

function presentPayout(row: typeof payouts.$inferSelect) {
  return {
    id: row.id,
    provider: row.provider,
    mode: row.mode,
    amountCents: row.amountCents,
    creditBonusCents: row.creditBonusCents,
    creditValueCents: row.creditValueCents,
    destination: row.destination,
    externalId: row.externalId,
    detail: row.detail,
    status: row.status,
    createdAtMs: asNumber(row.createdAtMs),
  }
}

function assertLabel(label: string) {
  if (label.length < 1 || label.length > NAME_MAX) throw new PayloadError('label length')
  for (let i = 0; i < label.length; i++) {
    const code = label.charCodeAt(i)
    if (code < 0x20 || code > 0x7e) throw new PayloadError('label must be printable ASCII')
  }
}

function parseCampaign(body: Record<string, unknown>) {
  const name = body.name
  const advertiserName = body.advertiserName
  const text = body.text
  const maxBidCents = body.maxBidCents
  const budgetCents = body.budgetCents
  const surfaces = body.surfaces
  if (typeof name !== 'string' || typeof advertiserName !== 'string' || typeof text !== 'string') {
    throw new PayloadError('name, advertiserName, and text are required strings')
  }
  assertLabel(name)
  if (advertiserName.length < 1 || advertiserName.length > ADVERTISER_MAX) {
    throw new PayloadError('advertiserName length')
  }
  for (const value of [advertiserName, text]) {
    for (let i = 0; i < value.length; i++) {
      const code = value.charCodeAt(i)
      if (code < 0x20 || code > 0x7e) throw new PayloadError('campaign copy must be a single printable ASCII line')
    }
  }
  if (text.length < 1 || text.length > AD_TEXT_MAX) throw new PayloadError('ad text length')
  if (typeof maxBidCents !== 'number' || typeof budgetCents !== 'number' || !Number.isInteger(maxBidCents) || !Number.isInteger(budgetCents)) {
    throw new PayloadError('bids and budgets are integer cents')
  }
  if (maxBidCents < AUCTION_RESERVE_CENTS) throw new PayloadError('max bid is below the reserve')
  if (budgetCents < maxBidCents) throw new PayloadError('budget must cover at least one max bid')
  if (!Array.isArray(surfaces) || surfaces.length === 0 || surfaces.some((item) => typeof item !== 'string' || !isSurface(item))) {
    throw new PayloadError(`surfaces must be chosen from ${SURFACES.join(', ')}`)
  }
  return {
    name,
    advertiserName,
    text,
    maxBidCents,
    budgetCents,
    surfaces: [...new Set(surfaces)],
  }
}

async function readBody(c: { req: { json(): Promise<unknown> } }): Promise<Record<string, unknown>> {
  try {
    const value = await c.req.json()
    if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>
  } catch {
    // fall through
  }
  return {}
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : 'Invalid request'
}

function b64UrlToBytesOrEmpty(value: string): Uint8Array {
  try {
    return b64UrlToBytes(value)
  } catch {
    return new Uint8Array()
  }
}
