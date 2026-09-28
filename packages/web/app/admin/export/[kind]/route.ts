import { notFound } from 'next/navigation'
import { requireAdmin } from '../../../../lib/admin'
import { api } from '../../../../lib/api'

export const dynamic = 'force-dynamic'

const KINDS = new Set(['developers', 'advertisers', 'leads', 'campaigns', 'payouts', 'table'])

export async function GET(request: Request, ctx: { params: Promise<{ kind: string }> }) {
  await requireAdmin()
  const { kind } = await ctx.params
  if (!KINDS.has(kind)) notFound()
  const url = new URL(request.url)
  const response = await api(`/v1/admin/export/${kind}${url.search}`)
  if (response.status === 404) notFound()
  const headers = new Headers()
  headers.set('content-type', response.headers.get('content-type') ?? 'text/csv; charset=utf-8')
  headers.set('content-disposition', response.headers.get('content-disposition') ?? `attachment; filename="${kind}.csv"`)
  headers.set('x-robots-tag', 'noindex')
  headers.set('cache-control', 'no-store')
  return new Response(await response.arrayBuffer(), { status: response.status, headers })
}
