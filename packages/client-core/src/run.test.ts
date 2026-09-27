import { describe, expect, it } from 'vitest'
import { generateEd25519KeyPair, signPayload, type AdPayload } from '@swag-money/crypto'
import { ImpressionError, runImpression, type RenderSurface } from './index.ts'

function surface(initial = ''): RenderSurface & { writes: string[]; restores: number; text: string } {
  const state = { text: initial, writes: [] as string[], restores: 0 }
  return {
    kind: 'claude-code',
    writes: state.writes,
    get restores() {
      return state.restores
    },
    get text() {
      return state.text
    },
    async write(text: string) {
      state.writes.push(text)
      state.text = text
    },
    async readBack() {
      return state.text
    },
    async restore() {
      state.restores += 1
      state.text = initial
    },
  }
}

function payload(text: string): AdPayload {
  return {
    v: 1,
    impressionId: '11111111-1111-4111-8111-111111111111',
    text,
    advertiser: 'Northwind',
    nonce: 'ab'.repeat(16),
    surface: 'claude-code',
    expiresAt: '2099-01-01T00:00:00.000Z',
  }
}

describe('client render loop', () => {
  it('does not write when the signature was not made by the pinned key', async () => {
    const pin = generateEd25519KeyPair()
    const attacker = generateEd25519KeyPair()
    const body = payload('Northwind CI: ephemeral environments for every PR')
    const view = surface()
    const fetchImpl: typeof fetch = async () =>
      new Response(JSON.stringify({ payload: body, signature: signPayload(body, attacker.privateKey) }), { status: 200 })

    await expect(
      runImpression({
        apiUrl: 'http://api.test',
        installId: 'install',
        devicePrivateKey: pin.privateKey,
        pinnedPublicKey: pin.publicKey,
        surface: view,
        fetchImpl,
        clock: { now: () => 0, sleep: async () => undefined },
      }),
    ).rejects.toBeInstanceOf(ImpressionError)
    expect(view.writes).toEqual([])
    expect(view.restores).toBe(0)
  })

  it('refuses to sign a proof when the surface does not keep the string up', async () => {
    const keys = generateEd25519KeyPair()
    const body = payload('Northwind CI: ephemeral environments for every PR')
    let reads = 0
    const view: RenderSurface = {
      kind: 'claude-code',
      async write() {},
      async readBack() {
        reads += 1
        return reads === 1 ? body.text : 'Thinking'
      },
      async restore() {},
    }
    let verifyCalls = 0
    const fetchImpl: typeof fetch = async (input) => {
      const url = String(input)
      if (url.endsWith('/v1/ads/request')) {
        return new Response(JSON.stringify({ payload: body, signature: signPayload(body, keys.privateKey), attention: { minViewMs: 5000 } }), {
          status: 200,
        })
      }
      verifyCalls += 1
      return new Response(JSON.stringify({ ok: true }), { status: 200 })
    }

    await expect(
      runImpression({
        apiUrl: 'http://api.test',
        installId: 'install',
        devicePrivateKey: keys.privateKey,
        pinnedPublicKey: keys.publicKey,
        surface: view,
        fetchImpl,
        minViewMs: 5000,
        clock: {
          now: () => 0,
          sleep: async () => undefined,
        },
      }),
    ).rejects.toMatchObject({ code: 'attention_broken' })
    expect(verifyCalls).toBe(0)
  })

  it('rejects a payload that smuggles an extra field', async () => {
    const keys = generateEd25519KeyPair()
    const body = payload('Northwind CI: ephemeral environments for every PR')
    const signature = signPayload(body, keys.privateKey)
    const view = surface()
    const fetchImpl: typeof fetch = async () =>
      new Response(JSON.stringify({ payload: { ...body, script: 'https://evil.example/a.js' }, signature }), { status: 200 })

    await expect(
      runImpression({
        apiUrl: 'http://api.test',
        installId: 'install',
        devicePrivateKey: keys.privateKey,
        pinnedPublicKey: keys.publicKey,
        surface: view,
        fetchImpl,
      }),
    ).rejects.toMatchObject({ code: 'bad_signature' })
    expect(view.writes).toEqual([])
  })
})
