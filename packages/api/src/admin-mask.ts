export const PIPELINE_STAGES = ['lead', 'contacted', 'onboarding', 'active', 'paused', 'churned'] as const
export type PipelineStage = (typeof PIPELINE_STAGES)[number]

export const PIPELINE_LABELS: Record<PipelineStage, string> = {
  lead: 'Lead',
  contacted: 'Contacted',
  onboarding: 'Onboarding',
  active: 'Active',
  paused: 'Paused',
  churned: 'Churned',
}

export const LEAD_STATUSES = ['new', 'reviewed', 'replied', 'spam'] as const
export type LeadStatus = (typeof LEAD_STATUSES)[number]

export function adminEmailsFromEnv(env: NodeJS.ProcessEnv = process.env): string[] {
  return (env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((part) => part.trim().toLowerCase())
    .filter((part) => part.length > 0)
}

export function isAdminEmail(email: string, allowlist: readonly string[]): boolean {
  const normalized = email.trim().toLowerCase()
  return normalized.length > 0 && allowlist.includes(normalized)
}

export function isPipelineStage(value: string): value is PipelineStage {
  return (PIPELINE_STAGES as readonly string[]).includes(value)
}

export function isLeadStatus(value: string): value is LeadStatus {
  return (LEAD_STATUSES as readonly string[]).includes(value)
}

/** List-view email. The first character of the local part stays visible. */
export function maskEmail(email: string): string {
  const trimmed = email.trim()
  const at = trimmed.lastIndexOf('@')
  if (at <= 0 || at === trimmed.length - 1) return '***'
  return `${trimmed.slice(0, 1)}***@${trimmed.slice(at + 1)}`
}

export function maskUpi(value: string): string {
  const trimmed = value.trim()
  const at = trimmed.lastIndexOf('@')
  if (at <= 0 || at === trimmed.length - 1) return maskOpaque(trimmed)
  const local = trimmed.slice(0, at)
  const keep = local.slice(0, Math.min(2, local.length))
  return `${keep}***@${trimmed.slice(at + 1)}`
}

export function maskWallet(value: string): string {
  const trimmed = value.trim()
  if (trimmed.length <= 8) return '***'
  return `${trimmed.slice(0, 4)}…${trimmed.slice(-4)}`
}

/** Partial mask for a payout destination. Provider names like "openai" are not secrets. */
export function maskDestination(value: string, provider?: string): string {
  const trimmed = value.trim()
  if (!trimmed) return ''
  if (provider === 'api_credits' && /^(anthropic|openai|oss)$/.test(trimmed)) return trimmed
  if (provider === 'upi' || looksLikeUpi(trimmed)) return maskUpi(trimmed)
  if (looksLikeEmail(trimmed)) return maskEmail(trimmed)
  return maskWallet(trimmed)
}

export function toCsv(headers: string[], rows: Array<Array<string | number>>): string {
  const lines = [headers, ...rows].map((row) => row.map((cell) => csvCell(String(cell))).join(','))
  return `${lines.join('\n')}\n`
}

function csvCell(value: string): string {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`
  return value
}

function looksLikeEmail(value: string): boolean {
  const at = value.lastIndexOf('@')
  if (at <= 0) return false
  return value.slice(at + 1).includes('.')
}

function looksLikeUpi(value: string): boolean {
  const at = value.lastIndexOf('@')
  if (at <= 0 || at === value.length - 1) return false
  return !value.slice(at + 1).includes('.')
}

function maskOpaque(value: string): string {
  if (value.length <= 8) return '***'
  return maskWallet(value)
}
