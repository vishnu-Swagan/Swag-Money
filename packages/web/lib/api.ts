import { cookies } from 'next/headers'

export const API_URL = process.env.SWAG_API_URL ?? 'http://127.0.0.1:8787'

export async function api(path: string, init?: RequestInit): Promise<Response> {
  const jar = await cookies()
  const token = jar.get('swag_session')?.value
  const headers = new Headers(init?.headers)
  if (token) headers.set('authorization', `Bearer ${token}`)
  if (init?.body && !headers.has('content-type')) headers.set('content-type', 'application/json')
  return fetch(`${API_URL}${path}`, { ...init, headers, cache: 'no-store' })
}

export async function apiJson<T>(path: string, init?: RequestInit): Promise<{ ok: true; data: T } | { ok: false; error: string; status: number }> {
  try {
    const response = await api(path, init)
    const data = (await response.json().catch(() => null)) as (T & { error?: string }) | null
    if (!response.ok) {
      return { ok: false, error: data?.error ?? `Request failed (${response.status})`, status: response.status }
    }
    return { ok: true, data: data as T }
  } catch {
    return { ok: false, error: 'The API is not running. Start it with pnpm dev from the repo root.', status: 0 }
  }
}
