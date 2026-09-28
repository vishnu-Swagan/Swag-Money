import { count, desc, eq, getTableColumns, sql } from 'drizzle-orm'
import type { SwagDb } from './db.ts'
import { pipelineLabel, syncInbox } from './crm.ts'
import { maskCredential, maskEmail, maskIfCredential } from './mask.ts'
import {
  adminAuditLog,
  apiKeys,
  campaigns,
  checkouts,
  contactMessages,
  crmAdvertisers,
  crmLeads,
  crmMailOutbox,
  crmNotes,
  crmTags,
  impressions,
  installs,
  ledger,
  payouts,
  privacyRequests,
  schemaMigrations,
  users,
} from './schema.ts'

type UserRow = typeof users.$inferSelect
type CampaignRow = typeof campaigns.$inferSelect

const DAY = 86_400_000
const PAGE_SIZE = 25
const CSV_CAP = 5_000

const SECRET_COLUMNS = new Set(['passwordHash', 'keyHash', 'tokenHash'])
const EMAIL_COLUMNS = new Set(['email', 'actorEmail', 'toEmail'])
const DESTINATION_COLUMNS = new Set(['destination'])

export const DATABASE_TABLES = {
  users,
  installs,
  campaigns,
  impressions,
  ledger,
  payouts,
  api_keys: apiKeys,
  checkouts,
  contact_messages: contactMessages,
  privacy_requests: privacyRequests,
  crm_notes: crmNotes,
  crm_tags: crmTags,
  crm_advertisers: crmAdvertisers,
  crm_leads: crmLeads,
  admin_audit_log: adminAuditLog,
  crm_mail_outbox: crmMailOutbox,
  schema_migrations: schemaMigrations,
} as const

export type DatabaseTableName = keyof typeof DATABASE_TABLES

const ORDER_COLUMN = {
  users: users.createdAtMs,
  installs: installs.createdAtMs,
  campaigns: campaigns.createdAtMs,
  impressions: impressions.servedAtMs,
  ledger: ledger.createdAtMs,
  payouts: payouts.createdAtMs,
  api_keys: apiKeys.createdAtMs,
  checkouts: checkouts.createdAtMs,
  contact_messages: contactMessages.createdAtMs,
  privacy_requests: privacyRequests.createdAtMs,
  crm_notes: crmNotes.createdAtMs,
  crm_tags: crmTags.createdAtMs,
  crm_advertisers: crmAdvertisers.userId,
  crm_leads: crmLeads.createdAtMs,
  admin_audit_log: adminAuditLog.createdAtMs,
  crm_mail_outbox: crmMailOutbox.createdAtMs,
  schema_migrations: schemaMigrations.appliedAtMs,
} as const

export function isDatabaseTable(name: string): name is DatabaseTableName {
  return Object.prototype.hasOwnProperty.call(DATABASE_TABLES, name)
}

function asNumber(value: unknown): number {
  const number = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(number) ? number : 0
}

