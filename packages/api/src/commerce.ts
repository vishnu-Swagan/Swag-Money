import { eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { PayloadError } from '@swag-money/crypto'
import {
  ADVERTISER_MAX,
  AD_TEXT_MAX,
  DomainError,
  NAME_MAX,
  isSurface,
  normalizeCountries,
  quoteImpressionBlocks,
  validateBuyPayload,
  type Surface,
} from '@swag-money/shared'
import { notifyAdvertiserSignup, recordLead } from './crm.ts'
import type { SwagDb } from './db.ts'
import { generateApiKey, hashPassword, verifyPassword } from './passwords.ts'
import { apiKeys, campaigns, checkouts, impressions, ledger, users } from './schema.ts'
import { signSession } from './session.ts'

type UserRow = typeof users.$inferSelect
type Vars = { user: UserRow | undefined }

export type CommerceDeps = {
  db: SwagDb
  clock: { now(): number }
  sessionSecret: string
  developerShareBps: number
}

const OPENAPI = {
  openapi: '3.1.0',
  info: {
    title: 'Swag-Money advertiser API',
    version: '0.2.0',
    description:
      'Create impression-block campaigns and read delivery stats. Authenticate with Authorization: Bearer sm_test_… . This build mocks card checkout and never calls a payment network.',
  },
  paths: {
    '/v1/checkout': { post: { summary: 'Buy impression blocks with a mocked card charge' } },
    '/v1/advertiser/v1/campaigns': { get: { summary: 'List campaigns for the key owner' } },
    '/v1/advertiser/v1/stats': { get: { summary: 'Spend and verified impressions for the key owner' } },
    '/v1/advertiser/api-keys': { post: { summary: 'Create a key. The secret is returned once.' } },
    '/v1/public/stats': { get: { summary: 'Public ledger totals. Computed, never a constant.' } },
  },
}

export function registerCommerce(app: Hono<{ Variables: Vars }>, deps: CommerceDeps) {
  const { db, clock, sessionSecret, developerShareBps } = deps

  app.get('/v1/public/stats', async (c) => {
    const [impressionRows, ledgerRows, userRows] = await Promise.all([
      db.select({ status: impressions.status }).from(impressions),
      db.select({ kind: ledger.kind, amountCents: ledger.amountCents }).from(ledger),
      db.select({ role: users.role }).from(users),
    ])
    const developerEarningsCents = ledgerRows
      .filter((row) => row.kind === 'earn' && row.amountCents > 0)
      .reduce((sum, row) => sum + row.amountCents, 0)
    const paidOutCents = ledgerRows
      .filter((row) => row.kind === 'payout')
      .reduce((sum, row) => sum + Math.abs(row.amountCents), 0)
    return c.json({
      verifiedImpressions: impressionRows.filter((row) => row.status === 'verified').length,
      developerEarningsCents,
      paidOutCents,
      developerCount: userRows.filter((row) => row.role === 'developer').length,
      advertiserCount: userRows.filter((row) => row.role === 'advertiser').length,
      developerShareBps,
      source: 'ledger',
    })
  })

  app.get('/v1/advertiser/openapi.json', (c) => c.json(OPENAPI))

  app.post('/v1/auth/signup', async (c) => {
    const body = await readBody(c)
    try {
      const email = assertEmail(body.email)
      const name = assertName(body.name)
      const password = assertPassword(body.password)
      const role = body.role === 'advertiser' ? 'advertiser' : body.role === 'developer' ? 'developer' : null
      if (!role) return c.json({ error: 'role must be developer or advertiser', code: 'bad_request' }, 400)
      const id = crypto.randomUUID()
      const createdAtMs = clock.now()
      await db.insert(users).values({
        id,
        email,
        name,
        role,
        passwordHash: hashPassword(password),
        setupComplete: 0,
        signupMethod: 'password',
        createdAtMs,
      })
      await recordLead(db, {
        kind: 'signup',
        sourceId: id,
        name,
        email,
        summary: `${role} account created with a password`,
        createdAtMs,
      })
      if (role === 'advertiser') await notifyAdvertiserSignup(db, { email, name, at: createdAtMs })
      return c.json({ token: signSession(id, sessionSecret), user: { id, email, name, role, setupComplete: false } }, 201)
    } catch (error) {
      const message = messageOf(error)
      if (/unique|duplicate/i.test(message)) {
        return c.json({ error: 'An account with that email already exists', code: 'conflict' }, 409)
      }
      return c.json({ error: message, code: 'bad_request' }, 400)
    }
  })

  app.post('/v1/auth/login', async (c) => {
    const body = await readBody(c)
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
    const password = typeof body.password === 'string' ? body.password : ''
    const [user] = await db.select().from(users).where(eq(users.email, email))
    if (!user || !user.passwordHash || !verifyPassword(password, user.passwordHash)) {
      return c.json({ error: 'Email or password is wrong', code: 'unauthorized' }, 401)
    }
    return c.json({
      token: signSession(user.id, sessionSecret),
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        setupComplete: user.setupComplete === 1,
      },
    })
  })

  app.post('/v1/checkout', (c) => checkout(c, deps))
  app.post('/v1/advertiser/v1/checkout', (c) => checkout(c, deps))

  app.post('/v1/advertiser/api-keys', async (c) => {
    const user = advertiser(c)
    if (user instanceof Response) return user
    const body = await readBody(c)
    const label = typeof body.label === 'string' && body.label.trim() ? body.label.trim().slice(0, 40) : 'default'
    const minted = generateApiKey()
    const id = crypto.randomUUID()
    await db.insert(apiKeys).values({
      id,
      advertiserId: user.id,
      prefix: minted.prefix,
      keyHash: minted.hash,
      label,
      createdAtMs: clock.now(),
      revokedAtMs: null,
    })
    return c.json({ id, prefix: minted.prefix, label, key: minted.key }, 201)
  })

  app.get('/v1/advertiser/api-keys', async (c) => {
    const user = advertiser(c)
    if (user instanceof Response) return user
    const rows = await db.select().from(apiKeys).where(eq(apiKeys.advertiserId, user.id))
    return c.json({
      keys: rows.map((row) => ({
        id: row.id,
        prefix: row.prefix,
        label: row.label,
        createdAtMs: asNumber(row.createdAtMs),
        revoked: row.revokedAtMs !== null,
      })),
    })
  })

  app.get('/v1/advertiser/v1/campaigns', async (c) => {
    const user = advertiser(c)
    if (user instanceof Response) return user
    const rows = await db.select().from(campaigns).where(eq(campaigns.advertiserId, user.id))
    return c.json({
      campaigns: rows.map((row) => ({
        id: row.id,
        name: row.name,
        text: row.adText,
        status: row.status,
        placement: row.placement,
        countries: parseList(row.countries),
        surfaces: parseList(row.surfaces),
        destinationUrl: row.destinationUrl,
        budgetCents: row.budgetCents,
        spentCents: row.spentCents,
        impressionCredits: row.impressionCredits,
        maxBidCents: row.maxBidCents,
      })),
    })
  })

  app.get('/v1/advertiser/v1/stats', async (c) => {
    const user = advertiser(c)
    if (user instanceof Response) return user
    const mine = await db.select().from(campaigns).where(eq(campaigns.advertiserId, user.id))
    const ids = new Set(mine.map((row) => row.id))
    const rows = await db.select().from(impressions)
    const relevant = rows.filter((row) => ids.has(row.campaignId))
    return c.json({
      campaigns: mine.length,
      verifiedImpressions: relevant.filter((row) => row.status === 'verified').length,
      spentCents: mine.reduce((sum, row) => sum + row.spentCents, 0),
    })
  })

}

