import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import postgres, { type Sql } from 'postgres'
import { migrationStatements } from './migration-sql.ts'
import * as schema from './schema.ts'

type GlobalPg = typeof globalThis & {
  __swagSql?: Sql
  __swagMigrated?: boolean
  __swagPoolWarned?: boolean
}

export type PgDb = PostgresJsDatabase<typeof schema>

export function databaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  const url = env.DATABASE_URL?.trim() ?? ''
  if (!url) throw new Error('DATABASE_URL is required. See DEPLOY.md.')
  if (!url.startsWith('postgres://') && !url.startsWith('postgresql://')) {
    throw new Error('DATABASE_URL must start with postgres:// or postgresql://. See DEPLOY.md.')
  }
  return url
}

function warnIfDirect(url: string) {
  const g = globalThis as GlobalPg
  if (g.__swagPoolWarned) return
  g.__swagPoolWarned = true
  if (/pooler|pgbouncer|:6543/i.test(url)) return
  console.warn(
    'DATABASE_URL does not look pooled (no "pooler" host, port 6543, or pgbouncer). On Vercel, use the Neon or Supabase pooled URL.',
  )
}

export function getSql(env: NodeJS.ProcessEnv = process.env): Sql {
  const g = globalThis as GlobalPg
  if (!g.__swagSql) {
    const url = databaseUrl(env)
    warnIfDirect(url)
    g.__swagSql = postgres(url, { max: 1, prepare: false, idle_timeout: 20 })
  }
  return g.__swagSql
}

export function openPostgres(env: NodeJS.ProcessEnv = process.env): PgDb {
  return drizzle(getSql(env), { schema })
}

/** Idempotent. Safe on every cold start; the CLI migrate command is what the Vercel build runs. */
export async function ensureMigrated(): Promise<void> {
  const g = globalThis as GlobalPg
  if (g.__swagMigrated) return
  const sql = getSql()
  for (const statement of migrationStatements()) {
    await sql.unsafe(statement)
  }
  g.__swagMigrated = true
}
