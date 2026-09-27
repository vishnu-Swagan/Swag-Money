#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { applyDetected, detectInstalledTools, memoryFs } from './detect.ts'

const home = process.env.HOME || process.cwd()
const command = process.argv[2] ?? 'detect'

if (command === 'detect') {
  const found = detectInstalledTools(home, existsSync)
  console.log('Swag-Money detect')
  console.log('Looks for official config directories. It does not patch other products.')
  for (const tool of found) {
    console.log(`${tool.present ? 'present' : 'absent '}  ${tool.id}  ${tool.evidence}`)
  }
  console.log('Browser tools install as an unpacked extension. They are not detected from the home directory.')
  console.log('Run `swag-money apply` to write config for the tools marked present.')
} else if (command === 'apply') {
  const fs = memoryFs()
  const walk = (dir: string) => {
    if (!existsSync(dir)) return
    fs.write(dir.endsWith('/') ? dir : `${dir}/.keep`, '')
  }
  for (const marker of [
    '.claude',
    '.codex',
    '.gemini',
    '.gemini/antigravity-cli',
    '.qwen',
    '.copilot',
    '.config/opencode',
    '.opencode',
    '.kilocode',
    '.kilo',
    '.config/goose',
    '.vscode',
    '.cursor',
    '.codeium/windsurf',
    '.windsurf',
    '.cline',
    '.kiro',
  ]) {
    walk(path.join(home, marker))
  }
  const applied = applyDetected(home, fs)
  for (const [file, contents] of fs.files) {
    if (file.endsWith('/.keep')) continue
    mkdirSync(path.dirname(file), { recursive: true })
    if (existsSync(file) && file.endsWith('.json')) {
      const backup = `${file}.swag-backup`
      if (!existsSync(backup)) writeFileSync(backup, readFileSync(file))
    }
    writeFileSync(file, contents)
  }
  console.log(applied.length ? `Wrote config for ${applied.join(', ')}` : 'No supported tools detected. Nothing written.')
} else {
  console.error('Usage: swag-money detect | apply')
  process.exit(1)
}
