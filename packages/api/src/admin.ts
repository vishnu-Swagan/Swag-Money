import { and, count, desc, eq, sql } from 'drizzle-orm'
import type { Context, Hono } from 'hono'
import {
  isAdminEmail,
  isLeadStatus,
  isPipelineStage,
  maskDestination,
  maskEmail,
  toCsv,
  type PipelineStage,
} from './admin-mask.ts'
import type { SwagDb } from './db.ts'
import { recordLead } from './leads.ts'
import { SCHEMA_VERSION } from './migration-sql.ts'
import {
  adminAuditLog,
  advertiserCrm,
  campaigns,
  checkouts,
  contactMessages,
  crmNotes,
  crmTags,
  impressions,
  installs,
  leads,
  ledger,
  payouts,
  privacyRequests,
  schemaMigrations,
  userFlags,
  users,
} from './schema.ts'

type UserRow = typeof users.$inferSelect
type AdminApp = Hono<{ Variables: { user: UserRow | undefined } }>

const PAGE_SIZE = 25
const EXPORT_CAP = 5000
const SECRET_FIELDS = new Set([
  'passwordHash',
  'keyHash',
  'tokenHash',
  'devicePublicKey',
  'brandIcon',
])

export function registerAdmin(
  app: AdminApp,
  deps: {
    db: SwagDb
    clock: { now(): number }
    adminEmails: readonly string[]
    notifyAdvertiserSignups: boolean
    notifyTo: string
  },
) {
  const { db, clock } = deps

  const gate = async (c: Context<{ Variables: { user: UserRow | undefined } }>, next: () => Promise<void>) => {
    const user = c.get('user')
    if (!user || !isAdminEmail(user.email, deps.adminEmails)) {
      return c.json({ error: 'Not found' }, 404)
    }
    await next()
  }
  app.use('/v1/admin', gate)
  app.use('/v1/admin/*', gate)

  async function audit(actor: UserRow, action: string, subjectType: string, subjectId: string, detail: string) {
    await db.insert(adminAuditLog).values({
      id: crypto.randomUUID(),
      actorId: actor.id,
      actorEmail: actor.email,
      action,
      subjectType,
      subjectId,
      detail,
      createdAtMs: clock.now(),
    })
  }

  app.get('/v1/admin/me', (c) => {
    const user = c.get('user')
    if (!user) return c.json({ error: 'Not found' }, 404)
    return c.json({ id: user.id, email: user.email, name: user.name })
  })

  app.get('/v1/admin/overview', async (c) => {
    const people = await db.select().from(users)
    const impressionRows = await db.select().from(impressions)
    const installRows = await db.select().from(installs)
    const ledgerRows = await db.select().from(ledger)
    const payoutRows = await db.select().from(payouts)
    const checkoutRows = await db.select().from(checkouts)
    const now = clock.now()
    const day = 86_400_000
    const developers = people.filter((row) => row.role === 'developer')
    const advertisers = people.filter((row) => row.role === 'advertiser')
    const signupCount = (role: string, since: number) =>
      people.filter((row) => row.role === role && asNumber(row.createdAtMs) >= since).length
    const days = Array.from({ length: 30 }, (_, index) => {
      const start = startOfUtcDay(now) - (29 - index) * day
      const end = start + day
      const inDay = people.filter((row) => {
        const at = asNumber(row.createdAtMs)
        return at >= start && at < end
      })
      return {
        day: new Date(start).toISOString().slice(0, 10),
        developers: inDay.filter((row) => row.role === 'developer').length,
        advertisers: inDay.filter((row) => row.role === 'advertiser').length,
      }
    })
    const tools = new Map<string, number>()
    for (const row of installRows) tools.set(row.label, (tools.get(row.label) ?? 0) + 1)
    const earnings = ledgerRows.filter((row) => row.kind === 'earn').reduce((sum, row) => sum + row.amountCents, 0)
    const paid = payoutRows.filter((row) => row.status === 'completed').reduce((sum, row) => sum + row.amountCents, 0)
    const owed = ledgerRows.reduce((sum, row) => sum + row.amountCents, 0)
    const pending = payoutRows.filter((row) => row.status !== 'completed' && row.status !== 'failed').length
    return c.json({
      developers: developers.length,
      advertisers: advertisers.length,
      signups: {
        today: {
          developers: signupCount('developer', startOfUtcDay(now)),
          advertisers: signupCount('advertiser', startOfUtcDay(now)),
        },
        days7: {
          developers: signupCount('developer', now - 7 * day),
          advertisers: signupCount('advertiser', now - 7 * day),
        },
        days30: {
          developers: signupCount('developer', now - 30 * day),
          advertisers: signupCount('advertiser', now - 30 * day),
        },
        series: days,
      },
      integrations: [...tools.entries()]
        .map(([tool, count]) => ({ tool, count }))
        .sort((a, b) => b.count - a.count || a.tool.localeCompare(b.tool)),
      impressionsServed: impressionRows.length,
      verifiedViews: impressionRows.filter((row) => row.status === 'verified').length,
      advertiserSpendCents: checkoutRows.reduce((sum, row) => sum + row.totalCents, 0),
      developerEarningsCents: earnings,
      developerPaidCents: paid,
      developerOwedCents: owed,
      pendingPayouts: pending,
      database: await databaseHealth(db),
    })
  })

  app.get('/v1/admin/developers', async (c) => {
    const rows = filterDevelopers(await loadDevelopers(db), c).map(conceal)
    return c.json(page(rows, queryPage(c)))
  })

  app.get('/v1/admin/developers/:id', async (c) => {
    const id = c.req.param('id')
    const [user] = await db.select().from(users).where(eq(users.id, id))
    if (!user || user.role !== 'developer') return c.json({ error: 'Not found' }, 404)
    const detail = conceal((await loadDevelopers(db)).find((row) => row.id === id)!)
    if (!detail.id) return c.json({ error: 'Not found' }, 404)
    const noteRows = await db.select().from(crmNotes).where(and(eq(crmNotes.subjectType, 'developer'), eq(crmNotes.subjectId, id)))
    const tagRows = await db.select().from(crmTags).where(and(eq(crmTags.subjectType, 'developer'), eq(crmTags.subjectId, id)))
    const installRows = await db.select().from(installs).where(eq(installs.userId, id))
    const payoutRows = await db.select().from(payouts).where(eq(payouts.userId, id))
    const impressionRows = await db.select().from(impressions).where(eq(impressions.developerId, id))
    const audits = await db
      .select()
      .from(adminAuditLog)
      .where(and(eq(adminAuditLog.subjectType, 'developer'), eq(adminAuditLog.subjectId, id)))
    const timeline = [
      { at: asNumber(user.createdAtMs), kind: 'signup', label: `Signed up by ${detail.signupMethod}` },
      ...installRows.map((row) => ({ at: asNumber(row.createdAtMs), kind: 'install', label: `Integration installed: ${row.label}` })),
      ...payoutRows.map((row) => ({
        at: asNumber(row.createdAtMs),
        kind: 'payout',
        label: `${row.provider} payout ${money(row.amountCents)} to ${row.destination} (${row.mode}, ${row.status})`,
      })),
      ...noteRows.map((row) => ({ at: asNumber(row.createdAtMs), kind: 'note', label: row.body })),
      ...audits.map((row) => ({ at: asNumber(row.createdAtMs), kind: 'admin', label: `${row.action}: ${row.detail}` })),
    ].sort((a, b) => b.at - a.at)
    return c.json({
      ...detail,
      email: user.email,
      payoutDestination: latestDestination(payoutRows),
      notes: noteRows
        .map((row) => ({ id: row.id, body: row.body, at: asNumber(row.createdAtMs) }))
        .sort((a, b) => b.at - a.at),
      tags: tagRows.map((row) => row.tag).sort(),
      timeline,
      fraud: fraudOf(impressionRows),
      payouts: payoutRows
        .map((row) => ({
          id: row.id,
          provider: row.provider,
          mode: row.mode,
          amountCents: row.amountCents,
          destination: row.destination,
          status: row.status,
          at: asNumber(row.createdAtMs),
        }))
        .sort((a, b) => b.at - a.at),
    })
  })

  app.post('/v1/admin/notes', async (c) => {
    const actor = c.get('user')
    if (!actor) return c.json({ error: 'Not found' }, 404)
    const body = await readBody(c)
    const subjectType = body.subjectType === 'advertiser' || body.subjectType === 'developer' || body.subjectType === 'lead' ? body.subjectType : ''
    const subjectId = typeof body.subjectId === 'string' ? body.subjectId : ''
    const text = typeof body.body === 'string' ? body.body.trim() : ''
    if (!subjectType || !subjectId) return c.json({ error: 'subjectType and subjectId are required', code: 'bad_request' }, 400)
    if (text.length < 1 || text.length > 2000) return c.json({ error: 'Note must be 1 to 2000 characters', code: 'bad_request' }, 400)
    if (!(await subjectExists(db, subjectType, subjectId))) return c.json({ error: 'Not found' }, 404)
    const id = crypto.randomUUID()
    await db.insert(crmNotes).values({
      id,
      subjectType,
      subjectId,
      authorId: actor.id,
      body: text,
      createdAtMs: clock.now(),
    })
    await audit(actor, 'note', subjectType, subjectId, text.slice(0, 180))
    return c.json({ id }, 201)
  })

  app.post('/v1/admin/tags', async (c) => {
    const actor = c.get('user')
    if (!actor) return c.json({ error: 'Not found' }, 404)
    const body = await readBody(c)
    const subjectType = body.subjectType === 'advertiser' || body.subjectType === 'developer' || body.subjectType === 'lead' ? body.subjectType : ''
    const subjectId = typeof body.subjectId === 'string' ? body.subjectId : ''
    const tag = typeof body.tag === 'string' ? body.tag.trim().toLowerCase() : ''
    const remove = body.remove === true
    if (!subjectType || !subjectId) return c.json({ error: 'subjectType and subjectId are required', code: 'bad_request' }, 400)
    if (!/^[a-z0-9][a-z0-9 -]{0,39}$/.test(tag)) return c.json({ error: 'Tag must be 1 to 40 letters, numbers, spaces, or hyphens', code: 'bad_request' }, 400)
    if (!(await subjectExists(db, subjectType, subjectId))) return c.json({ error: 'Not found' }, 404)
    const [existing] = await db
      .select()
      .from(crmTags)
      .where(and(eq(crmTags.subjectType, subjectType), eq(crmTags.subjectId, subjectId), eq(crmTags.tag, tag)))
      .limit(1)
    if (remove) {
      if (existing) {
        await db.delete(crmTags).where(eq(crmTags.id, existing.id))
        await audit(actor, 'untag', subjectType, subjectId, tag)
      }
      return c.json({ tag, removed: Boolean(existing) })
    }
    if (!existing) {
      await db.insert(crmTags).values({
        id: crypto.randomUUID(),
        subjectType,
        subjectId,
        tag,
        createdAtMs: clock.now(),
      })
      await audit(actor, 'tag', subjectType, subjectId, tag)
    }
    return c.json({ tag }, existing ? 200 : 201)
  })

  app.post('/v1/admin/developers/:id/suspend', async (c) => {
    const actor = c.get('user')
    if (!actor) return c.json({ error: 'Not found' }, 404)
    const id = c.req.param('id')
    const [user] = await db.select().from(users).where(eq(users.id, id))
    if (!user || user.role !== 'developer') return c.json({ error: 'Not found' }, 404)
    const body = await readBody(c)
    if (typeof body.suspended !== 'boolean') return c.json({ error: 'suspended must be true or false', code: 'bad_request' }, 400)
    if (isAdminEmail(user.email, deps.adminEmails) && body.suspended) {
      return c.json({ error: 'Refusing to suspend an admin account', code: 'bad_request' }, 400)
    }
    await upsertFlags(db, id, { suspended: body.suspended ? 1 : 0 }, clock.now())
    await audit(actor, body.suspended ? 'suspend' : 'unsuspend', 'developer', id, user.email)
    return c.json({ id, suspended: body.suspended })
  })

  app.post('/v1/admin/developers/:id/payout-review', async (c) => {
    const actor = c.get('user')
    if (!actor) return c.json({ error: 'Not found' }, 404)
    const id = c.req.param('id')
    const [user] = await db.select().from(users).where(eq(users.id, id))
    if (!user || user.role !== 'developer') return c.json({ error: 'Not found' }, 404)
    const body = await readBody(c)
    const reviewed = body.reviewed !== false
    await upsertFlags(db, id, { payoutReviewed: reviewed ? 1 : 0 }, clock.now())
    await audit(actor, reviewed ? 'payout_reviewed' : 'payout_review_cleared', 'developer', id, user.email)
    return c.json({ id, payoutReviewed: reviewed })
  })

  app.get('/v1/admin/advertisers', async (c) => {
    const rows = filterAdvertisers(await loadAdvertisers(db), c).map(conceal)
    return c.json(page(rows, queryPage(c)))
  })

  app.get('/v1/admin/advertisers/:id', async (c) => {
    const id = c.req.param('id')
    const found = (await loadAdvertisers(db)).find((item) => item.id === id)
    if (!found) return c.json({ error: 'Not found' }, 404)
    const row = conceal(found)
    const [user] = await db.select().from(users).where(eq(users.id, id))
    if (!user) return c.json({ error: 'Not found' }, 404)
    const campaignRows = await db.select().from(campaigns).where(eq(campaigns.advertiserId, id))
    const checkoutRows = await db.select().from(checkouts).where(eq(checkouts.advertiserId, id))
    const [profile] = await db.select().from(advertiserCrm).where(eq(advertiserCrm.userId, id))
    const noteRows = await db.select().from(crmNotes).where(and(eq(crmNotes.subjectType, 'advertiser'), eq(crmNotes.subjectId, id)))
    const tagRows = await db.select().from(crmTags).where(and(eq(crmTags.subjectType, 'advertiser'), eq(crmTags.subjectId, id)))
    return c.json({
      ...row,
      email: user.email,
      contact: user.name,
      ownerEmail: profile?.ownerEmail ?? '',
      notes: noteRows.map((note) => ({ id: note.id, body: note.body, at: asNumber(note.createdAtMs) })).sort((a, b) => b.at - a.at),
      tags: tagRows.map((tag) => tag.tag).sort(),
      campaignRows: campaignRows
        .map((campaign) => ({
          id: campaign.id,
          name: campaign.name,
          status: campaign.status,
          adText: campaign.adText,
          destinationUrl: campaign.destinationUrl,
          placement: campaign.placement,
          countries: parseList(campaign.countries),
          surfaces: parseList(campaign.surfaces),
          maxBidCents: campaign.maxBidCents,
          budgetCents: campaign.budgetCents,
          spentCents: campaign.spentCents,
          pace: campaign.pace,
          impressionCredits: campaign.impressionCredits,
          createdAtMs: asNumber(campaign.createdAtMs),
        }))
        .sort((a, b) => b.createdAtMs - a.createdAtMs),
      invoices: checkoutRows
        .map((checkout) => ({
          id: checkout.id,
          campaignId: checkout.campaignId,
          blocks: checkout.blocks,
          totalCents: checkout.totalCents,
          status: checkout.status,
          provider: checkout.provider,
          mode: checkout.mode,
          emailInvoice: checkout.emailInvoice === 1,
          mock: checkout.mode !== 'live',
          createdAtMs: asNumber(checkout.createdAtMs),
        }))
        .sort((a, b) => b.createdAtMs - a.createdAtMs),
    })
  })

  app.post('/v1/admin/advertisers/:id/pipeline', async (c) => {
    const actor = c.get('user')
    if (!actor) return c.json({ error: 'Not found' }, 404)
    const id = c.req.param('id')
    const [user] = await db.select().from(users).where(eq(users.id, id))
    if (!user || user.role !== 'advertiser') return c.json({ error: 'Not found' }, 404)
    const body = await readBody(c)
    const stage = typeof body.stage === 'string' ? body.stage : ''
    if (!isPipelineStage(stage)) return c.json({ error: 'Unknown pipeline stage', code: 'bad_request' }, 400)
    const [existing] = await db.select().from(advertiserCrm).where(eq(advertiserCrm.userId, id))
    const ownerEmail = 'ownerEmail' in body
      ? (typeof body.ownerEmail === 'string' ? body.ownerEmail.trim().toLowerCase() : '')
      : (existing?.ownerEmail ?? '')
    if (ownerEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ownerEmail)) {
      return c.json({ error: 'Owner must be an email or blank', code: 'bad_request' }, 400)
    }
    let followUpAtMs = existing?.followUpAtMs ?? null
    if ('followUpAt' in body) {
      const follow = body.followUpAt
      if (typeof follow === 'string' && follow.trim()) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(follow.trim())) return c.json({ error: 'Follow-up must be YYYY-MM-DD', code: 'bad_request' }, 400)
        followUpAtMs = Date.parse(`${follow.trim()}T00:00:00.000Z`)
        if (!Number.isFinite(followUpAtMs)) return c.json({ error: 'Follow-up date is not valid', code: 'bad_request' }, 400)
      } else {
        followUpAtMs = null
      }
    }
    if (existing) {
      await db
        .update(advertiserCrm)
        .set({ stage, ownerEmail, followUpAtMs, updatedAtMs: clock.now() })
        .where(eq(advertiserCrm.userId, id))
    } else {
      await db.insert(advertiserCrm).values({
        userId: id,
        stage,
        ownerEmail,
        followUpAtMs,
        updatedAtMs: clock.now(),
      })
    }
    await audit(actor, 'pipeline', 'advertiser', id, `${stage}${ownerEmail ? ` owner ${ownerEmail}` : ''}`)
    return c.json({ id, stage, ownerEmail, followUpAtMs })
  })

  app.get('/v1/admin/leads', async (c) => {
    await syncLeads(db)
    const rows = filterLeads(await loadLeads(db), c).map(conceal)
    return c.json(page(rows, queryPage(c)))
  })

  app.post('/v1/admin/leads/:id/status', async (c) => {
    const actor = c.get('user')
    if (!actor) return c.json({ error: 'Not found' }, 404)
    const id = c.req.param('id')
    const [lead] = await db.select().from(leads).where(eq(leads.id, id))
    if (!lead) return c.json({ error: 'Not found' }, 404)
    const body = await readBody(c)
    const status = typeof body.status === 'string' ? body.status : ''
    if (!isLeadStatus(status)) return c.json({ error: 'Unknown lead status', code: 'bad_request' }, 400)
    await db.update(leads).set({ status }).where(eq(leads.id, id))
    await audit(actor, 'lead_status', 'lead', id, `${lead.status} -> ${status}`)
    return c.json({ id, status })
  })

  app.get('/v1/admin/campaigns', async (c) => {
    const rows = filterCampaigns(await loadCampaigns(db), c)
    return c.json(page(rows, queryPage(c)))
  })

  app.get('/v1/admin/payouts', async (c) => {
    const rows = filterPayouts(await loadPayouts(db), c)
    return c.json(page(rows, queryPage(c)))
  })

  app.get('/v1/admin/database', async (c) => {
    const tables = await Promise.all(
      BROWSER.map(async (entry) => ({ name: entry.name, title: entry.title, count: await tally(db, entry.name) })),
    )
    return c.json({ tables, migrationVersion: await migrationVersion(db) })
  })

  app.get('/v1/admin/database/:table', async (c) => {
    const name = c.req.param('table')
    const entry = BROWSER.find((item) => item.name === name)
    if (!entry) return c.json({ error: 'Not found' }, 404)
    const total = await tally(db, name)
    const pageNumber = queryPage(c)
    const rows = (await entry.load(db, (pageNumber - 1) * PAGE_SIZE, PAGE_SIZE)).map((row) => presentBrowserRow(row, entry.mask))
    return c.json({ table: name, title: entry.title, columns: rows[0] ? Object.keys(rows[0]) : entry.columns, ...page(rows, pageNumber, total) })
  })

  app.get('/v1/admin/search', async (c) => {
    const q = (c.req.query('q') ?? '').trim().toLowerCase()
    if (q.length < 1) return c.json({ developers: [], advertisers: [], leads: [] })
    await syncLeads(db)
    const developers = (await loadDevelopers(db)).filter((row) => row.needle.includes(q)).slice(0, 20).map(conceal)
    const advertisers = (await loadAdvertisers(db)).filter((row) => row.needle.includes(q)).slice(0, 20).map(conceal)
    const leadRows = (await loadLeads(db)).filter((row) => row.needle.includes(q)).slice(0, 20).map(conceal)
    return c.json({ developers, advertisers, leads: leadRows })
  })

  app.get('/v1/admin/export/:kind', async (c) => {
    const kind = c.req.param('kind')
    const built = await csvFor(db, kind, c)
    if (!built) return c.json({ error: 'Not found' }, 404)
    return new Response(built.body, {
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': `attachment; filename="${kind}.csv"`,
        'x-robots-tag': 'noindex',
      },
    })
  })
}

