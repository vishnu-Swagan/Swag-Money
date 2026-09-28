import { eq } from 'drizzle-orm'
import type { SwagDb } from './db.ts'
import { crmLeads, crmMailOutbox, checkouts, contactMessages, privacyRequests, users } from './schema.ts'

export const PIPELINE_STAGES = ['lead', 'contacted', 'onboarding', 'active', 'paused', 'churned'] as const
export type PipelineStage = (typeof PIPELINE_STAGES)[number]

export const LEAD_STATUSES = ['new', 'reviewed', 'replied', 'spam'] as const
export type LeadStatus = (typeof LEAD_STATUSES)[number]

export const LEAD_KINDS = ['signup', 'contact', 'advertiser', 'privacy'] as const
export type LeadKind = (typeof LEAD_KINDS)[number]

const STAGE_LABELS: Record<PipelineStage, string> = {
  lead: 'Lead',
  contacted: 'Contacted',
  onboarding: 'Onboarding',
  active: 'Active',
  paused: 'Paused',
  churned: 'Churned',
}

export function pipelineLabel(stage: string): string {
  if (isPipelineStage(stage)) return STAGE_LABELS[stage]
  return 'Lead'
}

export function isPipelineStage(value: string): value is PipelineStage {
  return (PIPELINE_STAGES as readonly string[]).includes(value)
}

export function isLeadStatus(value: string): value is LeadStatus {
  return (LEAD_STATUSES as readonly string[]).includes(value)
}

export type LeadDraft = {
  kind: LeadKind
  sourceId: string
  name?: string
  email?: string
  company?: string
  country?: string
  summary?: string
  createdAtMs: number
}

export async function recordLead(db: SwagDb, draft: LeadDraft): Promise<void> {
  await db
    .insert(crmLeads)
    .values({
      id: crypto.randomUUID(),
      kind: draft.kind,
      sourceId: draft.sourceId,
      name: (draft.name ?? '').slice(0, 200),
      email: (draft.email ?? '').slice(0, 200),
      company: (draft.company ?? '').slice(0, 200),
      country: (draft.country ?? '').slice(0, 80),
      summary: (draft.summary ?? '').slice(0, 500),
      status: 'new',
      createdAtMs: draft.createdAtMs,
      updatedAtMs: draft.createdAtMs,
    })
    .onConflictDoNothing()
}

/** Pull stored form rows and accounts into the inbox. Safe to run more than once. */
export async function syncInbox(db: SwagDb, now: number): Promise<void> {
  const [contacts, privacy, buys, people, existing] = await Promise.all([
    db.select().from(contactMessages),
    db.select().from(privacyRequests),
    db.select().from(checkouts),
    db.select().from(users),
    db.select({ kind: crmLeads.kind, sourceId: crmLeads.sourceId }).from(crmLeads),
  ])
  const have = new Set(existing.map((row) => `${row.kind}:${row.sourceId}`))
  const peopleById = new Map(people.map((row) => [row.id, row]))
  const drafts: LeadDraft[] = []

  for (const row of people) {
    const key = `signup:${row.id}`
    if (have.has(key)) continue
    have.add(key)
    drafts.push({
      kind: 'signup',
      sourceId: row.id,
      name: row.name,
      email: row.email,
      country: row.residenceCountry,
      summary: `${row.role} account`,
      createdAtMs: row.createdAtMs,
    })
  }
  for (const row of contacts) {
    const key = `contact:${row.id}`
    if (have.has(key)) continue
    have.add(key)
    drafts.push({
      kind: 'contact',
      sourceId: row.id,
      name: row.name,
      email: row.email,
      summary: `${row.topic}: ${row.message}`,
      createdAtMs: row.createdAtMs,
    })
  }
  for (const row of privacy) {
    const key = `privacy:${row.id}`
    if (have.has(key)) continue
    have.add(key)
    drafts.push({
      kind: 'privacy',
      sourceId: row.id,
      name: row.email,
      email: row.email,
      country: row.region,
      summary: `${row.kind}: ${row.details || 'Privacy request'}`,
      createdAtMs: row.createdAtMs,
    })
  }
  for (const row of buys) {
    const key = `advertiser:${row.id}`
    if (have.has(key)) continue
    have.add(key)
    const person = peopleById.get(row.advertiserId)
    drafts.push({
      kind: 'advertiser',
      sourceId: row.id,
      name: person?.name ?? '',
      email: person?.email ?? '',
      country: person?.residenceCountry ?? '',
      summary: `Bought ${row.blocks} impression block${row.blocks === 1 ? '' : 's'}`,
      createdAtMs: row.createdAtMs,
    })
  }

  if (drafts.length === 0) return
  await db
    .insert(crmLeads)
    .values(
      drafts.map((draft) => ({
        id: crypto.randomUUID(),
        kind: draft.kind,
        sourceId: draft.sourceId,
        name: (draft.name ?? '').slice(0, 200),
        email: (draft.email ?? '').slice(0, 200),
        company: (draft.company ?? '').slice(0, 200),
        country: (draft.country ?? '').slice(0, 80),
        summary: (draft.summary ?? '').slice(0, 500),
        status: 'new',
        createdAtMs: draft.createdAtMs,
        updatedAtMs: now,
      })),
    )
    .onConflictDoNothing()
}

export async function setLeadStatus(db: SwagDb, id: string, status: LeadStatus, now: number): Promise<boolean> {
  const updated = await db.update(crmLeads).set({ status, updatedAtMs: now }).where(eq(crmLeads.id, id)).returning({ id: crmLeads.id })
  return updated.length > 0
}

/**
 * Mock email adapter for new advertiser signups.
 *
 * Off unless both ADMIN_NOTIFY_ADVERTISERS=1 and ADMIN_NOTIFY_EMAIL are set.
 * This function writes a row to crm_mail_outbox and does not open a socket.
 *
 * To send real mail, replace the body of this function with a provider call
 * (Resend, SES, or Postmark). Keep the outbox insert so the CRM still has a
 * record of the attempt. You will need a provider API key in the host's
 * secret store, the owner's address in ADMIN_NOTIFY_EMAIL, and
 * ADMIN_NOTIFY_ADVERTISERS=1. Do not log the API key. Do not enable this in
 * production until the provider call replaces the mock delivery value.
 */
export async function notifyAdvertiserSignup(
  db: SwagDb,
  input: { email: string; name: string; at: number },
  env: NodeJS.ProcessEnv = process.env,
): Promise<{ delivery: 'disabled' | 'mock' }> {
  if (env.ADMIN_NOTIFY_ADVERTISERS !== '1') return { delivery: 'disabled' }
  const to = env.ADMIN_NOTIFY_EMAIL?.trim() ?? ''
  if (!to) return { delivery: 'disabled' }
  await db.insert(crmMailOutbox).values({
    id: crypto.randomUUID(),
    toEmail: to,
    subject: `New advertiser signup: ${input.email}`,
    body: `${input.name} (${input.email}) created an advertiser account. This notice was stored locally and was not sent.`,
    delivery: 'mock',
    createdAtMs: input.at,
  })
  return { delivery: 'mock' }
}