async function checkout(c: { get(key: 'user'): UserRow | undefined; req: { json(): Promise<unknown> }; json: (body: unknown, status?: number) => Response }, deps: CommerceDeps) {
  const user = c.get('user')
  if (!user) return c.json({ error: 'Sign in required', code: 'unauthorized' }, 401)
  if (user.role !== 'advertiser') return c.json({ error: 'Advertiser account required', code: 'forbidden' }, 403)
  const body = await readBody(c)
  try {
    const strict = body.strict === true || body.acknowledgeDelivery !== undefined
    const created = strict ? parseStrictCheckout(body) : parseCheckout(body)
    const quote = quoteImpressionBlocks({
      blocks: created.blocks,
      bidPerBlockCents: created.bidPerBlockCents,
      countryCount: created.countries.length,
    })
    const campaignId = crypto.randomUUID()
    const checkoutId = crypto.randomUUID()
    const now = deps.clock.now()
    await deps.db.insert(campaigns).values({
      id: campaignId,
      advertiserId: user.id,
      name: created.name,
      advertiserName: created.advertiserName,
      status: 'active',
      adText: created.text,
      maxBidCents: quote.maxBidCents,
      budgetCents: quote.budgetCents,
      spentCents: 0,
      reservedCents: 0,
      surfaces: JSON.stringify(created.surfaces),
      placement: created.placement,
      countries: JSON.stringify(created.countries),
      destinationUrl: created.destinationUrl,
      impressionCredits: quote.impressionCredits,
      companyName: created.companyName,
      brandIcon: created.brandIcon,
      pace: created.pace,
      emailInvoice: created.emailInvoice ? 1 : 0,
      createdAtMs: now,
    })
    await deps.db.insert(checkouts).values({
      id: checkoutId,
      advertiserId: user.id,
      campaignId,
      blocks: quote.blocks,
      bidPerBlockCents: quote.bidPerBlockCents,
      countrySurchargeCents: quote.countrySurchargeCents,
      totalCents: quote.totalCents,
      status: 'paid',
      provider: 'mock_card',
      mode: 'mock',
      pace: created.pace,
      emailInvoice: created.emailInvoice ? 1 : 0,
      createdAtMs: now,
    })
    await recordLead(deps.db, {
      kind: 'advertiser',
      sourceId: checkoutId,
      name: user.name,
      email: user.email,
      company: created.companyName,
      country: user.residenceCountry,
      summary: `Bought ${quote.blocks} impression block${quote.blocks === 1 ? '' : 's'} · ${created.text}`,
      createdAtMs: now,
    })
    return c.json(
      {
        checkoutId,
        campaignId,
        mode: 'mock',
        provider: 'mock_card',
        totalCents: quote.totalCents,
        countrySurchargeCents: quote.countrySurchargeCents,
        budgetCents: quote.budgetCents,
        maxBidCents: quote.maxBidCents,
        impressionCredits: quote.impressionCredits,
        estimatedImpressionsAtMaxBid: quote.estimatedImpressionsAtMaxBid,
        placement: created.placement,
        countries: created.countries,
        surfaces: created.surfaces,
        pace: created.pace,
        forecast: created.forecast,
        detail: created.emailInvoice
          ? 'Mock card charge recorded locally. A tax invoice was noted. No mail was sent and no payment network was contacted.'
          : 'Mock card charge recorded locally. No payment network was contacted.',
      },
      201,
    )
  } catch (error) {
    if (error instanceof CheckoutInputError) {
      return c.json({ error: error.message, errors: error.errors, code: 'bad_request' }, 400)
    }
    const status = error instanceof DomainError || error instanceof PayloadError ? 400 : 400
    return c.json({ error: messageOf(error), code: error instanceof DomainError ? error.code : 'bad_request' }, status)
  }
}

