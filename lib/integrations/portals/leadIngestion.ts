import { createAdminClient } from '@/lib/supabase/admin'
import { createLogger } from '@/lib/logger'
import { normalizeBrazilianPhone } from '@/lib/phone'

import { buildIdempotencyKey, buildLeadFingerprint } from './idempotency'
import type { PortalProvider } from './types'

type PayloadRecord = Record<string, unknown>

export interface PortalLeadIngestionInput {
  provider: PortalProvider
  payload: PayloadRecord
  headers: Record<string, string>
}

export interface PortalLeadIngestionResult {
  ok: boolean
  status: 'processed' | 'duplicate' | 'ignored' | 'error'
  eventId: string | null
  leadId: string | null
  personId: string | null
  propertyId: string | null
  message: string
}

type PropertyContext = {
  propertyId: string | null
  propertyExternalId: string | null
  propertyOwnerUserId: string | null
  propertyTitle: string | null
}

function isUuid(value: string | null): boolean {
  if (!value) return false
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

function isSchemaMissingError(error: { code?: string | null; message?: string | null }): boolean {
  const code = String(error?.code || '')
  const msg = String(error?.message || '').toLowerCase()
  return (
    code === '42P01' ||
    code === '42703' ||
    code === 'PGRST204' ||
    code === 'PGRST205' ||
    msg.includes('does not exist') ||
    msg.includes('schema cache') ||
    msg.includes('column')
  )
}

function isDuplicateError(error: { code?: string | null }): boolean {
  return String(error?.code || '') === '23505'
}

function isPhoneUniqueError(error: { code?: string | null; message?: string | null }): boolean {
  return isDuplicateError(error) && String(error?.message || '').toLowerCase().includes('phone_e164')
}

function isMissingColumnError(error: { code?: string | null; message?: string | null }, column: string): boolean {
  const code = String(error?.code || '')
  const msg = String(error?.message || '').toLowerCase()
  return (code === '42703' || code === 'PGRST204') && msg.includes(column.toLowerCase())
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return value as Record<string, unknown>
}

function getByPath(source: unknown, path: string): unknown {
  const parts = path.split('.').map((item) => item.trim()).filter(Boolean)
  let cursor: unknown = source
  for (const part of parts) {
    if (!cursor || typeof cursor !== 'object' || Array.isArray(cursor)) return undefined
    cursor = (cursor as Record<string, unknown>)[part]
  }
  return cursor
}

function normalizeString(value: unknown): string | null {
  if (typeof value === 'string') {
    const cleaned = value.trim()
    return cleaned || null
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }
  return null
}

function pickString(source: unknown, paths: string[]): string | null {
  for (const path of paths) {
    const value = normalizeString(getByPath(source, path))
    if (value) return value
  }
  return null
}

function normalizeEmail(value: string | null): string | null {
  if (!value) return null
  const email = value.trim().toLowerCase()
  if (!email) return null
  const isValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  return isValid ? email : null
}

function normalizeDigits(value: string | null): string | null {
  if (!value) return null
  const digits = value.replace(/\D/g, '')
  return digits || null
}

function compactText(value: string | null, limit: number): string | null {
  if (!value) return null
  const compacted = value.replace(/\s+/g, ' ').trim()
  if (!compacted) return null
  return compacted.slice(0, limit)
}

function providerLeadSourceName(provider: PortalProvider): string {
  if (provider === 'grupoolx') return 'Portal - Grupo OLX'
  if (provider === 'olx') return 'Portal - OLX'
  return 'Portal - Meta'
}

function buildLeadTitle(provider: PortalProvider, clientName: string | null, propertyTitle: string | null): string {
  const providerLabel = provider === 'grupoolx' ? 'Grupo OLX' : provider.toUpperCase()
  const left = clientName ? `Lead ${providerLabel} - ${clientName}` : `Lead ${providerLabel}`
  if (!propertyTitle) return left.slice(0, 120)
  return `${left} (${propertyTitle})`.slice(0, 120)
}

async function ensurePortalLeadSourceId(admin: ReturnType<typeof createAdminClient>, provider: PortalProvider) {
  const sourceName = providerLeadSourceName(provider)
  const existing = await admin
    .from('lead_sources')
    .select('id')
    .eq('name', sourceName)
    .limit(1)
    .maybeSingle()

  if (existing.data?.id) return existing.data.id as string

  const inserted = await admin
    .from('lead_sources')
    .insert({
      name: sourceName,
      position: provider === 'grupoolx' ? 600 : provider === 'olx' ? 601 : 602,
      is_active: true,
    })
    .select('id')
    .maybeSingle()

  if (inserted.data?.id) return inserted.data.id as string

  const fallback = await admin
    .from('lead_sources')
    .select('id')
    .eq('name', sourceName)
    .limit(1)
    .maybeSingle()

  return (fallback.data?.id as string | undefined) ?? null
}

async function resolvePropertyContext(
  admin: ReturnType<typeof createAdminClient>,
  provider: PortalProvider,
  payload: PayloadRecord
): Promise<PropertyContext> {
  const propertyExternalId = pickString(payload, [
    'property_id',
    'property.id',
    'listing_id',
    'listing.id',
    'ad_id',
    'ad.id',
    'data.property_id',
    'data.property.id',
    'data.listing_id',
    'data.ad_id',
    'offer.id',
  ])

  let propertyId: string | null = null
  let propertyOwnerUserId: string | null = null
  let propertyTitle: string | null = null

  if (isUuid(propertyExternalId)) {
    const propertyByUuid = await admin
      .from('properties')
      .select('id, owner_user_id, title')
      .eq('id', propertyExternalId)
      .limit(1)
      .maybeSingle()
    if (propertyByUuid.data?.id) {
      propertyId = propertyByUuid.data.id as string
      propertyOwnerUserId = (propertyByUuid.data.owner_user_id as string | null) ?? null
      propertyTitle = (propertyByUuid.data.title as string | null) ?? null
    }
  }

  if (!propertyId && propertyExternalId) {
    const listingRes = await admin
      .from('property_portal_listings')
      .select('property_id')
      .eq('provider', provider)
      .eq('external_listing_id', propertyExternalId)
      .limit(1)
      .maybeSingle()

    if (!listingRes.error && listingRes.data?.property_id) {
      propertyId = listingRes.data.property_id as string
    }
  }

  if (propertyId && !propertyOwnerUserId) {
    const propertyRes = await admin
      .from('properties')
      .select('id, owner_user_id, title')
      .eq('id', propertyId)
      .limit(1)
      .maybeSingle()
    if (!propertyRes.error && propertyRes.data) {
      propertyOwnerUserId = (propertyRes.data.owner_user_id as string | null) ?? null
      propertyTitle = (propertyRes.data.title as string | null) ?? null
    }
  }

  return {
    propertyId,
    propertyExternalId,
    propertyOwnerUserId,
    propertyTitle,
  }
}

async function findPersonByDocument(
  admin: ReturnType<typeof createAdminClient>,
  cpfDigits: string | null,
  cnpjDigits: string | null
): Promise<string | null> {
  if (cpfDigits) {
    const byCpf = await admin
      .from('person_financing_profiles')
      .select('person_id')
      .eq('cpf', cpfDigits)
      .limit(1)
      .maybeSingle()

    if (byCpf.data?.person_id) return byCpf.data.person_id as string
    if (byCpf.error && !isSchemaMissingError(byCpf.error)) {
      throw new Error(byCpf.error.message || 'Erro ao buscar pessoa por CPF')
    }
  }

  if (cnpjDigits) {
    const byCnpj = await admin
      .from('person_company_profiles')
      .select('person_id')
      .eq('cnpj', cnpjDigits)
      .limit(1)
      .maybeSingle()

    if (byCnpj.data?.person_id) return byCnpj.data.person_id as string
    if (byCnpj.error && !isSchemaMissingError(byCnpj.error)) {
      throw new Error(byCnpj.error.message || 'Erro ao buscar pessoa por CNPJ')
    }
  }

  return null
}

async function findPersonByContact(
  admin: ReturnType<typeof createAdminClient>,
  phoneE164: string | null,
  email: string | null
): Promise<string | null> {
  if (phoneE164) {
    const byPhone = await admin
      .from('people')
      .select('id')
      .eq('phone_e164', phoneE164)
      .limit(1)
      .maybeSingle()
    if (byPhone.data?.id) return byPhone.data.id as string
    if (byPhone.error && !isSchemaMissingError(byPhone.error)) {
      throw new Error(byPhone.error.message || 'Erro ao buscar pessoa por telefone')
    }
  }

  if (email) {
    const byEmail = await admin
      .from('people')
      .select('id')
      .ilike('email', email)
      .limit(1)
      .maybeSingle()
    if (byEmail.data?.id) return byEmail.data.id as string
    if (byEmail.error && !isSchemaMissingError(byEmail.error)) {
      throw new Error(byEmail.error.message || 'Erro ao buscar pessoa por email')
    }
  }

  return null
}

async function createPerson(
  admin: ReturnType<typeof createAdminClient>,
  input: {
    fullName: string
    phoneE164: string | null
    email: string | null
    message: string | null
    propertyOwnerUserId: string | null
    documentId: string | null
  }
): Promise<string> {
  const primaryPayload: Record<string, unknown> = {
    full_name: input.fullName,
    phone_e164: input.phoneE164,
    email: input.email,
    notes: input.message,
    document_id: input.documentId,
    owner_profile_id: input.propertyOwnerUserId,
    created_by_profile_id: input.propertyOwnerUserId,
  }

  const firstTry = await admin.from('people').insert(primaryPayload).select('id').single()
  if (!firstTry.error && firstTry.data?.id) {
    return firstTry.data.id as string
  }

  if (firstTry.error && !isSchemaMissingError(firstTry.error)) {
    throw new Error(firstTry.error.message || 'Erro ao criar pessoa')
  }

  const fallbackPayload: Record<string, unknown> = {
    full_name: input.fullName,
    phone_e164: input.phoneE164,
    email: input.email,
    notes: input.message,
    document_id: input.documentId,
  }

  const secondTry = await admin.from('people').insert(fallbackPayload).select('id').single()
  if (!secondTry.error && secondTry.data?.id) {
    return secondTry.data.id as string
  }

  throw new Error(secondTry.error?.message || 'Erro ao criar pessoa')
}

async function resolvePersonId(
  admin: ReturnType<typeof createAdminClient>,
  input: {
    fullName: string
    phoneE164: string | null
    email: string | null
    message: string | null
    propertyOwnerUserId: string | null
    cpfDigits: string | null
    cnpjDigits: string | null
  }
): Promise<string> {
  const byDocument = await findPersonByDocument(admin, input.cpfDigits, input.cnpjDigits)
  if (byDocument) return byDocument

  const byContact = await findPersonByContact(admin, input.phoneE164, input.email)
  if (byContact) return byContact

  const personId = await createPerson(admin, {
    fullName: input.fullName,
    phoneE164: input.phoneE164,
    email: input.email,
    message: input.message,
    propertyOwnerUserId: input.propertyOwnerUserId,
    documentId: input.cpfDigits || input.cnpjDigits || null,
  })

  return personId
}

async function resolvePipelineAndStage(admin: ReturnType<typeof createAdminClient>) {
  const pipeline = await admin.from('pipelines').select('id').order('created_at', { ascending: true }).limit(1).maybeSingle()
  const pipelineId = (pipeline.data?.id as string | undefined) ?? null
  if (!pipelineId) return { pipelineId: null, stageId: null }

  const stage = await admin
    .from('pipeline_stages')
    .select('id')
    .eq('pipeline_id', pipelineId)
    .order('position', { ascending: true })
    .limit(1)
    .maybeSingle()
  return {
    pipelineId,
    stageId: (stage.data?.id as string | undefined) ?? null,
  }
}

async function insertLead(
  admin: ReturnType<typeof createAdminClient>,
  payload: Record<string, unknown>
): Promise<{ id: string }> {
  const tryInsert = async (candidate: Record<string, unknown>) =>
    admin.from('leads').insert(candidate).select('id').single()

  let workingPayload = { ...payload }
  let insertRes = await tryInsert(workingPayload)

  if (insertRes.error && isMissingColumnError(insertRes.error, 'allow_duplicate_phone')) {
    delete workingPayload.allow_duplicate_phone
    insertRes = await tryInsert(workingPayload)
  }

  if (insertRes.error && isMissingColumnError(insertRes.error, 'property_id')) {
    delete workingPayload.property_id
    insertRes = await tryInsert(workingPayload)
  }

  if (insertRes.error && isPhoneUniqueError(insertRes.error)) {
    workingPayload = {
      ...workingPayload,
      phone_e164: null,
      notes: compactText(
        `${String(workingPayload.notes || '')}\nTelefone normalizado enviado pelo portal: ${String(
          workingPayload.phone_raw || ''
        )}`.trim(),
        2000
      ),
    }
    insertRes = await tryInsert(workingPayload)
  }

  if (insertRes.error || !insertRes.data?.id) {
    throw new Error(insertRes.error?.message || 'Erro ao criar lead')
  }

  return { id: insertRes.data.id as string }
}

async function upsertPortalLeadLink(
  admin: ReturnType<typeof createAdminClient>,
  input: {
    provider: PortalProvider
    externalLeadId: string | null
    externalConversationId: string | null
    leadFingerprint: string
    leadId: string
    propertyId: string | null
  }
) {
  const row: Record<string, unknown> = {
    provider: input.provider,
    external_lead_id: input.externalLeadId,
    external_conversation_id: input.externalConversationId,
    lead_fingerprint: input.leadFingerprint,
    lead_id: input.leadId,
    property_id: input.propertyId,
  }

  const inserted = await admin.from('portal_lead_links').insert(row).select('id').maybeSingle()
  if (!inserted.error) return

  if (!isDuplicateError(inserted.error)) {
    throw new Error(inserted.error.message || 'Erro ao registrar vínculo do lead no portal')
  }

  if (input.externalLeadId) {
    await admin
      .from('portal_lead_links')
      .update({
        lead_id: input.leadId,
        property_id: input.propertyId,
        external_conversation_id: input.externalConversationId,
      })
      .eq('provider', input.provider)
      .eq('external_lead_id', input.externalLeadId)
  } else {
    await admin
      .from('portal_lead_links')
      .update({
        lead_id: input.leadId,
        property_id: input.propertyId,
        external_conversation_id: input.externalConversationId,
      })
      .eq('provider', input.provider)
      .eq('lead_fingerprint', input.leadFingerprint)
  }
}

async function updateEventStatus(
  admin: ReturnType<typeof createAdminClient>,
  eventId: string | null,
  patch: Record<string, unknown>
) {
  if (!eventId) return
  await admin.from('portal_webhook_events').update(patch).eq('id', eventId)
}

function providerLabel(provider: PortalProvider): string {
  if (provider === 'grupoolx') return 'Grupo OLX'
  if (provider === 'olx') return 'OLX'
  return 'META'
}

export async function ingestPortalLeadEvent(input: PortalLeadIngestionInput): Promise<PortalLeadIngestionResult> {
  const admin = createAdminClient()
  const log = createLogger(`/api/integrations/${input.provider}/leads`)

  const payload = asRecord(input.payload)

  const eventType = pickString(payload, ['event_type', 'event.type', 'type', 'action', 'topic']) || 'lead'
  const externalEventId = pickString(payload, [
    'event_id',
    'id',
    'event.id',
    'data.id',
    'data.event_id',
    'message.id',
  ])
  const externalLeadId = pickString(payload, [
    'lead_id',
    'lead.id',
    'data.lead_id',
    'data.lead.id',
    'contact.id',
    'customer.id',
    'buyer.id',
  ])
  const externalConversationId = pickString(payload, [
    'conversation_id',
    'conversation.id',
    'chat_id',
    'thread_id',
    'data.conversation_id',
    'data.chat_id',
  ])

  const rawName =
    pickString(payload, ['name', 'lead.name', 'contact.name', 'customer.name', 'buyer.name', 'client_name']) ||
    'Lead de portal'
  const rawPhone = pickString(payload, [
    'phone',
    'phone_number',
    'mobile',
    'whatsapp',
    'lead.phone',
    'contact.phone',
    'customer.phone',
    'buyer.phone',
  ])
  const rawEmail = pickString(payload, ['email', 'lead.email', 'contact.email', 'customer.email', 'buyer.email'])
  const rawMessage = pickString(payload, [
    'message',
    'text',
    'body',
    'description',
    'notes',
    'lead.message',
    'lead.notes',
  ])
  const cpfDigits = normalizeDigits(
    pickString(payload, ['cpf', 'lead.cpf', 'contact.cpf', 'customer.cpf', 'document.cpf'])
  )
  const cnpjDigits = normalizeDigits(
    pickString(payload, ['cnpj', 'lead.cnpj', 'contact.cnpj', 'customer.cnpj', 'document.cnpj'])
  )

  const normalizedPhone = rawPhone ? normalizeBrazilianPhone(rawPhone) : { isValid: false, e164: null, raw: '' }
  const phoneE164 = normalizedPhone.isValid ? normalizedPhone.e164 : null
  const email = normalizeEmail(rawEmail)
  const message = compactText(rawMessage, 1400)

  const propertyContext = await resolvePropertyContext(admin, input.provider, payload)
  const phoneFingerprint = normalizeDigits(phoneE164 || rawPhone || null)
  const messageFingerprint = compactText(message, 240)

  const idempotencyKey = buildIdempotencyKey({
    provider: input.provider,
    eventType,
    externalEventId,
    externalLeadId,
    externalConversationId,
    propertyExternalId: propertyContext.propertyExternalId,
    email,
    phoneFingerprint,
    messageFingerprint,
    payload,
  })

  const headersPayload = Object.fromEntries(
    Object.entries(input.headers).map(([key, value]) => [key.toLowerCase(), value])
  )

  const eventInsert = await admin
    .from('portal_webhook_events')
    .insert({
      provider: input.provider,
      external_event_id: externalEventId,
      idempotency_key: idempotencyKey,
      event_type: eventType,
      payload,
      headers: headersPayload,
      status: 'received',
    })
    .select('id')
    .maybeSingle()

  if (eventInsert.error) {
    if (isDuplicateError(eventInsert.error)) {
      return {
        ok: true,
        status: 'duplicate',
        eventId: null,
        leadId: null,
        personId: null,
        propertyId: propertyContext.propertyId,
        message: 'Evento duplicado (idempotência).',
      }
    }

    log.error('Failed to insert portal_webhook_events', eventInsert.error)
    return {
      ok: false,
      status: 'error',
      eventId: null,
      leadId: null,
      personId: null,
      propertyId: propertyContext.propertyId,
      message: eventInsert.error.message || 'Falha ao registrar evento bruto.',
    }
  }

  const eventId = (eventInsert.data?.id as string | undefined) ?? null

  try {
    const integrationState = await admin
      .from('portal_integrations')
      .select('is_enabled')
      .eq('provider', input.provider)
      .limit(1)
      .maybeSingle()

    if (integrationState.data && integrationState.data.is_enabled === false) {
      await updateEventStatus(admin, eventId, {
        status: 'ignored',
        processed_at: new Date().toISOString(),
        processing_result: { reason: 'provider_disabled' },
      })

      return {
        ok: true,
        status: 'ignored',
        eventId,
        leadId: null,
        personId: null,
        propertyId: propertyContext.propertyId,
        message: `${providerLabel(input.provider)} está desabilitado no CRM.`,
      }
    }

    const leadSourceId = await ensurePortalLeadSourceId(admin, input.provider)
    const { pipelineId, stageId } = await resolvePipelineAndStage(admin)

    const personId = await resolvePersonId(admin, {
      fullName: rawName,
      phoneE164,
      email,
      message,
      propertyOwnerUserId: propertyContext.propertyOwnerUserId,
      cpfDigits,
      cnpjDigits,
    })

    const leadNotes = compactText(
      [
        `Origem: ${providerLabel(input.provider)}`,
        externalLeadId ? `Lead externo: ${externalLeadId}` : null,
        externalConversationId ? `Conversa externa: ${externalConversationId}` : null,
        propertyContext.propertyExternalId ? `Anúncio externo: ${propertyContext.propertyExternalId}` : null,
        message ? `Mensagem: ${message}` : null,
      ]
        .filter(Boolean)
        .join('\n'),
      2000
    )

    const leadPayload: Record<string, unknown> = {
      title: buildLeadTitle(input.provider, rawName, propertyContext.propertyTitle),
      status: 'open',
      pipeline_id: pipelineId,
      stage_id: stageId,
      created_by: propertyContext.propertyOwnerUserId,
      assigned_to: propertyContext.propertyOwnerUserId,
      owner_user_id: propertyContext.propertyOwnerUserId,
      client_name: rawName,
      phone_raw: rawPhone,
      phone_e164: phoneE164,
      email,
      lead_source_id: leadSourceId,
      notes: leadNotes,
      person_id: personId,
      allow_duplicate_phone: true,
    }

    if (propertyContext.propertyId) {
      leadPayload.property_id = propertyContext.propertyId
    }

    const leadInsert = await insertLead(admin, leadPayload)

    const leadFingerprint = buildLeadFingerprint({
      provider: input.provider,
      externalLeadId,
      externalConversationId,
      email,
      phoneFingerprint,
      propertyExternalId: propertyContext.propertyExternalId,
      messageFingerprint,
    })

    await upsertPortalLeadLink(admin, {
      provider: input.provider,
      externalLeadId,
      externalConversationId,
      leadFingerprint,
      leadId: leadInsert.id,
      propertyId: propertyContext.propertyId,
    })

    await admin.from('lead_audit_logs').insert({
      lead_id: leadInsert.id,
      actor_id: propertyContext.propertyOwnerUserId,
      action: 'portal_webhook_ingested',
      details: {
        provider: input.provider,
        event_id: externalEventId,
        external_lead_id: externalLeadId,
        external_conversation_id: externalConversationId,
        property_id: propertyContext.propertyId,
      },
    })

    await updateEventStatus(admin, eventId, {
      status: 'processed',
      processed_at: new Date().toISOString(),
      processing_result: {
        lead_id: leadInsert.id,
        person_id: personId,
        property_id: propertyContext.propertyId,
        provider: input.provider,
      },
    })

    return {
      ok: true,
      status: 'processed',
      eventId,
      leadId: leadInsert.id,
      personId,
      propertyId: propertyContext.propertyId,
      message: 'Lead recebido e gravado com sucesso.',
    }
  } catch (error) {
    const errMessage = error instanceof Error ? error.message : 'Erro inesperado ao processar lead'
    log.error('Portal lead ingestion failed', error)

    await updateEventStatus(admin, eventId, {
      status: 'error',
      processed_at: new Date().toISOString(),
      error_message: errMessage,
    })

    return {
      ok: false,
      status: 'error',
      eventId,
      leadId: null,
      personId: null,
      propertyId: propertyContext.propertyId,
      message: errMessage,
    }
  }
}

