import { createAdminClient } from '@/lib/supabase/admin'
import {
  isEvolutionApiEnabled,
  normalizeEvolutionInstanceName,
  sendEvolutionTextMessage,
} from '@/lib/integrations/evolution/client'
import {
  isOpenClawApiEnabled,
  normalizeOpenClawAccountId,
  sendOpenClawTextMessage,
} from '@/lib/integrations/openclaw/client'
import { createClient } from '@/lib/supabaseServer'

export type ChatChannel = 'whatsapp' | 'instagram' | 'facebook' | 'olx' | 'grupoolx' | 'meta' | 'other'
export type ChatMessageDirection = 'inbound' | 'outbound' | 'system'
export type ChatMessageType = 'text' | 'image' | 'audio' | 'video' | 'document' | 'template' | 'event'

const CHANNELS: ChatChannel[] = ['whatsapp', 'instagram', 'facebook', 'olx', 'grupoolx', 'meta', 'other']
const CHANNEL_SET = new Set<ChatChannel>(CHANNELS)
const CONVERSATION_STATUSES = new Set(['open', 'pending', 'resolved', 'archived'])

function isDuplicateError(code: string | null | undefined): boolean {
  return String(code || '') === '23505'
}

function compactText(value: string | null | undefined, limit = 180): string | null {
  const text = String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
  if (!text) return null
  return text.slice(0, limit)
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return value as Record<string, unknown>
}

function asIsoDate(value: string | Date | null | undefined): string {
  if (!value) return new Date().toISOString()
  if (value instanceof Date) return value.toISOString()
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return new Date().toISOString()
  return parsed.toISOString()
}

function normalizeChannel(value: string | null | undefined): ChatChannel {
  const normalized = String(value || '')
    .trim()
    .toLowerCase() as ChatChannel
  return CHANNEL_SET.has(normalized) ? normalized : 'other'
}

function messagePreviewByType(type: ChatMessageType, contentText: string | null): string {
  if (contentText) return contentText
  if (type === 'image') return '[imagem]'
  if (type === 'audio') return '[audio]'
  if (type === 'video') return '[video]'
  if (type === 'document') return '[documento]'
  if (type === 'template') return '[template]'
  if (type === 'event') return '[evento]'
  return '[mensagem]'
}

export type InboundConversationMessageInput = {
  channel: ChatChannel | string
  externalConversationId?: string | null
  externalLeadId?: string | null
  leadId?: string | null
  personId?: string | null
  propertyId?: string | null
  brokerUserId?: string | null
  subject?: string | null
  text?: string | null
  mediaUrl?: string | null
  messageType?: ChatMessageType
  providerMessageId?: string | null
  senderName?: string | null
  senderExternalId?: string | null
  payload?: Record<string, unknown> | null
  metadata?: Record<string, unknown> | null
  occurredAt?: string | Date | null
}

export type InboundConversationMessageResult = {
  ok: boolean
  conversationId: string | null
  messageId: string | null
  createdConversation: boolean
  error?: string
}

type ConversationRow = {
  id: string
  channel: ChatChannel
  status: string
  subject: string | null
  external_conversation_id: string | null
  external_lead_id: string | null
  broker_user_id: string | null
  lead_id: string | null
  person_id: string | null
  property_id: string | null
  metadata: Record<string, unknown> | null
}

