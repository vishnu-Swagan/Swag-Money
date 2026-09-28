/** Partial masks for list views. Detail pages return the original string. */

export function maskEmail(email: string): string {
  const at = email.indexOf('@')
  if (at <= 0) return '••••'
  const local = email.slice(0, at)
  const domain = email.slice(at + 1)
  const localMask = local.length <= 1 ? '•' : `${local[0]}•••${local.length > 2 ? local[local.length - 1] : ''}`
  const dot = domain.lastIndexOf('.')
  const host = dot > 0 ? domain.slice(0, dot) : domain
  const tld = dot > 0 ? domain.slice(dot) : ''
  const hostMask = host.length <= 1 ? '•' : `${host[0]}•••`
  return `${localMask}@${hostMask}${tld}`
}

export function maskWallet(value: string): string {
  const trimmed = value.trim()
  if (trimmed.length <= 8) return '••••'
  return `${trimmed.slice(0, 4)}…${trimmed.slice(-4)}`
}

/** UPI ids and lightning addresses contain @. Wallet addresses do not. */
export function maskCredential(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) return ''
  if (trimmed.includes('@')) return maskEmail(trimmed)
  return maskWallet(trimmed)
}
