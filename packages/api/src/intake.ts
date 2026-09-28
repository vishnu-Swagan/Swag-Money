import { and, eq, isNull } from 'drizzle-orm'
import { Hono } from 'hono'
import { randomBytes } from 'node:crypto'
import {
  isEmail,
  validateContact,
  validatePrivacyRequest,
  validateSetup,
} from '@swag-money/shared'
import { isAdminEmail } from './admin-mask.ts'
import type { SwagDb } from './db.ts'
import { isSuspended } from './flags.ts'
import { recordLead } from './leads.ts'
import { notifyAdvertiserSignup } from './notify.ts'
import { hashApiKey } from './passwords.ts'
import { contactMessages, magicLinks, privacyRequests, users } from './schema.ts'
import { signSession } from './session.ts'

type UserRow = typeof users.$inferSelect
type Vars = { user: UserRow | undefined }

const DELETION_HOLD_MS = 30 * 24 * 60 * 60 * 1000

export function registerIntake(
  app: Hono<{ Variables: Vars }>,
  deps: {
    db: SwagDb
    clock: { now(): number }
    sessionSecret: string
    allowDemo: boolean
    adminEmails?: readonly string[]
    notifyAdvertiserSignups?: boolean
    notifyTo?: string
  },
) {
  const { db, clock, sessionSecret, allowDemo } = deps

  app.post('/v1/auth/google', async (c) => {
    const body = await readBody(c)
    if (body.adult !== true) return c.json({ error: 'Confirm that you are 18 or older and agree to the terms.', code: 'bad_request' }, 400)
    return c.json({ error: 'Google sign-in is not connected in this build. Use an email link.', code: 'not_configured' }, 501)
  })

  app.post('/v1/auth/magic-link', async (c) => {
    const body = await readBody(c)
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
    if (!isEmail(email)) return c.json({ error: 'Enter a valid email.', code: 'bad_request' }, 400)
    const role = body.role === 'advertiser' ? 'advertiser' : 'developer'
    if (role === 'developer' && body.adult !== true) {
      return c.json({ error: 'Confirm that you are 18 or older and agree to the terms.', code: 'bad_request' }, 400)
    }
    const [existing] = await db.select().from(users).where(eq(users.email, email))
    if (!existing) {
      const local = email.split('@')[0]?.replace(/[^A-Za-z0-9 ._-]/g, '').slice(0, 60) || 'Developer'
      const id = crypto.randomUUID()
      await db.insert(users).values({
        id,
        email,
        name: local,
        role,
        passwordHash: '',
        signupMethod: 'email',
        ageConfirmed: role === 'developer' ? 1 : 0,
        setupComplete: role === 'advertiser' ? 1 : 0,
        createdAtMs: clock.now(),
      })
      await recordLead(db, {
        source: 'signup',
        sourceId: id,
        name: local,
        email,
        topic: role,
        body: '',
        createdAtMs: clock.now(),
      })
      if (role === 'advertiser') {
        await notifyAdvertiserSignup(db, {
          enabled: deps.notifyAdvertiserSignups === true,
          toEmail: deps.notifyTo ?? '',
          advertiserEmail: email,
          name: local,
          now: clock.now(),
        })
      }
    } else if (body.role === 'advertiser' && existing.role !== 'advertiser') {
      return c.json({ error: 'That email belongs to a developer account.', code: 'conflict' }, 409)
    } else if (role === 'developer' && existing.ageConfirmed !== 1) {
      await db.update(users).set({ ageConfirmed: 1 }).where(eq(users.id, existing.id))
    }
    const token = `sm_link_${randomBytes(24).toString('hex')}`
    await db.insert(magicLinks).values({
      id: crypto.randomUUID(),
      email,
      tokenHash: hashApiKey(token),
      createdAtMs: clock.now(),
      consumedAtMs: null,
    })
    return c.json({
      sent: true,
      delivery: 'mock',
      detail: 'No mail was sent. This build stores the link locally.',
      ...(allowDemo ? { devToken: token } : {}),
    })
  })

  app.post('/v1/auth/magic-link/consume', async (c) => {
    const body = await readBody(c)
    const token = typeof body.token === 'string' ? body.token : ''
    if (!token.startsWith('sm_link_')) return c.json({ error: 'That sign-in link is not valid.', code: 'bad_request' }, 400)
    const [link] = await db
      .select()
      .from(magicLinks)
      .where(and(eq(magicLinks.tokenHash, hashApiKey(token)), isNull(magicLinks.consumedAtMs)))
    if (!link) return c.json({ error: 'That sign-in link has expired or was already used.', code: 'unauthorized' }, 401)
    const [user] = await db.select().from(users).where(eq(users.email, link.email))
    if (!user) return c.json({ error: 'That sign-in link has expired or was already used.', code: 'unauthorized' }, 401)
    if ((await isSuspended(db, user.id)) && !isAdminEmail(user.email, deps.adminEmails ?? [])) {
      return c.json({ error: 'This account is suspended.', code: 'forbidden' }, 403)
    }
    await db.update(magicLinks).set({ consumedAtMs: clock.now() }).where(eq(magicLinks.id, link.id))
    return c.json({
      token: signSession(user.id, sessionSecret),
      user: presentUser(user),
    })
  })

  app.post('/v1/auth/setup', async (c) => {
    const user = c.get('user')
    if (!user) return c.json({ error: 'Sign in required', code: 'unauthorized' }, 401)
    const body = await readBody(c)
    const parsed = validateSetup({
      country: body.country,
      newsOptIn: body.newsOptIn === true,
      payoutPreference: body.payoutPreference,
    })
    if (!parsed.ok) return c.json({ error: Object.values(parsed.errors)[0], errors: parsed.errors, code: 'bad_request' }, 400)
    await db
      .update(users)
      .set({
        residenceCountry: parsed.value.country,
        newsOptIn: parsed.value.newsOptIn ? 1 : 0,
        payoutPreference: parsed.value.payoutPreference,
        setupComplete: 1,
        ageConfirmed: 1,
      })
      .where(eq(users.id, user.id))
    const [next] = await db.select().from(users).where(eq(users.id, user.id))
    return c.json({ user: presentUser(next ?? user) })
  })

  app.post('/v1/account/deletion', async (c) => {
    const user = c.get('user')
    if (!user) return c.json({ error: 'Sign in required', code: 'unauthorized' }, 401)
    const body = await readBody(c)
    if (body.action === 'reactivate') {
      await db.update(users).set({ deletionScheduledAtMs: null }).where(eq(users.id, user.id))
      return c.json({ deletionScheduledAtMs: null })
    }
    if (body.action === 'keep') {
      return c.json({ deletionScheduledAtMs: user.deletionScheduledAtMs })
    }
    if (body.action !== 'schedule') return c.json({ error: 'Unknown deletion action', code: 'bad_request' }, 400)
    const at = clock.now() + DELETION_HOLD_MS
    await db.update(users).set({ deletionScheduledAtMs: at }).where(eq(users.id, user.id))
    return c.json({ deletionScheduledAtMs: at })
  })

  app.post('/v1/privacy-requests', async (c) => {
    const body = await readBody(c)
    const user = c.get('user')
    const parsed = validatePrivacyRequest({
      kind: body.kind,
      email: body.email,
      region: body.region,
      details: body.details,
      authorizedAgent: body.authorizedAgent === true,
      honeypot: body.companyWebsite,
      path: body.path,
    })
    if (!parsed.ok) return c.json({ error: Object.values(parsed.errors)[0] ?? 'Check the form', errors: parsed.errors, code: 'bad_request' }, 400)
    if ('discarded' in parsed) return c.json({ accepted: true, stored: false })
    if (parsed.value.path === 'session') {
      if (!user) return c.json({ error: 'Sign in to verify this request, or choose email verification.', errors: { path: 'Sign in required' }, code: 'unauthorized' }, 401)
      if (user.email !== parsed.value.email) {
        return c.json({ error: 'Use the email on this account, or choose email verification.', errors: { email: 'Email does not match the signed-in account' }, code: 'bad_request' }, 400)
      }
    }
    const privacyId = crypto.randomUUID()
    await db.insert(privacyRequests).values({
      id: privacyId,
      userId: parsed.value.path === 'session' ? user?.id ?? null : null,
      kind: parsed.value.kind,
      email: parsed.value.email,
      region: parsed.value.region,
      details: parsed.value.details,
      authorizedAgent: parsed.value.authorizedAgent ? 1 : 0,
      verification: parsed.value.path === 'session' ? 'session' : 'email_pending',
      createdAtMs: clock.now(),
    })
    await recordLead(db, {
      source: 'privacy',
      sourceId: privacyId,
      name: '',
      email: parsed.value.email,
      topic: parsed.value.kind,
      body: parsed.value.details,
      createdAtMs: clock.now(),
    })
    return c.json({
      accepted: true,
      stored: true,
      verification: parsed.value.path === 'session' ? 'session' : 'email_pending',
      detail:
        parsed.value.kind === 'do-not-sell'
          ? 'Recorded. Swag-Money does not sell or share personal data. The opt-out is stored anyway.'
          : 'Recorded. This build does not send mail. Email verification stays pending until an operator confirms it.',
    }, 201)
  })

  app.post('/v1/contact', async (c) => {
    const body = await readBody(c)
    const parsed = validateContact({
      name: body.name,
      email: body.email,
      topic: body.topic,
      message: body.message,
      honeypot: body.companyWebsite,
    })
    if (!parsed.ok) {
      return c.json({ error: Object.values(parsed.errors)[0] ?? 'Check the form', errors: parsed.errors, code: 'bad_request' }, 400)
    }
    if ('discarded' in parsed) return c.json({ accepted: true, stored: false })
    const contactId = crypto.randomUUID()
    await db.insert(contactMessages).values({
      id: contactId,
      name: parsed.value.name,
      email: parsed.value.email,
      topic: parsed.value.topic,
      message: parsed.value.message,
      createdAtMs: clock.now(),
    })
    await recordLead(db, {
      source: parsed.value.topic === 'advertiser' ? 'advertiser_form' : 'contact',
      sourceId: contactId,
      name: parsed.value.name,
      email: parsed.value.email,
      topic: parsed.value.topic,
      body: parsed.value.message,
      createdAtMs: clock.now(),
    })
    return c.json({ accepted: true, stored: true, detail: 'Stored locally. No mail was sent.' }, 201)
  })
}

function presentUser(user: UserRow) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    setupComplete: user.setupComplete === 1,
    residenceCountry: user.residenceCountry,
    newsOptIn: user.newsOptIn === 1,
    payoutPreference: user.payoutPreference,
    ageConfirmed: user.ageConfirmed === 1,
    deletionScheduledAtMs: user.deletionScheduledAtMs,
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