async function resolveConversation(
  admin: ReturnType<typeof createAdminClient>,
  input: {
    channel: ChatChannel
    externalConversationId: string | null
    externalLeadId: string | null
    leadId: string | null
    brokerUserId: string | null
  }
): Promise<ConversationRow | null> {
  if (input.externalConversationId) {
    const byExternalConversation = await admin
      .from('chat_conversations')
      .select(
        'id,channel,status,subject,external_conversation_id,external_lead_id,broker_user_id,lead_id,person_id,property_id,metadata'
      )
      .eq('channel', input.channel)
      .eq('external_conversation_id', input.externalConversationId)
      .limit(1)
      .maybeSingle()
    if (byExternalConversation.data?.id) return byExternalConversation.data as ConversationRow
  }

  if (input.externalLeadId) {
    const byExternalLead = await admin
      .from('chat_conversations')
      .select(
        'id,channel,status,subject,external_conversation_id,external_lead_id,broker_user_id,lead_id,person_id,property_id,metadata'
      )
      .eq('channel', input.channel)
      .eq('external_lead_id', input.externalLeadId)
      .limit(1)
      .maybeSingle()
    if (byExternalLead.data?.id) return byExternalLead.data as ConversationRow
  }

  if (input.leadId) {
    let query = admin
      .from('chat_conversations')
      .select(
        'id,channel,status,subject,external_conversation_id,external_lead_id,broker_user_id,lead_id,person_id,property_id,metadata'
      )
      .eq('channel', input.channel)
      .eq('lead_id', input.leadId)
      .in('status', ['open', 'pending'])
      .order('updated_at', { ascending: false })
      .limit(1)

    if (input.brokerUserId) query = query.eq('broker_user_id', input.brokerUserId)
    const byLead = await query.maybeSingle()
    if (byLead.data?.id) return byLead.data as ConversationRow
  }

  return null
}

export async function upsertInboundConversationMessage(
  input: InboundConversationMessageInput
): Promise<InboundConversationMessageResult> {
  const admin = createAdminClient()

  const channel = normalizeChannel(input.channel)
  const externalConversationId = compactText(input.externalConversationId, 120)
  const externalLeadId = compactText(input.externalLeadId, 120)
  const leadId = compactText(input.leadId, 60)
  const personId = compactText(input.personId, 60)
  const propertyId = compactText(input.propertyId, 60)
  const brokerUserId = compactText(input.brokerUserId, 60)
  const subject = compactText(input.subject, 180)
  const contentText = compactText(input.text, 4000)
  const mediaUrl = compactText(input.mediaUrl, 1200)
  const messageType = input.messageType || (mediaUrl ? 'document' : 'text')
  const providerMessageId = compactText(input.providerMessageId, 190)
  const senderName = compactText(input.senderName, 160)
  const senderExternalId = compactText(input.senderExternalId, 160)
  const occurredAtIso = asIsoDate(input.occurredAt)

  if (!contentText && !mediaUrl) {
    return {
      ok: true,
      conversationId: null,
      messageId: null,
      createdConversation: false,
      error: 'Mensagem vazia ignorada.',
    }
  }

  let conversation = await resolveConversation(admin, {
    channel,
    externalConversationId,
    externalLeadId,
    leadId,
    brokerUserId,
  })

  let createdConversation = false
  if (!conversation) {
    const conversationInsert = await admin
      .from('chat_conversations')
      .insert({
        channel,
        external_conversation_id: externalConversationId,
        external_lead_id: externalLeadId,
        broker_user_id: brokerUserId,
        lead_id: leadId,
        person_id: personId,
        property_id: propertyId,
        status: 'open',
        subject,
        last_message_at: occurredAtIso,
        last_message_preview: compactText(
          messagePreviewByType(messageType, contentText),
          220
        ),
        metadata: {
          ...(input.metadata || {}),
          source: channel,
          last_inbound_at: occurredAtIso,
        },
      })
      .select(
        'id,channel,status,subject,external_conversation_id,external_lead_id,broker_user_id,lead_id,person_id,property_id,metadata'
      )
      .single()

    if (conversationInsert.error || !conversationInsert.data?.id) {
      return {
        ok: false,
        conversationId: null,
        messageId: null,
        createdConversation: false,
        error: conversationInsert.error?.message || 'Falha ao criar conversa.',
      }
    }

    conversation = conversationInsert.data as ConversationRow
    createdConversation = true
  } else {
    const mergedMetadata = {
      ...(conversation.metadata || {}),
      ...(input.metadata || {}),
      last_inbound_at: occurredAtIso,
    }

    const patch: Record<string, unknown> = {
      last_message_at: occurredAtIso,
      last_message_preview: compactText(messagePreviewByType(messageType, contentText), 220),
      metadata: mergedMetadata,
    }

    if (!conversation.subject && subject) patch.subject = subject
    if (!conversation.external_conversation_id && externalConversationId) {
      patch.external_conversation_id = externalConversationId
    }
    if (!conversation.external_lead_id && externalLeadId) patch.external_lead_id = externalLeadId
    if (!conversation.lead_id && leadId) patch.lead_id = leadId
    if (!conversation.person_id && personId) patch.person_id = personId
    if (!conversation.property_id && propertyId) patch.property_id = propertyId
    if (!conversation.broker_user_id && brokerUserId) patch.broker_user_id = brokerUserId
    if (conversation.status === 'resolved' || conversation.status === 'archived') patch.status = 'open'

    const updateRes = await admin.from('chat_conversations').update(patch).eq('id', conversation.id)
    if (updateRes.error) {
      return {
        ok: false,
        conversationId: conversation.id,
        messageId: null,
        createdConversation,
        error: updateRes.error.message || 'Falha ao atualizar conversa.',
      }
    }
  }

  const messageInsert = await admin
    .from('chat_messages')
    .insert({
      conversation_id: conversation.id,
      direction: 'inbound',
      channel,
      message_type: messageType,
      content_text: contentText,
      media_url: mediaUrl,
      provider_message_id: providerMessageId,
      sender_name: senderName,
      sender_external_id: senderExternalId,
      status: 'received',
      payload: input.payload || {},
      occurred_at: occurredAtIso,
    })
    .select('id')
    .single()

  if (messageInsert.error) {
    if (isDuplicateError(messageInsert.error.code) && providerMessageId) {
      const existingMessage = await admin
        .from('chat_messages')
        .select('id')
        .eq('conversation_id', conversation.id)
        .eq('provider_message_id', providerMessageId)
        .limit(1)
        .maybeSingle()

      return {
        ok: true,
        conversationId: conversation.id,
        messageId: (existingMessage.data?.id as string | undefined) || null,
        createdConversation,
      }
    }

    return {
      ok: false,
      conversationId: conversation.id,
      messageId: null,
      createdConversation,
      error: messageInsert.error.message || 'Falha ao gravar mensagem inbound.',
    }
  }

  return {
    ok: true,
    conversationId: conversation.id,
    messageId: messageInsert.data?.id as string,
    createdConversation,
  }
}