class CheckoutInputError extends Error {
  readonly errors: Record<string, string>
  constructor(errors: Record<string, string>) {
    super(Object.values(errors)[0] ?? 'Check the form')
    this.errors = errors
  }
}

function parseStrictCheckout(body: Record<string, unknown>) {
  const parsed = validateBuyPayload({
    text: body.text,
    destinationUrl: body.destinationUrl,
    companyName: body.companyName,
    brandIconDataUrl: body.brandIconDataUrl,
    emailInvoice: body.emailInvoice === true,
    blocks: body.blocks,
    bid: body.bid,
    placement: body.placement,
    tool: body.tool,
    pace: body.pace,
    audience: body.audience,
    countries: body.countries,
    acknowledgeDelivery: body.acknowledgeDelivery === true,
  })
  if (!parsed.ok) throw new CheckoutInputError(parsed.errors)
  return {
    name: parsed.value.name,
    advertiserName: parsed.value.advertiserName,
    text: parsed.value.text,
    destinationUrl: parsed.value.destinationUrl,
    blocks: parsed.value.blocks,
    bidPerBlockCents: parsed.value.bidPerBlockCents,
    surfaces: parsed.value.surfaces,
    countries: parsed.value.countries,
    placement: parsed.value.placement,
    companyName: parsed.value.companyName,
    brandIcon: parsed.value.brandIconDataUrl,
    pace: parsed.value.pace,
    emailInvoice: parsed.value.emailInvoice,
    forecast: parsed.value.forecast,
  }
}

