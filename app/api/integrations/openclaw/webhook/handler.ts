import { createHmac, timingSafeEqual } from 'node:crypto'

import { NextRequest, NextResponse } from 'next/server'

import { upsertInboundConversationMessage, type ChatChannel, type ChatMessageType } from '@/lib/chat/inbox'
import { normalizeOpenClawAccountId } from '@/lib/integrations/openclaw/client'
import { normalizeBrazilianPhone } from '@/lib/phone'
import { createAdminClient } from '@/lib/supabase/admin'

type PayloadRecord = Record<string, unknown>

type ParsedInboundMessage = {
  channel: ChatChannel
  accountId: string | null
  senderExternalId: string | null
  senderName: string | null
  externalConversationId: string | null
  providerMessageId: string | null
  messageType: ChatMessageType
  text: string | null
  mediaUrl: string | null
  occurredAt: string
  payload: PayloadRecord
}

type LeadContext = {
  leadId: string | null
  personId: string | null
  propertyId: string | null
  brokerUserId: string | null
  subject: string | null
}

function asRecord(value: unknown): PayloadRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return value as PayloadRecord
}

function compactText(value: unknown, limit = 4000): string | null {
  const raw = typeof value === 'string' ? value : typeof value === 'number' ? String(value) : ''
  const normalized = raw.replace(/\s+/g, ' ').trim()
  if (!normalized) return null
  return normalized.slice(0, limit)
}

function boolFromEnv(name: string): boolean {
  const normalized = String(process.env[name] || '')
    .trim()
    .toLowerCase()
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on'
}

function isWebhookEnabled(): boolean {
  const hasFlag = String(process.env.OPENCLAW_WEBHOOK_ENABLED || '').trim().length > 0
  if (!hasFlag) return true
  return boolFromEnv('OPENCLAW_WEBHOOK_ENABLED')
}

function safeTokenEquals(expected: string, received: string): boolean {
  const expectedBuffer = Buffer.from(expected)
  const receivedBuffer = Buffer.from(received)
  if (expectedBuffer.length !== receivedBuffer.length) return false
  return timingSafeEqual(expectedBuffer, receivedBuffer)
}

function hasValidOptionalToken(request: NextRequest): boolean {
  const expected = String(process.env.OPENCLAW_WEBHOOK_TOKEN || '').trim()
  if (!expected) return true

  const candidates = [
    request.headers.get('x-webhook-token'),
    request.headers.get('apikey'),
    request.headers.get('x-api-key'),
    request.nextUrl.searchParams.get('token'),
  ]

  const auth = String(request.headers.get('authorization') || '').trim()
  if (auth.toLowerCase().startsWith('bearer ')) {
    candidates.push(auth.slice(7).trim())
  }

  for (const raw of candidates) {
    const token = String(raw || '').trim()
    if (token && safeTokenEquals(expected, token)) return true
  }

  return false
}

function parseSignatureHeader(value: string): string | null {
  const compacted = value.trim()
  if (!compacted) return null
  const withoutPrefix = compacted.toLowerCase().startsWith('sha256=')
    ? compacted.slice(7)
    : compacted
  const normalized = withoutPrefix.trim().toLowerCase()
  if (!/^[0-9a-f]{64}$/.test(normalized)) return null
  return normalized
}

function hasValidOptionalSignature(request: NextRequest, rawBody: string): boolean {
  const secret = String(process.env.OPENCLAW_WEBHOOK_SECRET || '').trim()
  if (!secret) return true

  const rawHeader =
    String(request.headers.get('x-openclaw-signature') || '') ||
    String(request.headers.get('x-webhook-signature') || '') ||
    String(request.headers.get('x-signature') || '') ||
    String(request.headers.get('x-hub-signature-256') || '')

  const receivedHex = parseSignatureHeader(rawHeader)
  if (!receivedHex) return false

  const digestHex = createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex')
  return safeTokenEquals(digestHex, receivedHex)
}

function normalizeChannel(value: string | null | undefined): ChatChannel {
  const normalized = String(value || '').trim().toLowerCase()
  if (normalized === 'whatsapp') return 'whatsapp'
  if (normalized === 'instagram') return 'instagram'
  if (normalized === 'facebook') return 'facebook'
  if (normalized === 'olx') return 'olx'
  if (normalized === 'grupoolx') return 'grupoolx'
  if (normalized === 'meta') return 'meta'
  return 'other'
}

function parseOccurredAt(value: unknown): string {
  if (typeof value === 'number' && Number.isFinite(value)) {
    if (value > 1000000000000) return new Date(value).toISOString()
    if (value > 1000000000) return new Date(value * 1000).toISOString()
  }

  if (typeof value === 'string') {
    const numeric = Number(value)
    if (Number.isFinite(numeric)) return parseOccurredAt(numeric)
    const parsed = new Date(value)
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString()
  }

  return new Date().toISOString()
}

