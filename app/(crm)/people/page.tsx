export const dynamic = 'force-dynamic'
export const revalidate = 0

import { createClient } from '@/lib/supabaseServer'
import { redirect } from 'next/navigation'
import { ensureUserProfile } from '@/lib/auth'
import { PeopleClient } from './PeopleClient'

async function PeopleContent() {
  const supabase = await createClient()

  // 1) Garantir user logado (SSR)
  const { data: { user }, error: userErr } = await supabase.auth.getUser()
  if (userErr || !user) {
    redirect('/?next=/people')
  }

  // 2) Buscar o profile DO usuário logado (filtro obrigatório)
  const { data: currentProfile, error: profErr } = await supabase
    .from('profiles')
    .select('id, full_name, role, is_active')
    .eq('id', user.id)
    .single()

  if (profErr || !currentProfile || currentProfile.is_active === false) {
    // se perfil não existe / inativo, manda pra home (ou /blocked)
    redirect('/?next=/people')
  }

  const isAdminOrGestor =
    currentProfile.role === 'admin' || currentProfile.role === 'gestor'

  // 3) Pessoas
  const { data: peopleRaw, error: peopleErr } = await supabase
    .from('people')
    .select('id, full_name, email, phone_e164, document_id, kind_tags, notes, owner_profile_id, created_by_profile_id, created_at, updated_at, avatar_path')
    .order('created_at', { ascending: false })
    .limit(500)

  if (peopleErr) {
    // Se quiser, você pode renderizar uma tela de erro amigável em vez de redirect
    redirect('/dashboard')
  }

  // 4) Corretores (somente admin/gestor)
  let corretores: { id: string; full_name: string; role: string }[] = []
  if (isAdminOrGestor) {
    const { data: corretoresRaw } = await supabase
      .from('profiles')
      .select('id, full_name, role')
      .eq('is_active', true)
      .order('full_name', { ascending: true })

    corretores = (corretoresRaw ?? []) as { id: string; full_name: string; role: string }[]
  }

  const people = (peopleRaw ?? []).map((p: any) => ({
    ...p,
    kind_tags: p.kind_tags || [],
  }))

  return (
    <PeopleClient
      people={people}
      currentUserId={currentProfile.id}
      currentUserRole={currentProfile.role as 'admin' | 'gestor' | 'corretor'}
      corretores={corretores}
    />
  )
}

export default async function PeoplePage() {
  // mantém para criar/garantir profile no primeiro login
  await ensureUserProfile()
  return <PeopleContent />
}