async function csvFor(db: SwagDb, kind: string, c: Context): Promise<{ body: string } | null> {
  if (kind === 'developers') {
    const rows = filterDevelopers(await loadDevelopers(db), c).slice(0, EXPORT_CAP)
    return {
      body: toCsv(
        ['name', 'email', 'country', 'signup', 'method', 'payout', 'tools', 'impressions', 'verified', 'earnings_cents', 'balance_cents', 'last_active', 'status'],
        rows.map((row) => [
          row.name,
          row.email,
          row.country,
          row.signupAt,
          row.signupMethod,
          row.payoutMethod,
          row.tools.join(' '),
          row.impressions,
          row.verified,
          row.earningsCents,
          row.balanceCents,
          row.lastActiveAt,
          row.status,
        ]),
      ),
    }
  }
  if (kind === 'advertisers') {
    const rows = filterAdvertisers(await loadAdvertisers(db), c).slice(0, EXPORT_CAP)
    return {
      body: toCsv(
        ['company', 'contact', 'email', 'country', 'stage', 'campaigns', 'spend_cents', 'blocks', 'status', 'created'],
        rows.map((row) => [row.company, row.contact, row.email, row.country, row.stage, row.campaigns, row.spendCents, row.blocks, row.status, row.createdAt]),
      ),
    }
  }
  if (kind === 'leads') {
    await syncLeads(db)
    const rows = filterLeads(await loadLeads(db), c).slice(0, EXPORT_CAP)
    return {
      body: toCsv(
        ['source', 'name', 'email', 'topic', 'status', 'created', 'body'],
        rows.map((row) => [row.source, row.name, row.email, row.topic, row.status, row.createdAt, row.body]),
      ),
    }
  }
  if (kind === 'campaigns') {
    const rows = filterCampaigns(await loadCampaigns(db), c).slice(0, EXPORT_CAP)
    return {
      body: toCsv(
        ['name', 'company', 'email', 'status', 'bid_cents', 'budget_cents', 'spent_cents', 'verified', 'created'],
        rows.map((row) => [row.name, row.company, row.email, row.status, row.maxBidCents, row.budgetCents, row.spentCents, row.verified, row.createdAt]),
      ),
    }
  }
  if (kind === 'payouts') {
    const rows = filterPayouts(await loadPayouts(db), c).slice(0, EXPORT_CAP)
    return {
      body: toCsv(
        ['developer', 'email', 'provider', 'mode', 'amount_cents', 'destination', 'status', 'created'],
        rows.map((row) => [row.developer, row.email, row.provider, row.mode, row.amountCents, row.destination, row.status, row.createdAt]),
      ),
    }
  }
  const entry = BROWSER.find((item) => item.name === kind)
  if (!entry) return null
  const rows = (await entry.load(db, 0, EXPORT_CAP)).map((row) => presentBrowserRow(row, entry.mask))
  const columns = rows[0] ? Object.keys(rows[0]) : entry.columns
  return { body: toCsv(columns, rows.map((row) => columns.map((column) => String(row[column] ?? '')))) }
}

