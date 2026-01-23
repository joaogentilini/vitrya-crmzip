'use server'

import { createClient } from '@/lib/supabaseServer'
import { revalidatePath } from 'next/cache'

export async function reorderPropertyMedia(propertyId: string, mediaIds: string[]) {
  const supabase = await createClient()

  // Verificar se o usuário tem acesso ao property
  const { data: property, error: propError } = await supabase
    .from('properties')
    .select('id, owner_user_id')
    .eq('id', propertyId)
    .single()

  if (propError || !property) {
    throw new Error('Imóvel não encontrado ou acesso negado')
  }

  // Verificar ownership ou admin
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role, is_active')
    .eq('id', (await supabase.auth.getUser()).data.user?.id)
    .single()

  if (profileError) {
    throw new Error('Erro ao verificar permissões')
  }

  const isAdmin = profile.role === 'admin' && profile.is_active
  const isOwner = property.owner_user_id === (await supabase.auth.getUser()).data.user?.id

  if (!isAdmin && !isOwner) {
    throw new Error('Acesso negado')
  }

  // Verificar se todos os mediaIds pertencem ao property
  const { data: existingMedia, error: mediaError } = await supabase
    .from('property_media')
    .select('id')
    .eq('property_id', propertyId)
    .in('id', mediaIds)

  if (mediaError) {
    throw new Error('Erro ao verificar mídias')
  }

  if (existingMedia.length !== mediaIds.length) {
    throw new Error('Algumas mídias não pertencem a este imóvel')
  }

  // Atualizar posições em lote
  const updates = mediaIds.map((id, index) => ({
    id,
    position: index + 1
  }))

  for (const update of updates) {
    const { error: updateError } = await supabase
      .from('property_media')
      .update({ position: update.position })
      .eq('id', update.id)

    if (updateError) {
      throw new Error(`Erro ao atualizar posição: ${updateError.message}`)
    }
  }

  revalidatePath(`/properties/${propertyId}`)
}