import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { assertDisplayString } from '@swag-money/crypto'

export type SpinnerVerbs = {
  mode: 'replace' | 'append'
  verbs: string[]
}

type BackupFile = {
  version: 1
  created: boolean
  original: string | null
  impressionId: string
}

export function backupPathFor(settingsPath: string): string {
  return `${settingsPath}.swag-backup.json`
}

/**
 * Write one verified string into Claude Code's spinnerVerbs setting.
 * The previous file bytes are saved beside it and put back by restoreSettings.
 * Nothing is written unless `verb` passes the ASCII display-string check.
 */
export function applyVerifiedVerb(settingsPath: string, verb: string, impressionId: string): void {
  assertDisplayString(verb)
  const backupPath = backupPathFor(settingsPath)
  if (existsSync(backupPath)) {
    throw new Error('A Swag-Money backup already exists. Restore it before applying another ad.')
  }

  let created = false
  let original: string | null = null
  if (existsSync(settingsPath)) {
    original = readFileSync(settingsPath, 'utf8')
    const parsed = JSON.parse(original) as unknown
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('Claude settings JSON must be an object. No changes were written.')
    }
  } else {
    created = true
  }

  const backup: BackupFile = { version: 1, created, original, impressionId }
  mkdirSync(path.dirname(settingsPath), { recursive: true })
  writeFileSync(backupPath, JSON.stringify(backup), 'utf8')

  const settings = (original ? JSON.parse(original) : {}) as Record<string, unknown>
  const next: Record<string, unknown> = {
    ...settings,
    spinnerVerbs: { mode: 'replace', verbs: [verb] } satisfies SpinnerVerbs,
  }
  atomicWrite(settingsPath, `${JSON.stringify(next, null, 2)}\n`)
}

export function restoreSettings(settingsPath: string): boolean {
  const backupPath = backupPathFor(settingsPath)
  if (!existsSync(backupPath)) return false
  const backup = JSON.parse(readFileSync(backupPath, 'utf8')) as BackupFile
  if (backup.version !== 1) throw new Error('Unknown Swag-Money backup version')
  if (backup.original !== null) {
    atomicWrite(settingsPath, backup.original)
  } else if (existsSync(settingsPath)) {
    unlinkSync(settingsPath)
  }
  unlinkSync(backupPath)
  return true
}

export function readSpinnerVerb(settingsPath: string): string | null {
  if (!existsSync(settingsPath)) return null
  const settings = JSON.parse(readFileSync(settingsPath, 'utf8')) as {
    spinnerVerbs?: { mode?: unknown; verbs?: unknown }
  }
  const verbs = settings.spinnerVerbs?.verbs
  if (!Array.isArray(verbs) || verbs.length !== 1 || typeof verbs[0] !== 'string') return null
  if (settings.spinnerVerbs?.mode !== 'replace') return null
  return verbs[0]
}

function atomicWrite(file: string, contents: string) {
  const tmp = `${file}.${process.pid}.tmp`
  writeFileSync(tmp, contents, 'utf8')
  renameSync(tmp, file)
}
