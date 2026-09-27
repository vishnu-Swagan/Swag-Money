import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

function run(command, args) {
  const child = spawn(command, args, {
    cwd: root,
    stdio: 'inherit',
    env: process.env,
  })
  child.on('exit', (code) => {
    if (code && code !== 0) process.exit(code)
  })
  return child
}

const api = run('pnpm', ['exec', 'tsx', 'packages/api/src/main.ts'])

async function waitForApi() {
  const url = process.env.SWAG_API_URL ?? 'http://127.0.0.1:8787/health'
  const health = url.endsWith('/health') ? url : `${url.replace(/\/$/, '')}/health`
  for (let i = 0; i < 80; i++) {
    try {
      const res = await fetch(health)
      if (res.ok) return
    } catch {
      // API still booting.
    }
    await new Promise((r) => setTimeout(r, 250))
  }
  throw new Error(`API did not become healthy at ${health}`)
}

await waitForApi()
const web = run('pnpm', ['--filter', '@swag-money/web', 'dev'])

function shutdown() {
  api.kill('SIGTERM')
  web.kill('SIGTERM')
  process.exit(0)
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
