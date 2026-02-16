import 'server-only'

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'
const GOOGLE_USERINFO_URL = 'https://www.googleapis.com/oauth2/v2/userinfo'

const GOOGLE_CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.events'
const GOOGLE_PROFILE_SCOPES = [
  'openid',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
]

function readEnv(name: string): string {
  const value = process.env[name]
  if (!value || !value.trim()) {
    throw new Error(`Missing required env: ${name}`)
  }
  return value.trim()
}

export function getGoogleOAuthRedirectUri(origin: string): string {
  const explicit = process.env.GOOGLE_OAUTH_REDIRECT_URI?.trim()
  if (explicit) return explicit
  const base = (process.env.NEXT_PUBLIC_SITE_URL || origin).replace(/\/$/, '')
  return `${base}/api/integrations/google/callback`
}

export function buildGoogleOAuthUrl(params: {
  origin: string
  state: string
  loginHint?: string | null
}): string {
  const clientId = readEnv('GOOGLE_OAUTH_CLIENT_ID')
  const redirectUri = getGoogleOAuthRedirectUri(params.origin)
  const scope = [GOOGLE_CALENDAR_SCOPE, ...GOOGLE_PROFILE_SCOPES].join(' ')

  const url = new URL(GOOGLE_AUTH_URL)
  url.searchParams.set('client_id', clientId)
  url.searchParams.set('redirect_uri', redirectUri)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('access_type', 'offline')
  url.searchParams.set('include_granted_scopes', 'true')
  url.searchParams.set('prompt', 'consent')
  url.searchParams.set('scope', scope)
  url.searchParams.set('state', params.state)

  if (params.loginHint) {
    url.searchParams.set('login_hint', params.loginHint)
  }

  return url.toString()
}

type GoogleTokenResponse = {
  access_token: string
  expires_in?: number
  refresh_token?: string
  scope?: string
  token_type?: string
}

async function parseJsonSafe(res: Response): Promise<any> {
  try {
    return await res.json()
  } catch {
    return null
  }
}

export async function exchangeGoogleCodeForTokens(args: {
  code: string
  origin: string
}): Promise<GoogleTokenResponse> {
  const clientId = readEnv('GOOGLE_OAUTH_CLIENT_ID')
  const clientSecret = readEnv('GOOGLE_OAUTH_CLIENT_SECRET')
  const redirectUri = getGoogleOAuthRedirectUri(args.origin)

  const body = new URLSearchParams({
    code: args.code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code',
  })

  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
    cache: 'no-store',
  })

  const json = await parseJsonSafe(res)
  if (!res.ok || !json?.access_token) {
    const detail = json?.error_description || json?.error || 'token_exchange_failed'
    throw new Error(`Google token exchange failed: ${detail}`)
  }

  return json as GoogleTokenResponse
}

export async function refreshGoogleTokens(refreshToken: string): Promise<GoogleTokenResponse> {
  const clientId = readEnv('GOOGLE_OAUTH_CLIENT_ID')
  const clientSecret = readEnv('GOOGLE_OAUTH_CLIENT_SECRET')

  const body = new URLSearchParams({
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: 'refresh_token',
  })

  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
    cache: 'no-store',
  })

  const json = await parseJsonSafe(res)
  if (!res.ok || !json?.access_token) {
    const detail = json?.error_description || json?.error || 'refresh_failed'
    throw new Error(`Google token refresh failed: ${detail}`)
  }

  return json as GoogleTokenResponse
}

export async function fetchGoogleUserEmail(accessToken: string): Promise<string | null> {
  const res = await fetch(GOOGLE_USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
  })

  if (!res.ok) return null
  const json = (await res.json().catch(() => null)) as { email?: string } | null
  return json?.email ?? null
}