function startOfUtcDay(ms: number): number {
  const date = new Date(ms)
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
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

function likeNeedle(raw: string): string {
  return raw.trim().toLowerCase()
}

function matches(haystack: string, needle: string): boolean {
  return haystack.toLowerCase().includes(needle)
}

type Directory = {
  users: UserRow[]
  installs: Array<typeof installs.$inferSelect>
  campaigns: CampaignRow[]
  impressions: Array<typeof impressions.$inferSelect>
  ledger: Array<typeof ledger.$inferSelect>
  payouts: Array<typeof payouts.$inferSelect>
  checkouts: Array<typeof checkouts.$inferSelect>
  notes: Array<typeof crmNotes.$inferSelect>
  tags: Array<typeof crmTags.$inferSelect>
  advertisers: Array<typeof crmAdvertisers.$inferSelect>
  leads: Array<typeof crmLeads.$inferSelect>
  audit: Array<typeof adminAuditLog.$inferSelect>
}

async function loadDirectory(db: SwagDb): Promise<Directory> {
  const [userRows, installRows, campaignRows, impressionRows, ledgerRows, payoutRows, checkoutRows, noteRows, tagRows, advertiserRows, leadRows, auditRows] =
    await Promise.all([
      db.select().from(users),
      db.select().from(installs),
      db.select().from(campaigns),
      db.select().from(impressions),
      db.select().from(ledger),
      db.select().from(payouts),
      db.select().from(checkouts),
      db.select().from(crmNotes),
      db.select().from(crmTags),
      db.select().from(crmAdvertisers),
      db.select().from(crmLeads),
      db.select().from(adminAuditLog),
    ])
  return {
    users: userRows,
    installs: installRows,
    campaigns: campaignRows,
    impressions: impressionRows,
    ledger: ledgerRows,
    payouts: payoutRows,
    checkouts: checkoutRows,
    notes: noteRows,
    tags: tagRows,
    advertisers: advertiserRows,
    leads: leadRows,
    audit: auditRows,
  }
}

function money(rows: Directory['ledger'], userId: string) {
  let earned = 0
  let balance = 0
  for (const row of rows) {
    if (row.userId !== userId) continue
    balance += row.amountCents
    if (row.kind === 'earn') earned += row.amountCents
  }
  return { earned, balance }
}

export async function buildOverview(db: SwagDb, now: number) {
  const directory = await loadDirectory(db)
  const developers = directory.users.filter((row) => row.role === 'developer')
  const advertisers = directory.users.filter((row) => row.role === 'advertiser')
  const dayStart = startOfUtcDay(now)
  const signups = directory.users
  const countSince = (from: number) => signups.filter((row) => row.createdAtMs >= from).length
  const days = Array.from({ length: 30 }, (_, index) => {
    const start = dayStart - (29 - index) * DAY
    return {
      date: new Date(start).toISOString().slice(0, 10),
      count: signups.filter((row) => row.createdAtMs >= start && row.createdAtMs < start + DAY).length,
    }
  })
  const integrations = new Map<string, Set<string>>()
  for (const row of directory.impressions) {
    const set = integrations.get(row.surface) ?? new Set<string>()
    set.add(row.installId)
    integrations.set(row.surface, set)
  }
  const paid = directory.payouts.filter((row) => row.status === 'completed' || row.status === 'paid')
  const pending = directory.payouts.filter((row) => row.status === 'pending')
  const earned = directory.ledger.filter((row) => row.kind === 'earn').reduce((sum, row) => sum + row.amountCents, 0)
  const balance = directory.ledger.reduce((sum, row) => sum + row.amountCents, 0)
  const health = await databaseHealth(db)
  return {
    developers: developers.length,
    advertisers: advertisers.length,
    signups: {
      today: countSince(dayStart),
      days7: countSince(now - 7 * DAY),
      days30: countSince(now - 30 * DAY),
      days,
    },
    integrations: [...integrations.entries()]
      .map(([tool, ids]) => ({ tool, active: ids.size }))
      .sort((a, b) => b.active - a.active || a.tool.localeCompare(b.tool)),
    impressionsServed: directory.impressions.length,
    verifiedViews: directory.impressions.filter((row) => row.status === 'verified').length,
    advertiserSpendCents: directory.campaigns.reduce((sum, row) => sum + row.spentCents, 0),
    blocksBought: directory.checkouts.reduce((sum, row) => sum + row.blocks, 0),
    earningsEarnedCents: earned,
    earningsPaidCents: paid.reduce((sum, row) => sum + row.amountCents, 0),
    earningsOwedCents: balance,
    pendingPayouts: pending.length,
    pendingPayoutCents: pending.reduce((sum, row) => sum + row.amountCents, 0),
    database: health,
  }
}

async function databaseHealth(db: SwagDb) {
  let ok = false
  try {
    await db.execute(sql`select 1 as ok`)
    ok = true
  } catch {
    // select 1 failed; ok stays false
  }
  const versions = await db.select().from(schemaMigrations)
  const latest = [...versions].sort((a, b) => b.appliedAtMs - a.appliedAtMs || b.version.localeCompare(a.version))[0]
  const tables = await Promise.all(
    (Object.keys(DATABASE_TABLES) as DatabaseTableName[]).map(async (name) => {
      const [row] = await db.select({ n: count() }).from(DATABASE_TABLES[name])
      return { name, rows: asNumber(row?.n ?? 0) }
    }),
  )
  return {
    ok,
    migrationVersion: latest?.version ?? 'unknown',
    tables,
  }
}

export type DeveloperFilters = {
  q?: string
  country?: string
  status?: string
  payout?: string
  tool?: string
  signup?: string
}

export async function listDevelopers(db: SwagDb, filters: DeveloperFilters = {}) {
  const directory = await loadDirectory(db)
  const needle = likeNeedle(filters.q ?? '')
  const rows = directory.users
    .filter((row) => row.role === 'developer')
    .map((row) => presentDeveloper(directory, row))
    .filter((row) => {
      if (filters.country && row.country !== filters.country) return false
      if (filters.status && row.status !== filters.status) return false
      if (filters.payout && row.payoutMethod !== filters.payout) return false
      if (filters.signup && row.signupMethod !== filters.signup) return false
      if (filters.tool && !row.tools.includes(filters.tool)) return false
      if (!needle) return true
      return matches(`${row.name} ${row.emailMasked} ${row.country} ${row.tools.join(' ')}`, needle) || matches(emailOf(directory, row.id), needle)
    })
    .sort((a, b) => b.createdAtMs - a.createdAtMs)
  return rows
}

function emailOf(directory: Directory, id: string): string {
  return directory.users.find((row) => row.id === id)?.email ?? ''
}

function presentDeveloper(directory: Directory, row: UserRow) {
  const tools = new Set<string>()
  for (const impression of directory.impressions) {
    if (impression.developerId === row.id) tools.add(impression.surface)
  }
  const installLabels = directory.installs.filter((install) => install.userId === row.id).map((install) => install.label)
  let lastActive: number | null = null
  for (const impression of directory.impressions) {
    if (impression.developerId !== row.id) continue
    if (lastActive === null || impression.servedAtMs > lastActive) lastActive = impression.servedAtMs
  }
  for (const install of directory.installs) {
    if (install.userId !== row.id) continue
    if (lastActive === null || install.createdAtMs > lastActive) lastActive = install.createdAtMs
  }
  const totals = money(directory.ledger, row.id)
  return {
    id: row.id,
    name: row.name,
    emailMasked: maskEmail(row.email),
    country: row.residenceCountry,
    createdAtMs: row.createdAtMs,
    signupMethod: row.signupMethod,
    payoutMethod: row.payoutPreference,
    tools: [...tools].sort(),
    installs: installLabels.length,
    impressions: directory.impressions.filter((item) => item.developerId === row.id).length,
    earningsCents: totals.earned,
    balanceCents: totals.balance,
    lastActiveMs: lastActive,
    status: row.accountStatus,
  }
}

export async function developerDetail(db: SwagDb, id: string) {
  const directory = await loadDirectory(db)
  const row = directory.users.find((user) => user.id === id && user.role === 'developer')
  if (!row) return null
  const list = presentDeveloper(directory, row)
  const fraudRows = directory.impressions.filter(
    (item) => item.developerId === id && (item.status === 'rejected' || item.status === 'expired' || Boolean(item.lastError)),
  )
  const byReason: Record<string, number> = {}
  for (const item of fraudRows) {
    const reason = item.lastError || item.status
    byReason[reason] = (byReason[reason] ?? 0) + 1
  }
  const timeline = developerTimeline(directory, row)
  return {
    ...list,
    email: row.email,
    notes: notesFor(directory, 'developer', id),
    tags: tagsFor(directory, 'developer', id),
    payouts: directory.payouts
      .filter((item) => item.userId === id)
      .map((item) => ({
        id: item.id,
        provider: item.provider,
        amountCents: item.amountCents,
        status: item.status,
        destination: item.destination,
        mode: item.mode,
        reviewedAtMs: item.reviewedAtMs,
        reviewedBy: item.reviewedBy,
        createdAtMs: item.createdAtMs,
        detail: item.detail,
      }))
      .sort((a, b) => b.createdAtMs - a.createdAtMs),
    fraud: {
      rejected: fraudRows.filter((item) => item.status === 'rejected').length,
      expired: fraudRows.filter((item) => item.status === 'expired').length,
      byReason,
      recent: fraudRows
        .map((item) => ({
          id: item.id,
          at: item.servedAtMs,
          surface: item.surface,
          status: item.status,
          reason: item.lastError,
        }))
        .sort((a, b) => b.at - a.at)
        .slice(0, 20),
    },
    timeline,
  }
}

function developerTimeline(directory: Directory, row: UserRow) {
  const events: Array<{ at: number; kind: string; label: string; detail: string }> = [
    { at: row.createdAtMs, kind: 'signup', label: 'Signed up', detail: row.signupMethod || 'unknown method' },
  ]
  for (const install of directory.installs) {
    if (install.userId !== row.id) continue
    events.push({ at: install.createdAtMs, kind: 'integration', label: 'Integration connected', detail: install.label })
  }
  for (const payout of directory.payouts) {
    if (payout.userId !== row.id) continue
    events.push({
      at: payout.createdAtMs,
      kind: 'payout',
      label: `Payout ${payout.status}`,
      detail: `${payout.provider} · ${payout.amountCents} cents`,
    })
    if (payout.reviewedAtMs) {
      events.push({ at: payout.reviewedAtMs, kind: 'review', label: 'Payout reviewed', detail: payout.reviewedBy })
    }
  }
  for (const note of directory.notes) {
    if (note.subjectType !== 'developer' || note.subjectId !== row.id) continue
    events.push({ at: note.createdAtMs, kind: 'note', label: 'Note', detail: note.body })
  }
  for (const entry of directory.audit) {
    if (entry.subjectId !== row.id) continue
    if (entry.action === 'developer.suspend' || entry.action === 'developer.unsuspend' || entry.action === 'developer.tag') {
      events.push({ at: entry.createdAtMs, kind: 'flag', label: entry.action, detail: entry.detail })
    }
  }
  const rejected = directory.impressions.filter((item) => item.developerId === row.id && item.lastError)
  if (rejected.length > 0) {
    const latest = rejected.reduce((max, item) => Math.max(max, item.servedAtMs), 0)
    events.push({
      at: latest,
      kind: 'flag',
      label: 'Render challenge flags',
      detail: `${rejected.length} impression${rejected.length === 1 ? '' : 's'} failed a render check`,
    })
  }
  return events.sort((a, b) => b.at - a.at)
}

export type AdvertiserFilters = {
  q?: string
  stage?: string
  status?: string
  country?: string
}

export async function listAdvertisers(db: SwagDb, filters: AdvertiserFilters = {}) {
  const directory = await loadDirectory(db)
  const needle = likeNeedle(filters.q ?? '')
  return directory.users
    .filter((row) => row.role === 'advertiser')
    .map((row) => presentAdvertiser(directory, row))
    .filter((row) => {
      if (filters.stage && row.pipelineStage !== filters.stage) return false
      if (filters.status && row.status !== filters.status) return false
      if (filters.country && row.country !== filters.country) return false
      if (!needle) return true
      const email = emailOf(directory, row.id)
      return matches(`${row.company} ${row.contact} ${row.emailMasked} ${row.country}`, needle) || matches(email, needle)
    })
    .sort((a, b) => b.createdAtMs - a.createdAtMs)
}

function presentAdvertiser(directory: Directory, row: UserRow) {
  const profile = directory.advertisers.find((item) => item.userId === row.id)
  const mine = directory.campaigns.filter((item) => item.advertiserId === row.id)
  const blocks = directory.checkouts.filter((item) => item.advertiserId === row.id).reduce((sum, item) => sum + item.blocks, 0)
  const company = profile?.company || mine.find((item) => item.companyName)?.companyName || mine[0]?.advertiserName || row.name
  return {
    id: row.id,
    company,
    contact: row.name,
    emailMasked: maskEmail(row.email),
    country: row.residenceCountry,
    campaigns: mine.length,
    spendCents: mine.reduce((sum, item) => sum + item.spentCents, 0),
    blocksBought: blocks,
    status: row.accountStatus,
    pipelineStage: profile?.pipelineStage || 'lead',
    pipelineLabel: pipelineLabel(profile?.pipelineStage || 'lead'),
    owner: profile?.owner ?? '',
    followUpAtMs: profile?.followUpAtMs ?? null,
    createdAtMs: row.createdAtMs,
  }
}

export async function advertiserDetail(db: SwagDb, id: string) {
  const directory = await loadDirectory(db)
  const row = directory.users.find((user) => user.id === id && user.role === 'advertiser')
  if (!row) return null
  const list = presentAdvertiser(directory, row)
  const mine = directory.campaigns.filter((item) => item.advertiserId === id)
  return {
    ...list,
    email: row.email,
    notes: notesFor(directory, 'advertiser', id),
    tags: tagsFor(directory, 'advertiser', id),
    campaigns: mine
      .map((item) => ({
        id: item.id,
        name: item.name,
        adText: item.adText,
        destinationUrl: item.destinationUrl,
        surfaces: parseList(item.surfaces),
        placement: item.placement,
        countries: parseList(item.countries),
        maxBidCents: item.maxBidCents,
        budgetCents: item.budgetCents,
        spentCents: item.spentCents,
        impressionCredits: item.impressionCredits,
        pace: item.pace,
        status: item.status,
        createdAtMs: item.createdAtMs,
      }))
      .sort((a, b) => b.createdAtMs - a.createdAtMs),
    invoices: directory.checkouts
      .filter((item) => item.advertiserId === id)
      .map((item) => ({
        id: item.id,
        campaignId: item.campaignId,
        blocks: item.blocks,
        totalCents: item.totalCents,
        status: item.status,
        provider: item.provider,
        mode: item.mode,
        createdAtMs: item.createdAtMs,
        mock: true,
        note: 'Mock invoice. No tax document was generated and no card network was contacted.',
      }))
      .sort((a, b) => b.createdAtMs - a.createdAtMs),
  }
}

function notesFor(directory: Directory, subjectType: string, subjectId: string) {
  return directory.notes
    .filter((row) => row.subjectType === subjectType && row.subjectId === subjectId)
    .map((row) => ({ id: row.id, body: row.body, authorId: row.authorId, createdAtMs: row.createdAtMs }))
    .sort((a, b) => b.createdAtMs - a.createdAtMs)
}

function tagsFor(directory: Directory, subjectType: string, subjectId: string) {
  return directory.tags
    .filter((row) => row.subjectType === subjectType && row.subjectId === subjectId)
    .map((row) => row.tag)
    .sort()
}

export async function listLeads(db: SwagDb, now: number, status?: string) {
  await syncInbox(db, now)
  const rows = await db.select().from(crmLeads)
  return rows
    .filter((row) => !status || row.status === status)
    .map((row) => ({
      id: row.id,
      kind: row.kind,
      sourceId: row.sourceId,
      name: maskIfCredential(row.name),
      emailMasked: row.email ? maskEmail(row.email) : '',
      company: row.company,
      country: row.country,
      summary: row.summary,
      status: row.status,
      createdAtMs: row.createdAtMs,
      updatedAtMs: row.updatedAtMs,
    }))
    .sort((a, b) => b.createdAtMs - a.createdAtMs || b.id.localeCompare(a.id))
}

export async function leadDetail(db: SwagDb, id: string, now: number) {
  await syncInbox(db, now)
  const [row] = await db.select().from(crmLeads).where(eq(crmLeads.id, id))
  if (!row) return null
  const directory = await loadDirectory(db)
  return {
    id: row.id,
    kind: row.kind,
    sourceId: row.sourceId,
    name: row.name,
    email: row.email,
    emailMasked: row.email ? maskEmail(row.email) : '',
    company: row.company,
    country: row.country,
    summary: row.summary,
    status: row.status,
    createdAtMs: row.createdAtMs,
    updatedAtMs: row.updatedAtMs,
    notes: notesFor(directory, 'lead', id),
    tags: tagsFor(directory, 'lead', id),
  }
}

export async function listCampaigns(db: SwagDb, filters: { q?: string; status?: string } = {}) {
  const directory = await loadDirectory(db)
  const needle = likeNeedle(filters.q ?? '')
  const names = new Map(directory.users.map((row) => [row.id, row.name]))
  return directory.campaigns
    .filter((row) => !filters.status || row.status === filters.status)
    .map((row) => ({
      id: row.id,
      name: row.name,
      advertiser: names.get(row.advertiserId) ?? row.advertiserName,
      advertiserId: row.advertiserId,
      status: row.status,
      adText: row.adText,
      maxBidCents: row.maxBidCents,
      spentCents: row.spentCents,
      budgetCents: row.budgetCents,
      surfaces: parseList(row.surfaces),
      placement: row.placement,
      countries: parseList(row.countries),
      pace: row.pace,
      createdAtMs: row.createdAtMs,
    }))
    .filter((row) => !needle || matches(`${row.name} ${row.advertiser} ${row.adText} ${row.surfaces.join(' ')}`, needle))
    .sort((a, b) => b.createdAtMs - a.createdAtMs)
}

export async function listPayouts(db: SwagDb, filters: { status?: string; provider?: string; reviewed?: string } = {}) {
  const directory = await loadDirectory(db)
  const names = new Map(directory.users.map((row) => [row.id, row.name]))
  return directory.payouts
    .filter((row) => !filters.status || row.status === filters.status)
    .filter((row) => !filters.provider || row.provider === filters.provider)
    .filter((row) => {
      if (filters.reviewed === 'yes') return Boolean(row.reviewedAtMs)
      if (filters.reviewed === 'no') return !row.reviewedAtMs
      return true
    })
    .map((row) => ({
      id: row.id,
      userId: row.userId,
      developer: names.get(row.userId) ?? row.userId,
      provider: row.provider,
      amountCents: row.amountCents,
      status: row.status,
      destinationMasked: maskCredential(row.destination),
      mode: row.mode,
      reviewed: Boolean(row.reviewedAtMs),
      createdAtMs: row.createdAtMs,
    }))
    .sort((a, b) => b.createdAtMs - a.createdAtMs)
}

export async function searchAll(db: SwagDb, q: string, now: number) {
  const needle = likeNeedle(q)
  if (needle.length < 2) {
    return { developers: [], advertisers: [], leads: [] }
  }
  await syncInbox(db, now)
  const [developers, advertisers, leadRows] = await Promise.all([
    listDevelopers(db, { q }),
    listAdvertisers(db, { q }),
    db.select().from(crmLeads),
  ])
  return {
    developers: developers.slice(0, 20),
    advertisers: advertisers.slice(0, 20),
    leads: leadRows
      .filter((row) => matches(`${row.name} ${row.email} ${row.company} ${row.summary} ${row.kind}`, needle))
      .map((row) => ({
        id: row.id,
        kind: row.kind,
        name: maskIfCredential(row.name),
        emailMasked: row.email ? maskEmail(row.email) : '',
        company: row.company,
        summary: row.summary,
        status: row.status,
        createdAtMs: row.createdAtMs,
      }))
      .sort((a, b) => b.createdAtMs - a.createdAtMs)
      .slice(0, 20),
  }
}

export async function databaseCatalog(db: SwagDb) {
  const health = await databaseHealth(db)
  return { ok: health.ok, migrationVersion: health.migrationVersion, tables: health.tables }
}

export async function browseTable(db: SwagDb, name: DatabaseTableName, page: number) {
  const table = DATABASE_TABLES[name]
  const order = ORDER_COLUMN[name]
  const safePage = Number.isInteger(page) && page > 0 ? page : 1
  const [counted] = await db.select({ n: count() }).from(table)
  const total = asNumber(counted?.n ?? 0)
  const rows = await db
    .select()
    .from(table)
    .orderBy(desc(order))
    .limit(PAGE_SIZE)
    .offset((safePage - 1) * PAGE_SIZE)
  return {
    name,
    page: safePage,
    pageSize: PAGE_SIZE,
    total,
    pages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    columns: Object.keys(getTableColumns(table)),
    rows: rows.map((row) => presentDatabaseRow(row as Record<string, unknown>)),
  }
}

function presentDatabaseRow(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [column, value] of Object.entries(row)) {
    out[column] = presentCell(column, value)
  }
  return out
}

