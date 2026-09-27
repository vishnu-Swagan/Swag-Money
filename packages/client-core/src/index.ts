import {
  PayloadError,
  bytesToB64Url,
  canonicalAdRequest,
  openSignedPayload,
  randomHex,
  signBytes,
  signTranscript,
  validateContinuousView,
  type AdPayload,
  type RenderSample,
} from '@swag-money/crypto'
import { MIN_VIEW_MS, type Surface } from '@swag-money/shared'

export type Clock = {
  now(): number
  sleep(ms: number): Promise<void>
}

export const systemClock: Clock = {
  now: () => Date.now(),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
}

/**
 * The only thing an adapter is allowed to do with an ad: put a string on a
 * surface the developer already has, read it back, and put the old string back.
 * Adapters must not fetch remote code or change a content-security policy.
 */
export type RenderSurface = {
  readonly kind: Surface
  write(text: string): Promise<void> | void
  readBack(): Promise<string> | string
  restore(): Promise<void> | void
}

export class ImpressionError extends Error {
  readonly code: string

  constructor(code: string, message: string) {
    super(message)
    this.name = 'ImpressionError'
    this.code = code
  }
}

export type ServedAd = {
  payload: AdPayload
  signature: string
  clearing: {
    priceCents: number
    developerShareCents: number
    platformShareCents: number
  }
}

export type RunImpressionOptions = {
  apiUrl: string
  installId: string
  devicePrivateKey: Uint8Array
  surface: RenderSurface
  /** Ed25519 public key pinned locally. Never taken from the ad response. */
  pinnedPublicKey: Uint8Array
  clock?: Clock
  minViewMs?: number
  fetchImpl?: typeof fetch
}

export type RunImpressionResult = {
  impressionId: string
  text: string
  advertiser: string
  priceCents: number
  developerShareCents: number
  platformShareCents: number
  samples: RenderSample[]
}

type AdResponse = {
  payload?: unknown
  signature?: unknown
  attention?: { minViewMs?: number }
  clearing?: {
    priceCents?: number
    developerShareCents?: number
    platformShareCents?: number
  }
}

export async function runImpression(options: RunImpressionOptions): Promise<RunImpressionResult> {
  const clock = options.clock ?? systemClock
  const fetchImpl = options.fetchImpl ?? fetch
  const minViewMs = options.minViewMs ?? MIN_VIEW_MS
  const base = options.apiUrl.replace(/\/$/, '')
  const signedAt = clock.now()
  const requestNonce = randomHex(16)
  const requestMessage = canonicalAdRequest({
    installId: options.installId,
    surface: options.surface.kind,
    requestNonce,
    signedAt,
  })
  const requestSignature = bytesToB64Url(signBytes(utf8(requestMessage), options.devicePrivateKey))

  const served = await postJson<AdResponse>(fetchImpl, `${base}/v1/ads/request`, {
    installId: options.installId,
    surface: options.surface.kind,
    requestNonce,
    signedAt,
    signature: requestSignature,
  })

  if (typeof served.signature !== 'string') {
    throw new ImpressionError('bad_response', 'Ad response did not include a signature')
  }

  let payload: AdPayload
  try {
    payload = openSignedPayload(served.payload, served.signature, options.pinnedPublicKey)
  } catch (error) {
    if (error instanceof PayloadError) {
      throw new ImpressionError('bad_signature', error.message)
    }
    throw error
  }

  if (payload.surface !== options.surface.kind) {
    throw new ImpressionError('bad_surface', 'Signed surface does not match this adapter')
  }
  if (Date.parse(payload.expiresAt) <= clock.now()) {
    throw new ImpressionError('expired', 'Signed payload is already expired')
  }

  const requiredMs = Math.max(minViewMs, served.attention?.minViewMs ?? minViewMs)
  let wrote = false
  try {
    await options.surface.write(payload.text)
    wrote = true
    const samples = await sampleSurface(options.surface, payload.text, clock, requiredMs)
    validateContinuousView(samples, payload.text, requiredMs)
    const proof = signTranscript(
      {
        impressionId: payload.impressionId,
        nonce: payload.nonce,
        surface: payload.surface,
        text: payload.text,
        samples,
      },
      options.devicePrivateKey,
    )
    const verified = await postJson<{
      priceCents: number
      developerShareCents: number
      platformShareCents: number
    }>(fetchImpl, `${base}/v1/ads/verify`, {
      impressionId: payload.impressionId,
      samples,
      signature: proof,
    })
    return {
      impressionId: payload.impressionId,
      text: payload.text,
      advertiser: payload.advertiser,
      priceCents: verified.priceCents,
      developerShareCents: verified.developerShareCents,
      platformShareCents: verified.platformShareCents,
      samples,
    }
  } finally {
    if (wrote) await options.surface.restore()
  }
}

async function sampleSurface(
  surface: RenderSurface,
  text: string,
  clock: Clock,
  minViewMs: number,
): Promise<RenderSample[]> {
  const start = clock.now()
  const points = [0, Math.floor(minViewMs / 2), minViewMs]
  const samples: RenderSample[] = []
  for (const point of points) {
    const wait = start + point - clock.now()
    if (wait > 0) await clock.sleep(wait)
    const readBack = await surface.readBack()
    if (readBack !== text) {
      throw new ImpressionError(
        'attention_broken',
        'The rendered string changed before the continuous-view threshold',
      )
    }
    samples.push({ offsetMs: clock.now() - start, readBack })
  }
  return samples
}

async function postJson<T>(fetchImpl: typeof fetch, url: string, body: unknown): Promise<T> {
  const response = await fetchImpl(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  const parsed = (await response.json().catch(() => null)) as (T & { error?: string; code?: string }) | null
  if (!response.ok) {
    throw new ImpressionError(parsed?.code ?? 'http_error', parsed?.error ?? `Request failed (${response.status})`)
  }
  if (!parsed) throw new ImpressionError('bad_response', 'Empty response')
  return parsed
}

function utf8(value: string): Uint8Array {
  return new TextEncoder().encode(value)
}
