import { b64UrlToBytes, bytesToB64Url, publicKeyFromPrivate } from '@swag-money/crypto'

/** Production reads the seed from the environment. This module does not touch the filesystem. */
export function loadSigningKeyFromEnv(envPrivate: string | undefined): {
  privateKey: Uint8Array
  publicKey: Uint8Array
} {
  const trimmed = envPrivate?.trim()
  if (!trimmed || trimmed === 'replace-me') {
    throw new Error(
      'SWAG_SIGNING_PRIVATE_KEY is required when the API runs inside the Worker. Generate one with pnpm -s keys. See DEPLOY.md.',
    )
  }
  const privateKey = b64UrlToBytes(trimmed)
  if (privateKey.length !== 32) {
    throw new Error('SWAG_SIGNING_PRIVATE_KEY must be a base64url 32-byte seed')
  }
  return { privateKey, publicKey: publicKeyFromPrivate(privateKey) }
}

export function signingPublicKeysMatch(privateSeed: string | undefined, declaredPublic: string | undefined): boolean {
  const declared = declaredPublic?.trim() ?? ''
  if (!declared) return false
  try {
    const { publicKey } = loadSigningKeyFromEnv(privateSeed)
    return bytesToB64Url(publicKey) === declared
  } catch {
    return false
  }
}
