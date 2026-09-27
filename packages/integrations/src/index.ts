export function mergeClaudeSettings(
  existing: Record<string, unknown>,
  tips: readonly string[],
  statusCommand: string,
): Record<string, unknown> {
  return {
    ...existing,
    spinnerTipsOverride: {
      excludeDefault: false,
      label: 'Sponsored',
      tips: [...tips],
    },
    statusLine: {
      type: 'command',
      command: statusCommand,
    },
  }
}

export function statusLineScript(): string {
  return `#!/bin/sh
# Prints one local sponsored line. Stdin is ignored. Agent transcripts are ignored.
file="\${SWAG_AD_FILE:-$HOME/.swag-money/current-ad.txt}"
if [ -f "$file" ]; then
  line=$(head -n 1 "$file")
  printf 'Sponsored · %s\\n' "$line"
fi
`
}

export function hookScript(): string {
  return `#!/bin/sh
# Timing only. Stdin is ignored, so a prompt payload is never consumed.
printf '%s %s\\n' "$(date +%s)" "\${1:-event}" >> "\${SWAG_HOOK_LOG:-$HOME/.swag-money/hooks.log}"
exit 0
`
}

export function mergePhraseSettings(
  existing: Record<string, unknown>,
  phrases: readonly string[],
): Record<string, unknown> {
  const ui =
    existing.ui && typeof existing.ui === 'object' && !Array.isArray(existing.ui)
      ? (existing.ui as Record<string, unknown>)
      : {}
  return {
    ...existing,
    ui: {
      ...ui,
      loadingPhrases: 'witty',
      customWittyPhrases: phrases.map((phrase) =>
        phrase.startsWith('Sponsored') ? phrase : `Sponsored · ${phrase}`,
      ),
    },
  }
}

export function codexHooks(command: string) {
  return {
    hooks: {
      UserPromptSubmit: [{ command: `${command} start` }],
      Stop: [{ command: `${command} stop` }],
    },
  }
}

export function mergeCopilotConfig(existing: Record<string, unknown>, command: string): Record<string, unknown> {
  const flags = Array.isArray(existing.experimental_flags)
    ? existing.experimental_flags.filter((flag): flag is string => typeof flag === 'string')
    : []
  return {
    ...existing,
    experimental: true,
    experimental_flags: [...new Set([...flags, 'STATUS_LINE'])],
    statusLine: { type: 'command', command },
  }
}

export function mergeAntigravitySettings(existing: Record<string, unknown>, command: string): Record<string, unknown> {
  return {
    ...existing,
    statusLine: { type: 'command', command, stack_with_default: true },
  }
}

export function antigravityScript(): string {
  return `#!/usr/bin/env node
// Reads stdin only long enough to copy agent_state. The rest of the object is discarded.
import { readFileSync } from 'node:fs'
let state = 'idle'
try {
  const parsed = JSON.parse(readFileSync(0, 'utf8') || '{}')
  if (parsed && typeof parsed.agent_state === 'string') state = parsed.agent_state
} catch {
  state = 'idle'
}
if (state !== 'thinking' && state !== 'working' && state !== 'tool_use') process.exit(0)
const file = process.env.SWAG_AD_FILE || (process.env.HOME ?? '') + '/.swag-money/current-ad.txt'
try {
  const line = readFileSync(file, 'utf8').split('\\n')[0]
  if (line) process.stdout.write('Sponsored · ' + line + '\\n')
} catch {
  process.exit(0)
}
`
}

export function cursorHooks(command: string) {
  return {
    version: 1,
    hooks: {
      beforeSubmitPrompt: [{ command: `${command} start` }],
      stop: [{ command: `${command} stop` }],
    },
  }
}

export function windsurfHooks(command: string) {
  return {
    hooks: {
      pre_user_prompt: [{ command: `${command} start` }],
      post_cascade_response: [{ command: `${command} stop` }],
    },
  }
}

export function clineHooks(command: string) {
  return {
    hooks: [
      { name: 'TaskStart', command: `${command} start` },
      { name: 'TaskComplete', command: `${command} stop` },
    ],
  }
}

export function kiroHooks(command: string) {
  return {
    name: 'swag-money',
    hooks: {
      SessionStart: [{ command: `${command} start` }],
      Stop: [{ command: `${command} stop` }],
    },
  }
}

export function opencodePluginSource(): string {
  return `// Scaffold. This file is not loaded by OpenCode in this repository.
export const SwagMoneyPlugin = async () => ({
  event: async ({ event }) => {
    if (!event || (event.type !== 'session.status' && event.type !== 'session.idle')) return
  },
})
`
}

export function kiloPluginSource(): string {
  return `// Scaffold. This file is not loaded by Kilo in this repository.
export const KiloSwagPlugin = async () => ({
  event: async ({ event }) => {
    if (!event || event.type !== 'session.status') return
  },
})
`
}

export function gooseStatusScript(): string {
  return `#!/bin/sh
# GOOSE_STATUS_HOOK scaffold. Prints a local line for thinking or waiting.
case "$1" in
  thinking|waiting) ;;
  *) exit 0 ;;
esac
file="\${SWAG_AD_FILE:-$HOME/.swag-money/current-ad.txt}"
if [ -f "$file" ]; then
  printf 'Sponsored · %s\\n' "$(head -n 1 "$file")"
fi
`
}
