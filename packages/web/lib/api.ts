import { cookies } from 'next/headers'

function remoteBase(): string | undefined {
  const value = process.env.SWAG_API_URL?.trim()
  return value ? value.replace(/\/$/, '') : undefined
}

export async function api(path: string, init?: RequestInit): Promise<Response> {
  const jar = await cookies()
  const token = jar.get('swag_session')?.value
  const headers = new Headers(init?.headers)
  if (token && !headers.has('authorization')) headers.set('authorization', `Bearer ${token}`)
  if (init?.body && !headers.has('content-type')) headers.set('content-type', 'application/json')

  const remote = remoteBase()
  if (remote) {
    return fetch(`${remote}${path}`, { ...init, headers, cache: 'no-store' })
  }
  if (!process.env.DATABASE_URL?.trim()) {
    throw new Error('Set SWAG_API_URL to the local API, or DATABASE_URL for Postgres. See DEPLOY.md.')
  }
  const { handleApi } = await import('@swag-money/api/http')
  const method = init?.method ?? 'GET'
  const requestInit: RequestInit = { method, headers }
  if (method !== 'GET' && method !== 'HEAD' && init?.body !== undefined) {
    requestInit.body = init.body
  }
  return handleApi(new Request(`http://swag.internal${path}`, requestInit))
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
