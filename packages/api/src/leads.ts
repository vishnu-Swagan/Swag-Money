import { and, eq } from 'drizzle-orm'
import type { SwagDb } from './db.ts'
import { leads } from './schema.ts'

export type LeadSource = 'signup' | 'contact' | 'advertiser_form' | 'privacy'

export async function recordLead(
  db: SwagDb,
  row: {
    source: LeadSource
    sourceId: string
    name: string
    email: string
    topic: string
    body: string
    createdAtMs: number
  },
): Promise<void> {
  const [existing] = await db
    .select({ id: leads.id })
    .from(leads)
    .where(and(eq(leads.source, row.source), eq(leads.sourceId, row.sourceId)))
    .limit(1)
  if (existing) return
  await db.insert(leads).values({
    id: crypto.randomUUID(),
    source: row.source,
    sourceId: row.sourceId,
    name: row.name,
    email: row.email,
    topic: row.topic,
    body: row.body,
    status: 'new',
    createdAtMs: row.createdAtMs,
  })
}
