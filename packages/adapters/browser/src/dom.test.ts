import { describe, expect, it } from 'vitest'
import { applyAdText, findWaitState } from './dom.ts'

describe('browser text slot', () => {
  it('sets textContent and refuses markup or escapes', () => {
    const el = { textContent: 'Thinking…' }
    applyAdText(el, 'Northwind CI: ephemeral environments for every PR')
    expect(el.textContent).toBe('Northwind CI: ephemeral environments for every PR')
    expect(() => applyAdText(el, 'hello\n<script>alert(1)</script>')).toThrow(/ASCII/)
    expect(() => applyAdText(el, 'hello\u001b[31m')).toThrow(/ASCII/)
  })

  it('finds an explicit slot without scanning the whole page for HTML injection', () => {
    const slot = { id: 'swag-money-slot', textContent: 'Thinking' }
    const doc = {
      querySelector(selector: string) {
        return selector.includes('swag-money-slot') ? slot : null
      },
      querySelectorAll() {
        return []
      },
    }
    expect(findWaitState(doc as unknown as Document)).toBe(slot)
  })
})
