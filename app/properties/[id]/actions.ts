'use server'

import { createServerClient } from '@/lib/supabaseClient'
import { revalidatePath } from 'next/cache'

export interface PublishResult {
  success: boolean
  error?: string
}

export async function publishProperty(propertyId: string): Promise<PublishResult> {
  const supabase = await createServerClient()

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
  const supabase = await createServerClient()

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
  const supabase = await createServerClient()

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
