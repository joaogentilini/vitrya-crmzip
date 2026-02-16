import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabaseServer'
import { createAdminClient } from '@/lib/supabase/admin'

type ActorProfile = {
  id: string
  role: 'admin' | 'gestor' | 'corretor'
  is_active: boolean
}

async function validateAdminOrGestor() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return null

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, role, is_active')
    .eq('id', user.id)
    .maybeSingle()

  const actorProfile = profile as ActorProfile | null
  if (!actorProfile || actorProfile.is_active === false) return null
  if (actorProfile.role !== 'admin' && actorProfile.role !== 'gestor') return null

  return { user, profile: actorProfile }
}

async function revokeGoogleToken(token: string | null | undefined) {
  if (!token) return
  try {
    await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      cache: 'no-store',
    })
  } catch (err) {
    console.error('[admin google-calendar] token revoke failed', err)
  }
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await validateAdminOrGestor()
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await params
    const admin = createAdminClient()

    const { data: integration, error } = await admin
      .from('user_google_calendar_integrations')
      .select('user_id, google_email, sync_enabled, auto_create_from_tasks, connected_at, updated_at, last_error')
      .eq('user_id', id)
      .maybeSingle()

    if (error) {
      return NextResponse.json({ error: error.message || 'Falha ao buscar integracao.' }, { status: 400 })
    }

    return NextResponse.json({
      connected: !!integration,
      integration: integration || null,
    })
  } catch (err) {
    console.error('[GET /api/admin/users/[id]/google-calendar] Error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await validateAdminOrGestor()
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await params
    const body = await request.json().catch(() => ({}))
    const updates: Record<string, unknown> = {}

    if (typeof body?.sync_enabled === 'boolean') {
      updates.sync_enabled = body.sync_enabled
    }
    if (typeof body?.auto_create_from_tasks === 'boolean') {
      updates.auto_create_from_tasks = body.auto_create_from_tasks
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'Nenhum campo valido para atualizar.' }, { status: 400 })
    }

    const admin = createAdminClient()

    const { data: existing } = await admin
      .from('user_google_calendar_integrations')
      .select('user_id')
      .eq('user_id', id)
      .maybeSingle()

    if (!existing) {
      return NextResponse.json(
        { error: 'Usuario ainda nao possui Google Agenda conectada.' },
        { status: 404 }
      )
    }

    const { data: updated, error } = await admin
      .from('user_google_calendar_integrations')
      .update(updates)
      .eq('user_id', id)
      .select('user_id, google_email, sync_enabled, auto_create_from_tasks, connected_at, updated_at, last_error')
      .maybeSingle()

    if (error) {
      return NextResponse.json({ error: error.message || 'Falha ao atualizar integracao.' }, { status: 400 })
    }

    await admin.from('user_audit_logs').insert({
      actor_id: auth.user.id,
      target_user_id: id,
      action: 'google_calendar_integration_updated',
      details: updates,
    })

    return NextResponse.json({ success: true, integration: updated || null })
  } catch (err) {
    console.error('[PATCH /api/admin/users/[id]/google-calendar] Error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await validateAdminOrGestor()
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await params
    const admin = createAdminClient()

    const { data: integration } = await admin
      .from('user_google_calendar_integrations')
      .select('refresh_token, access_token')
      .eq('user_id', id)
      .maybeSingle()

    if (!integration) {
      return NextResponse.json({ success: true })
    }

    await revokeGoogleToken((integration as any)?.refresh_token || (integration as any)?.access_token || null)

    const { error: deleteMapsError } = await admin
      .from('google_calendar_task_events')
      .delete()
      .eq('user_id', id)

    if (deleteMapsError) {
      return NextResponse.json(
        { error: deleteMapsError.message || 'Falha ao remover mapeamentos de eventos.' },
        { status: 400 }
      )
    }

    const { error: deleteIntegrationError } = await admin
      .from('user_google_calendar_integrations')
      .delete()
      .eq('user_id', id)

    if (deleteIntegrationError) {
      return NextResponse.json(
        { error: deleteIntegrationError.message || 'Falha ao remover integracao Google.' },
        { status: 400 }
      )
    }

    await admin.from('user_audit_logs').insert({
      actor_id: auth.user.id,
      target_user_id: id,
      action: 'google_calendar_integration_removed',
      details: { removed: true },
    })

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[DELETE /api/admin/users/[id]/google-calendar] Error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
