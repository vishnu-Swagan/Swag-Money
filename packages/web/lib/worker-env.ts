const RUNTIME_KEYS = [
  'DATABASE_URL',
  'SWAG_ENV',
  'SWAG_SIGNING_PRIVATE_KEY',
  'SWAG_SIGNING_PUBLIC_KEY',
  'SWAG_SESSION_SECRET',
  'SWAG_DEVELOPER_SHARE_BPS',
  'SWAG_PUBLIC_SITE_URL',
  'SWAG_MIN_VIEW_MS',
  'SWAG_PAYOUT_MIN_CENTS',
  'SWAG_IMPRESSION_TTL_MS',
  'SWAG_ALLOW_DEMO',
  'STRIPE_SECRET_KEY',
  'STRIPE_CONNECT_CLIENT_ID',
  'SOLANA_RPC_URL',
  'SOLANA_PAYOUT_SECRET_KEY',
  'LIGHTNING_NODE_URL',
  'LIGHTNING_MACAROON',
  'OPENAI_API_KEY',
  'ANTHROPIC_API_KEY',
  'RAZORPAYX_KEY_ID',
  'RAZORPAYX_KEY_SECRET',
  'ADMIN_EMAILS',
  'ADMIN_NOTIFY_ADVERTISERS',
  'ADMIN_NOTIFY_EMAIL',
] as const

/** Copy Worker bindings onto process.env. Hyperdrive, when bound, replaces DATABASE_URL. */
export async function loadWorkerEnv(): Promise<void> {
  try {
    const { getCloudflareContext } = await import('@opennextjs/cloudflare')
    const { env } = await getCloudflareContext({ async: true })
    const record = env as unknown as Record<string, unknown>
    for (const key of RUNTIME_KEYS) {
      const value = record[key]
      if (typeof value === 'string' && value.trim()) process.env[key] = value
    }
    const hyperdrive = record.HYPERDRIVE as { connectionString?: string } | undefined
    if (hyperdrive?.connectionString) process.env.DATABASE_URL = hyperdrive.connectionString
  } catch {
    // next dev and unit tests have no Worker context. process.env is already set.
  }
}