export async function loadInboxConversations(params: {
  channel?: string | null
  status?: string | null
  q?: string | null
  limit?: number
}) {
  const supabase = await createClient()
  const limit = Math.max(1, Math.min(300, Number(params.limit || 120)))

  let query = supabase
    .from('chat_conversations')
    .select(
      `
      id,
      channel,
      status,
      subject,
      external_conversation_id,
      external_lead_id,
      broker_user_id,
      lead_id,
      person_id,
      property_id,
      last_message_at,
      last_message_preview,
      created_at,
      updated_at,
      leads:lead_id (id, title, client_name, phone_e164, email, status),
      people:person_id (id, full_name, email, phone_e164),
      properties:property_id (id, title, public_code),
      brokers:broker_user_id (id, full_name, public_name, email)
    `
    )
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .order('updated_at', { ascending: false })
    .limit(limit)

  const channel = normalizeChannel(params.channel || '')
  if (params.channel && channel !== 'other') {
    query = query.eq('channel', channel)
  }

  const status = String(params.status || '')
    .trim()
    .toLowerCase()
  if (CONVERSATION_STATUSES.has(status)) {
    query = query.eq('status', status)
  }

  const res = await query
  if (res.error) {
    return { data: [], error: res.error.message || 'Erro ao carregar conversas.' }
  }

  const rows = (res.data || []) as Array<Record<string, unknown>>
  const q = String(params.q || '')
    .trim()
    .toLowerCase()

  if (!q) return { data: rows, error: null }

  const filtered = rows.filter((row) => {
    const lead = row.leads as Record<string, unknown> | null
    const person = row.people as Record<string, unknown> | null
    const property = row.properties as Record<string, unknown> | null
    const broker = row.brokers as Record<string, unknown> | null

    const haystack = [
      row.subject,
      row.last_message_preview,
      row.external_conversation_id,
      row.external_lead_id,
      lead?.title,
      lead?.client_name,
      lead?.phone_e164,
      lead?.email,
      person?.full_name,
      person?.email,
      person?.phone_e164,
      property?.title,
      property?.public_code,
      broker?.full_name,
      broker?.public_name,
      broker?.email,
    ]
      .map((value) => String(value || '').toLowerCase())
      .join(' ')

    return haystack.includes(q)
  })

  return { data: filtered, error: null }
}

