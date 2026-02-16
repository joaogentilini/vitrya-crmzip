export const dynamic = 'force-dynamic'
export const revalidate = 0

import { redirect } from 'next/navigation'
import { ensureUserProfile } from '@/lib/auth'
import { createClient } from '@/lib/supabaseServer'
import { PerfilClient } from './PerfilClient'

export default async function PerfilPage({
  searchParams,
}: {
  searchParams: Promise<{ google?: string }>
}) {
  const params = await searchParams
  const profile = await ensureUserProfile()
  
  if (!profile) {
    redirect('/')
  }
  
  if (profile.is_active === false) {
    redirect('/blocked')
  }

  const supabase = await createClient()
  const { data: integration } = await supabase
    .from('user_google_calendar_integrations')
    .select('google_email, sync_enabled, auto_create_from_tasks, connected_at, updated_at')
    .eq('user_id', profile.id)
    .maybeSingle()

  return (
    <PerfilClient
      userId={profile.id}
      userEmail={profile.email}
      initialFullName={profile.full_name}
      initialPhone={profile.phone_e164}
      role={profile.role}
      googleStatus={typeof params.google === 'string' ? params.google : null}
      googleCalendar={{
        connected: !!integration,
        googleEmail: (integration as any)?.google_email ?? null,
        syncEnabled: (integration as any)?.sync_enabled ?? false,
        autoCreateFromTasks: (integration as any)?.auto_create_from_tasks ?? false,
        connectedAt: (integration as any)?.connected_at ?? null,
        updatedAt: (integration as any)?.updated_at ?? null,
      }}
    />
  )
}
