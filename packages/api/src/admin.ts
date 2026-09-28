import { and, eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { isAdminEmail } from './admin-auth.ts'
import {
  advertiserDetail,
  browseTable,
  buildOverview,
  databaseCatalog,
  developerDetail,
  exportCsv,
  isDatabaseTable,
  leadDetail,
  listAdvertisers,
  listCampaigns,
  listDevelopers,
  listLeads,
  listPayouts,
  searchAll,
} from './admin-read.ts'
import { crmSeedAllowed, seedCrmDemo } from './seed-crm.ts'
import { isLeadStatus, isPipelineStage, setLeadStatus } from './crm.ts'
import type { SwagDb } from './db.ts'
import { adminAuditLog, crmAdvertisers, crmNotes, crmTags, payouts, users } from './schema.ts'

type UserRow = typeof users.$inferSelect
type Vars = { user: UserRow | undefined }

const SUBJECTS = new Set(['developer', 'advertiser', 'lead'])

export function registerAdmin(
  app: Hono<{ Variables: Vars }>,
  deps: { db: SwagDb; clock: { now(): number }; adminEmails: readonly string[] },
) {
  const { db, clock } = deps
  let previewSeeded = false

  async function ensurePreviewSeed() {
    if (previewSeeded) return
    if (process.env.VERCEL_ENV !== 'preview' || !crmSeedAllowed()) return
    await seedCrmDemo(db, clock.now())
    previewSeeded = true
  }

  async function allow(c: { get(key: 'user'): UserRow | undefined; json: (body: unknown, status?: number) => Response }): Promise<Response | null> {
    const user = c.get('user')
    if (!user || !isAdminEmail(user.email, deps.adminEmails)) {
      return c.json({ error: 'Not found', code: 'not_found' }, 404)
    }
    await ensurePreviewSeed()
    return null
  }
  app.use('/v1/admin', async (c, next) => {
    const denied = await allow(c)
    if (denied) return denied
    await next()
  })
  app.use('/v1/admin/*', async (c, next) => {
    const denied = await allow(c)
    if (denied) return denied
    await next()
  })

  async function audit(actor: UserRow, action: string, subjectType: string, subjectId: string, detail: Record<string, unknown>) {
    await db.insert(adminAuditLog).values({
      id: crypto.randomUUID(),
      actorUserId: actor.id,
      actorEmail: actor.email,
      action,
      subjectType,
      subjectId,
      detail: JSON.stringify(detail),
      createdAtMs: clock.now(),
    })
  }

  app.get('/v1/admin/overview', async (c) => c.json(await buildOverview(db, clock.now())))

  app.get('/v1/admin/developers', async (c) => {
    const rows = await listDevelopers(db, {
      q: c.req.query('q'),
      country: c.req.query('country'),
      status: c.req.query('status'),
      payout: c.req.query('payout'),
      tool: c.req.query('tool'),
      signup: c.req.query('signup'),
    })
    return c.json({ developers: rows })
  })

  app.get('/v1/admin/developers/:id', async (c) => {
    const row = await developerDetail(db, c.req.param('id'))
    if (!row) return c.json({ error: 'Not found', code: 'not_found' }, 404)
    return c.json(row)
  })

  app.post('/v1/admin/developers/:id/status', async (c) => {
    const actor = c.get('user')
    if (!actor) return c.json({ error: 'Not found', code: 'not_found' }, 404)
    const id = c.req.param('id')
    const body = await readBody(c)
    const status = body.status === 'suspended' ? 'suspended' : body.status === 'active' ? 'active' : ''
    if (!status) return c.json({ error: 'status must be active or suspended', code: 'bad_request' }, 400)
    const [row] = await db.select().from(users).where(and(eq(users.id, id), eq(users.role, 'developer')))
    if (!row) return c.json({ error: 'Not found', code: 'not_found' }, 404)
    await db.update(users).set({ accountStatus: status }).where(eq(users.id, id))
    await audit(actor, status === 'suspended' ? 'developer.suspend' : 'developer.unsuspend', 'developer', id, { status })
    return c.json({ id, status })
  })

  app.get('/v1/admin/advertisers', async (c) => {
    const rows = await listAdvertisers(db, {
      q: c.req.query('q'),
      stage: c.req.query('stage'),
      status: c.req.query('status'),
      country: c.req.query('country'),
    })
    return c.json({ advertisers: rows })
  })

  app.get('/v1/admin/advertisers/:id', async (c) => {
    const row = await advertiserDetail(db, c.req.param('id'))
    if (!row) return c.json({ error: 'Not found', code: 'not_found' }, 404)
    return c.json(row)
  })

  app.post('/v1/admin/advertisers/:id', async (c) => {
    const actor = c.get('user')
    if (!actor) return c.json({ error: 'Not found', code: 'not_found' }, 404)
    const id = c.req.param('id')
    const [row] = await db.select().from(users).where(and(eq(users.id, id), eq(users.role, 'advertiser')))
    if (!row) return c.json({ error: 'Not found', code: 'not_found' }, 404)
    const body = await readBody(c)
    const [current] = await db.select().from(crmAdvertisers).where(eq(crmAdvertisers.userId, id))
    const stage = typeof body.pipelineStage === 'string' ? body.pipelineStage : current?.pipelineStage ?? 'lead'
    if (!isPipelineStage(stage)) return c.json({ error: 'Unknown pipeline stage', code: 'bad_request' }, 400)
    const owner = typeof body.owner === 'string' ? body.owner.trim().slice(0, 120) : current?.owner ?? ''
    const company = typeof body.company === 'string' ? body.company.trim().slice(0, 160) : current?.company ?? ''
    let followUpAtMs = current?.followUpAtMs ?? null
    if (body.followUpAt === null || body.followUpAt === '') followUpAtMs = null
    else if (typeof body.followUpAt === 'string' && body.followUpAt) {
      const parsed = Date.parse(`${body.followUpAt}T00:00:00.000Z`)
      if (!Number.isFinite(parsed)) return c.json({ error: 'followUpAt must be a YYYY-MM-DD date', code: 'bad_request' }, 400)
      followUpAtMs = parsed
    }
    const next = { pipelineStage: stage, owner, company, followUpAtMs }
    if (current) await db.update(crmAdvertisers).set(next).where(eq(crmAdvertisers.userId, id))
    else await db.insert(crmAdvertisers).values({ userId: id, ...next })
    await audit(actor, 'advertiser.pipeline', 'advertiser', id, {
      pipelineStage: stage,
      owner,
      followUpAt: followUpAtMs ? new Date(followUpAtMs).toISOString().slice(0, 10) : null,
    })
    return c.json({ id, ...next, pipelineLabel: stage })
  })

  app.get('/v1/admin/leads', async (c) => {
    const rows = await listLeads(db, clock.now(), c.req.query('status'))
    return c.json({ leads: rows })
  })

  app.get('/v1/admin/leads/:id', async (c) => {
    const row = await leadDetail(db, c.req.param('id'), clock.now())
    if (!row) return c.json({ error: 'Not found', code: 'not_found' }, 404)
    return c.json(row)
  })

  app.post('/v1/admin/leads/:id/status', async (c) => {
    const actor = c.get('user')
    if (!actor) return c.json({ error: 'Not found', code: 'not_found' }, 404)
    const body = await readBody(c)
    const status = typeof body.status === 'string' ? body.status : ''
    if (!isLeadStatus(status)) return c.json({ error: 'Unknown lead status', code: 'bad_request' }, 400)
    const ok = await setLeadStatus(db, c.req.param('id'), status, clock.now())
    if (!ok) return c.json({ error: 'Not found', code: 'not_found' }, 404)
    await audit(actor, 'lead.status', 'lead', c.req.param('id'), { status })
    return c.json({ id: c.req.param('id'), status })
  })

  app.get('/v1/admin/campaigns', async (c) => {
    const rows = await listCampaigns(db, { q: c.req.query('q'), status: c.req.query('status') })
    return c.json({ campaigns: rows })
  })

  app.get('/v1/admin/payouts', async (c) => {
    const rows = await listPayouts(db, {
      status: c.req.query('status'),
      provider: c.req.query('provider'),
      reviewed: c.req.query('reviewed'),
    })
    return c.json({ payouts: rows })
  })

  app.post('/v1/admin/payouts/:id/review', async (c) => {
    const actor = c.get('user')
    if (!actor) return c.json({ error: 'Not found', code: 'not_found' }, 404)
    const id = c.req.param('id')
    const [row] = await db.select().from(payouts).where(eq(payouts.id, id))
    if (!row) return c.json({ error: 'Not found', code: 'not_found' }, 404)
    const now = clock.now()
    await db.update(payouts).set({ reviewedAtMs: now, reviewedBy: actor.email }).where(eq(payouts.id, id))
    await audit(actor, 'payout.review', 'payout', id, { reviewed: true })
    return c.json({ id, reviewedAtMs: now })
  })

  app.post('/v1/admin/notes', async (c) => {
    const actor = c.get('user')
    if (!actor) return c.json({ error: 'Not found', code: 'not_found' }, 404)
    const body = await readBody(c)
    const subjectType = typeof body.subjectType === 'string' ? body.subjectType : ''
    const subjectId = typeof body.subjectId === 'string' ? body.subjectId : ''
    const note = typeof body.body === 'string' ? body.body.trim() : ''
    if (!SUBJECTS.has(subjectType) || !subjectId) return c.json({ error: 'Unknown subject', code: 'bad_request' }, 400)
    if (note.length < 1 || note.length > 2000) return c.json({ error: 'Note must be 1 to 2000 characters', code: 'bad_request' }, 400)
    const id = crypto.randomUUID()
    await db.insert(crmNotes).values({
      id,
      subjectType,
      subjectId,
      authorId: actor.id,
      body: note,
      createdAtMs: clock.now(),
    })
    await audit(actor, 'note.add', subjectType, subjectId, { noteId: id })
    return c.json({ id }, 201)
  })

  app.post('/v1/admin/tags', async (c) => {
    const actor = c.get('user')
    if (!actor) return c.json({ error: 'Not found', code: 'not_found' }, 404)
    const body = await readBody(c)
    const subjectType = typeof body.subjectType === 'string' ? body.subjectType : ''
    const subjectId = typeof body.subjectId === 'string' ? body.subjectId : ''
    const tag = typeof body.tag === 'string' ? body.tag.trim().toLowerCase() : ''
    if (!SUBJECTS.has(subjectType) || !subjectId) return c.json({ error: 'Unknown subject', code: 'bad_request' }, 400)
    if (!/^[a-z0-9-]{1,40}$/.test(tag)) return c.json({ error: 'Tags use lowercase letters, numbers, and hyphens', code: 'bad_request' }, 400)
    const id = crypto.randomUUID()
    await db
      .insert(crmTags)
      .values({ id, subjectType, subjectId, tag, authorId: actor.id, createdAtMs: clock.now() })
      .onConflictDoNothing()
    await audit(actor, `${subjectType}.tag`, subjectType, subjectId, { tag })
    return c.json({ tag }, 201)
  })

  app.post('/v1/admin/tags/remove', async (c) => {
    const actor = c.get('user')
    if (!actor) return c.json({ error: 'Not found', code: 'not_found' }, 404)
    const body = await readBody(c)
    const subjectType = typeof body.subjectType === 'string' ? body.subjectType : ''
    const subjectId = typeof body.subjectId === 'string' ? body.subjectId : ''
    const tag = typeof body.tag === 'string' ? body.tag.trim().toLowerCase() : ''
    if (!SUBJECTS.has(subjectType) || !subjectId || !tag) return c.json({ error: 'Unknown subject', code: 'bad_request' }, 400)
    await db.delete(crmTags).where(and(eq(crmTags.subjectType, subjectType), eq(crmTags.subjectId, subjectId), eq(crmTags.tag, tag)))
    await audit(actor, 'tag.remove', subjectType, subjectId, { tag })
    return c.json({ removed: tag })
  })

  app.get('/v1/admin/database', async (c) => c.json(await databaseCatalog(db)))

  app.get('/v1/admin/database/:table', async (c) => {
    const name = c.req.param('table')
    if (!isDatabaseTable(name)) return c.json({ error: 'Not found', code: 'not_found' }, 404)
    const page = Number(c.req.query('page') ?? '1')
    return c.json(await browseTable(db, name, page))
  })

  app.get('/v1/admin/search', async (c) => {
    const q = c.req.query('q') ?? ''
    return c.json(await searchAll(db, q, clock.now()))
  })

  app.get('/v1/admin/export/:kind', async (c) => {
    const url = new URL(c.req.url)
    const file = await exportCsv(db, c.req.param('kind'), url.searchParams, clock.now())
    if (!file) return c.json({ error: 'Not found', code: 'not_found' }, 404)
    return new Response(file.body, {
      status: 200,
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': `attachment; filename="${file.filename}"`,
        'x-robots-tag': 'noindex',
      },
    })
  })
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