type DeveloperListRow = {
  id: string
  name: string
  email: string
  country: string
  signupAt: number
  signupMethod: string
  payoutMethod: string
  tools: string[]
  impressions: number
  verified: number
  earningsCents: number
  balanceCents: number
  lastActiveAt: number
  status: string
  payoutReviewed: boolean
  needle: string
}

async function loadDevelopers(db: SwagDb): Promise<DeveloperListRow[]> {
  const people = await db.select().from(users).where(eq(users.role, 'developer'))
  const installRows = await db.select().from(installs)
  const impressionRows = await db.select().from(impressions)
  const ledgerRows = await db.select().from(ledger)
  const payoutRows = await db.select().from(payouts)
  const flags = await db.select().from(userFlags)
  return people
    .map((user) => {
      const mineInstalls = installRows.filter((row) => row.userId === user.id)
      const mineImpressions = impressionRows.filter((row) => row.developerId === user.id)
      const mineLedger = ledgerRows.filter((row) => row.userId === user.id)
      const minePayouts = payoutRows.filter((row) => row.userId === user.id)
      const flag = flags.find((row) => row.userId === user.id)
      const earnings = mineLedger.filter((row) => row.kind === 'earn').reduce((sum, row) => sum + row.amountCents, 0)
      const lastActive = Math.max(
        asNumber(user.createdAtMs),
        ...mineInstalls.map((row) => asNumber(row.createdAtMs)),
        ...mineImpressions.map((row) => asNumber(row.servedAtMs)),
        ...minePayouts.map((row) => asNumber(row.createdAtMs)),
      )
      const status = flag?.suspended === 1 ? 'suspended' : user.deletionScheduledAtMs ? 'deletion scheduled' : 'active'
      return {
        id: user.id,
        name: user.name,
        email: maskEmail(user.email),
        country: user.residenceCountry,
        signupAt: asNumber(user.createdAtMs),
        signupMethod: user.signupMethod === 'google' ? 'Google' : 'Email',
        payoutMethod: user.payoutPreference || latestProvider(minePayouts) || '',
        tools: [...new Set(mineInstalls.map((row) => row.label))].sort(),
        impressions: mineImpressions.length,
        verified: mineImpressions.filter((row) => row.status === 'verified').length,
        earningsCents: earnings,
        balanceCents: mineLedger.reduce((sum, row) => sum + row.amountCents, 0),
        lastActiveAt: lastActive,
        status,
        payoutReviewed: flag?.payoutReviewed === 1,
        needle: `${user.name} ${user.email} ${user.residenceCountry} ${mineInstalls.map((row) => row.label).join(' ')}`.toLowerCase(),
      }
    })
    .sort((a, b) => b.signupAt - a.signupAt)
}

