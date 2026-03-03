import { createAdminClient } from '@/lib/supabase/admin'
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
    .select('id, channel')
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

  const messageType: ChatMessageType = params.messageType || (mediaUrl ? 'document' : 'text')
  const occurredAt = new Date().toISOString()

  const insertRes = await supabase
    .from('chat_messages')
    .insert({
      conversation_id: params.conversationId,
      direction: 'outbound',
      channel: normalizeChannel(conversationRes.data.channel as string),
      message_type: messageType,
      content_text: text,
      media_url: mediaUrl,
      status: 'sent',
      payload: params.payload || {},
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

  return {
    ok: true as const,
    messageId: insertRes.data?.id as string,
  }
}