export async function loadConversationMessages(conversationId: string, limit = 200) {
  const supabase = await createClient()
  const normalizedLimit = Math.max(1, Math.min(400, limit))

  const res = await supabase
    .from('chat_messages')
    .select(
      'id, conversation_id, direction, channel, message_type, content_text, media_url, sender_name, sender_external_id, status, payload, occurred_at, created_at, created_by_profile_id'
    )
    .eq('conversation_id', conversationId)
    .order('occurred_at', { ascending: true })
    .limit(normalizedLimit)

  if (res.error) {
    return { data: [], error: res.error.message || 'Erro ao carregar mensagens.' }
  }

  return { data: (res.data || []) as Array<Record<string, unknown>>, error: null }
}

type OutboundConversationRow = {
  id: string
  channel: string | null
  external_conversation_id: string | null
  broker_user_id: string | null
  metadata: Record<string, unknown> | null
}

type WhatsappDispatchResult = {
  ok: boolean
  status: 'sent' | 'skipped' | 'failed'
  providerMessageId: string | null
  payload: Record<string, unknown>
  error: string | null
}

type OpenClawDispatchResult = {
  ok: boolean
  status: 'sent' | 'skipped' | 'failed'
  providerMessageId: string | null
  payload: Record<string, unknown>
  error: string | null
}

function normalizeDigits(value: string | null | undefined): string | null {
  const digits = String(value || '').replace(/\D/g, '')
  return digits || null
}

function normalizeWhatsappDestinationDigits(value: string | null | undefined): string | null {
  const digits = normalizeDigits(value)
  if (!digits) return null

  if (digits.startsWith('55') && digits.length >= 12) return digits
  if (digits.length === 10 || digits.length === 11) return `55${digits}`
  if (digits.length >= 12) return digits
  return null
}

function extractDigitsFromJid(value: string | null | undefined): string | null {
  const raw = String(value || '').trim()
  if (!raw) return null
  const withoutSuffix = raw.includes('@') ? raw.split('@')[0] : raw
  return normalizeDigits(withoutSuffix)
}

function parseConversationExternalId(value: string | null | undefined): {
  instanceName: string | null
  remoteRef: string | null
} {
  const externalId = compactText(value || '', 240)
  if (!externalId) {
    return { instanceName: null, remoteRef: null }
  }

  const idx = externalId.indexOf(':')
  if (idx > 0) {
    const left = compactText(externalId.slice(0, idx), 120)
    const right = compactText(externalId.slice(idx + 1), 160)
    return {
      instanceName: left,
      remoteRef: right,
    }
  }

  return {
    instanceName: null,
    remoteRef: externalId,
  }
}

function shouldUseOpenClawProvider(conversation: OutboundConversationRow): boolean {
  const metadata = asRecord(conversation.metadata)
  const provider = compactText(String(metadata.provider || ''), 40)
  const source = compactText(String(metadata.source || ''), 80)

  return (
    String(provider || '').trim().toLowerCase() === 'openclaw' ||
    String(source || '').trim().toLowerCase() === 'openclaw' ||
    String(source || '').trim().toLowerCase() === 'openclaw_webhook'
  )
}

