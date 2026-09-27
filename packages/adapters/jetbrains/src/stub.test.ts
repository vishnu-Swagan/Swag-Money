import { describe, expect, it } from 'vitest'
import { AdapterNotImplementedError, createJetBrainsSurface } from './stub.ts'

describe('JetBrains stub', () => {
  it('fails closed instead of pretending to render', async () => {
    const surface = createJetBrainsSurface()
    expect(surface.kind).toBe('jetbrains')
    await expect(Promise.resolve().then(() => surface.write('Northwind'))).rejects.toBeInstanceOf(AdapterNotImplementedError)
  })
})
