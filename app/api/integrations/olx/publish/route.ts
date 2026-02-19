import { NextResponse } from 'next/server'

import { createClient } from '@/lib/supabaseServer'
import { createAdminClient } from '@/lib/supabase/admin'
import { isPortalIntegrationsEnabled } from '@/lib/integrations/portals/security'

export const runtime = 'nodejs'

type PublishAction = 'publish' | 'update' | 'unpublish'

function isSchemaMissingError(code: string | null | undefined, message: string | null | undefined): boolean {
  const normalizedCode = String(code || '')
  const normalizedMessage = String(message || '').toLowerCase()
  return (
    normalizedCode === '42P01' ||
    normalizedCode === '42703' ||
    normalizedCode === 'PGRST204' ||
    normalizedCode === 'PGRST205' ||
    normalizedMessage.includes('does not exist') ||
    normalizedMessage.includes('schema cache')
  )
}

export async function POST(request: Request) {
  if (!isPortalIntegrationsEnabled()) {
    return NextResponse.json(
      { ok: false, error: 'PORTAL_INTEGRATIONS_ENABLED desabilitado.' },
      { status: 503 }
    )
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ ok: false, error: 'Não autenticado.' }, { status: 401 })
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, role, is_active')
    .eq('id', user.id)
    .maybeSingle()

  const isManager = profile?.is_active === true && (profile.role === 'admin' || profile.role === 'gestor')
  if (!isManager) {
    return NextResponse.json({ ok: false, error: 'Acesso restrito a admin/gestor.' }, { status: 403 })
  }

  const body = await request.json().catch(() => null)
  const propertyId = String((body as { property_id?: unknown })?.property_id || '').trim()
  const action = String((body as { action?: unknown })?.action || 'publish').trim() as PublishAction

  if (!propertyId) {
    return NextResponse.json({ ok: false, error: 'property_id é obrigatório.' }, { status: 400 })
  }

  if (action !== 'publish' && action !== 'update' && action !== 'unpublish') {
    return NextResponse.json({ ok: false, error: 'action inválida.' }, { status: 400 })
  }

  const admin = createAdminClient()

  const propertyRes = await admin.from('properties').select('id').eq('id', propertyId).maybeSingle()
  if (propertyRes.error || !propertyRes.data) {
    return NextResponse.json({ ok: false, error: 'Imóvel não encontrado.' }, { status: 404 })
  }

  const listingUpsert = await admin
    .from('property_portal_listings')
    .upsert(
      {
        property_id: propertyId,
        provider: 'olx',
        status: action === 'unpublish' ? 'queued' : 'ready',
        metadata: { prepared_via: 'api/integrations/olx/publish' },
      },
      { onConflict: 'property_id,provider' }
    )
    .select('id, property_id, provider, status, updated_at')
    .maybeSingle()

  if (listingUpsert.error) {
    if (isSchemaMissingError(listingUpsert.error.code, listingUpsert.error.message)) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Tabelas de portal não encontradas. Aplique a migration 202602171100_portals_stage1_foundation.sql.',
        },
        { status: 500 }
      )
    }
    return NextResponse.json({ ok: false, error: listingUpsert.error.message }, { status: 500 })
  }

  const jobInsert = await admin
    .from('portal_publish_jobs')
    .insert({
      property_id: propertyId,
      provider: 'olx',
      action,
      status: 'queued',
      payload: body || {},
      created_by_profile_id: user.id,
    })
    .select('id, property_id, provider, action, status, attempts, created_at')
    .maybeSingle()

  if (jobInsert.error) {
    if (isSchemaMissingError(jobInsert.error.code, jobInsert.error.message)) {
      return NextResponse.json(
        {
          ok: false,
          error: 'Fila de publicação ainda não existe. Aplique a migration 202602171100_portals_stage1_foundation.sql.',
        },
        { status: 500 }
      )
    }
    return NextResponse.json({ ok: false, error: jobInsert.error.message }, { status: 500 })
  }

  return NextResponse.json({
    ok: true,
    message: 'Job de publicação OLX criado (estrutura pronta, execução futura).',
    listing: listingUpsert.data || null,
    job: jobInsert.data || null,
  })
}