function resolveOpenClawAccountId(conversation: OutboundConversationRow): string | null {
  const metadata = asRecord(conversation.metadata)

  const accountCandidates = [
    compactText(String(metadata.account_id || ''), 120),
    compactText(String(metadata.accountId || ''), 120),
    compactText(String(metadata.recipient_account_id || ''), 120),
    compactText(String(metadata.recipientAccountId || ''), 120),
    compactText(String(metadata.channel_account_id || ''), 120),
  ]

  const external = parseConversationExternalId(conversation.external_conversation_id)
  if (external.instanceName) {
    accountCandidates.push(compactText(external.instanceName, 120))
  }

  for (const raw of accountCandidates) {
    const normalized = normalizeOpenClawAccountId(String(raw || ''))
    if (!normalized) continue
    return normalized.startsWith('openclaw:') ? normalized.slice('openclaw:'.length) : normalized
  }

  return null
}

function resolveOpenClawRecipient(conversation: OutboundConversationRow): string | null {
  const metadata = asRecord(conversation.metadata)
  const external = parseConversationExternalId(conversation.external_conversation_id)

  const candidates = [
    compactText(String(metadata.sender_external_id || ''), 180),
    compactText(String(metadata.senderExternalId || ''), 180),
    compactText(String(metadata.remote_jid || ''), 180),
    compactText(String(metadata.phone_e164 || ''), 180),
    compactText(external.remoteRef || '', 180),
  ]

  for (const candidate of candidates) {
    if (!candidate) continue
    if (candidate.includes(':')) continue
    return candidate
  }

  return null
}

async function dispatchOpenClawMessage(input: {
  conversation: OutboundConversationRow
  channel: ChatChannel
  text: string
  payload: Record<string, unknown>
}): Promise<OpenClawDispatchResult> {
  if (!isOpenClawApiEnabled()) {
    return {
      ok: true,
      status: 'skipped',
      providerMessageId: null,
      payload: {
        ...(input.payload || {}),
        provider: 'local_only',
        reason: 'OPENCLAW_API_ENABLED desabilitado',
      },
      error: null,
    }
  }

  const accountId = resolveOpenClawAccountId(input.conversation)
  const toExternalId = resolveOpenClawRecipient(input.conversation)
  const externalConversationId = compactText(input.conversation.external_conversation_id, 180)

  if (!externalConversationId && !toExternalId) {
    return {
      ok: false,
      status: 'failed',
      providerMessageId: null,
      payload: {
        ...(input.payload || {}),
        provider: 'openclaw',
        reason: 'conversation_or_recipient_not_found',
      },
      error: 'Nao foi possivel identificar conversa ou destinatario da mensagem.',
    }
  }

  const sendRes = await sendOpenClawTextMessage({
    channel: input.channel,
    text: input.text,
    accountId,
    externalConversationId,
    toExternalId,
  })

  if (!sendRes.ok || !sendRes.data) {
    return {
      ok: false,
      status: 'failed',
      providerMessageId: null,
      payload: {
        ...(input.payload || {}),
        provider: 'openclaw',
        account_id: accountId,
        conversation_id: externalConversationId,
        to_external_id: toExternalId,
        response: sendRes.raw,
      },
      error: sendRes.error || 'Falha ao enviar mensagem pela OpenClaw.',
    }
  }

  return {
    ok: true,
    status: 'sent',
    providerMessageId: compactText(sendRes.data.providerMessageId, 190),
    payload: {
      ...(input.payload || {}),
      provider: 'openclaw',
      account_id: accountId,
      conversation_id: sendRes.data.externalConversationId || externalConversationId,
      to_external_id: toExternalId,
      response: sendRes.data.raw,
    },
    error: null,
  }
}

