import { handleApi } from '@swag-money/api/http'
import { loadWorkerEnv } from '../../../lib/worker-env'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Ctx = { params: Promise<{ path?: string[] }> }

async function forward(request: Request, ctx: Ctx): Promise<Response> {
  await loadWorkerEnv()
  const { path } = await ctx.params
  const url = new URL(request.url)
  const suffix = path?.length ? `/${path.join('/')}` : ''
  const target = `http://swag.internal/v1${suffix}${url.search}`
  const headers = new Headers(request.headers)
  headers.delete('host')
  const method = request.method
  const init: RequestInit = { method, headers }
  if (method !== 'GET' && method !== 'HEAD') {
    init.body = await request.arrayBuffer()
  }
  return handleApi(new Request(target, init))
}

export const GET = forward
export const POST = forward
export const PATCH = forward
export const PUT = forward
export const DELETE = forward
export const OPTIONS = forward
