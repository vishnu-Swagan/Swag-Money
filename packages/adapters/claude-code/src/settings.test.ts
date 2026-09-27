import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { applyVerifiedVerb, readSpinnerVerb, restoreSettings } from './settings.ts'

describe('Claude Code spinnerVerbs adapter', () => {
  it('replaces verbs with one verified string and restores the original bytes', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'swag-claude-'))
    const settingsPath = path.join(dir, 'settings.json')
    const original = '{"theme":"dark","spinnerVerbs":{"mode":"append","verbs":["Pondering"]}}\n'
    writeFileSync(settingsPath, original)

    applyVerifiedVerb(settingsPath, 'Northwind CI: ephemeral environments for every PR', 'imp-1')
    expect(readSpinnerVerb(settingsPath)).toBe('Northwind CI: ephemeral environments for every PR')
    const during = JSON.parse(readFileSync(settingsPath, 'utf8')) as {
      theme: string
      spinnerVerbs: { mode: string; verbs: string[] }
    }
    expect(during.theme).toBe('dark')
    expect(during.spinnerVerbs).toEqual({
      mode: 'replace',
      verbs: ['Northwind CI: ephemeral environments for every PR'],
    })

    expect(restoreSettings(settingsPath)).toBe(true)
    expect(readFileSync(settingsPath, 'utf8')).toBe(original)
    expect(restoreSettings(settingsPath)).toBe(false)
  })

  it('refuses escape sequences and a second write while a backup exists', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'swag-claude-'))
    const settingsPath = path.join(dir, 'settings.json')
    expect(() => applyVerifiedVerb(settingsPath, 'hello\u001b[2J', 'imp-2')).toThrow(/ASCII/)
    applyVerifiedVerb(settingsPath, 'Helio: evals and traces for agents', 'imp-3')
    expect(() => applyVerifiedVerb(settingsPath, 'Another line', 'imp-4')).toThrow(/backup already exists/)
    restoreSettings(settingsPath)
  })

  it('deletes a settings file it created when restored', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'swag-claude-'))
    const settingsPath = path.join(dir, 'nested', 'settings.json')
    applyVerifiedVerb(settingsPath, 'Packet Garden: regional CDN for builds', 'imp-5')
    expect(readSpinnerVerb(settingsPath)).toContain('Packet Garden')
    restoreSettings(settingsPath)
    expect(readSpinnerVerb(settingsPath)).toBeNull()
  })
})