function mapMessageType(value: string | null | undefined): ChatMessageType {
  const normalized = String(value || '').trim().toLowerCase()
  if (normalized === 'text') return 'text'
  if (normalized === 'image') return 'image'
  if (normalized === 'audio') return 'audio'
  if (normalized === 'video') return 'video'
  if (normalized === 'document' || normalized === 'file') return 'document'
  if (normalized === 'template') return 'template'
  return 'event'
}

function messageTypeFromNode(node: PayloadRecord): ChatMessageType | null {
  const messageType =
    compactText(node.message_type, 40) ||
    compactText(node.type, 40) ||
    compactText(asRecord(node.message).type, 40) ||
    compactText(asRecord(asRecord(node.payload).message).type, 40)

  return messageType ? mapMessageType(messageType) : null
}

function isOutboundNode(node: PayloadRecord): boolean {
  const directDirection = compactText(node.direction, 40)
  if (directDirection) {
    const normalized = directDirection.toLowerCase()
    if (normalized === 'outbound' || normalized === 'out' || normalized === 'sent') return true
  }

  if (node.from_me === true || node.fromMe === true) return true
  if (asRecord(node.message).from_me === true || asRecord(node.message).fromMe === true) return true

  return false
}

function extractAccountId(root: PayloadRecord, node: PayloadRecord): string | null {
  const raw =
    compactText(node.account_id, 120) ||
    compactText(node.accountId, 120) ||
    compactText(node.channel_account_id, 120) ||
    compactText(node.channelAccountId, 120) ||
    compactText(node.inbox_id, 120) ||
    compactText(node.inboxId, 120) ||
    compactText(node.phone_number_id, 120) ||
    compactText(asRecord(node.account).id, 120) ||
    compactText(asRecord(root.account).id, 120) ||
    compactText(root.account_id, 120) ||
    compactText(root.accountId, 120)

  return raw ? normalizeOpenClawAccountId(raw) : null
}

function extractSenderExternalId(node: PayloadRecord): string | null {
  return (
    compactText(node.from, 180) ||
    compactText(node.sender_id, 180) ||
    compactText(node.senderId, 180) ||
    compactText(node.contact_id, 180) ||
    compactText(node.contactId, 180) ||
    compactText(node.customer_id, 180) ||
    compactText(node.customerId, 180) ||
    compactText(asRecord(node.sender).id, 180) ||
    compactText(asRecord(node.contact).id, 180) ||
    compactText(asRecord(node.customer).id, 180)
  )
}

function extractSenderName(node: PayloadRecord): string | null {
  return (
    compactText(node.sender_name, 180) ||
    compactText(node.senderName, 180) ||
    compactText(node.contact_name, 180) ||
    compactText(node.customer_name, 180) ||
    compactText(asRecord(node.sender).name, 180) ||
    compactText(asRecord(node.contact).name, 180) ||
    compactText(asRecord(node.customer).name, 180)
  )
}

function extractExternalConversationId(node: PayloadRecord, accountId: string | null, senderExternalId: string | null): string | null {
  const direct =
    compactText(node.conversation_id, 180) ||
    compactText(node.conversationId, 180) ||
    compactText(node.chat_id, 180) ||
    compactText(node.chatId, 180) ||
    compactText(node.thread_id, 180) ||
    compactText(node.threadId, 180) ||
    compactText(node.external_conversation_id, 180) ||
    compactText(node.externalConversationId, 180) ||
    compactText(asRecord(node.conversation).id, 180)

  if (direct) return direct
  if (accountId && senderExternalId) return compactText(`${accountId}:${senderExternalId}`, 180)
  return compactText(senderExternalId, 180)
}

function extractProviderMessageId(node: PayloadRecord): string | null {
  return (
    compactText(node.message_id, 190) ||
    compactText(node.messageId, 190) ||
    compactText(node.id, 190) ||
    compactText(asRecord(node.message).id, 190)
  )
}

function extractMessageText(node: PayloadRecord): string | null {
  const message = asRecord(node.message)
  const payload = asRecord(node.payload)

  return (
    compactText(node.text, 4000) ||
    compactText(node.body, 4000) ||
    compactText(node.content, 4000) ||
    compactText(message.text, 4000) ||
    compactText(asRecord(message.text).body, 4000) ||
    compactText(message.body, 4000) ||
    compactText(payload.text, 4000) ||
    compactText(asRecord(payload.message).text, 4000)
  )
}

