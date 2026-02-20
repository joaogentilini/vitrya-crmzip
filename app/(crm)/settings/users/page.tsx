export const dynamic = 'force-dynamic'
export const revalidate = 0

import { createClient } from '@/lib/supabaseServer'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { UsersClient } from './UsersClient'
import { ensureUserProfile } from '@/lib/auth'

type UserRole = 'admin' | 'gestor' | 'corretor'

interface DbUser {
  id: string
  full_name: string
  email: string | null
  phone_e164: string | null
  role: UserRole
  is_active: boolean
  created_at: string
  updated_at: string
  broker_commission_level?: string | null
  broker_commission_percent?: number | null
  company_commission_percent?: number | null
  partner_commission_percent?: number | null
}

interface GoogleCalendarSummary {
  connected: boolean
  google_email: string | null
  sync_enabled: boolean
  auto_create_from_tasks: boolean
  connected_at: string | null
  updated_at: string | null
  last_error: string | null
}

type UserIntegrationRow = {
  user_id: string | null
  google_email?: string | null
  sync_enabled?: boolean | null
  auto_create_from_tasks?: boolean | null
  connected_at?: string | null
  updated_at?: string | null
  last_error?: string | null
}

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<{ google?: string }>
}) {
  const params = await searchParams
  const profile = await ensureUserProfile()
  if (!profile) {
    redirect('/')
  }
  
  if (profile && profile.is_active === false) {
    redirect('/blocked')
  }

  if (profile.role !== 'admin' && profile.role !== 'gestor') {
    redirect('/dashboard')
  }

  const userEmail = profile.email
  const userId = profile.id
  const supabase = await createClient()

  const baseSelect = 'id, full_name, email, phone_e164, role, is_active, created_at, updated_at'
  const extendedSelect = `${baseSelect}, broker_commission_level, broker_commission_percent, company_commission_percent, partner_commission_percent`

  const extendedQuery = await supabase
    .from('profiles')
    .select(extendedSelect)
    .order('created_at', { ascending: false })

  let users = (extendedQuery.data as DbUser[] | null) ?? null
  let usersError = extendedQuery.error

  if (
    usersError &&
    /broker_commission_level|broker_commission_percent|company_commission_percent|partner_commission_percent|column/i.test(
      usersError.message || ''
    )
  ) {
    const fallback = await supabase
      .from('profiles')
      .select(baseSelect)
      .order('created_at', { ascending: false })

    users = (fallback.data as DbUser[] | null) ?? null
    usersError = fallback.error
  }

  if (usersError) {
    throw new Error(usersError.message || 'Erro ao carregar usuários.')
  }

  const userIds = (users || []).map((user) => user.id)
  const integrationMap: Record<string, GoogleCalendarSummary> = {}

  if (userIds.length > 0) {
    const adminSupabase = createAdminClient()
    const { data: integrationsRaw } = await adminSupabase
      .from('user_google_calendar_integrations')
      .select('user_id, google_email, sync_enabled, auto_create_from_tasks, connected_at, updated_at, last_error')
      .in('user_id', userIds)
    const integrations = (integrationsRaw ?? []) as UserIntegrationRow[]

    for (const integration of integrations) {
      const uid = integration.user_id ?? null
      if (!uid) continue

      integrationMap[uid] = {
        connected: true,
        google_email: integration.google_email ?? null,
        sync_enabled: !!integration.sync_enabled,
        auto_create_from_tasks: !!integration.auto_create_from_tasks,
        connected_at: integration.connected_at ?? null,
        updated_at: integration.updated_at ?? null,
        last_error: integration.last_error ?? null,
      }
    }
  }

  const usersWithIntegrations = (users || []).map((user): DbUser & { google_calendar: GoogleCalendarSummary } => ({
    ...user,
    google_calendar: integrationMap[user.id] ?? {
      connected: false,
      google_email: null,
      sync_enabled: false,
      auto_create_from_tasks: false,
      connected_at: null,
      updated_at: null,
      last_error: null,
    },
  }))

  return (
    <UsersClient
      userEmail={userEmail ?? undefined}
      users={usersWithIntegrations}
      currentUserId={userId}
      currentUserRole={profile.role}
      googleStatus={typeof params.google === 'string' ? params.google : null}
    />
  )
}
