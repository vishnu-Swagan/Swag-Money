/** Comma-separated allowlist from ADMIN_EMAILS. Empty means nobody is an admin. */
export function parseAdminEmails(raw: string | undefined): string[] {
  if (!raw) return []
  const seen = new Set<string>()
  for (const part of raw.split(',')) {
    const email = part.trim().toLowerCase()
    if (email) seen.add(email)
  }
  return [...seen]
}

export function isAdminEmail(email: string | null | undefined, allow: readonly string[]): boolean {
  if (!email) return false
  const needle = email.trim().toLowerCase()
  return allow.some((item) => item.trim().toLowerCase() === needle)
}