function advertiser(c: { get(key: 'user'): UserRow | undefined; json: (body: unknown, status?: number) => Response }): UserRow | Response {
  const user = c.get('user')
  if (!user) return c.json({ error: 'Sign in required', code: 'unauthorized' }, 401)
  if (user.role !== 'advertiser') return c.json({ error: 'Advertiser account required', code: 'forbidden' }, 403)
  return user
}

function parseCheckout(body: Record<string, unknown>) {
  const name = body.name
  const advertiserName = body.advertiserName
  const text = body.text
  const destinationUrl = body.destinationUrl
  const blocks = body.blocks
  const bidPerBlockCents = body.bidPerBlockCents
  const surfaces = body.surfaces
  const placement = body.placement
  if (typeof name !== 'string' || typeof advertiserName !== 'string' || typeof text !== 'string') {
    throw new PayloadError('name, advertiserName, and text are required strings')
  }
  if (name.length < 1 || name.length > NAME_MAX) throw new PayloadError('name length')
  if (advertiserName.length < 1 || advertiserName.length > ADVERTISER_MAX) throw new PayloadError('advertiserName length')
  if (text.length < 1 || text.length > AD_TEXT_MAX) throw new PayloadError('ad text length')
  for (const value of [name, advertiserName, text]) assertAscii(value)
  if (typeof destinationUrl !== 'string') throw new PayloadError('destinationUrl is required')
  const url = assertHttps(destinationUrl)
  if (typeof blocks !== 'number' || typeof bidPerBlockCents !== 'number') {
    throw new PayloadError('blocks and bidPerBlockCents must be integers')
  }
  if (!Array.isArray(surfaces) || surfaces.length === 0 || surfaces.some((item) => typeof item !== 'string' || !isSurface(item))) {
    throw new PayloadError('surfaces must be known tool ids')
  }
  let countries: string[] = []
  if (body.countries !== undefined) {
    if (!Array.isArray(body.countries) || body.countries.some((item) => typeof item !== 'string')) {
      throw new PayloadError('countries must be an array of codes')
    }
    try {
      countries = normalizeCountries(body.countries)
    } catch (error) {
      throw new PayloadError(messageOf(error))
    }
  }
  const uniqueSurfaces = [...new Set(surfaces)] as Surface[]
  const resolvedPlacement =
    placement === 'terminal' || placement === 'editor' || placement === 'browser' || placement === 'any'
      ? placement
      : 'any'
  return {
    name,
    advertiserName,
    text,
    destinationUrl: url,
    blocks,
    bidPerBlockCents,
    surfaces: uniqueSurfaces,
    countries,
    placement: resolvedPlacement,
    companyName: advertiserName,
    brandIcon: '',
    pace: 'medium' as const,
    emailInvoice: false,
    forecast: null,
  }
}

function assertHttps(value: string): string {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new PayloadError('destinationUrl must be an https URL')
  }
  if (url.protocol !== 'https:') throw new PayloadError('destinationUrl must be an https URL')
  if (value.length > 500) throw new PayloadError('destinationUrl is too long')
  return value
}

function assertAscii(value: string) {
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i)
    if (code < 0x20 || code > 0x7e) throw new PayloadError('campaign copy must be a single printable ASCII line')
  }
}

function assertEmail(value: unknown): string {
  if (typeof value !== 'string') throw new PayloadError('email is required')
  const email = value.trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 120) throw new PayloadError('email is invalid')
  return email
}

function assertName(value: unknown): string {
  if (typeof value !== 'string' || value.length < 1 || value.length > NAME_MAX) throw new PayloadError('name length')
  assertAscii(value)
  return value
}

function assertPassword(value: unknown): string {
  if (typeof value !== 'string' || value.length < 8 || value.length > 200) {
    throw new PayloadError('password must be 8 to 200 characters')
  }
  return value
}

function parseList(value: string): string[] {
  try {
    const parsed = JSON.parse(value) as unknown
    if (!Array.isArray(parsed) || parsed.some((item) => typeof item !== 'string')) return []
    return parsed
  } catch {
    return []
  }
}

function asNumber(value: unknown): number {
  const number = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(number) ? number : 0
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
