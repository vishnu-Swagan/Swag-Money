import { createHmac, timingSafeEqual } from 'node:crypto'

export function signSession(userId: string, secret: string): string {
  const mac = createHmac('sha256', secret).update(userId).digest('base64url')
  return `${userId}.${mac}`
}

export function readSession(token: string, secret: string): string | null {
  const dot = token.lastIndexOf('.')
  if (dot <= 0) return null
  const userId = token.slice(0, dot)
  const mac = token.slice(dot + 1)
  const expected = createHmac('sha256', secret).update(userId).digest('base64url')
  const left = Buffer.from(mac)
  const right = Buffer.from(expected)
  if (left.length !== right.length) return null
  if (!timingSafeEqual(left, right)) return null
  return userId
}
