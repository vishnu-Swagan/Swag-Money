import { b64UrlToBytes } from '@swag-money/crypto'
import { signingPublicKeysMatch } from './keys-env.ts'

/** Set SWAG_ENV=production on the Worker. Local `pnpm dev` leaves it unset and keeps the embedded database. */
export function isHosted(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.SWAG_ENV === 'production'
}

/** Names of required production variables that are missing or unusable. Empty when this process is not hosted. */
export function productionProblems(env: NodeJS.ProcessEnv = process.env): string[] {
  if (!isHosted(env)) return []
  const problems: string[] = []
  const databaseUrl = env.DATABASE_URL?.trim() ?? ''
  if (!databaseUrl.startsWith('postgres://') && !databaseUrl.startsWith('postgresql://')) {
    problems.push('DATABASE_URL')
  }
  if (!validSigningSeed(env.SWAG_SIGNING_PRIVATE_KEY)) problems.push('SWAG_SIGNING_PRIVATE_KEY')
  if (!signingPublicKeysMatch(env.SWAG_SIGNING_PRIVATE_KEY, env.SWAG_SIGNING_PUBLIC_KEY)) {
    problems.push('SWAG_SIGNING_PUBLIC_KEY')
  }
  const session = env.SWAG_SESSION_SECRET?.trim() ?? ''
  if (session.length < 16 || session === 'replace-with-a-long-random-string') problems.push('SWAG_SESSION_SECRET')
  const share = env.SWAG_DEVELOPER_SHARE_BPS?.trim() ?? ''
  if (!/^\d+$/.test(share) || Number(share) > 10_000) problems.push('SWAG_DEVELOPER_SHARE_BPS')
  const site = env.SWAG_PUBLIC_SITE_URL?.trim() ?? ''
  if (!validSiteUrl(site)) problems.push('SWAG_PUBLIC_SITE_URL')
  return problems
}

function validSiteUrl(site: string): boolean {
  try {
    const url = new URL(site)
    return url.protocol === 'https:' || url.protocol === 'http:'
  } catch {
    return false
  }
}

export function assertProductionEnv(env: NodeJS.ProcessEnv = process.env): void {
  const problems = productionProblems(env)
  if (problems.length === 0) return
  throw new Error(
    `Missing or invalid production environment: ${problems.join(', ')}. Set Worker secrets and vars (see DEPLOY.md) and redeploy.`,
  )
}

function validSigningSeed(value: string | undefined): boolean {
  const trimmed = value?.trim() ?? ''
  if (!trimmed || trimmed === 'replace-me') return false
  try {
    return b64UrlToBytes(trimmed).length === 32
  } catch {
    return false
  }
}
