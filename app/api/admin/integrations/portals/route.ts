import { NextRequest, NextResponse } from 'next/server'

import { createClient } from '@/lib/supabaseServer'
import { createAdminClient } from '@/lib/supabase/admin'

const PROVIDERS = new Set(['grupoolx', 'olx', 'meta'])

type PortalIntegrationRow = {
  id: string
  provider: string
  is_enabled?: boolean | null
  settings?: Record<string, unknown> | null
  created_at?: string | null
  updated_at?: string | null
}

type PortalWebhookEventSummaryRow = {
  provider: string | null
  status: string | null
}

type PortalIntegrationPatch = Partial<Pick<PortalIntegrationRow, 'is_enabled' | 'settings'>> & {
  updated_at?: string
}

type UserAuditLogInsert = {
  actor_id: string | null
  target_user_id: string | null
  action: string
  details?: Record<string, unknown>
  created_at?: string
}

function boolFromEnv(name: string): boolean {
  const normalized = String(process.env[name] || '')
    .trim()
    .toLowerCase()
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on'
}

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

async function validateManager() {
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

  if (!profile || profile.is_active !== true) return null
  if (profile.role !== 'admin' && profile.role !== 'gestor') return null

  return { user, profile }
}

export async function GET() {
  const auth = await validateManager()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()

  const integrationsRes = await admin
    .from('portal_integrations')
    .select('id, provider, is_enabled, settings, created_at, updated_at')
    .order('provider', { ascending: true })
  const integrations = (integrationsRes.data ?? []) as PortalIntegrationRow[]

  if (integrationsRes.error) {
    if (isSchemaMissingError(integrationsRes.error.code, integrationsRes.error.message)) {
      return NextResponse.json(
        {
          error: 'Tabelas de portais ainda não existem. Aplique a migration 202602171100_portals_stage1_foundation.sql.',
        },
        { status: 500 }
      )
    }
    return NextResponse.json({ error: integrationsRes.error.message }, { status: 500 })
  }

  const eventsSummaryRes = await admin
    .from('portal_webhook_events')
    .select('provider, status')
    .order('received_at', { ascending: false })
    .limit(1000)
  const eventsSummary = (eventsSummaryRes.data ?? []) as PortalWebhookEventSummaryRow[]

  const summaryByProvider: Record<string, { processed: number; errors: number; duplicates: number }> = {}
  for (const provider of PROVIDERS) {
    summaryByProvider[provider] = { processed: 0, errors: 0, duplicates: 0 }
  }

  for (const row of eventsSummary) {
    const provider = String(row.provider || '')
    const status = String(row.status || '')
    if (!summaryByProvider[provider]) continue
    if (status === 'processed') summaryByProvider[provider].processed += 1
    if (status === 'error') summaryByProvider[provider].errors += 1
    if (status === 'duplicate') summaryByProvider[provider].duplicates += 1
  }

  return NextResponse.json({
    integrations,
    summary_by_provider: summaryByProvider,
    env: {
      portal_integrations_enabled: boolFromEnv('PORTAL_INTEGRATIONS_ENABLED'),
      grupoolx_webhook_token_set: Boolean(process.env.GRUPO_OLX_WEBHOOK_TOKEN),
      grupoolx_feed_token_set: Boolean(process.env.GRUPO_OLX_FEED_TOKEN),
      olx_webhook_token_set: Boolean(process.env.OLX_WEBHOOK_TOKEN),
      olx_client_id_set: Boolean(process.env.OLX_CLIENT_ID),
      olx_client_secret_set: Boolean(process.env.OLX_CLIENT_SECRET),
      olx_redirect_uri_set: Boolean(process.env.OLX_REDIRECT_URI),
    },
  })
}

export async function PATCH(request: NextRequest) {
  const auth = await validateManager()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const provider = String(body?.provider || '').trim().toLowerCase()
  const isEnabled = body?.is_enabled
  const settings = body?.settings

  if (!PROVIDERS.has(provider)) {
    return NextResponse.json({ error: 'Provider inválido.' }, { status: 400 })
  }

  if (typeof isEnabled !== 'boolean' && (typeof settings !== 'object' || settings === null || Array.isArray(settings))) {
    return NextResponse.json(
      { error: 'Informe ao menos um campo válido (is_enabled ou settings).' },
      { status: 400 }
    )
  }

  const patch: PortalIntegrationPatch = {}
  if (typeof isEnabled === 'boolean') patch.is_enabled = isEnabled
  if (settings && typeof settings === 'object' && !Array.isArray(settings)) {
    patch.settings = settings as Record<string, unknown>
  }
  patch.updated_at = new Date().toISOString()

  const admin = createAdminClient()
  const portalIntegrationsTable = admin.from('portal_integrations') as any
  const updateRes = await portalIntegrationsTable
    .update(patch)
    .eq('provider', provider)
    .select('id, provider, is_enabled, settings, created_at, updated_at')
    .maybeSingle()

  if (updateRes.error) {
    if (isSchemaMissingError(updateRes.error.code, updateRes.error.message)) {
      return NextResponse.json(
        {
          error: 'Tabela portal_integrations não encontrada. Aplique a migration 202602171100_portals_stage1_foundation.sql.',
        },
        { status: 500 }
      )
    }
    return NextResponse.json({ error: updateRes.error.message }, { status: 500 })
  }

  const audit: UserAuditLogInsert = {
    actor_id: auth.user.id,
    target_user_id: auth.user.id,
    action: 'portal_integration_updated',
    details: {
      provider,
      patch,
    },
    created_at: new Date().toISOString(),
  }
  const auditLogsTable = admin.from('user_audit_logs') as any
  await auditLogsTable.insert(audit)

  return NextResponse.json({ ok: true, integration: updateRes.data || null })
}

