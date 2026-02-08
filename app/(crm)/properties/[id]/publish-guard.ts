'use server'

import { createClient } from '@/lib/supabaseServer'

const VALID_STATUSES = new Set(['validated', 'valid', 'approved', 'active'])

type PropertyDocRow = {
  id: string
  status?: string | null
}

export async function hasValidatedAuthorizationDoc(propertyId: string): Promise<boolean> {
  const supabase = await createClient()
  let canFallback = false

  // Tentativa 1: schema com coluna status (se existir)
  try {
    const { data: withStatus, error: withStatusError } = await supabase
      .from('property_documents')
      .select('id, status')
      .eq('property_id', propertyId)
      .eq('doc_type', 'authorization')
      .limit(20)

    if (!withStatusError) {
      const rows = (withStatus ?? []) as PropertyDocRow[]
      if (rows.length > 0) {
        const hasAnyStatusField = rows.some((r) => r.status !== undefined)
        if (hasAnyStatusField) {
          return rows.some((r) => VALID_STATUSES.has(String(r.status ?? '').toLowerCase()))
        }

        // schema sem coluna status -> não valida por status, segue fallback
        canFallback = true
      } else {
        // sem rows legacy -> permite fallback (document_links)
        canFallback = true
      }
    } else {
      const msg = String(withStatusError.message ?? '').toLowerCase()
      const isSchemaError =
        (msg.includes('column') && msg.includes('status')) ||
        msg.includes('relation') ||
        msg.includes('schema cache')
      if (!isSchemaError) {
        console.error('Error loading property_documents:', withStatusError)
        return false
      }
      canFallback = true
    }
  } catch (err) {
    console.error('Error loading property_documents:', err)
    return false
  }

  if (!canFallback) return false

  // Fallback: schema sem coluna status (não quebra o publish)
  try {
    const { data: fallback, error: fallbackError } = await supabase
      .from('property_documents')
      .select('id')
      .eq('property_id', propertyId)
      .eq('doc_type', 'authorization')
      .limit(1)

    if (!fallbackError && (fallback ?? []).length > 0) {
      return true
    }
  } catch (err) {
    console.error('Error loading property_documents (fallback):', err)
  }

  // Tentativa 2: document_links -> documents (schema novo)
  try {
    const { data: linkData, error: linkError } = await supabase
      .from('document_links')
      .select('document_id')
      .eq('entity_type', 'property')
      .eq('entity_id', propertyId)
      .limit(20)

    if (linkError) {
      console.error('Error loading document_links:', linkError)
    } else {
      const documentIds = (linkData ?? [])
        .map((row: any) => row?.document_id)
        .filter(Boolean)

      if (documentIds.length > 0) {
        const { data: docsData, error: docsError } = await supabase
          .from('documents')
          .select('id')
          .in('id', documentIds)
          .eq('doc_type', 'authorization')
          .limit(1)

        if (!docsError && (docsData ?? []).length > 0) {
          return true
        }

        if (docsError) {
          console.error('Error loading documents:', docsError)
        }
      }
    }
  } catch (err) {
    console.error('Error loading document_links/documents:', err)
  }

  return false
}