function extractMessageMedia(node: PayloadRecord): { mediaUrl: string | null; mediaType: ChatMessageType | null } {
  const message = asRecord(node.message)
  const attachment = asRecord(node.attachment)
  const media = asRecord(node.media)

  const mediaUrl =
    compactText(media.url, 1200) ||
    compactText(attachment.url, 1200) ||
    compactText(asRecord(message.media).url, 1200) ||
    compactText(asRecord(message.attachment).url, 1200) ||
    compactText(media.id, 320) ||
    compactText(attachment.id, 320) ||
    compactText(asRecord(message.media).id, 320) ||
    compactText(asRecord(message.attachment).id, 320)

  if (!mediaUrl) return { mediaUrl: null, mediaType: null }

  const typeRaw =
    compactText(media.type, 40) ||
    compactText(attachment.type, 40) ||
    compactText(node.media_type, 40) ||
    compactText(node.type, 40) ||
    compactText(asRecord(message.media).type, 40) ||
    compactText(asRecord(message.attachment).type, 40)

  const normalizedUrl = mediaUrl.startsWith('http') ? mediaUrl : `openclaw-media:${mediaUrl}`
  const mediaType = mapMessageType(typeRaw || 'document')

  return { mediaUrl: normalizedUrl, mediaType }
}

function toInboundNodes(root: PayloadRecord): PayloadRecord[] {
  const nodes: PayloadRecord[] = []

  const pushObject = (value: unknown) => {
    const asObj = asRecord(value)
    if (Object.keys(asObj).length > 0) nodes.push(asObj)
  }
  const pushArray = (value: unknown) => {
    if (!Array.isArray(value)) return
    for (const item of value) pushObject(item)
  }

  pushArray(root.messages)
  pushArray(root.events)
  pushArray(root.items)
  pushArray(root.records)
  pushObject(root.message)

  const data = asRecord(root.data)
  pushArray(data.messages)
  pushArray(data.events)
  pushArray(data.items)
  pushArray(data.records)
  pushObject(data.message)
  pushObject(data.payload)

  if (Array.isArray(root.data)) {
    pushArray(root.data)
  }

  if (nodes.length === 0) {
    pushObject(root)
  }

  return nodes
}

function parseInboundMessages(root: PayloadRecord, routeEvent: string | null): ParsedInboundMessage[] {
  const nodes = toInboundNodes(root)
  const parsed: ParsedInboundMessage[] = []
  const rootChannel = compactText(root.channel, 40) || compactText(asRecord(root.data).channel, 40)
  const rootEvent = compactText(root.event, 80)

  for (const node of nodes) {
    if (isOutboundNode(node)) continue

    const channelRaw =
      compactText(node.channel, 40) ||
      compactText(asRecord(node.account).channel, 40) ||
      compactText(asRecord(node.message).channel, 40) ||
      rootChannel
    const channel = normalizeChannel(channelRaw)

    const accountId = extractAccountId(root, node)
    const senderExternalId = extractSenderExternalId(node)
    const senderName = extractSenderName(node)
    const externalConversationId = extractExternalConversationId(node, accountId, senderExternalId)
    const providerMessageId = extractProviderMessageId(node)
    const text = extractMessageText(node)
    const media = extractMessageMedia(node)
    const explicitType = messageTypeFromNode(node)
    const messageType = explicitType || media.mediaType || (text ? 'text' : 'event')
    const occurredAt = parseOccurredAt(
      node.timestamp ||
      node.occurred_at ||
      node.created_at ||
      asRecord(node.message).timestamp ||
      asRecord(node.message).created_at
    )

    if (!senderExternalId && !externalConversationId && !providerMessageId) continue

    parsed.push({
      channel,
      accountId,
      senderExternalId,
      senderName,
      externalConversationId,
      providerMessageId,
      messageType,
      text,
      mediaUrl: media.mediaUrl,
      occurredAt,
      payload: {
        source: 'openclaw_webhook',
        route_event: routeEvent,
        root_event: rootEvent,
        item: node,
      },
    })
  }

  return parsed
}

