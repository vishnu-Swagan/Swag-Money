import { describe, expect, it } from 'vitest'
import { applyDetected, detectInstalledTools, memoryFs } from './detect.ts'

describe('swag-money installer', () => {
  it('reports only tools that have a home-directory marker', () => {
    const home = '/tmp/home'
    const fs = memoryFs({
      [`${home}/.claude/settings.json`]: '{}\n',
      [`${home}/.gemini/settings.json`]: '{}\n',
    })
    const found = detectInstalledTools(home, (path) => fs.exists(path))
    expect(found.find((tool) => tool.id === 'claude-code')?.present).toBe(true)
    expect(found.find((tool) => tool.id === 'gemini-cli')?.present).toBe(true)
    expect(found.find((tool) => tool.id === 'codex-cli')?.present).toBe(false)
  })

  it('merges Claude and Gemini config without dropping existing keys', () => {
    const home = '/tmp/home'
    const fs = memoryFs({
      [`${home}/.claude/settings.json`]: JSON.stringify({ theme: 'dark' }),
      [`${home}/.gemini/keep`]: 'dir',
    })
    const applied = applyDetected(home, fs)
    expect(applied).toEqual(['claude-code', 'gemini-cli'])
    const claude = JSON.parse(fs.read(`${home}/.claude/settings.json`)) as {
      theme: string
      spinnerTipsOverride: { label: string }
    }
    expect(claude.theme).toBe('dark')
    expect(claude.spinnerTipsOverride.label).toBe('Sponsored')
    const gemini = JSON.parse(fs.read(`${home}/.gemini/settings.json`)) as {
      ui: { customWittyPhrases: string[] }
    }
    expect(gemini.ui.customWittyPhrases[0]).toContain('Sponsored')
    expect(fs.read(`${home}/.swag-money/hook.sh`)).not.toMatch(/\bread\b/)
  })
})
