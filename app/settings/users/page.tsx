export const dynamic = 'force-dynamic'
export const revalidate = 0

import { createClient } from '@/lib/supabaseServer'
import { redirect } from 'next/navigation'
import { UsersClient } from './UsersClient'
import { ensureUserProfile } from '@/lib/auth'

export default async function UsersPage() {
  const profile = await ensureUserProfile()
  if (!profile) {
    redirect('/')
  }
  
  if (!profile.is_active) {
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

  return (
    <UsersClient
      userEmail={userEmail ?? undefined}
      users={users || []}
      currentUserId={userId}
      currentUserRole={profile.role}
    />
  )
}
