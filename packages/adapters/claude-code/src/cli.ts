import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { runImpression } from '@swag-money/client-core'
import {
  b64UrlToBytes,
  bytesToB64Url,
  fingerprint,
  generateEd25519KeyPair,
} from '@swag-money/crypto'
import { readSpinnerVerb, restoreSettings } from './settings.ts'
import { createClaudeCodeSurface } from './surface.ts'

const DEMO_EMAIL = 'ada@dev.swagmoney.test'

const command = process.argv[2] ?? 'help'
const flags = parseFlags(process.argv.slice(3))

try {
  if (command === 'demo') await demo()
  else if (command === 'install') await install()
  else if (command === 'once') await once()
  else if (command === 'restore') restore()
  else help()
} catch (error) {
  const message = error instanceof Error ? error.message : String(error)
  console.error(`swag-claude: ${message}`)
  process.exitCode = 1
}

async function demo() {
  const apiUrl = flags.api ?? process.env.SWAG_API_URL ?? 'http://127.0.0.1:8787'
  console.log('Swag-Money Claude Code adapter')
  console.log(`API ${apiUrl}`)
  const pinned = await fetchJson(`${apiUrl}/v1/public-key`)
  if (typeof pinned.publicKey !== 'string' || typeof pinned.fingerprint !== 'string') {
    throw new Error('API did not return a public key')
  }
  console.log(`TOFU pin for this local process only: ${pinned.fingerprint}`)
  console.log('Production installs pass --pin and do not trust a key fetched from the ad server.')

  const session = await postJson(`${apiUrl}/v1/demo/session`, { email: flags.email ?? DEMO_EMAIL })
  const token = session.token
  if (typeof token !== 'string') throw new Error('Demo session was not issued. Is SWAG_ALLOW_DEMO enabled?')

  const device = generateEd25519KeyPair()
  const registered = await postJson(
    `${apiUrl}/v1/installs`,
    { label: 'claude-code-demo', publicKey: bytesToB64Url(device.publicKey) },
    token,
  )
  if (typeof registered.installId !== 'string') throw new Error('Install registration failed')

  const dir = mkdtempSync(path.join(tmpdir(), 'swag-claude-demo-'))
  const settingsPath = path.join(dir, 'settings.json')
  const original = JSON.stringify(
    { spinnerVerbs: { mode: 'append', verbs: ['Pondering', 'Thinking'] }, theme: 'dark' },
    null,
    2,
  )
  writeFileSync(settingsPath, original)
  console.log(`Fixture settings ${settingsPath}`)
  console.log(`Before: ${original}`)

  let observed = ''
  const surface = createClaudeCodeSurface(settingsPath, 'pending')
  const wrapped = {
    kind: surface.kind,
    write: async (text: string) => {
      await surface.write(text)
      observed = readSpinnerVerb(settingsPath) ?? ''
      console.log(`Rendered spinnerVerbs: ${JSON.stringify(observed)}`)
    },
    readBack: () => surface.readBack(),
    restore: () => surface.restore(),
  }

  const result = await runImpression({
    apiUrl,
    installId: registered.installId,
    devicePrivateKey: device.privateKey,
    pinnedPublicKey: b64UrlToBytes(pinned.publicKey),
    surface: wrapped,
  })

  const restored = readFileSync(settingsPath, 'utf8')
  console.log(`Verified impression ${result.impressionId}`)
  console.log(`Advertiser ${result.advertiser}`)
  console.log(`Clearing price ${result.priceCents} cents`)
  console.log(`Developer share ${result.developerShareCents} cents`)
  console.log(`Platform share ${result.platformShareCents} cents`)
  console.log(`Samples ${result.samples.length}, span ${result.samples.at(-1)?.offsetMs ?? 0}ms`)
  console.log(`After restore: ${restored}`)
  if (restored !== original) throw new Error('Settings file was not restored to its original bytes')
  if (observed !== result.text) throw new Error('Spinner read-back did not match the signed text')
  rmSync(dir, { recursive: true, force: true })
  console.log('Demo complete. Original settings restored and the temp directory removed.')
}