function filterDevelopers(rows: DeveloperListRow[], c: Context): DeveloperListRow[] {
  const q = (c.req.query('q') ?? '').trim().toLowerCase()
  const country = (c.req.query('country') ?? '').trim().toLowerCase()
  const status = (c.req.query('status') ?? '').trim().toLowerCase()
  const payout = (c.req.query('payout') ?? '').trim().toLowerCase()
  return rows.filter((row) => {
    if (q && !row.needle.includes(q)) return false
    if (country && row.country.toLowerCase() !== country) return false
    if (status && row.status !== status) return false
    if (payout && row.payoutMethod.toLowerCase() !== payout) return false
    return true
  })
}

type AdvertiserListRow = {
  id: string
  company: string
  contact: string
  email: string
  country: string
  campaigns: number
  spendCents: number
  blocks: number
  status: string
  stage: PipelineStage
  ownerEmail: string
  followUpAt: number | null
  createdAt: number
  needle: string
}

async function loadAdvertisers(db: SwagDb): Promise<AdvertiserListRow[]> {
  const people = await db.select().from(users).where(eq(users.role, 'advertiser'))
  const campaignRows = await db.select().from(campaigns)
  const checkoutRows = await db.select().from(checkouts)
  const crm = await db.select().from(advertiserCrm)
  const flags = await db.select().from(userFlags)
  return people
    .map((user) => {
      const mine = campaignRows.filter((row) => row.advertiserId === user.id)
      const orders = checkoutRows.filter((row) => row.advertiserId === user.id)
      const profile = crm.find((row) => row.userId === user.id)
      const flag = flags.find((row) => row.userId === user.id)
      const company = mine.find((row) => row.companyName)?.companyName || mine[0]?.advertiserName || user.name
      const stage = profile && isPipelineStage(profile.stage) ? profile.stage : 'lead'
      return {
        id: user.id,
        company,
        contact: user.name,
        email: maskEmail(user.email),
        country: user.residenceCountry,
        campaigns: mine.length,
        spendCents: orders.reduce((sum, row) => sum + row.totalCents, 0),
        blocks: orders.reduce((sum, row) => sum + row.blocks, 0),
        status: flag?.suspended === 1 ? 'suspended' : 'active',
        stage,
        ownerEmail: profile?.ownerEmail ? maskEmail(profile.ownerEmail) : '',
        followUpAt: profile?.followUpAtMs ? asNumber(profile.followUpAtMs) : null,
        createdAt: asNumber(user.createdAtMs),
        needle: `${company} ${user.name} ${user.email} ${user.residenceCountry}`.toLowerCase(),
      }
    })
    .sort((a, b) => b.createdAt - a.createdAt)
}

