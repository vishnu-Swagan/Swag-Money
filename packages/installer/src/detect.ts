import { TOOLS } from '@swag-money/shared'
import {
  clineHooks,
  codexHooks,
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
  kiroHooks,
} from '@swag-money/integrations'

export type DetectedTool = {
  id: string
  present: boolean
  evidence: string
}

const HOME_MARKERS: Record<string, string[]> = {
  'claude-code': ['.claude'],
  'codex-cli': ['.codex'],
  'gemini-cli': ['.gemini'],
  'qwen-code': ['.qwen'],
  'copilot-cli': ['.copilot'],
  'antigravity-cli': ['.gemini/antigravity-cli'],
  opencode: ['.config/opencode', '.opencode'],
  kilo: ['.kilocode', '.kilo'],
  goose: ['.config/goose'],
  vscode: ['.vscode'],
  cursor: ['.cursor'],
  windsurf: ['.codeium/windsurf', '.windsurf'],
  cline: ['.cline'],
  kiro: ['.kiro'],
  jetbrains: ['.local/share/JetBrains', 'Library/Application Support/JetBrains'],
}

export function detectInstalledTools(home: string, exists: (path: string) => boolean): DetectedTool[] {
  return TOOLS.filter((tool) => tool.placement !== 'browser' && tool.id !== 'claude-code-vscode').map((tool) => {
    const markers = HOME_MARKERS[tool.id] ?? []
    const hit = markers.find((marker) => exists(join(home, marker)))
    return {
      id: tool.id,
      present: Boolean(hit),
      evidence: hit ? join(home, hit) : markers.length ? `no ${markers.join(' or ')}` : 'no local marker',
    }
  })
}

export type MemoryFs = {
  files: Map<string, string>
  exists(path: string): boolean
  read(path: string): string
  write(path: string, data: string): void
}

export function memoryFs(seed: Record<string, string> = {}): MemoryFs {
  const files = new Map<string, string>(Object.entries(seed))
  return {
    files,
    exists(path) {
      if (files.has(path)) return true
      const prefix = path.endsWith('/') ? path : `${path}/`
      for (const key of files.keys()) {
        if (key.startsWith(prefix)) return true
      }
      return false
    },
    read(path) {
      const value = files.get(path)
      if (value === undefined) throw new Error(`missing ${path}`)
      return value
    },
    write(path, data) {
      files.set(path, data)
    },
  }
}

const TIP = 'Northwind CI: ephemeral environments for every PR'

/** Writes official config for tools that are already present. Does not invent installs. */
export function applyDetected(home: string, fs: MemoryFs): string[] {
  const present = new Set(detectInstalledTools(home, (path) => fs.exists(path)).filter((tool) => tool.present).map((tool) => tool.id))
  const applied: string[] = []
  const hook = join(home, '.swag-money/hook.sh')
  const status = join(home, '.swag-money/statusline.sh')
  fs.write(hook, hookScript())
  fs.write(status, statusLineScript())
  fs.write(join(home, '.swag-money/current-ad.txt'), TIP)

  const writeJson = (path: string, value: unknown) => {
    fs.write(path, `${JSON.stringify(value, null, 2)}\n`)
  }
  const readJson = (path: string): Record<string, unknown> => {
    if (!fs.exists(path) || !fs.files.has(path)) return {}
    const parsed = JSON.parse(fs.read(path)) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    return parsed as Record<string, unknown>
  }

  if (present.has('claude-code')) {
    const path = join(home, '.claude/settings.json')
    writeJson(path, mergeClaudeSettings(readJson(path), [TIP], status))
    applied.push('claude-code')
  }
  if (present.has('codex-cli')) {
    writeJson(join(home, '.codex/hooks.json'), codexHooks(hook))
    applied.push('codex-cli')
  }
  if (present.has('gemini-cli')) {
    const path = join(home, '.gemini/settings.json')
    writeJson(path, mergePhraseSettings(readJson(path), [TIP]))
    applied.push('gemini-cli')
  }
  if (present.has('qwen-code')) {
    const path = join(home, '.qwen/settings.json')
    writeJson(path, mergePhraseSettings(readJson(path), [TIP]))
    applied.push('qwen-code')
  }
  if (present.has('copilot-cli')) {
    const path = join(home, '.copilot/config.json')
    writeJson(path, mergeCopilotConfig(readJson(path), status))
    applied.push('copilot-cli')
  }
  if (present.has('antigravity-cli')) {
    const path = join(home, '.gemini/antigravity-cli/settings.json')
    writeJson(path, mergeAntigravitySettings(readJson(path), join(home, '.swag-money/antigravity-status.mjs')))
    applied.push('antigravity-cli')
  }
  if (present.has('opencode')) {
    fs.write(join(home, '.config/opencode/plugin/swag-money.ts'), opencodePluginSource())
    applied.push('opencode')
  }
  if (present.has('kilo')) {
    fs.write(join(home, '.kilocode/plugin/swag-money.ts'), kiloPluginSource())
    applied.push('kilo')
  }
  if (present.has('goose')) {
    fs.write(join(home, '.config/goose/swag-money-status.sh'), gooseStatusScript())
    applied.push('goose')
  }
  if (present.has('cursor')) {
    writeJson(join(home, '.cursor/hooks.json'), cursorHooks(hook))
    applied.push('cursor')
  }
  if (present.has('windsurf')) {
    writeJson(join(home, '.codeium/windsurf/hooks.json'), windsurfHooks(hook))
    applied.push('windsurf')
  }
  if (present.has('cline')) {
    writeJson(join(home, '.cline/hooks/swag-money.json'), clineHooks(hook))
    applied.push('cline')
  }
  if (present.has('kiro')) {
    writeJson(join(home, '.kiro/hooks/swag-money.json'), kiroHooks(hook))
    applied.push('kiro')
  }
  return applied
}

function join(home: string, rest: string): string {
  return `${home.replace(/\/$/, '')}/${rest}`
}
