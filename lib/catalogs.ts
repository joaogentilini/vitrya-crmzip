'use server'

import { createClient } from '@/lib/supabaseServer'

export type CatalogKind = 'types' | 'interests' | 'sources'

export interface CatalogItem {
  id: string
  name: string
  is_active: boolean
  position: number
  created_at: string
}

const tableMap: Record<CatalogKind, string> = {
  types: 'lead_types',
  interests: 'lead_interests',
  sources: 'lead_sources',
}

export async function listCatalog(kind: CatalogKind, activeOnly = true): Promise<CatalogItem[]> {
  const supabase = await createClient()
  const table = tableMap[kind]

  let query = supabase
    .from(table)
    .select('id, name, is_active, position, created_at')
    .order('position', { ascending: true })

  if (activeOnly) {
    query = query.eq('is_active', true)
  }

  const { data, error } = await query

  if (error) {
    console.error(`[catalogs] Failed to list ${kind}:`, error)
    return []
  }

  return data || []
}

export async function upsertCatalogItem(
  kind: CatalogKind,
  item: { id?: string; name: string; is_active?: boolean; position?: number }
): Promise<{ success: boolean; error?: string; item?: CatalogItem }> {
  const supabase = await createClient()
  const table = tableMap[kind]

  // Check admin
  const { data: userRes } = await supabase.auth.getUser()
  if (!userRes?.user) {
    return { success: false, error: 'Não autenticado' }
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', userRes.user.id)
    .single()

  if (profile?.role !== 'admin') {
    return { success: false, error: 'Apenas administradores podem gerenciar catálogos' }
  }

  if (item.id) {
    // Update
    const { data, error } = await supabase
      .from(table)
      .update({
        name: item.name,
        is_active: item.is_active ?? true,
        position: item.position ?? 0,
      })
      .eq('id', item.id)
      .select()
      .single()

    if (error) {
      return { success: false, error: error.message }
    }
    return { success: true, item: data }
  } else {
    // Insert
    const { data, error } = await supabase
      .from(table)
      .insert({
        name: item.name,
        is_active: item.is_active ?? true,
        position: item.position ?? 0,
      })
      .select()
      .single()

    if (error) {
      if (error.code === '23505') {
        return { success: false, error: 'Já existe um item com esse nome' }
      }
      return { success: false, error: error.message }
    }
    return { success: true, item: data }
  }
}

export async function deleteCatalogItem(kind: CatalogKind, id: string): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()
  const table = tableMap[kind]

  // Check admin
  const { data: userRes } = await supabase.auth.getUser()
  if (!userRes?.user) {
    return { success: false, error: 'Não autenticado' }
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', userRes.user.id)
    .single()

  if (profile?.role !== 'admin') {
    return { success: false, error: 'Apenas administradores podem gerenciar catálogos' }
  }

  // Soft delete by setting is_active = false
  const { error } = await supabase
    .from(table)
    .update({ is_active: false })
    .eq('id', id)

  if (error) {
    return { success: false, error: error.message }
  }

  return { success: true }
}
