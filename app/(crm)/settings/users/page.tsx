export const dynamic = 'force-dynamic'
export const revalidate = 0

import { createClient } from '@/lib/supabaseServer'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { UsersClient } from './UsersClient'
import { ensureUserProfile } from '@/lib/auth'

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

  const { data: users } = await supabase
    .from('profiles')
    .select('id, full_name, email, phone_e164, role, is_active, created_at, updated_at')
    .order('created_at', { ascending: false })

  const userIds = (users || []).map((user) => user.id)
  const integrationMap: Record<
    string,
    {
      connected: boolean
      google_email: string | null
      sync_enabled: boolean
      auto_create_from_tasks: boolean
      connected_at: string | null
      updated_at: string | null
      last_error: string | null
    }
  > = {}

  if (userIds.length > 0) {
    const adminSupabase = createAdminClient()
    const { data: integrations } = await adminSupabase
      .from('user_google_calendar_integrations')
      .select('user_id, google_email, sync_enabled, auto_create_from_tasks, connected_at, updated_at, last_error')
      .in('user_id', userIds)

    for (const integration of integrations || []) {
      integrationMap[integration.user_id] = {
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

  const usersWithIntegrations = (users || []).map((user) => ({
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
