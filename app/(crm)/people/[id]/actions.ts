'use server'

import { createClient } from '@/lib/supabaseServer'
import { revalidatePath } from 'next/cache'

export interface UpdatePersonData {
  full_name: string
  phone_e164?: string
  email?: string
  document_id?: string
  notes?: string
  kind_tags?: string[]
}

export async function updatePerson(personId: string, data: UpdatePersonData) {
  const supabase = await createClient()

  // Verificar se o usuário tem acesso à pessoa
  const { data: person, error: personError } = await supabase
    .from('people')
    .select('id, owner_profile_id, created_by_profile_id')
    .eq('id', personId)
    .single()

  if (personError || !person) {
    throw new Error('Pessoa não encontrada')
  }

  // Verificar permissões - admin/gestor pode editar tudo, corretor só as próprias
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role, is_active')
    .eq('id', (await supabase.auth.getUser()).data.user?.id)
    .single()

  if (profileError) {
    throw new Error('Erro ao verificar permissões')
  }

  const isAdmin = profile.role === 'admin' && profile.is_active
  const isGestor = profile.role === 'gestor' && profile.is_active
  const isOwner = person.owner_profile_id === (await supabase.auth.getUser()).data.user?.id
  const isCreator = person.created_by_profile_id === (await supabase.auth.getUser()).data.user?.id

  if (!isAdmin && !isGestor && !isOwner && !isCreator) {
    throw new Error('Acesso negado')
  }

  // Atualizar pessoa
  const { error: updateError } = await supabase
    .from('people')
    .update({
      full_name: data.full_name,
      phone_e164: data.phone_e164 || null,
      email: data.email || null,
      document_id: data.document_id || null,
      notes: data.notes || null,
      kind_tags: data.kind_tags || []
    })
    .eq('id', personId)

  if (updateError) {
    throw new Error(`Erro ao atualizar pessoa: ${updateError.message}`)
  }

  revalidatePath(`/people/${personId}`)
}