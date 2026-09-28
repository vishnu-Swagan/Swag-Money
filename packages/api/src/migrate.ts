import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import postgres from 'postgres'
import { isHosted } from './config.ts'
import { migrationStatements } from './migration-sql.ts'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
loadDotEnv(path.join(repoRoot, '.env'))

const url = process.env.DATABASE_URL?.trim() ?? ''
const required = isHosted() || process.env.SWAG_REQUIRE_DATABASE === '1'

if (!url) {
  if (required) {
    console.error('DATABASE_URL is required to migrate. See DEPLOY.md.')
    process.exit(1)
  }
  console.log('DATABASE_URL is unset; skipping migrations. Local dev uses the embedded database.')
  process.exit(0)
}

if (!url.startsWith('postgres://') && !url.startsWith('postgresql://')) {
  console.error('DATABASE_URL must start with postgres:// or postgresql://. See DEPLOY.md.')
  process.exit(1)
}

const sql = postgres(url, { max: 1, prepare: false, idle_timeout: 20 })
try {
  await sql.unsafe('SET client_min_messages TO warning')
  for (const statement of migrationStatements()) {
    await sql.unsafe(statement)
  }
  console.log('Migrations applied.')
} finally {
  await sql.end({ timeout: 5 })
}

function loadDotEnv(file: string) {
  if (!existsSync(file)) return
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq < 1) continue
    const key = trimmed.slice(0, eq).trim()
    let value = trimmed.slice(eq + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    if (process.env[key] === undefined) process.env[key] = value
  }
}
