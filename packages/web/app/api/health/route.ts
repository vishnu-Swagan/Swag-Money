import { handleApi } from '@swag-money/api/http'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export function GET(): Promise<Response> {
  return handleApi(new Request('http://swag.internal/v1/health'))
}
