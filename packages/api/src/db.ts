import { PGlite } from '@electric-sql/pglite'
import { drizzle, type PgliteDatabase } from 'drizzle-orm/pglite'
import * as schema from './schema.ts'
import { MIGRATION_SQL } from './migration-sql.ts'

export { MIGRATION_SQL }

/** Query type for both drivers. The hosted client is postgres.js; tests use PGlite. */
export type SwagDb = PgliteDatabase<typeof schema>

/** Embedded Postgres for local dev and tests. Production uses DATABASE_URL via pg-db.ts. */
export async function openDatabase(dataDir?: string): Promise<{ db: SwagDb; close: () => Promise<void> }> {
  const client = new PGlite(dataDir)
  await client.exec(MIGRATION_SQL)
  const db = drizzle(client, { schema })
  return {
    db,
    async close() {
      await client.close()
    },
  }
}
