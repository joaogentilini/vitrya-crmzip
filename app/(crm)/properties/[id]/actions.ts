'use server'

import { createClient } from '@/lib/supabaseServer'
import { revalidatePath } from 'next/cache'

export interface PublishResult {
  success: boolean
  error?: string
}

export async function publishProperty(propertyId: string): Promise<PublishResult> {
  const supabase = await createClient()

  // verificar role do usuário: apenas admin ou gestor podem aprovar publicações
  const { data: userRes, error: authError } = await supabase.auth.getUser()
  if (authError || !userRes?.user) {
    return { success: false, error: 'Não autenticado' }
  }

  const userId = userRes.user.id
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role, is_active')
    .eq('id', userId)
    .maybeSingle()

  if (profileError) {
    return { success: false, error: `Erro ao verificar perfil: ${profileError.message}` }
  }

  const isAdmin = profile?.role === 'admin' && profile?.is_active
  const isGestor = profile?.role === 'gestor' && profile?.is_active
  if (!isAdmin && !isGestor) {
    return { success: false, error: 'Apenas admin/gestor podem aprovar publicações' }
  }

  const { data: authorizationDocs, error: docsError } = await supabase
    .from('property_documents')
    .select('id')
    .eq('property_id', propertyId)
    .eq('doc_type', 'authorization')
    .limit(1)

  if (docsError) {
    return {
      success: false,
      error: `Erro ao verificar documentos: ${docsError.message}`
    }
  }

  if (!authorizationDocs || authorizationDocs.length === 0) {
    return {
      success: false,
      error: 'Para publicar, anexe o Termo de Autorização do Proprietário (Documentos).'
    }
  }

  const { error: updateError } = await supabase
    .from('properties')
    .update({ status: 'active' })
    .eq('id', propertyId)

  if (updateError) {
    return {
      success: false,
      error: `Erro ao publicar imóvel: ${updateError.message}`
    }
  }

  revalidatePath(`/properties/${propertyId}`)
  revalidatePath('/properties')

  return { success: true }
}

export async function unpublishProperty(propertyId: string): Promise<PublishResult> {
  const supabase = await createClient()

  // verificar role do usuário: apenas admin ou gestor podem reprovar/despublicar
  const { data: userRes, error: authError } = await supabase.auth.getUser()
  if (authError || !userRes?.user) {
    return { success: false, error: 'Não autenticado' }
  }

  const userId = userRes.user.id
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role, is_active')
    .eq('id', userId)
    .maybeSingle()

  if (profileError) {
    return { success: false, error: `Erro ao verificar perfil: ${profileError.message}` }
  }

  const isAdmin = profile?.role === 'admin' && profile?.is_active
  const isGestor = profile?.role === 'gestor' && profile?.is_active
  if (!isAdmin && !isGestor) {
    return { success: false, error: 'Apenas admin/gestor podem reprovar/despublicar' }
  }

  const { error: updateError } = await supabase
    .from('properties')
    .update({ status: 'draft' })
    .eq('id', propertyId)

  if (updateError) {
    return {
      success: false,
      error: `Erro ao despublicar imóvel: ${updateError.message}`
    }
  }

  revalidatePath(`/properties/${propertyId}`)
  revalidatePath('/properties')

  return { success: true }
}

export async function checkAuthorizationDocument(propertyId: string): Promise<boolean> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('property_documents')
    .select('id')
    .eq('property_id', propertyId)
    .eq('doc_type', 'authorization')
    .limit(1)

  if (error) {
    console.error('Error checking authorization document:', error)
    return false
  }

  return (data?.length ?? 0) > 0
}

export interface UpdatePropertyData {
  title: string
  purpose: string

  // ✅ categoria/classificação (nova)
  property_category_id?: string | null

  city?: string | null
  neighborhood?: string | null
  address?: string | null
  price?: number | null
  rent_price?: number | null
  area_m2?: number | null
  bedrooms?: number | null
  bathrooms?: number | null
  parking?: number | null
  description?: string | null
}

export interface UpdatePropertyResult {
  success: boolean
  data?: UpdatePropertyData
  error?: string
}

export async function updatePropertyAction(
  propertyId: string,
  data: UpdatePropertyData
): Promise<UpdatePropertyResult> {
  const supabase = await createClient()

  // ✅ 1x auth.getUser
  const { data: userRes, error: authError } = await supabase.auth.getUser()
  if (authError || !userRes?.user) {
    return { success: false, error: 'Não autenticado' }
  }
  const userId = userRes.user.id

  // Verificar permissões: admin/gestor OU owner do imóvel
  const { data: property, error: fetchError } = await supabase
    .from('properties')
    .select('owner_user_id')
    .eq('id', propertyId)
    .maybeSingle()

  if (fetchError) {
    return {
      success: false,
      error: `Erro ao verificar permissões: ${fetchError.message}`
    }
  }

  if (!property) {
    return {
      success: false,
      error: 'Imóvel não encontrado'
    }
  }

  // Verificar se usuário é admin/gestor ou proprietário
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role, is_active')
    .eq('id', userId)
    .maybeSingle()

  if (profileError) {
    return {
      success: false,
      error: `Erro ao verificar perfil: ${profileError.message}`
    }
  }

  const isAdmin = profile?.role === 'admin' && profile?.is_active
  const isGestor = profile?.role === 'gestor' && profile?.is_active
  const isOwner = property.owner_user_id === userId

  if (!isAdmin && !isGestor && !isOwner) {
    return {
      success: false,
      error: 'Você não tem permissão para editar este imóvel'
    }
  }

  // ✅ normalização leve (evita mandar undefined)
  const patch: Record<string, any> = {
    title: data.title,
    purpose: data.purpose,

    // ✅ novo campo
    property_category_id:
      typeof data.property_category_id === 'undefined'
        ? undefined
        : data.property_category_id,

    city: typeof data.city === 'undefined' ? undefined : data.city,
    neighborhood: typeof data.neighborhood === 'undefined' ? undefined : data.neighborhood,
    address: typeof data.address === 'undefined' ? undefined : data.address,
    price: typeof data.price === 'undefined' ? undefined : data.price,
    rent_price: typeof data.rent_price === 'undefined' ? undefined : data.rent_price,
    area_m2: typeof data.area_m2 === 'undefined' ? undefined : data.area_m2,
    bedrooms: typeof data.bedrooms === 'undefined' ? undefined : data.bedrooms,
    bathrooms: typeof data.bathrooms === 'undefined' ? undefined : data.bathrooms,
    parking: typeof data.parking === 'undefined' ? undefined : data.parking,
    description: typeof data.description === 'undefined' ? undefined : data.description,
    updated_at: new Date().toISOString(),
  }

  // remove chaves undefined (Supabase update ignora, mas aqui fica limpo)
  for (const k of Object.keys(patch)) {
    if (typeof patch[k] === 'undefined') delete patch[k]
  }

  const { error: updateError } = await supabase
    .from('properties')
    .update(patch)
    .eq('id', propertyId)

  if (updateError) {
    return {
      success: false,
      error: `Erro ao atualizar imóvel: ${updateError.message}`
    }
  }

  revalidatePath(`/properties/${propertyId}`)
  revalidatePath('/properties')
  revalidatePath('/properties/my')

  return {
    success: true,
    data,
  }
}
