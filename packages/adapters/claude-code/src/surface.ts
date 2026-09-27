import type { RenderSurface } from '@swag-money/client-core'
import { applyVerifiedVerb, readSpinnerVerb, restoreSettings } from './settings.ts'

export function createClaudeCodeSurface(settingsPath: string, impressionId: string): RenderSurface {
  return {
    kind: 'claude-code',
    write(text) {
      applyVerifiedVerb(settingsPath, text, impressionId)
    },
    readBack() {
      return readSpinnerVerb(settingsPath) ?? ''
    },
    restore() {
      restoreSettings(settingsPath)
    },
  }
}
