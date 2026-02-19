import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabaseServer'

export const runtime = 'nodejs'

async function revokeGoogleToken(token: string | null | undefined) {
  if (!token) return
  try {
    await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      cache: 'no-store',
    })
  } catch (err) {
    console.error('[google disconnect] revoke failed', err)
  }
}

export async function POST() {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 })
    }

    const { data: integration } = await supabase
      .from('user_google_calendar_integrations')
      .select('access_token, refresh_token')
      .eq('user_id', user.id)
      .maybeSingle()

    await revokeGoogleToken((integration as any)?.refresh_token || (integration as any)?.access_token || null)

    const { error: deleteEventsError } = await supabase
      .from('google_calendar_task_events')
      .delete()
      .eq('user_id', user.id)

    if (deleteEventsError) {
      console.error('[google disconnect] delete events map failed', deleteEventsError)
    }

    const { error: deleteIntegrationError } = await supabase
      .from('user_google_calendar_integrations')
      .delete()
      .eq('user_id', user.id)

    if (deleteIntegrationError) {
      return NextResponse.json({ error: deleteIntegrationError.message || 'Falha ao desconectar.' }, { status: 400 })
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[google disconnect] failed', err)
    return NextResponse.json({ error: 'Falha ao desconectar Google Agenda.' }, { status: 500 })
  }
}

