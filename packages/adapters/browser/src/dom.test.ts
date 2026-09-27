import { describe, expect, it } from 'vitest'
import { TOOLS } from '@swag-money/shared'
import { applyAdText, findGeneratingAnchor, findWaitState, HOST_RULES, surfaceForHost } from './dom.ts'

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

  it('maps each browser catalog surface to a host rule and a stop selector', () => {
    const browserTools = TOOLS.filter((tool) => tool.placement === 'browser')
    expect(browserTools.length).toBe(HOST_RULES.length)
    for (const tool of browserTools) {
      const rule = HOST_RULES.find((entry) => entry.id === tool.surface)
      expect(rule, tool.id).toBeTruthy()
      expect(surfaceForHost(rule!.hosts[0]!)).toBe(tool.surface)
      const anchor = { id: 'stop' }
      const doc = {
        querySelector(selector: string) {
          return selector === rule!.selectors[0] ? anchor : null
        },
      }
      expect(findGeneratingAnchor(doc as unknown as Document, rule!.hosts[0]!)).toBe(anchor)
    }
    expect(surfaceForHost('example.com')).toBe('browser')
  })
})
