import { notFound } from 'next/navigation'
import { api } from '../../../../lib/api'

export const dynamic = 'force-dynamic'

export async function GET(request: Request, ctx: { params: Promise<{ kind: string }> }) {
  const { kind } = await ctx.params
  if (!/^[a-z0-9_]+$/.test(kind)) notFound()
  const url = new URL(request.url)
  const response = await api(`/v1/admin/export/${kind}${url.search}`)
  if (response.status === 404) notFound()
  const body = await response.arrayBuffer()
  return new Response(body, {
    status: response.status,
    headers: {
      'content-type': response.headers.get('content-type') ?? 'text/csv; charset=utf-8',
      'content-disposition': response.headers.get('content-disposition') ?? `attachment; filename="${kind}.csv"`,
      'x-robots-tag': 'noindex',
      'cache-control': 'no-store',
    },
  })
}
