import { eq } from 'drizzle-orm'
import type { SwagDb } from './db.ts'
import { userFlags } from './schema.ts'

export async function isSuspended(db: SwagDb, userId: string): Promise<boolean> {
  const [row] = await db
    .select({ suspended: userFlags.suspended })
    .from(userFlags)
    .where(eq(userFlags.userId, userId))
    .limit(1)
  return row?.suspended === 1
}