async function resolveWhatsappInstanceName(conversation: OutboundConversationRow): Promise<string | null> {
  const metadata = asRecord(conversation.metadata)
  const fromMetadata =
    compactText(String(metadata.instance_name || ''), 80) ||
    compactText(String(metadata.instanceName || ''), 80)

  const fromExternal = parseConversationExternalId(conversation.external_conversation_id).instanceName
  const normalizedMetadata = fromMetadata ? normalizeEvolutionInstanceName(fromMetadata) : null
  const normalizedExternal = fromExternal ? normalizeEvolutionInstanceName(fromExternal) : null
  if (normalizedMetadata) return normalizedMetadata
  if (normalizedExternal) return normalizedExternal

  const brokerUserId = compactText(conversation.broker_user_id, 80)
  const admin = createAdminClient()

  if (brokerUserId) {
    const byBroker = await admin
      .from('chat_channel_accounts')
      .select('provider_account_id')
      .eq('channel', 'whatsapp')
      .eq('broker_user_id', brokerUserId)
      .eq('is_active', true)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (byBroker.data?.provider_account_id) {
      return normalizeEvolutionInstanceName(String(byBroker.data.provider_account_id))
    }
  }

  const fallback = await admin
    .from('chat_channel_accounts')
    .select('provider_account_id')
    .eq('channel', 'whatsapp')
    .is('broker_user_id', null)
    .eq('is_active', true)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (fallback.data?.provider_account_id) {
    return normalizeEvolutionInstanceName(String(fallback.data.provider_account_id))
  }

  return null
}

function resolveWhatsappRecipientNumber(conversation: OutboundConversationRow): string | null {
  const metadata = asRecord(conversation.metadata)
  const external = parseConversationExternalId(conversation.external_conversation_id)

  const phoneCandidates = [
    normalizeWhatsappDestinationDigits(compactText(String(metadata.phone_e164 || ''), 40)),
    normalizeWhatsappDestinationDigits(extractDigitsFromJid(compactText(String(metadata.remote_jid || ''), 120))),
    normalizeWhatsappDestinationDigits(extractDigitsFromJid(external.remoteRef)),
    normalizeWhatsappDestinationDigits(compactText(external.remoteRef || '', 120)),
    normalizeWhatsappDestinationDigits(compactText(conversation.external_conversation_id || '', 120)),
  ]

  for (const candidate of phoneCandidates) {
    if (candidate) return candidate
  }

  return null
}

async function dispatchWhatsappEvolutionMessage(input: {
  conversation: OutboundConversationRow
  text: string
  payload: Record<string, unknown>
}): Promise<WhatsappDispatchResult> {
  if (!isEvolutionApiEnabled()) {
    return {
      ok: true,
      status: 'skipped',
      providerMessageId: null,
      payload: {
        ...(input.payload || {}),
        provider: 'local_only',
        reason: 'EVOLUTION_API_ENABLED desabilitado',
      },
      error: null,
    }
  }

  const instanceName = await resolveWhatsappInstanceName(input.conversation)
  if (!instanceName) {
    return {
      ok: false,
      status: 'failed',
      providerMessageId: null,
      payload: {
        ...(input.payload || {}),
        provider: 'evolution',
        reason: 'instance_not_found',
      },
      error: 'Nao foi possivel resolver a instancia Evolution para esta conversa.',
    }
  }

  const toNumber = resolveWhatsappRecipientNumber(input.conversation)
  if (!toNumber) {
    return {
      ok: false,
      status: 'failed',
      providerMessageId: null,
      payload: {
        ...(input.payload || {}),
        provider: 'evolution',
        instance_name: instanceName,
        reason: 'recipient_not_found',
      },
      error: 'Nao foi possivel identificar o numero destino desta conversa.',
    }
  }

  const sendRes = await sendEvolutionTextMessage({
    instanceName,
    toNumber,
    text: input.text,
  })

  if (!sendRes.ok || !sendRes.data) {
    return {
      ok: false,
      status: 'failed',
      providerMessageId: null,
      payload: {
        ...(input.payload || {}),
        provider: 'evolution',
        instance_name: instanceName,
        to_number: toNumber,
        response: sendRes.raw,
      },
      error: sendRes.error || 'Falha ao enviar mensagem pela Evolution.',
    }
  }

  return {
    ok: true,
    status: 'sent',
    providerMessageId: compactText(sendRes.data.providerMessageId, 190),
    payload: {
      ...(input.payload || {}),
      provider: 'evolution',
      instance_name: instanceName,
      to_number: toNumber,
      remote_jid: sendRes.data.remoteJid,
      response: sendRes.data.raw,
    },
    error: null,
  }
}