function presentCell(column: string, value: unknown): unknown {
  if (SECRET_COLUMNS.has(column)) return '[redacted]'
  if (value === null || value === undefined) return null
  if (typeof value === 'string') {
    if (EMAIL_COLUMNS.has(column)) return maskEmail(value)
    if (DESTINATION_COLUMNS.has(column)) return maskCredential(value)
    if (value.length > 180) return `${value.slice(0, 177)}…`
    return value
  }
  return value
}

function csvEscape(value: unknown): string {
  const text = value === null || value === undefined ? '' : String(value)
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`
  return text
}

export function toCsv(headers: string[], rows: Array<Array<unknown>>): string {
  const lines = [headers.map((header) => csvEscape(header)).join(',')]
  for (const row of rows) lines.push(row.map((cell) => csvEscape(cell)).join(','))
  return `${lines.join('\n')}\n`
}

export async function exportCsv(db: SwagDb, kind: string, query: URLSearchParams, now: number): Promise<{ filename: string; body: string } | null> {
  if (kind === 'developers') {
    const rows = await listDevelopers(db, {
      q: query.get('q') ?? undefined,
      country: query.get('country') ?? undefined,
      status: query.get('status') ?? undefined,
      payout: query.get('payout') ?? undefined,
      tool: query.get('tool') ?? undefined,
      signup: query.get('signup') ?? undefined,
    })
    return {
      filename: 'developers.csv',
      body: toCsv(
        ['name', 'email', 'country', 'signup', 'method', 'payout', 'tools', 'impressions', 'earnings_cents', 'balance_cents', 'last_active', 'status'],
        rows.map((row) => [
          row.name,
          row.emailMasked,
          row.country,
          new Date(row.createdAtMs).toISOString(),
          row.signupMethod,
          row.payoutMethod,
          row.tools.join('|'),
          row.impressions,
          row.earningsCents,
          row.balanceCents,
          row.lastActiveMs ? new Date(row.lastActiveMs).toISOString() : '',
          row.status,
        ]),
      ),
    }
  }
  if (kind === 'advertisers') {
    const rows = await listAdvertisers(db, {
      q: query.get('q') ?? undefined,
      stage: query.get('stage') ?? undefined,
      status: query.get('status') ?? undefined,
      country: query.get('country') ?? undefined,
    })
    return {
      filename: 'advertisers.csv',
      body: toCsv(
        ['company', 'contact', 'email', 'country', 'campaigns', 'spend_cents', 'blocks', 'status', 'stage', 'owner', 'created'],
        rows.map((row) => [
          row.company,
          row.contact,
          row.emailMasked,
          row.country,
          row.campaigns,
          row.spendCents,
          row.blocksBought,
          row.status,
          row.pipelineStage,
          row.owner,
          new Date(row.createdAtMs).toISOString(),
        ]),
      ),
    }
  }
  if (kind === 'leads') {
    const rows = await listLeads(db, now, query.get('status') ?? undefined)
    return {
      filename: 'leads.csv',
      body: toCsv(
        ['created', 'kind', 'name', 'email', 'company', 'country', 'status', 'summary'],
        rows.map((row) => [
          new Date(row.createdAtMs).toISOString(),
          row.kind,
          row.name,
          row.emailMasked,
          row.company,
          row.country,
          row.status,
          row.summary,
        ]),
      ),
    }
  }
  if (kind === 'campaigns') {
    const rows = await listCampaigns(db, { q: query.get('q') ?? undefined, status: query.get('status') ?? undefined })
    return {
      filename: 'campaigns.csv',
      body: toCsv(
        ['name', 'advertiser', 'status', 'ad', 'bid_cents', 'spent_cents', 'surfaces', 'placement', 'countries', 'pace'],
        rows.map((row) => [
          row.name,
          row.advertiser,
          row.status,
          row.adText,
          row.maxBidCents,
          row.spentCents,
          row.surfaces.join('|'),
          row.placement,
          row.countries.join('|'),
          row.pace,
        ]),
      ),
    }
  }
  if (kind === 'payouts') {
    const rows = await listPayouts(db, {
      status: query.get('status') ?? undefined,
      provider: query.get('provider') ?? undefined,
      reviewed: query.get('reviewed') ?? undefined,
    })
    return {
      filename: 'payouts.csv',
      body: toCsv(
        ['developer', 'provider', 'amount_cents', 'status', 'destination', 'mode', 'reviewed', 'created'],
        rows.map((row) => [
          row.developer,
          row.provider,
          row.amountCents,
          row.status,
          row.destinationMasked,
          row.mode,
          row.reviewed ? 'yes' : 'no',
          new Date(row.createdAtMs).toISOString(),
        ]),
      ),
    }
  }
  if (kind === 'table') {
    const name = query.get('name') ?? ''
    if (!isDatabaseTable(name)) return null
    const table = DATABASE_TABLES[name]
    const order = ORDER_COLUMN[name]
    const [counted] = await db.select({ n: count() }).from(table)
    const total = Math.min(asNumber(counted?.n ?? 0), CSV_CAP)
    const rows = await db.select().from(table).orderBy(desc(order)).limit(total)
    const presented = rows.map((row) => presentDatabaseRow(row as unknown as Record<string, unknown>))
    const headers = presented[0] ? Object.keys(presented[0]) : []
    return {
      filename: `${name}.csv`,
      body: toCsv(
        headers,
        presented.map((row) => headers.map((header) => row[header])),
      ),
    }
  }
  return null
}
