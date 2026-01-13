export const dynamic = 'force-dynamic'
export const revalidate = 0

import { createClient } from '@/lib/supabaseServer'
import { redirect } from 'next/navigation'
import { UsersClient } from './UsersClient'

export default async function UsersPage() {
  const supabase = await createClient()

  const { data: userRes, error: authError } = await supabase.auth.getUser()
  if (authError || !userRes?.user) {
    redirect('/')
  }

  const userId = userRes.user.id
  const userEmail = userRes.user.email

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, is_active')
    .eq('id', userId)
    .single()

  if (!profile?.is_active) {
    redirect('/blocked')
  }

  if (profile?.role !== 'admin' && profile?.role !== 'gestor') {
    redirect('/dashboard')
  }

  const { data: users } = await supabase
    .from('profiles')
    .select('id, full_name, email, phone_e164, role, is_active, created_at, updated_at')
    .order('created_at', { ascending: false })

  return (
    <UsersClient
      userEmail={userEmail}
      users={users || []}
      currentUserId={userId}
      currentUserRole={profile.role}
    />
  )
}
