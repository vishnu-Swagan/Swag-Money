import type { SwagDb } from './db.ts'
import { adminNotifications } from './schema.ts'

/**
 * Mock mail adapter. It records a row and does not open a network connection.
 * Turn it on with SWAG_ADMIN_NOTIFY=1. See DEPLOY.md for a real provider.
 */
export async function notifyAdvertiserSignup(
  db: SwagDb,
  input: { enabled: boolean; toEmail: string; advertiserEmail: string; name: string; now: number },
): Promise<void> {
  if (!input.enabled) return
  const to = input.toEmail.trim()
  await db.insert(adminNotifications).values({
    id: crypto.randomUUID(),
    kind: 'advertiser_signup',
    toEmail: to,
    subject: 'New advertiser signup',
    body: to
      ? `Mock email to ${to}: ${input.name} signed up as an advertiser (${input.advertiserEmail}). No message was sent.`
      : `SWAG_ADMIN_NOTIFY is on but SWAG_ADMIN_NOTIFY_TO is empty. ${input.name} signed up as an advertiser. No message was sent.`,
    adapter: 'mock',
    createdAtMs: input.now,
  })
}
