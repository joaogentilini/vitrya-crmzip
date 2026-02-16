import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { createClient } from '@/lib/supabaseServer'
import { createAdminClient } from '@/lib/supabase/admin'
import { buildGoogleOAuthUrl } from '@/lib/integrations/googleCalendarApi'

export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.redirect(new URL('/crm/login', request.url))
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

    const returnToRaw = request.nextUrl.searchParams.get('returnTo') || '/perfil'
    const returnTo = returnToRaw.startsWith('/') ? returnToRaw : '/perfil'
    const targetUserIdRaw = request.nextUrl.searchParams.get('targetUserId')
    const targetUserId = targetUserIdRaw?.trim() || user.id

    if (!canManageGoogle) {
      const denied = new URL(returnTo, request.url)
      denied.searchParams.set('google', 'error')
      denied.searchParams.set('reason', 'forbidden_role')
      return NextResponse.redirect(denied)
    }

    let loginHint = user.email ?? null

    if (targetUserId !== user.id) {
      const admin = createAdminClient()
      const { data: targetProfile } = await admin
        .from('profiles')
        .select('email')
        .eq('id', targetUserId)
        .maybeSingle()

      if (!targetProfile) {
        const notFound = new URL(returnTo, request.url)
        notFound.searchParams.set('google', 'error')
        notFound.searchParams.set('reason', 'target_user_not_found')
        return NextResponse.redirect(notFound)
      }

      loginHint = targetProfile.email ?? loginHint
    }

    const state = randomUUID()
    const authUrl = buildGoogleOAuthUrl({
      origin: request.nextUrl.origin,
      state,
      loginHint,
    })

    const response = NextResponse.redirect(authUrl)
    response.cookies.set('google_oauth_state', state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 10,
    })
    response.cookies.set('google_oauth_return_to', returnTo, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 10,
    })
    response.cookies.set('google_oauth_target_user_id', targetUserId, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 10,
    })

    return response
  } catch (err) {
    console.error('[google connect] failed', err)
    const returnToRaw = request.nextUrl.searchParams.get('returnTo') || '/perfil'
    const returnTo = returnToRaw.startsWith('/') ? returnToRaw : '/perfil'
    const fallback = new URL(returnTo, request.url)
    fallback.searchParams.set('google', 'error')
    return NextResponse.redirect(fallback)
  }
}
