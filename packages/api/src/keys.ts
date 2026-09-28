import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { b64UrlToBytes, bytesToB64Url, generateEd25519KeyPair, publicKeyFromPrivate } from '@swag-money/crypto'
import { loadSigningKeyFromEnv } from './keys-env.ts'

export { loadSigningKeyFromEnv }

export function loadSigningKey(dataDir: string, envPrivate: string | undefined): {
  privateKey: Uint8Array
  publicKey: Uint8Array
} {
  mkdirSync(dataDir, { recursive: true })
  if (envPrivate && envPrivate.trim() && envPrivate.trim() !== 'replace-me') {
    const privateKey = b64UrlToBytes(envPrivate.trim())
    if (privateKey.length !== 32) {
      throw new Error('SWAG_SIGNING_PRIVATE_KEY must be a base64url 32-byte seed')
    }
    return { privateKey, publicKey: publicKeyFromPrivate(privateKey) }
  }

  const file = path.join(dataDir, 'signing-key.json')
  if (existsSync(file)) {
    const saved = JSON.parse(readFileSync(file, 'utf8')) as { privateKey?: string }
    if (!saved.privateKey) throw new Error('data/signing-key.json is missing privateKey')
    const privateKey = b64UrlToBytes(saved.privateKey)
    return { privateKey, publicKey: publicKeyFromPrivate(privateKey) }
  }

  const generated = generateEd25519KeyPair()
  writeFileSync(
    file,
    JSON.stringify(
      {
        privateKey: bytesToB64Url(generated.privateKey),
        publicKey: bytesToB64Url(generated.publicKey),
      },
      null,
      2,
    ),
    { encoding: 'utf8', mode: 0o600 },
  )
  try {
    chmodSync(file, 0o600)
  } catch {
    // Some filesystems ignore chmod. The file is still gitignored.
  }
  return generated
}

export function loadSessionSecret(dataDir: string, envSecret: string | undefined): string {
  if (envSecret && envSecret.trim() && envSecret.trim() !== 'replace-with-a-long-random-string') {
    return envSecret.trim()
  }
  mkdirSync(dataDir, { recursive: true })
  const file = path.join(dataDir, 'session-secret')
  if (existsSync(file)) return readFileSync(file, 'utf8').trim()
  const secret = bytesToB64Url(crypto.getRandomValues(new Uint8Array(32)))
  writeFileSync(file, secret, { encoding: 'utf8', mode: 0o600 })
  try {
    chmodSync(file, 0o600)
  } catch {
    // ignore
  }
  return secret
}