async function resolveContextByPhone(admin: ReturnType<typeof createAdminClient>, phoneE164: string | null): Promise<LeadContext> {
  if (!phoneE164) {
    return {
      leadId: null,
      personId: null,
      propertyId: null,
      brokerUserId: null,
      subject: null,
    }
  }

  const leadRes = await admin
    .from('leads')
    .select('id, person_id, property_id, owner_user_id, assigned_to, created_by, title, client_name')
    .eq('phone_e164', phoneE164)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const lead = (leadRes.data || null) as
    | {
        id: string
        person_id: string | null
        property_id: string | null
        owner_user_id: string | null
        assigned_to: string | null
        created_by: string | null
        title: string | null
        client_name: string | null
      }
    | null

  if (lead?.id) {
    return {
      leadId: lead.id,
      personId: lead.person_id || null,
      propertyId: lead.property_id || null,
      brokerUserId: lead.owner_user_id || lead.assigned_to || lead.created_by || null,
      subject: compactText(lead.title || lead.client_name, 180),
    }
  }

  const personRes = await admin
    .from('people')
    .select('id, full_name')
    .eq('phone_e164', phoneE164)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const person = (personRes.data || null) as { id: string; full_name: string | null } | null
  if (person?.id) {
    return {
      leadId: null,
      personId: person.id,
      propertyId: null,
      brokerUserId: null,
      subject: compactText(person.full_name, 180),
    }
  }

  return {
    leadId: null,
    personId: null,
    propertyId: null,
    brokerUserId: null,
    subject: null,
  }
}

async function resolveBrokerByChannelAccount(
  admin: ReturnType<typeof createAdminClient>,
  channel: ChatChannel,
  accountId: string | null,
  cache: Map<string, string | null>
): Promise<string | null> {
  if (!accountId) return null

  const cacheKey = `${channel}:${accountId}`
  if (cache.has(cacheKey)) {
    return cache.get(cacheKey) || null
  }

  const normalizedAccount = normalizeOpenClawAccountId(accountId)
  if (!normalizedAccount) {
    cache.set(cacheKey, null)
    return null
  }

  const candidates = Array.from(new Set([normalizedAccount, `openclaw:${normalizedAccount}`]))
  const mappingRes = await admin
    .from('chat_channel_accounts')
    .select('broker_user_id')
    .eq('channel', channel)
    .in('provider_account_id', candidates)
    .eq('is_active', true)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const brokerUserId = compactText(mappingRes.data?.broker_user_id, 80)
  cache.set(cacheKey, brokerUserId)
  return brokerUserId
}

export async function handleOpenClawWebhook(
  request: NextRequest,
  routeEvent: string | null = null
) {
  if (!isWebhookEnabled()) {
    return NextResponse.json({ ok: false, error: 'OPENCLAW_WEBHOOK_ENABLED desabilitado.' }, { status: 503 })
  }

  if (!hasValidOptionalToken(request)) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  const rawBody = await request.text()
  if (!hasValidOptionalSignature(request, rawBody)) {
    return NextResponse.json({ ok: false, error: 'Invalid signature.' }, { status: 401 })
  }

  const payload = (() => {
    try {
      return JSON.parse(rawBody || '{}') as unknown
    } catch {
      return null
    }
  })()

  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return NextResponse.json({ ok: false, error: 'Payload JSON invalido.' }, { status: 400 })
  }

  const root = asRecord(payload)
  const parsedMessages = parseInboundMessages(root, routeEvent)
  const admin = createAdminClient()
  const brokerCache = new Map<string, string | null>()

  let processed = 0
  let skipped = 0
  const errors: string[] = []

  for (const item of parsedMessages) {
    const senderDigits = String(item.senderExternalId || '').replace(/\D/g, '')
    const phoneNormalization =
      item.channel === 'whatsapp' && senderDigits
        ? normalizeBrazilianPhone(senderDigits)
        : { isValid: false, e164: null }
    const phoneE164 = phoneNormalization.isValid ? phoneNormalization.e164 : null
    const context = await resolveContextByPhone(admin, phoneE164)
    const mappedBroker = await resolveBrokerByChannelAccount(
      admin,
      item.channel,
      item.accountId,
      brokerCache
    )

    const upsertResult = await upsertInboundConversationMessage({
      channel: item.channel,
      externalConversationId: item.externalConversationId,
      externalLeadId: context.leadId,
      leadId: context.leadId,
      personId: context.personId,
      propertyId: context.propertyId,
      brokerUserId: mappedBroker || context.brokerUserId,
      subject: context.subject || item.senderName || item.senderExternalId || item.externalConversationId,
      text: item.text || `Mensagem inbound OpenClaw (${item.messageType}).`,
      mediaUrl: item.mediaUrl,
      messageType: item.messageType,
      providerMessageId: item.providerMessageId,
      senderName: item.senderName || phoneE164 || item.senderExternalId,
      senderExternalId: item.senderExternalId,
      occurredAt: item.occurredAt,
      payload: item.payload,
      metadata: {
        source: 'openclaw_webhook',
        account_id: item.accountId,
        phone_e164: phoneE164,
      },
    })

    if (upsertResult.ok) {
      processed += 1
    } else {
      skipped += 1
      errors.push(upsertResult.error || 'Falha ao registrar mensagem inbound.')
    }
  }

  return NextResponse.json({
    ok: true,
    processed,
    skipped,
    errors: errors.slice(0, 20),
  })
}