async function install() {
  const apiUrl = flags.api ?? process.env.SWAG_API_URL ?? 'http://127.0.0.1:8787'
  const email = flags.email
  const out = flags.out
  if (!email || !out) throw new Error('install requires --email and --out')
  const session = await postJson(`${apiUrl}/v1/demo/session`, { email })
  if (typeof session.token !== 'string') throw new Error('Could not open a demo session for that email')
  const device = generateEd25519KeyPair()
  const registered = await postJson(
    `${apiUrl}/v1/installs`,
    { label: flags.label ?? 'claude-code', publicKey: bytesToB64Url(device.publicKey) },
    session.token,
  )
  if (typeof registered.installId !== 'string') throw new Error('Install registration failed')
  const record = {
    apiUrl,
    installId: registered.installId,
    publicKey: bytesToB64Url(device.publicKey),
    privateKey: bytesToB64Url(device.privateKey),
  }
  writeFileSync(out, `${JSON.stringify(record, null, 2)}\n`, { mode: 0o600 })
  console.log(`Wrote ${out}`)
  console.log('This file contains a device private key. Do not commit it.')
  console.log(`Device fingerprint ${fingerprint(device.publicKey)}`)
  const pinned = await fetchJson(`${apiUrl}/v1/public-key`)
  console.log(`Pin the server fingerprint out of band: ${String(pinned.fingerprint)}`)
}

async function once() {
  const devicePath = flags.device
  const settingsPath = flags.settings
  const pin = flags.pin
  if (!devicePath || !settingsPath || !pin) {
    throw new Error('once requires --device, --settings, and --pin <base64url public key>')
  }
  const device = JSON.parse(readFileSync(devicePath, 'utf8')) as {
    apiUrl: string
    installId: string
    privateKey: string
  }
  const result = await runImpression({
    apiUrl: flags.api ?? device.apiUrl,
    installId: device.installId,
    devicePrivateKey: b64UrlToBytes(device.privateKey),
    pinnedPublicKey: b64UrlToBytes(pin),
    surface: createClaudeCodeSurface(settingsPath, 'once'),
  })
  console.log(JSON.stringify({ impressionId: result.impressionId, developerShareCents: result.developerShareCents }, null, 2))
}

function restore() {
  const settingsPath = flags.settings
  if (!settingsPath) throw new Error('restore requires --settings')
  const restored = restoreSettings(settingsPath)
  console.log(restored ? `Restored ${settingsPath}` : 'No Swag-Money backup found')
}

function help() {
  console.log(`swag-claude <demo|install|once|restore>

demo     Fetch a signed ad, write Claude Code spinnerVerbs, hold 5s, restore.
install  Register a device key. Requires --email and --out. Never commit the output.
once     One impression. Requires --device, --settings, and --pin.
restore  Put the previous settings bytes back. Requires --settings.

The client pins an Ed25519 key and will not write a string it cannot verify.
It does not download or execute remote code.`)
}

function parseFlags(args: string[]): Record<string, string> {
  const flags: Record<string, string> = {}
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (!arg?.startsWith('--')) continue
    const key = arg.slice(2)
    const value = args[i + 1]
    if (!value || value.startsWith('--')) flags[key] = 'true'
    else {
      flags[key] = value
      i += 1
    }
  }
  return flags
}

async function fetchJson(url: string): Promise<Record<string, unknown>> {
  const response = await fetch(url)
  const body = (await response.json().catch(() => null)) as Record<string, unknown> | null
  if (!response.ok || !body) throw new Error(body?.error?.toString() ?? `GET ${url} failed`)
  return body
}

async function postJson(url: string, payload: unknown, token?: string): Promise<Record<string, unknown>> {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (token) headers.authorization = `Bearer ${token}`
  const response = await fetch(url, { method: 'POST', headers, body: JSON.stringify(payload) })
  const body = (await response.json().catch(() => null)) as Record<string, unknown> | null
  if (!response.ok || !body) {
    throw new Error(typeof body?.error === 'string' ? body.error : `POST ${url} failed (${response.status})`)
  }
  return body
}