export async function appendOutboundMessage(params: {
  conversationId: string
  actorProfileId: string
  contentText: string
  messageType?: ChatMessageType
  mediaUrl?: string | null
  payload?: Record<string, unknown> | null
}) {
  const supabase = await createClient()

  const conversationRes = await supabase
    .from('chat_conversations')
    .select('id, channel, external_conversation_id, broker_user_id, metadata')
    .eq('id', params.conversationId)
    .limit(1)
    .maybeSingle()

  if (conversationRes.error || !conversationRes.data?.id) {
    return { ok: false as const, error: conversationRes.error?.message || 'Conversa nao encontrada.' }
  }

  const text = compactText(params.contentText, 4000)
  const mediaUrl = compactText(params.mediaUrl, 1200)
  if (!text && !mediaUrl) {
    return { ok: false as const, error: 'Mensagem vazia.' }
  }

  const conversation = conversationRes.data as OutboundConversationRow
  const channel = normalizeChannel(conversation.channel || '')
  const messageType: ChatMessageType = params.messageType || (mediaUrl ? 'document' : 'text')
  const occurredAt = new Date().toISOString()
  let status: 'sent' | 'failed' | 'queued' = 'sent'
  let providerMessageId: string | null = null
  let payload: Record<string, unknown> = params.payload || {}
  let dispatchError: string | null = null

  if (text && shouldUseOpenClawProvider(conversation)) {
    const dispatch = await dispatchOpenClawMessage({
      conversation,
      channel,
      text,
      payload,
    })
    status = dispatch.status === 'failed' ? 'failed' : dispatch.status === 'skipped' ? 'sent' : 'sent'
    providerMessageId = dispatch.providerMessageId
    payload = dispatch.payload
    dispatchError = dispatch.error
  } else if (channel === 'whatsapp' && text) {
    const dispatch = await dispatchWhatsappEvolutionMessage({
      conversation,
      text,
      payload,
    })
    status = dispatch.status === 'failed' ? 'failed' : dispatch.status === 'skipped' ? 'sent' : 'sent'
    providerMessageId = dispatch.providerMessageId
    payload = dispatch.payload
    dispatchError = dispatch.error
  }

  if (shouldUseOpenClawProvider(conversation) && !text && mediaUrl) {
    status = 'failed'
    dispatchError = 'Envio de midia via OpenClaw ainda nao foi habilitado neste fluxo.'
    payload = {
      ...(payload || {}),
      provider: 'openclaw',
      reason: 'media_not_supported',
    }
  } else if (channel === 'whatsapp' && !text && mediaUrl) {
    status = 'failed'
    dispatchError = 'Envio de midia via Evolution ainda nao foi habilitado neste fluxo.'
    payload = {
      ...(payload || {}),
      provider: 'evolution',
      reason: 'media_not_supported',
    }
  }

  const insertRes = await supabase
    .from('chat_messages')
    .insert({
      conversation_id: params.conversationId,
      direction: 'outbound',
      channel,
      message_type: messageType,
      content_text: text,
      media_url: mediaUrl,
      provider_message_id: providerMessageId,
      status,
      payload,
      occurred_at: occurredAt,
      created_by_profile_id: params.actorProfileId,
    })
    .select('id')
    .single()

  if (insertRes.error) {
    return { ok: false as const, error: insertRes.error.message || 'Falha ao enviar mensagem.' }
  }

  const preview = compactText(messagePreviewByType(messageType, text), 220)
  const updateRes = await supabase
    .from('chat_conversations')
    .update({
      last_message_at: occurredAt,
      last_message_preview: preview,
    })
    .eq('id', params.conversationId)

  if (updateRes.error) {
    return { ok: false as const, error: updateRes.error.message || 'Mensagem enviada, mas falha ao atualizar conversa.' }
  }

  if (status === 'failed') {
    return {
      ok: false as const,
      error: dispatchError || 'Mensagem registrada, mas falha no envio pelo provedor.',
    }
  }

  return {
    ok: true as const,
    messageId: insertRes.data?.id as string,
  }
}
