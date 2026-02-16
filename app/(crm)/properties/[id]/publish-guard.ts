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

function isContractLikeType(docType: unknown): boolean {
  const v = String(docType ?? '').toLowerCase()
  if (!v) return false
  return v.includes('contract') || v.includes('contrato')
}

function isContractLikeTitle(title: unknown): boolean {
  const v = String(title ?? '').toLowerCase()
  if (!v) return false
  return v.includes('contrat')
}

export async function hasSignedContractDoc(propertyId: string): Promise<boolean> {
  const supabase = await createClient()

  // 1) Legacy: property_documents with optional status
  try {
    const { data: withStatus, error: withStatusError } = await supabase
      .from('property_documents')
      .select('id, status, doc_type, title')
      .eq('property_id', propertyId)
      .limit(50)

    if (!withStatusError) {
      const rows = (withStatus ?? []) as Array<{
        id: string
        status?: string | null
        doc_type?: string | null
        title?: string | null
      }>
      const candidates = rows.filter((r) => isContractLikeType(r.doc_type) || isContractLikeTitle(r.title))
      if (candidates.length > 0) {
        const hasAnyStatusField = candidates.some((r) => r.status !== undefined)
        if (hasAnyStatusField) {
          return candidates.some((r) => VALID_STATUSES.has(String(r.status ?? '').toLowerCase()))
        }
        return true
      }
    }
  } catch {
    // noop
  }

  // 2) Legacy fallback: schema sem status no property_documents
  try {
    const { data: legacyRows, error: legacyErr } = await supabase
      .from('property_documents')
      .select('id, doc_type, title')
      .eq('property_id', propertyId)
      .limit(50)

    if (!legacyErr) {
      const candidates = (legacyRows ?? []).filter(
        (r: any) => isContractLikeType(r?.doc_type) || isContractLikeTitle(r?.title)
      )
      if (candidates.length > 0) return true
    }
  } catch {
    // noop
  }

  // 3) Novo schema: document_links -> documents
  try {
    const { data: links, error: linksErr } = await supabase
      .from('document_links')
      .select('document_id')
      .eq('entity_type', 'property')
      .eq('entity_id', propertyId)
      .limit(50)

    if (linksErr) return false

    const documentIds = (links ?? []).map((x: any) => x?.document_id).filter(Boolean)
    if (documentIds.length === 0) return false

    const { data: docs, error: docsErr } = await supabase
      .from('documents')
      .select('id, doc_type, title, status')
      .in('id', documentIds)
      .limit(50)

    if (!docsErr) {
      const candidates = (docs ?? []).filter(
        (r: any) => isContractLikeType(r?.doc_type) || isContractLikeTitle(r?.title)
      )
      if (candidates.length > 0) {
        const hasAnyStatusField = candidates.some((r: any) => r?.status !== undefined)
        if (hasAnyStatusField) {
          return candidates.some((r: any) => VALID_STATUSES.has(String(r?.status ?? '').toLowerCase()))
        }
        return true
      }
    }
  } catch {
    // noop
  }

  return false
}
