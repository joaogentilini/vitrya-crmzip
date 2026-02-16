import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabaseServer'
import { createAdminClient } from '@/lib/supabase/admin'
import { exchangeGoogleCodeForTokens, fetchGoogleUserEmail } from '@/lib/integrations/googleCalendarApi'

export const runtime = 'nodejs'

function buildReturnUrl(request: NextRequest, returnToRaw: string | undefined, status: string, reason?: string) {
  const returnTo = returnToRaw && returnToRaw.startsWith('/') ? returnToRaw : '/perfil'
  const url = new URL(returnTo, request.url)
  url.searchParams.set('google', status)
  if (reason) url.searchParams.set('reason', reason)
  return url
}

function clearOauthCookies(response: NextResponse) {
  response.cookies.delete('google_oauth_state')
  response.cookies.delete('google_oauth_return_to')
  response.cookies.delete('google_oauth_target_user_id')
}

export async function GET(request: NextRequest) {
  const returnToCookie = request.cookies.get('google_oauth_return_to')?.value
  const targetUserIdCookie = request.cookies.get('google_oauth_target_user_id')?.value

  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      const response = NextResponse.redirect(new URL('/crm/login', request.url))
      clearOauthCookies(response)
      return response
    }

    const { data: actorProfile } = await supabase
      .from('profiles')
      .select('role, is_active')
      .eq('id', user.id)
      .maybeSingle()

    const canManageGoogle =
      actorProfile &&
      actorProfile.is_active !== false &&
      (actorProfile.role === 'admin' || actorProfile.role === 'gestor')

    if (!canManageGoogle) {
      const response = NextResponse.redirect(
        buildReturnUrl(request, returnToCookie, 'error', 'forbidden_role')
      )
      clearOauthCookies(response)
      return response
    }

    const targetUserId = targetUserIdCookie || user.id

    const error = request.nextUrl.searchParams.get('error')
    if (error) {
      const response = NextResponse.redirect(
        buildReturnUrl(request, returnToCookie, 'error', `oauth_${error}`)
      )
      clearOauthCookies(response)
      return response
    }

    const code = request.nextUrl.searchParams.get('code')
    const state = request.nextUrl.searchParams.get('state')
    const stateCookie = request.cookies.get('google_oauth_state')?.value

    if (!code || !state || !stateCookie || state !== stateCookie) {
      const response = NextResponse.redirect(
        buildReturnUrl(request, returnToCookie, 'error', 'invalid_state')
      )
      clearOauthCookies(response)
      return response
    }

    const tokenData = await exchangeGoogleCodeForTokens({
      code,
      origin: request.nextUrl.origin,
    })

    const expiresAt = tokenData.expires_in
      ? new Date(Date.now() + Number(tokenData.expires_in) * 1000).toISOString()
      : null

    const targetDbClient: any = targetUserId === user.id ? supabase : createAdminClient()

    const { data: existingIntegration } = await targetDbClient
      .from('user_google_calendar_integrations')
      .select('refresh_token')
      .eq('user_id', targetUserId)
      .maybeSingle()

    let fallbackEmail = user.email || null
    if (targetUserId !== user.id) {
      const admin = createAdminClient()
      const { data: targetProfile } = await admin
        .from('profiles')
        .select('email')
        .eq('id', targetUserId)
        .maybeSingle()
      fallbackEmail = targetProfile?.email || fallbackEmail
    }

    const email = await fetchGoogleUserEmail(tokenData.access_token)
    const refreshToken = tokenData.refresh_token || (existingIntegration as any)?.refresh_token || null

    const { error: upsertError } = await targetDbClient
      .from('user_google_calendar_integrations')
      .upsert(
        {
          user_id: targetUserId,
          google_email: email || fallbackEmail,
          calendar_id: 'primary',
          access_token: tokenData.access_token,
          refresh_token: refreshToken,
          token_type: tokenData.token_type || null,
          scope: tokenData.scope || null,
          expires_at: expiresAt,
          sync_enabled: true,
          auto_create_from_tasks: true,
          last_error: null,
          connected_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' }
      )

    if (upsertError) {
      console.error('[google callback] upsert failed', upsertError)
      const response = NextResponse.redirect(
        buildReturnUrl(request, returnToCookie, 'error', 'save_failed')
      )
      clearOauthCookies(response)
      return response
    }

    const response = NextResponse.redirect(buildReturnUrl(request, returnToCookie, 'connected'))
    clearOauthCookies(response)
    return response
  } catch (err) {
    console.error('[google callback] failed', err)
    const response = NextResponse.redirect(buildReturnUrl(request, returnToCookie, 'error', 'callback_failed'))
    clearOauthCookies(response)
    return response
  }
}
