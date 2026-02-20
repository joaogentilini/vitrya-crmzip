import { timingSafeEqual } from 'node:crypto'

function safeEquals(expected: string, received: string): boolean {
  const expectedBuffer = Buffer.from(expected)
  const receivedBuffer = Buffer.from(received)
  if (expectedBuffer.length !== receivedBuffer.length) return false
  return timingSafeEqual(expectedBuffer, receivedBuffer)
}

export function readBearerToken(request: Request): string | null {
  const authHeader = request.headers.get('authorization') || ''
  if (!authHeader.startsWith('Bearer ')) return null
  const token = authHeader.slice(7).trim()
  return token || null
}

export function readQueryToken(request: Request, key = 'token'): string | null {
  const url = new URL(request.url)
  const token = url.searchParams.get(key)?.trim()
  return token || null
}

export function isValidWebhookToken(request: Request, expectedToken: string | undefined): boolean {
  if (!expectedToken) return false

  const bearer = readBearerToken(request)
  if (bearer && safeEquals(expectedToken, bearer)) return true

  const queryToken = readQueryToken(request)
  if (queryToken && safeEquals(expectedToken, queryToken)) return true

  return false
}

