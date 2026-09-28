import { neonConfig, Pool } from '@neondatabase/serverless'
import { drizzle as drizzleNeon } from 'drizzle-orm/neon-serverless'
import { drizzle as drizzlePostgres } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import type { SwagDb } from './db.ts'
import * as schema from './schema.ts'

/**
 * Query helper for the Worker. One connection per request, closed before the
 * response returns. Migrations are not run here; use `pnpm db:migrate`.
 *
 * Neon hosts use @neondatabase/serverless over WebSocket (Workers have no TCP).
 * localhost uses postgres.js so `pnpm preview` can talk to a Postgres on this machine.
 * Optional Hyperdrive: the web layer copies HYPERDRIVE.connectionString onto DATABASE_URL first.
 */
export async function withDatabase<T>(fn: (db: SwagDb) => Promise<T>, env: NodeJS.ProcessEnv = process.env): Promise<T> {
  const url = databaseUrl(env)
  if (isLocalPostgres(url)) return withLocalPostgres(url, fn)
  return withNeon(url, fn)
}

export function databaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  const url = env.DATABASE_URL?.trim() ?? ''
  if (!url) throw new Error('DATABASE_URL is required. See DEPLOY.md.')
  if (!url.startsWith('postgres://') && !url.startsWith('postgresql://')) {
    throw new Error('DATABASE_URL must start with postgres:// or postgresql://. See DEPLOY.md.')
  }
  return url
}

export function isLocalPostgres(url: string): boolean {
  const host = new URL(url).hostname
  return host === 'localhost' || host === '127.0.0.1' || host === '::1'
}

async function withLocalPostgres<T>(url: string, fn: (db: SwagDb) => Promise<T>): Promise<T> {
  const sql = postgres(url, { max: 1, prepare: false, idle_timeout: 5, connect_timeout: 10 })
  try {
    return await fn(drizzlePostgres(sql, { schema }) as unknown as SwagDb)
  } finally {
    await sql.end({ timeout: 5 })
  }
}

async function withNeon<T>(url: string, fn: (db: SwagDb) => Promise<T>): Promise<T> {
  if (/pooler|pgbouncer|:6543/i.test(url)) {
    console.warn(
      'DATABASE_URL looks like a pooled Neon or PgBouncer URL. The serverless driver wants the direct Neon host, not the -pooler host.',
    )
  }
  const webSocket = (globalThis as { WebSocket?: typeof WebSocket }).WebSocket
  if (!webSocket) throw new Error('WebSocket is required for the Neon driver. See DEPLOY.md.')
  neonConfig.webSocketConstructor = webSocket
  const pool = new Pool({ connectionString: url, max: 1 })
  try {
    return await fn(drizzleNeon(pool, { schema }) as unknown as SwagDb)
  } finally {
    await pool.end()
  }
}
