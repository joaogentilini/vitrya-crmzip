export const dynamic = 'force-dynamic'
export const revalidate = 0

import { redirect } from 'next/navigation'

import { ensureUserProfile } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { getEvolutionEnvSummary } from '@/lib/integrations/evolution/client'

import { WhatsappSettingsClient } from './WhatsappSettingsClient'

type ChatChannelAccountRow = {
  id: string
  channel: string
  provider_account_id: string
  account_name: string | null
  broker_user_id: string | null
  is_active: boolean
  settings: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

type ProfileRow = {
  id: string
  full_name: string | null
  email: string | null
  role: string | null
  is_active: boolean | null
}

function isValidBrokerRole(role: string | null): boolean {
  return role === 'admin' || role === 'gestor' || role === 'corretor'
}

export default async function WhatsappSettingsPage() {
  const profile = await ensureUserProfile()
  if (!profile) redirect('/')
  if (profile.is_active === false) redirect('/blocked')
  if (profile.role !== 'admin' && profile.role !== 'gestor') redirect('/dashboard')

  const admin = createAdminClient()
  const [accountsRes, brokersRes] = await Promise.all([
    admin
      .from('chat_channel_accounts')
      .select('id, channel, provider_account_id, account_name, broker_user_id, is_active, settings, created_at, updated_at')
      .eq('channel', 'whatsapp')
      .order('updated_at', { ascending: false }),
    admin
      .from('profiles')
      .select('id, full_name, email, role, is_active')
      .eq('is_active', true)
      .order('full_name', { ascending: true }),
  ])

  const schemaMissing = Boolean(accountsRes.error)

  const brokers = ((brokersRes.data || []) as ProfileRow[]).filter((row) => isValidBrokerRole(row.role || null))

  return (
    <WhatsappSettingsClient
      schemaMissing={schemaMissing}
      schemaErrorMessage={accountsRes.error?.message || null}
      mappings={(accountsRes.data || []) as ChatChannelAccountRow[]}
      brokers={brokers}
      env={getEvolutionEnvSummary()}
      appBaseUrl={(process.env.NEXT_PUBLIC_SITE_URL || '').replace(/\/$/, '')}
    />
  )
}
