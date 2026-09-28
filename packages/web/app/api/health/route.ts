import { handleApi } from '@swag-money/api/http'
import { loadWorkerEnv } from '../../../lib/worker-env'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(): Promise<Response> {
  await loadWorkerEnv()
  return handleApi(new Request('http://swag.internal/v1/health'))
}
