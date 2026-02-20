'use server'

import { createClient } from '@/lib/supabaseServer'
import {
  AUTHORIZATION_TEMPLATE_CODES,
  buildAuthorizationSnapshot,
  hasAuthorizationSnapshotMismatch,
  isDigitalAuthorizationRequired,
} from '@/lib/documents/esign'

const VALID_STATUSES = new Set(['validated', 'valid', 'approved', 'active', 'signed'])

type PropertyDocRow = {
  id: string
  status?: string | null
}

type AuthorizationInstanceRow = {
  id: string
  status: string | null
  signed_at: string | null
  updated_at: string | null
  template_code: string | null
  authorization_snapshot: Record<string, unknown> | null
}

export type AuthorizationPublicationState = {
  hasAuthorization: boolean
  source: 'digital' | 'legacy' | null
  status: string | null
  documentInstanceId: string | null
  signedAt: string | null
  dataChangedAfterSignature: boolean
  reason: string | null
}

function isSchemaError(message: string): boolean {
  const text = message.toLowerCase()
  return (
    text.includes('column') ||
    text.includes('relation') ||
    text.includes('schema cache') ||
    text.includes('does not exist')
  )
}

async function readCurrentAuthorizationFacts(propertyId: string): Promise<{
  snapshot: ReturnType<typeof buildAuthorizationSnapshot> | null
  error: string | null
}> {
  const supabase = await createClient()

  const { data: propertyRow, error: propertyError } = await supabase
    .from('properties')
    .select(
      'id, registry_number, address, address_number, address_complement, neighborhood, city, state, postal_code, price, commission_percent, authorization_started_at, authorization_expires_at, authorization_is_exclusive'
    )
    .eq('id', propertyId)
    .maybeSingle()

  if (propertyError || !propertyRow) {
    return {
      snapshot: null,
      error: propertyError?.message || 'Imóvel não encontrado para validação de autorização.',
    }
  }

  let saleCommissionPercent: number | null = null
  try {
    const { data: commissionRow, error: commissionError } = await supabase
      .from('property_commission_settings')
      .select('sale_commission_percent')
      .eq('property_id', propertyId)
      .maybeSingle()

    if (!commissionError && typeof commissionRow?.sale_commission_percent === 'number') {
      saleCommissionPercent = commissionRow.sale_commission_percent
    }
  } catch {
    // tabela ausente ou sem permissão: usa fallback da propriedade
  }

  const snapshot = buildAuthorizationSnapshot({
    registry_number: propertyRow.registry_number,
    address: propertyRow.address,
    address_number: propertyRow.address_number,
    address_complement: propertyRow.address_complement,
    neighborhood: propertyRow.neighborhood,
    city: propertyRow.city,
    state: propertyRow.state,
    postal_code: propertyRow.postal_code,
    sale_price: propertyRow.price,
    commission_percent: saleCommissionPercent ?? propertyRow.commission_percent,
    authorization_started_at: propertyRow.authorization_started_at,
    authorization_expires_at: propertyRow.authorization_expires_at,
    authorization_is_exclusive: propertyRow.authorization_is_exclusive,
  })

  return { snapshot, error: null }
}

async function checkLegacyAuthorizationDoc(propertyId: string): Promise<boolean> {
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
        const hasAnyStatusField = rows.some((row) => row.status !== undefined)
        if (hasAnyStatusField) {
          return rows.some((row) => VALID_STATUSES.has(String(row.status ?? '').toLowerCase()))
        }

        canFallback = true
      } else {
        canFallback = true
      }
    } else if (!isSchemaError(String(withStatusError.message ?? ''))) {
      console.error('Error loading property_documents:', withStatusError)
      return false
    } else {
      canFallback = true
    }
  } catch (err) {
    console.error('Error loading property_documents:', err)
    return false
  }

  if (!canFallback) return false

  // Fallback: schema sem coluna status
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

  // Tentativa 2: document_links -> documents
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
      const documentIds = (linkData ?? []).map((row: any) => row?.document_id).filter(Boolean)

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