function filterAdvertisers(rows: AdvertiserListRow[], c: Context): AdvertiserListRow[] {
  const q = (c.req.query('q') ?? '').trim().toLowerCase()
  const stage = (c.req.query('stage') ?? '').trim().toLowerCase()
  const status = (c.req.query('status') ?? '').trim().toLowerCase()
  return rows.filter((row) => {
    if (q && !row.needle.includes(q)) return false
    if (stage && row.stage !== stage) return false
    if (status && row.status !== status) return false
    return true
  })
}

type LeadListRow = {
  id: string
  source: string
  name: string
  email: string
  topic: string
  body: string
  status: string
  createdAt: number
  needle: string
}

async function loadLeads(db: SwagDb): Promise<LeadListRow[]> {
  const rows = await db.select().from(leads)
  return rows
    .map((row) => ({
      id: row.id,
      source: row.source,
      name: row.name,
      email: maskEmail(row.email),
      topic: row.topic,
      body: row.body,
      status: row.status,
      createdAt: asNumber(row.createdAtMs),
      needle: `${row.name} ${row.email} ${row.topic} ${row.body} ${row.source}`.toLowerCase(),
    }))
    .sort((a, b) => b.createdAt - a.createdAt)
}

function filterLeads(rows: LeadListRow[], c: Context): LeadListRow[] {
  const q = (c.req.query('q') ?? '').trim().toLowerCase()
  const status = (c.req.query('status') ?? '').trim().toLowerCase()
  const source = (c.req.query('source') ?? '').trim().toLowerCase()
  return rows.filter((row) => {
    if (q && !row.needle.includes(q)) return false
    if (status && row.status !== status) return false
    if (source && row.source !== source) return false
    return true
  })
}

