export const dynamic = 'force-dynamic'
export const revalidate = 0

import { redirect } from 'next/navigation'

import { ensureUserProfile } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'

import { PortalsSettingsClient } from './PortalsSettingsClient'

type IntegrationRow = {
  id: string
  provider: 'grupoolx' | 'olx' | 'meta'
  is_enabled: boolean
  settings: Record<string, unknown>
  created_at: string
  updated_at: string
}

type EventRow = {
  id: string
  provider: 'grupoolx' | 'olx' | 'meta'
  status: 'received' | 'duplicate' | 'processed' | 'ignored' | 'error'
  event_type: string | null
  received_at: string
  processed_at: string | null
  error_message: string | null
}

function boolFromEnv(name: string): boolean {
  const normalized = String(process.env[name] || '')
    .trim()
    .toLowerCase()
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on'
}

export default async function PortalsSettingsPage() {
  const profile = await ensureUserProfile()
  if (!profile) redirect('/')

  if (profile.is_active === false) redirect('/blocked')
  if (profile.role !== 'admin' && profile.role !== 'gestor') redirect('/dashboard')

  const admin = createAdminClient()

  const [integrationsRes, eventsRes] = await Promise.all([
    admin
      .from('portal_integrations')
      .select('id, provider, is_enabled, settings, created_at, updated_at')
      .order('provider', { ascending: true }),
    admin
      .from('portal_webhook_events')
      .select('id, provider, status, event_type, received_at, processed_at, error_message')
      .order('received_at', { ascending: false })
      .limit(50),
  ])

  const schemaMissing = Boolean(integrationsRes.error || eventsRes.error)

  return (
    <PortalsSettingsClient
      schemaMissing={schemaMissing}
      schemaErrorMessage={integrationsRes.error?.message || eventsRes.error?.message || null}
      integrations={(integrationsRes.data || []) as IntegrationRow[]}
      recentEvents={(eventsRes.data || []) as EventRow[]}
      envFlags={{
        portal_integrations_enabled: boolFromEnv('PORTAL_INTEGRATIONS_ENABLED'),
        grupoolx_webhook_token_set: Boolean(process.env.GRUPO_OLX_WEBHOOK_TOKEN),
        grupoolx_feed_token_set: Boolean(process.env.GRUPO_OLX_FEED_TOKEN),
        olx_webhook_token_set: Boolean(process.env.OLX_WEBHOOK_TOKEN),
        olx_client_id_set: Boolean(process.env.OLX_CLIENT_ID),
        olx_client_secret_set: Boolean(process.env.OLX_CLIENT_SECRET),
        olx_redirect_uri_set: Boolean(process.env.OLX_REDIRECT_URI),
      }}
      appBaseUrl={(process.env.NEXT_PUBLIC_SITE_URL || '').replace(/\/$/, '')}
    />
  )
}

