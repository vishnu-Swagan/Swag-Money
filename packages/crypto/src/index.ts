import { ed25519 } from '@noble/curves/ed25519'
import { sha256 } from '@noble/hashes/sha2'
import { ADVERTISER_MAX, AD_TEXT_MAX, isSurface, type Surface } from '@swag-money/shared'

export class PayloadError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PayloadError'
  }
}

export type AdPayload = {
  v: 1
  impressionId: string
  text: string
  advertiser: string
  nonce: string
  surface: Surface
  expiresAt: string
}

const PAYLOAD_KEYS = ['advertiser', 'expiresAt', 'impressionId', 'nonce', 'surface', 'text', 'v'] as const

export type RenderSample = {
  offsetMs: number
  readBack: string
}

export function generateEd25519KeyPair(): { privateKey: Uint8Array; publicKey: Uint8Array } {
  const privateKey = ed25519.utils.randomPrivateKey()
  const publicKey = ed25519.getPublicKey(privateKey)
  return { privateKey, publicKey }
}

export function publicKeyFromPrivate(privateKey: Uint8Array): Uint8Array {
  return ed25519.getPublicKey(privateKey)
}

export function fingerprint(publicKey: Uint8Array): string {
  const hash = sha256(publicKey)
  return [...hash.subarray(0, 8)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

export function bytesToB64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')
}

export function b64UrlToBytes(value: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) {
    throw new PayloadError('expected base64url')
  }
  const padded = value.replaceAll('-', '+').replaceAll('_', '/') + '='.repeat((4 - (value.length % 4)) % 4)
  const binary = atob(padded)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

export function randomHex(byteLength: number): string {
  const bytes = new Uint8Array(byteLength)
  crypto.getRandomValues(bytes)
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

export function assertDisplayString(text: unknown, max = AD_TEXT_MAX): asserts text is string {
  if (typeof text !== 'string') throw new PayloadError('display string must be a string')
  if (text.length < 1 || text.length > max) throw new PayloadError(`display string must be 1..${max} characters`)
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i)
    if (code < 0x20 || code > 0x7e) {
      throw new PayloadError('display string must be a single printable ASCII line')
    }
  }
}

export function canonicalPayload(payload: AdPayload): string {
  return JSON.stringify({
    advertiser: payload.advertiser,
    expiresAt: payload.expiresAt,
    impressionId: payload.impressionId,
    nonce: payload.nonce,
    surface: payload.surface,
    text: payload.text,
    v: payload.v,
  })
}

export function assertPayload(input: unknown): AdPayload {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    throw new PayloadError('payload must be an object')
  }
  const record = input as Record<string, unknown>
  const keys = Object.keys(record)
  if (keys.length !== PAYLOAD_KEYS.length || PAYLOAD_KEYS.some((key) => !Object.hasOwn(record, key))) {
    throw new PayloadError('payload must contain only the signed string fields')
  }
  if (record.v !== 1) throw new PayloadError('unsupported payload version')
  assertDisplayString(record.text, AD_TEXT_MAX)
  assertDisplayString(record.advertiser, ADVERTISER_MAX)
  if (typeof record.impressionId !== 'string' || !/^[0-9a-f-]{36}$/i.test(record.impressionId)) {
    throw new PayloadError('impressionId must be a uuid string')
  }
  if (typeof record.nonce !== 'string' || !/^[0-9a-f]{32}$/.test(record.nonce)) {
    throw new PayloadError('nonce must be 32 hex characters')
  }
  if (typeof record.surface !== 'string' || !isSurface(record.surface)) {
    throw new PayloadError('unknown surface')
  }
  if (typeof record.expiresAt !== 'string' || Number.isNaN(Date.parse(record.expiresAt))) {
    throw new PayloadError('expiresAt must be an ISO date string')
  }
  return {
    v: 1,
    advertiser: record.advertiser,
    expiresAt: record.expiresAt,
    impressionId: record.impressionId,
    nonce: record.nonce,
    surface: record.surface,
    text: record.text,
  }
}

export function signBytes(message: Uint8Array, privateKey: Uint8Array): Uint8Array {
  return ed25519.sign(message, privateKey)
}

export function verifyBytes(signature: Uint8Array, message: Uint8Array, publicKey: Uint8Array): boolean {
  try {
    return ed25519.verify(signature, message, publicKey)
  } catch {
    return false
  }
}

function utf8(value: string): Uint8Array {
  return new TextEncoder().encode(value)
}

export function signPayload(payload: AdPayload, privateKey: Uint8Array): string {
  assertPayload(payload)
  return bytesToB64Url(signBytes(utf8(canonicalPayload(payload)), privateKey))
}

/** Verify a signed ad. Rejects non-strings, extra fields, and bad signatures before any render. */
export function openSignedPayload(input: unknown, signatureB64: string, publicKey: Uint8Array): AdPayload {
  const payload = assertPayload(input)
  const signature = b64UrlToBytes(signatureB64)
  const ok = verifyBytes(signature, utf8(canonicalPayload(payload)), publicKey)
  if (!ok) throw new PayloadError('signature did not verify against the pinned public key')
  return payload
}

export function canonicalAdRequest(input: {
  installId: string
  surface: string
  requestNonce: string
  signedAt: number
}): string {
  return [
    'swag-money/ad-request/v1',
    input.installId,
    input.surface,
    input.requestNonce,
    String(input.signedAt),
  ].join('\n')
}

export function canonicalTranscript(input: {
  impressionId: string
  nonce: string
  surface: string
  text: string
  samples: readonly RenderSample[]
}): string {
  return [
    'swag-money/render-proof/v1',
    input.impressionId,
    input.nonce,
    input.surface,
    input.text,
    ...input.samples.map((sample) => `${sample.offsetMs} ${sample.readBack}`),
  ].join('\n')
}

export function signTranscript(
  transcript: Parameters<typeof canonicalTranscript>[0],
  privateKey: Uint8Array,
): string {
  return bytesToB64Url(signBytes(utf8(canonicalTranscript(transcript)), privateKey))
}

export function verifyTranscript(
  transcript: Parameters<typeof canonicalTranscript>[0],
  signatureB64: string,
  publicKey: Uint8Array,
): boolean {
  try {
    const signature = b64UrlToBytes(signatureB64)
    return verifyBytes(signature, utf8(canonicalTranscript(transcript)), publicKey)
  } catch {
    return false
  }
}

/**
 * Structural checks on samples taken from a render surface.
 * This does not trust the client clock for payout; the server also requires
 * wall-clock time since the nonce was issued.
 */
export function validateContinuousView(
  samples: readonly RenderSample[],
  text: string,
  minViewMs: number,
): void {
  if (!Array.isArray(samples) || samples.length < 3) {
    throw new PayloadError('a payable view needs at least 3 render samples')
  }
  let previous = -1
  for (const sample of samples) {
    if (!sample || typeof sample !== 'object') throw new PayloadError('sample must be an object')
    if (!Number.isInteger(sample.offsetMs) || sample.offsetMs < 0) {
      throw new PayloadError('sample offset must be a non-negative integer')
    }
    if (sample.offsetMs <= previous) throw new PayloadError('sample offsets must strictly increase')
    if (typeof sample.readBack !== 'string' || sample.readBack !== text) {
      throw new PayloadError('read-back does not match the served text')
    }
    previous = sample.offsetMs
  }
  if (samples[0]!.offsetMs > 500) throw new PayloadError('first sample must be taken when the text is written')
  const span = samples[samples.length - 1]!.offsetMs - samples[0]!.offsetMs
  if (span < minViewMs) throw new PayloadError(`continuous view shorter than ${minViewMs}ms`)
}