async function syncLeads(db: SwagDb): Promise<void> {
  const people = await db.select().from(users)
  for (const user of people) {
    await recordLead(db, {
      source: 'signup',
      sourceId: user.id,
      name: user.name,
      email: user.email,
      topic: user.role,
      body: '',
      createdAtMs: asNumber(user.createdAtMs),
    })
  }
  const messages = await db.select().from(contactMessages)
  for (const message of messages) {
    await recordLead(db, {
      source: message.topic === 'advertiser' ? 'advertiser_form' : 'contact',
      sourceId: message.id,
      name: message.name,
      email: message.email,
      topic: message.topic,
      body: message.message,
      createdAtMs: asNumber(message.createdAtMs),
    })
  }
  const requests = await db.select().from(privacyRequests)
  for (const request of requests) {
    await recordLead(db, {
      source: 'privacy',
      sourceId: request.id,
      name: '',
      email: request.email,
      topic: request.kind,
      body: request.details,
      createdAtMs: asNumber(request.createdAtMs),
    })
  }
}

type CampaignListRow = {
  id: string
  name: string
  company: string
  email: string
  status: string
  surfaces: string[]
  maxBidCents: number
  budgetCents: number
  spentCents: number
  verified: number
  createdAt: number
}

async function loadCampaigns(db: SwagDb): Promise<CampaignListRow[]> {
  const rows = await db.select().from(campaigns)
  const people = await db.select().from(users)
  const impressionRows = await db.select().from(impressions)
  return rows
    .map((row) => {
      const owner = people.find((user) => user.id === row.advertiserId)
      return {
        id: row.id,
        name: row.name,
        company: row.companyName || row.advertiserName,
        email: owner ? maskEmail(owner.email) : '',
        status: row.status,
        surfaces: parseList(row.surfaces),
        maxBidCents: row.maxBidCents,
        budgetCents: row.budgetCents,
        spentCents: row.spentCents,
        verified: impressionRows.filter((impression) => impression.campaignId === row.id && impression.status === 'verified').length,
        createdAt: asNumber(row.createdAtMs),
      }
    })
    .sort((a, b) => b.createdAt - a.createdAt)
}

function filterCampaigns(rows: CampaignListRow[], c: Context): CampaignListRow[] {
  const q = (c.req.query('q') ?? '').trim().toLowerCase()
  const status = (c.req.query('status') ?? '').trim().toLowerCase()
  return rows.filter((row) => {
    if (q && !hit(q, row.name, row.company, row.email, row.surfaces.join(' '))) return false
    if (status && row.status !== status) return false
    return true
  })
}

type PayoutListRow = {
  id: string
  developer: string
  email: string
  provider: string
  mode: string
  amountCents: number
  destination: string
  status: string
  createdAt: number
}

async function loadPayouts(db: SwagDb): Promise<PayoutListRow[]> {
  const rows = await db.select().from(payouts)
  const people = await db.select().from(users)
  return rows
    .map((row) => {
      const user = people.find((person) => person.id === row.userId)
      return {
        id: row.id,
        developer: user?.name ?? '',
        email: user ? maskEmail(user.email) : '',
        provider: row.provider,
        mode: row.mode,
        amountCents: row.amountCents,
        destination: maskDestination(row.destination, row.provider),
        status: row.status,
        createdAt: asNumber(row.createdAtMs),
      }
    })
    .sort((a, b) => b.createdAt - a.createdAt)
}

function filterPayouts(rows: PayoutListRow[], c: Context): PayoutListRow[] {
  const q = (c.req.query('q') ?? '').trim().toLowerCase()
  const status = (c.req.query('status') ?? '').trim().toLowerCase()
  const provider = (c.req.query('provider') ?? '').trim().toLowerCase()
  return rows.filter((row) => {
    if (q && !hit(q, row.developer, row.email, row.destination, row.provider)) return false
    if (status && row.status !== status) return false
    if (provider && row.provider !== provider) return false
    return true
  })
}

