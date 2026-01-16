export const dynamic = 'force-dynamic'
export const revalidate = 0

import { createClient } from '@/lib/supabaseServer'
import { redirect } from 'next/navigation'
import { ensureUserProfile } from '@/lib/auth'
import { PeopleClient } from './PeopleClient'

async function PeopleContent() {
  const supabase = await createClient()

  const { data: currentProfile } = await supabase
    .from('profiles')
    .select('id, full_name, role')
    .single()

  if (!currentProfile) {
    redirect('/')
  }

  const isAdminOrGestor = currentProfile.role === 'admin' || currentProfile.role === 'gestor'

  const { data: peopleRaw } = await supabase
    .from('people')
    .select('id, full_name, email, phone_e164, document_id, kind_tags, notes, owner_profile_id, created_by_profile_id, created_at, updated_at')
    .order('created_at', { ascending: false })
    .limit(500)

  let corretores: { id: string; full_name: string; role: string }[] = []
  if (isAdminOrGestor) {
    const { data: corretoresRaw } = await supabase
      .from('profiles')
      .select('id, full_name, role')
      .eq('is_active', true)
      .order('full_name', { ascending: true })
    
    corretores = (corretoresRaw ?? []) as { id: string; full_name: string; role: string }[]
  }

  const { data: { user } } = await supabase.auth.getUser()

  const people = (peopleRaw ?? []).map(p => ({
    ...p,
    kind_tags: p.kind_tags || []
  }))

  return (
    <PeopleClient 
      people={people}
      currentUserId={currentProfile.id}
      currentUserRole={currentProfile.role as 'admin' | 'gestor' | 'corretor'}
      corretores={corretores}
      userEmail={user?.email}
    />
  )
}

export default async function PeoplePage() {
  await ensureUserProfile()
  
  return <PeopleContent />
}
