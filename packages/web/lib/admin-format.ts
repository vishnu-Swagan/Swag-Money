import { formatUsd } from '@swag-money/shared'

export function usd(cents: number): string {
  return formatUsd(cents)
}

export function when(ms: number | null | undefined): string {
  if (!ms) return '—'
  return new Date(ms).toISOString().slice(0, 16).replace('T', ' ')
}

export function day(ms: number | null | undefined): string {
  if (!ms) return '—'
  return new Date(ms).toISOString().slice(0, 10)
}
