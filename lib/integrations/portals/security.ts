import { timingSafeEqual } from 'node:crypto'

function isTruthy(value: string | undefined): boolean {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on'
}

export function isPortalIntegrationsEnabled(): boolean {
  return isTruthy(process.env.PORTAL_INTEGRATIONS_ENABLED)
}

export function readBearerToken(request: Request): string | null {
  const authHeader = request.headers.get('authorization') || ''
  if (!authHeader.startsWith('Bearer ')) return null
  const token = authHeader.slice(7).trim()
  return token || null
}

export function readQueryToken(request: Request, paramName = 'token'): string | null {
  const url = new URL(request.url)
  const token = url.searchParams.get(paramName)?.trim()
  return token || null
}

function safeTokenEquals(expected: string, received: string): boolean {
  const expectedBuffer = Buffer.from(expected)
  const receivedBuffer = Buffer.from(received)
  if (expectedBuffer.length !== receivedBuffer.length) return false
  return timingSafeEqual(expectedBuffer, receivedBuffer)
}

export function isValidBearerToken(request: Request, expectedToken: string | undefined): boolean {
  if (!expectedToken) return false
  const receivedToken = readBearerToken(request)
  if (!receivedToken) return false
  return safeTokenEquals(expectedToken, receivedToken)
}

export function isValidQueryToken(
  request: Request,
  expectedToken: string | undefined,
  paramName = 'token'
): boolean {
  if (!expectedToken) return false
  const receivedToken = readQueryToken(request, paramName)
  if (!receivedToken) return false
  return safeTokenEquals(expectedToken, receivedToken)
}