export async function getAuthorizationPublicationState(
  propertyId: string
): Promise<AuthorizationPublicationState> {
  const supabase = await createClient()
  const requireDigital = isDigitalAuthorizationRequired()

  try {
    const { data: rows, error } = await supabase
      .from('document_instances')
      .select('id, status, signed_at, updated_at, template_code, authorization_snapshot')
      .eq('property_id', propertyId)
      .in('template_code', [...AUTHORIZATION_TEMPLATE_CODES])
      .order('signed_at', { ascending: false })
      .order('updated_at', { ascending: false })
      .limit(20)

    if (error) {
      const message = String(error.message || '')
      if (!isSchemaError(message)) {
        console.error('Error loading document_instances:', error)
      }
    } else {
      const signed = ((rows ?? []) as AuthorizationInstanceRow[]).find(
        (row) => String(row.status || '').toLowerCase() === 'signed'
      )

      if (signed) {
        const currentFacts = await readCurrentAuthorizationFacts(propertyId)
        const mismatch = currentFacts.snapshot
          ? hasAuthorizationSnapshotMismatch({
              snapshot: signed.authorization_snapshot,
              current: currentFacts.snapshot,
            })
          : true

        if (!mismatch) {
          return {
            hasAuthorization: true,
            source: 'digital',
            status: 'signed',
            documentInstanceId: signed.id,
            signedAt: signed.signed_at || null,
            dataChangedAfterSignature: false,
            reason: null,
          }
        }

        return {
          hasAuthorization: false,
          source: 'digital',
          status: 'signed',
          documentInstanceId: signed.id,
          signedAt: signed.signed_at || null,
          dataChangedAfterSignature: true,
          reason: 'Dados do imóvel alterados após assinatura. Gere nova autorização digital.',
        }
      }

      const latest = (rows ?? [])[0] as AuthorizationInstanceRow | undefined
      if (latest) {
        return {
          hasAuthorization: false,
          source: 'digital',
          status: latest.status || null,
          documentInstanceId: latest.id,
          signedAt: latest.signed_at || null,
          dataChangedAfterSignature: false,
          reason: 'Autorização digital ainda não assinada.',
        }
      }
    }
  } catch (err) {
    console.error('Error validating digital authorization:', err)
  }

  if (requireDigital) {
    return {
      hasAuthorization: false,
      source: null,
      status: null,
      documentInstanceId: null,
      signedAt: null,
      dataChangedAfterSignature: false,
      reason: 'Autorização digital assinada é obrigatória para publicar.',
    }
  }

  const legacyOk = await checkLegacyAuthorizationDoc(propertyId)
  return {
    hasAuthorization: legacyOk,
    source: legacyOk ? 'legacy' : null,
    status: legacyOk ? 'validated' : null,
    documentInstanceId: null,
    signedAt: null,
    dataChangedAfterSignature: false,
    reason: legacyOk ? null : 'Autorização não encontrada.',
  }
}

export async function hasValidatedAuthorizationDoc(propertyId: string): Promise<boolean> {
  const state = await getAuthorizationPublicationState(propertyId)
  return state.hasAuthorization
}

function isContractLikeType(docType: unknown): boolean {
  const value = String(docType ?? '').toLowerCase()
  if (!value) return false
  return value.includes('contract') || value.includes('contrato')
}

function isContractLikeTitle(title: unknown): boolean {
  const value = String(title ?? '').toLowerCase()
  if (!value) return false
  return value.includes('contrat')
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
      const candidates = rows.filter((row) => isContractLikeType(row.doc_type) || isContractLikeTitle(row.title))
      if (candidates.length > 0) {
        const hasAnyStatusField = candidates.some((row) => row.status !== undefined)
        if (hasAnyStatusField) {
          return candidates.some((row) => VALID_STATUSES.has(String(row.status ?? '').toLowerCase()))
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
        (row: any) => isContractLikeType(row?.doc_type) || isContractLikeTitle(row?.title)
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

    const documentIds = (links ?? []).map((item: any) => item?.document_id).filter(Boolean)
    if (documentIds.length === 0) return false

    const { data: docs, error: docsErr } = await supabase
      .from('documents')
      .select('id, doc_type, title, status')
      .in('id', documentIds)
      .limit(50)

    if (!docsErr) {
      const candidates = (docs ?? []).filter(
        (row: any) => isContractLikeType(row?.doc_type) || isContractLikeTitle(row?.title)
      )
      if (candidates.length > 0) {
        const hasAnyStatusField = candidates.some((row: any) => row?.status !== undefined)
        if (hasAnyStatusField) {
          return candidates.some((row: any) => VALID_STATUSES.has(String(row?.status ?? '').toLowerCase()))
        }
        return true
      }
    }
  } catch {
    // noop
  }

  return false
}

