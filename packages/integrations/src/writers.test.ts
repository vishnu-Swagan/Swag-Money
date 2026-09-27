import { describe, expect, it } from 'vitest'
import {
  antigravityScript,
  clineHooks,
  cursorHooks,
  gooseStatusScript,
  hookScript,
  kiloPluginSource,
  mergeAntigravitySettings,
  mergeClaudeSettings,
  mergeCopilotConfig,
  mergePhraseSettings,
  opencodePluginSource,
  statusLineScript,
  windsurfHooks,
} from './index.ts'

describe('official config writers', () => {
  it('labels Claude tips as Sponsored and keeps unrelated settings', () => {
    const next = mergeClaudeSettings({ theme: 'dark', spinnerVerbs: { mode: 'append', verbs: ['Thinking'] } }, ['Northwind CI'], '/bin/swag-status')
    expect(next.theme).toBe('dark')
    const tips = next.spinnerTipsOverride as { label: string; tips: string[] }
    expect(tips.label).toBe('Sponsored')
    expect(tips.tips).toEqual(['Northwind CI'])
    expect((next.statusLine as { command: string }).command).toBe('/bin/swag-status')
  })

  it('merges Gemini and Qwen phrases without dropping other ui keys', () => {
    const next = mergePhraseSettings({ ui: { theme: 'ansi' }, model: 'gemini' }, ['Northwind CI'])
    const ui = next.ui as { theme: string; loadingPhrases: string; customWittyPhrases: string[] }
    expect(ui.theme).toBe('ansi')
    expect(ui.loadingPhrases).toBe('witty')
    expect(ui.customWittyPhrases[0]).toBe('Sponsored · Northwind CI')
    expect(next.model).toBe('gemini')
  })

  it('keeps Copilot experimental flags and points statusLine at a local command', () => {
    const next = mergeCopilotConfig({ experimental_flags: ['OTHER'], trusted: true }, '/bin/swag-status')
    expect(next.experimental_flags).toEqual(['OTHER', 'STATUS_LINE'])
    expect(next.trusted).toBe(true)
  })

  it('writes hook commands that do not read stdin', () => {
    const script = hookScript()
    expect(script).not.toMatch(/\bread\b/)
    expect(script).not.toContain('transcript')
    expect(cursorHooks('/bin/swag-hook').hooks.beforeSubmitPrompt[0]?.command).toContain('start')
    expect(windsurfHooks('/bin/swag-hook').hooks.pre_user_prompt[0]?.command).toContain('start')
    expect(clineHooks('/bin/swag-hook').hooks[0]?.name).toBe('TaskStart')
    const status = statusLineScript()
    expect(status).toContain('Sponsored')
    expect(status).not.toMatch(/\bread\b/)
  })

  it('limits the Antigravity script to agent_state', () => {
    const script = antigravityScript()
    expect(script).toContain('agent_state')
    expect(script).not.toContain('console.log')
    expect(script).not.toContain('prompt')
    const settings = mergeAntigravitySettings({ model: 'ag' }, '/bin/swag-ag')
    expect((settings.statusLine as { stack_with_default: boolean }).stack_with_default).toBe(true)
  })

  it('keeps plugin scaffolds from reading prompts', () => {
    for (const source of [opencodePluginSource(), kiloPluginSource(), gooseStatusScript()]) {
      expect(source.toLowerCase()).not.toContain('transcript')
      expect(source.toLowerCase()).not.toContain('prompt')
    }
  })
})
