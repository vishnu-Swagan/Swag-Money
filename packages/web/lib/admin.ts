import { notFound } from 'next/navigation'
import { isAdminEmail, parseAdminEmails } from '@swag-money/api/admin-auth'
import { apiJson } from './api'

export type AdminUser = { id: string; email: string; name: string; role: string }

/** Server-side allowlist check. Missing or non-admin sessions are a 404. */
export async function requireAdmin(): Promise<AdminUser> {
  const me = await apiJson<AdminUser>('/v1/me')
  const allow = parseAdminEmails(process.env.ADMIN_EMAILS)
  if (!me.ok || !isAdminEmail(me.data.email, allow)) notFound()
  return me.data
}

export function adminQuery(path: string, params: Record<string, string | undefined>): string {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value) search.set(key, value)
  }
  const qs = search.toString()
  return qs ? `${path}?${qs}` : path
}
