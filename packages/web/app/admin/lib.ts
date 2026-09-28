import { notFound } from 'next/navigation'
import { apiJson } from '../../lib/api'

export type Page<T> = { rows: T[]; page: number; pageSize: number; total: number }

export async function adminGet<T>(path: string): Promise<T> {
  const result = await apiJson<T>(path)
  if (!result.ok) {
    if (result.status === 404 || result.status === 401 || result.status === 0) notFound()
    throw new Error(result.error)
  }
  return result.data
}

export function money(cents: number): string {
  const sign = cents < 0 ? '-' : ''
  return `${sign}$${(Math.abs(cents) / 100).toFixed(2)}`
}

export function when(ms: number | null | undefined): string {
  if (!ms) return '—'
  return new Date(ms).toISOString().slice(0, 10)
}

export function qs(params: Record<string, string | undefined>): string {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value) search.set(key, value)
  }
  const text = search.toString()
  return text ? `?${text}` : ''
}