const BROWSER: Array<{
  name: string
  title: string
  columns: string[]
  mask: string[]
  load: (db: SwagDb, offset: number, limit: number) => Promise<Array<Record<string, unknown>>>
}> = [
  { name: 'users', title: 'Users', columns: ['id', 'email', 'name', 'role', 'residenceCountry', 'payoutPreference', 'signupMethod', 'createdAtMs'], mask: ['email'], load: (db, offset, limit) => rowsOf(db.select().from(users).orderBy(desc(users.createdAtMs)).limit(limit).offset(offset)) },
  { name: 'installs', title: 'Installs', columns: ['id', 'userId', 'label', 'createdAtMs'], mask: [], load: (db, offset, limit) => rowsOf(db.select({ id: installs.id, userId: installs.userId, label: installs.label, createdAtMs: installs.createdAtMs }).from(installs).orderBy(desc(installs.createdAtMs)).limit(limit).offset(offset)) },
  { name: 'campaigns', title: 'Campaigns', columns: ['id', 'name', 'advertiserName', 'status', 'adText', 'maxBidCents', 'budgetCents', 'spentCents', 'createdAtMs'], mask: [], load: (db, offset, limit) => rowsOf(db.select({ id: campaigns.id, name: campaigns.name, advertiserName: campaigns.advertiserName, status: campaigns.status, adText: campaigns.adText, maxBidCents: campaigns.maxBidCents, budgetCents: campaigns.budgetCents, spentCents: campaigns.spentCents, createdAtMs: campaigns.createdAtMs }).from(campaigns).orderBy(desc(campaigns.createdAtMs)).limit(limit).offset(offset)) },
  { name: 'impressions', title: 'Impressions', columns: ['id', 'campaignId', 'developerId', 'surface', 'status', 'priceCents', 'servedAtMs', 'lastError'], mask: [], load: (db, offset, limit) => rowsOf(db.select({ id: impressions.id, campaignId: impressions.campaignId, developerId: impressions.developerId, surface: impressions.surface, status: impressions.status, priceCents: impressions.priceCents, servedAtMs: impressions.servedAtMs, lastError: impressions.lastError }).from(impressions).orderBy(desc(impressions.servedAtMs)).limit(limit).offset(offset)) },
  { name: 'ledger', title: 'Ledger', columns: ['id', 'userId', 'kind', 'amountCents', 'createdAtMs'], mask: [], load: (db, offset, limit) => rowsOf(db.select({ id: ledger.id, userId: ledger.userId, kind: ledger.kind, amountCents: ledger.amountCents, createdAtMs: ledger.createdAtMs }).from(ledger).orderBy(desc(ledger.createdAtMs)).limit(limit).offset(offset)) },
  { name: 'payouts', title: 'Payouts', columns: ['id', 'userId', 'provider', 'mode', 'amountCents', 'destination', 'status', 'createdAtMs'], mask: ['destination'], load: (db, offset, limit) => rowsOf(db.select({ id: payouts.id, userId: payouts.userId, provider: payouts.provider, mode: payouts.mode, amountCents: payouts.amountCents, destination: payouts.destination, status: payouts.status, createdAtMs: payouts.createdAtMs }).from(payouts).orderBy(desc(payouts.createdAtMs)).limit(limit).offset(offset)) },
  { name: 'checkouts', title: 'Checkouts', columns: ['id', 'advertiserId', 'blocks', 'totalCents', 'status', 'provider', 'mode', 'createdAtMs'], mask: [], load: (db, offset, limit) => rowsOf(db.select({ id: checkouts.id, advertiserId: checkouts.advertiserId, blocks: checkouts.blocks, totalCents: checkouts.totalCents, status: checkouts.status, provider: checkouts.provider, mode: checkouts.mode, createdAtMs: checkouts.createdAtMs }).from(checkouts).orderBy(desc(checkouts.createdAtMs)).limit(limit).offset(offset)) },
  { name: 'contact_messages', title: 'Contact messages', columns: ['id', 'name', 'email', 'topic', 'message', 'createdAtMs'], mask: ['email'], load: (db, offset, limit) => rowsOf(db.select().from(contactMessages).orderBy(desc(contactMessages.createdAtMs)).limit(limit).offset(offset)) },
  { name: 'privacy_requests', title: 'Privacy requests', columns: ['id', 'kind', 'email', 'region', 'details', 'createdAtMs'], mask: ['email'], load: (db, offset, limit) => rowsOf(db.select({ id: privacyRequests.id, kind: privacyRequests.kind, email: privacyRequests.email, region: privacyRequests.region, details: privacyRequests.details, createdAtMs: privacyRequests.createdAtMs }).from(privacyRequests).orderBy(desc(privacyRequests.createdAtMs)).limit(limit).offset(offset)) },
  { name: 'leads', title: 'Leads', columns: ['id', 'source', 'name', 'email', 'topic', 'status', 'createdAtMs'], mask: ['email'], load: (db, offset, limit) => rowsOf(db.select({ id: leads.id, source: leads.source, name: leads.name, email: leads.email, topic: leads.topic, status: leads.status, createdAtMs: leads.createdAtMs }).from(leads).orderBy(desc(leads.createdAtMs)).limit(limit).offset(offset)) },
  { name: 'crm_notes', title: 'CRM notes', columns: ['id', 'subjectType', 'subjectId', 'body', 'createdAtMs'], mask: [], load: (db, offset, limit) => rowsOf(db.select({ id: crmNotes.id, subjectType: crmNotes.subjectType, subjectId: crmNotes.subjectId, body: crmNotes.body, createdAtMs: crmNotes.createdAtMs }).from(crmNotes).orderBy(desc(crmNotes.createdAtMs)).limit(limit).offset(offset)) },
  { name: 'crm_tags', title: 'CRM tags', columns: ['id', 'subjectType', 'subjectId', 'tag', 'createdAtMs'], mask: [], load: (db, offset, limit) => rowsOf(db.select().from(crmTags).orderBy(desc(crmTags.createdAtMs)).limit(limit).offset(offset)) },
  { name: 'advertiser_crm', title: 'Advertiser pipeline', columns: ['userId', 'stage', 'ownerEmail', 'followUpAtMs', 'updatedAtMs'], mask: ['ownerEmail'], load: (db, offset, limit) => rowsOf(db.select().from(advertiserCrm).orderBy(desc(advertiserCrm.updatedAtMs)).limit(limit).offset(offset)) },
  { name: 'user_flags', title: 'User flags', columns: ['userId', 'suspended', 'payoutReviewed', 'updatedAtMs'], mask: [], load: (db, offset, limit) => rowsOf(db.select().from(userFlags).orderBy(desc(userFlags.updatedAtMs)).limit(limit).offset(offset)) },
  { name: 'admin_audit_log', title: 'Admin audit log', columns: ['id', 'actorEmail', 'action', 'subjectType', 'subjectId', 'detail', 'createdAtMs'], mask: ['actorEmail'], load: (db, offset, limit) => rowsOf(db.select({ id: adminAuditLog.id, actorEmail: adminAuditLog.actorEmail, action: adminAuditLog.action, subjectType: adminAuditLog.subjectType, subjectId: adminAuditLog.subjectId, detail: adminAuditLog.detail, createdAtMs: adminAuditLog.createdAtMs }).from(adminAuditLog).orderBy(desc(adminAuditLog.createdAtMs)).limit(limit).offset(offset)) },
]

async function rowsOf(query: Promise<unknown[]>): Promise<Array<Record<string, unknown>>> {
  const rows = await query
  return rows.map((row) => ({ ...(row as Record<string, unknown>) }))
}

async function tally(db: SwagDb, name: string): Promise<number> {
  const entry = BROWSER.find((item) => item.name === name)
  if (!entry) return 0
  const table = {
    users,
    installs,
    campaigns,
    impressions,
    ledger,
    payouts,
    checkouts,
    contact_messages: contactMessages,
    privacy_requests: privacyRequests,
    leads,
    crm_notes: crmNotes,
    crm_tags: crmTags,
    advertiser_crm: advertiserCrm,
    user_flags: userFlags,
    admin_audit_log: adminAuditLog,
  }[name]
  if (!table) return 0
  const [row] = await db.select({ value: count() }).from(table)
  return asNumber(row?.value)
}

function presentBrowserRow(row: Record<string, unknown>, mask: string[]): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(row)) {
    if (SECRET_FIELDS.has(key)) continue
    const text = value === null || value === undefined ? '' : String(value)
    if (mask.includes(key) && key.toLowerCase().includes('email')) out[key] = text ? maskEmail(text) : ''
    else if (mask.includes(key) && key === 'destination') out[key] = maskDestination(text, typeof row.provider === 'string' ? row.provider : undefined)
    else out[key] = text.length > 180 ? `${text.slice(0, 180)}…` : text
  }
  return out
}

async function databaseHealth(db: SwagDb) {
  const tables = await Promise.all(BROWSER.map(async (entry) => ({ name: entry.name, count: await tally(db, entry.name) })))
  return {
    connection: 'ok' as const,
    migrationVersion: await migrationVersion(db),
    tables,
    bytes: await databaseBytes(db),
  }
}

async function migrationVersion(db: SwagDb): Promise<string> {
  const rows = await db.select().from(schemaMigrations)
  if (rows.length === 0) return SCHEMA_VERSION
  return rows.map((row) => row.version).sort().at(-1) ?? SCHEMA_VERSION
}

async function databaseBytes(db: SwagDb): Promise<number | null> {
  try {
    const result = await db.execute(sql`select pg_database_size(current_database()) as bytes`)
    const row = firstRow(result)
    if (!row) return null
    const bytes = asNumber(row.bytes ?? row.BYTES)
    return bytes > 0 ? bytes : null
  } catch {
    return null
  }
}

async function subjectExists(db: SwagDb, subjectType: string, subjectId: string): Promise<boolean> {
  if (subjectType === 'developer' || subjectType === 'advertiser') {
    const [user] = await db.select({ id: users.id, role: users.role }).from(users).where(eq(users.id, subjectId))
    return Boolean(user && user.role === subjectType)
  }
  if (subjectType === 'lead') {
    const [lead] = await db.select({ id: leads.id }).from(leads).where(eq(leads.id, subjectId))
    return Boolean(lead)
  }
  return false
}

async function upsertFlags(db: SwagDb, userId: string, patch: { suspended?: number; payoutReviewed?: number }, now: number) {
  const [existing] = await db.select().from(userFlags).where(eq(userFlags.userId, userId))
  if (!existing) {
    await db.insert(userFlags).values({
      userId,
      suspended: patch.suspended ?? 0,
      payoutReviewed: patch.payoutReviewed ?? 0,
      updatedAtMs: now,
    })
    return
  }
  await db
    .update(userFlags)
    .set({
      suspended: patch.suspended ?? existing.suspended,
      payoutReviewed: patch.payoutReviewed ?? existing.payoutReviewed,
      updatedAtMs: now,
    })
    .where(eq(userFlags.userId, userId))
}

function fraudOf(rows: Array<typeof impressions.$inferSelect>) {
  const errors = (code: string) => rows.filter((row) => row.lastError === code).length
  return {
    served: rows.length,
    verified: rows.filter((row) => row.status === 'verified').length,
    rejected: rows.filter((row) => row.status === 'rejected').length,
    expired: rows.filter((row) => row.status === 'expired').length,
    viewTooShort: errors('view_too_short'),
    badSignature: errors('bad_device_signature'),
    replay: rows.filter((row) => row.lastError === 'replay' || row.status === 'replay').length,
  }
}

function latestDestination(rows: Array<typeof payouts.$inferSelect>): string {
  const latest = [...rows].sort((a, b) => asNumber(b.createdAtMs) - asNumber(a.createdAtMs))[0]
  return latest?.destination ?? ''
}

function latestProvider(rows: Array<typeof payouts.$inferSelect>): string {
  const latest = [...rows].sort((a, b) => asNumber(b.createdAtMs) - asNumber(a.createdAtMs))[0]
  return latest?.provider ?? ''
}

function conceal<T extends { needle: string }>(row: T): Omit<T, 'needle'> {
  const { needle: _needle, ...rest } = row
  return rest
}

function page<T>(rows: T[], pageNumber: number, total = rows.length) {
  const start = (pageNumber - 1) * PAGE_SIZE
  const slice = total === rows.length ? rows.slice(start, start + PAGE_SIZE) : rows
  return { rows: slice, page: pageNumber, pageSize: PAGE_SIZE, total }
}

function queryPage(c: Context): number {
  const raw = Number(c.req.query('page') ?? '1')
  return Number.isInteger(raw) && raw > 0 ? raw : 1
}

function hit(q: string, ...parts: string[]): boolean {
  return parts.join(' ').toLowerCase().includes(q)
}

function parseList(value: string): string[] {
  try {
    const parsed = JSON.parse(value) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter((item): item is string => typeof item === 'string')
  } catch {
    return []
  }
}

function money(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`
}

function startOfUtcDay(ms: number): number {
  const date = new Date(ms)
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
}

function asNumber(value: unknown): number {
  const number = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(number) ? number : 0
}

function firstRow(result: unknown): Record<string, unknown> | undefined {
  if (Array.isArray(result)) return result[0] as Record<string, unknown> | undefined
  if (result && typeof result === 'object' && 'rows' in result) {
    const rows = (result as { rows?: unknown[] }).rows
    return rows?.[0] as Record<string, unknown> | undefined
  }
  return undefined
}

async function readBody(c: { req: { json(): Promise<unknown> } }): Promise<Record<string, unknown>> {
  try {
    const value = await c.req.json()
    if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>
  } catch {
    return {}
  }
  return {}
}
