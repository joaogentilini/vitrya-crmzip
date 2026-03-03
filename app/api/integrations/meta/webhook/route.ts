import { createHmac, timingSafeEqual } from 'node:crypto'

import { NextRequest, NextResponse } from 'next/server'

import { upsertInboundConversationMessage } from '@/lib/chat/inbox'
import type { ChatMessageType } from '@/lib/chat/inbox'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'

type PayloadRecord = Record<string, unknown>
type MetaChannel = 'instagram' | 'facebook'

type ParsedInboundMessage = {
  channel: MetaChannel
  recipientAccountId: string | null
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
  const hasFlag = String(process.env.META_WEBHOOK_ENABLED || '').trim().length > 0
  if (!hasFlag) return true
  return boolFromEnv('META_WEBHOOK_ENABLED')
}

function hasValidOptionalToken(request: NextRequest): boolean {
  const expected = String(process.env.META_WEBHOOK_TOKEN || '').trim()
  if (!expected) return true

  const fromHeader = String(request.headers.get('x-webhook-token') || '').trim()
  if (fromHeader && safeTokenEquals(expected, fromHeader)) return true

  const auth = String(request.headers.get('authorization') || '').trim()
  if (auth.toLowerCase().startsWith('bearer ')) {
    const token = auth.slice(7).trim()
    if (token && safeTokenEquals(expected, token)) return true
  }

  return false
}

function safeTokenEquals(expected: string, received: string): boolean {
  const expectedBuffer = Buffer.from(expected)
  const receivedBuffer = Buffer.from(received)
  if (expectedBuffer.length !== receivedBuffer.length) return false
  return timingSafeEqual(expectedBuffer, receivedBuffer)
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

function hasValidMetaSignature(request: NextRequest, rawBody: string): boolean {
  const appSecret = String(process.env.META_APP_SECRET || '').trim()
  if (!appSecret) return true

  const fromHeader = String(request.headers.get('x-hub-signature-256') || '')
  const receivedHex = parseSignatureHeader(fromHeader)
  if (!receivedHex) return false

  const digestHex = createHmac('sha256', appSecret).update(rawBody, 'utf8').digest('hex')
  return safeTokenEquals(digestHex, receivedHex)
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

function parseOccurredAt(value: unknown): string {
  if (typeof value === 'number' && Number.isFinite(value)) {
    if (value > 1000000000000) return new Date(value).toISOString()
    if (value > 1000000000) return new Date(value * 1000).toISOString()
  }

  if (typeof value === 'string') {
    const numeric = Number(value)
    if (Number.isFinite(numeric)) {
      return parseOccurredAt(numeric)
    }

    const parsed = new Date(value)
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString()
  }

  return new Date().toISOString()
}

function extractMessageText(message: PayloadRecord): string | null {
  const direct = compactText(message.text)
  if (direct) return direct

  const textBody = compactText(asRecord(message.text).body)
  if (textBody) return textBody

  const caption = compactText(message.caption)
  if (caption) return caption

  return null
}

function mapAttachmentType(type: string | null): ChatMessageType {
  const normalized = String(type || '').trim().toLowerCase()
  if (normalized === 'image') return 'image'
  if (normalized === 'audio') return 'audio'
  if (normalized === 'video') return 'video'
  if (normalized === 'file') return 'document'
  return 'document'
}

function extractMessageMedia(message: PayloadRecord): { messageType: ChatMessageType | null; mediaUrl: string | null } {
  const attachmentsRaw = message.attachments
  const attachments = Array.isArray(attachmentsRaw) ? attachmentsRaw : []

  for (const itemRaw of attachments) {
    const item = asRecord(itemRaw)
    const payload = asRecord(item.payload)
    const mediaUrl =
      compactText(payload.url, 1200) ||
      compactText(payload.src, 1200) ||
      compactText(item.url, 1200) ||
      compactText(payload.attachment_id, 250)
    const messageType = mapAttachmentType(compactText(item.type, 40))

    if (mediaUrl) {
      const normalizedMediaUrl = mediaUrl.startsWith('http') ? mediaUrl : `meta-media:${mediaUrl}`
      return { messageType, mediaUrl: normalizedMediaUrl }
    }
  }

  return { messageType: null, mediaUrl: null }
}

function extractChannel(objectValue: unknown): MetaChannel {
  const normalized = String(objectValue || '').trim().toLowerCase()
  return normalized === 'instagram' ? 'instagram' : 'facebook'
}

function buildExternalConversationId(recipientAccountId: string | null, senderExternalId: string | null): string | null {
  if (recipientAccountId && senderExternalId) {
    return compactText(`${recipientAccountId}:${senderExternalId}`, 120)
  }
  return compactText(senderExternalId || recipientAccountId, 120)
}

function parseMessagingEvent(params: {
  channel: MetaChannel
  event: PayloadRecord
  entryId: string | null
  objectValue: string | null
  field: string | null
}): ParsedInboundMessage | null {
  const event = params.event
  const sender = asRecord(event.sender)
  const recipient = asRecord(event.recipient)
  const message = asRecord(event.message)

  if (!message || Object.keys(message).length === 0) return null
  if (message.is_echo === true) return null

  const senderExternalId = compactText(sender.id, 160) || compactText(event.from, 160)
  const recipientAccountId =
    compactText(recipient.id, 160) ||
    compactText(event.to, 160) ||
    compactText(params.entryId, 160)

  if (!senderExternalId && !recipientAccountId) return null

  const text = extractMessageText(message)
  const media = extractMessageMedia(message)
  const messageType = media.messageType || (text ? 'text' : 'event')
  const providerMessageId =
    compactText(message.mid, 190) ||
    compactText(message.id, 190) ||
    compactText(event.mid, 190) ||
    compactText(event.id, 190)
  const senderName =
    compactText(sender.name, 160) ||
    compactText(asRecord(event.from).name, 160)
  const occurredAt = parseOccurredAt(event.timestamp || event.time)
  const externalConversationId = buildExternalConversationId(recipientAccountId, senderExternalId)

  const payload: PayloadRecord = {
    source: 'meta_graph_webhook',
    object: compactText(params.objectValue, 80),
    field: compactText(params.field, 80),
    entry_id: params.entryId,
    event,
  }

  return {
    channel: params.channel,
    recipientAccountId,
    senderExternalId,
    senderName,
    externalConversationId,
    providerMessageId,
    messageType,
    text,
    mediaUrl: media.mediaUrl,
    occurredAt,
    payload,
  }
}

function extractInboundMessages(root: PayloadRecord): ParsedInboundMessage[] {
  const objectValue = compactText(root.object, 80)
  const defaultChannel = extractChannel(objectValue)
  const entries = Array.isArray(root.entry) ? root.entry : []
  const parsed: ParsedInboundMessage[] = []

  for (const entryRaw of entries) {
    const entry = asRecord(entryRaw)
    const entryId = compactText(entry.id, 160)

    const entryMessaging = Array.isArray(entry.messaging) ? entry.messaging : []
    for (const eventRaw of entryMessaging) {
      const event = asRecord(eventRaw)
      const parsedMessage = parseMessagingEvent({
        channel: defaultChannel,
        event,
        entryId,
        objectValue,
        field: null,
      })
      if (parsedMessage) parsed.push(parsedMessage)
    }

    const changes = Array.isArray(entry.changes) ? entry.changes : []
    for (const changeRaw of changes) {
      const change = asRecord(changeRaw)
      const field = compactText(change.field, 80)
      const value = asRecord(change.value)

      const valueMessagingProduct = String(value.messaging_product || '').trim().toLowerCase()
      const changeChannel: MetaChannel =
        valueMessagingProduct === 'instagram' ? 'instagram' : valueMessagingProduct === 'facebook' ? 'facebook' : defaultChannel

      const valueMessaging = Array.isArray(value.messaging) ? value.messaging : []
      for (const eventRaw of valueMessaging) {
        const event = asRecord(eventRaw)
        const parsedMessage = parseMessagingEvent({
          channel: changeChannel,
          event,
          entryId,
          objectValue,
          field,
        })
        if (parsedMessage) parsed.push(parsedMessage)
      }

      if (Object.keys(asRecord(value.message)).length > 0 && (value.sender || value.from)) {
        const parsedMessage = parseMessagingEvent({
          channel: changeChannel,
          event: value,
          entryId,
          objectValue,
          field,
        })
        if (parsedMessage) parsed.push(parsedMessage)
      }

      const valueMessages = Array.isArray(value.messages) ? value.messages : []
      if (valueMessages.length > 0) {
        const from = asRecord(value.from)
        const to = asRecord(value.to)
        const fromId = compactText(from.id, 160)
        const fromName = compactText(from.name, 160)
        const toId = compactText(to.id, 160) || entryId

        for (const itemRaw of valueMessages) {
          const item = asRecord(itemRaw)
          const senderId = compactText(item.from, 160) || fromId
          const recipientId = compactText(item.to, 160) || toId
          const syntheticEvent: PayloadRecord = {
            sender: {
              id: senderId,
              name: fromName,
            },
            recipient: {
              id: recipientId,
            },
            message: {
              id: compactText(item.id, 190) || compactText(item.mid, 190),
              mid: compactText(item.mid, 190) || compactText(item.id, 190),
              text: item.text,
              attachments: item.attachments,
              type: item.type,
            },
            timestamp: item.timestamp || value.timestamp || entry.time,
          }

          const parsedMessage = parseMessagingEvent({
            channel: changeChannel,
            event: syntheticEvent,
            entryId,
            objectValue,
            field,
          })
          if (parsedMessage) parsed.push(parsedMessage)
        }
      }
    }
  }

  return parsed
}

async function resolveBrokerByChannelAccount(
  channel: MetaChannel,
  recipientAccountId: string | null,
  cache: Map<string, string | null>
): Promise<string | null> {
  if (!recipientAccountId) return null
  const cacheKey = `${channel}:${recipientAccountId}`
  if (cache.has(cacheKey)) {
    return cache.get(cacheKey) || null
  }

  const admin = createAdminClient()
  const mappingRes = await admin
    .from('chat_channel_accounts')
    .select('broker_user_id')
    .eq('channel', channel)
    .eq('provider_account_id', recipientAccountId)
    .eq('is_active', true)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (mappingRes.error) {
    if (isSchemaMissingError(mappingRes.error)) {
      cache.set(cacheKey, null)
      return null
    }
    cache.set(cacheKey, null)
    return null
  }

  const brokerUserId = compactText(mappingRes.data?.broker_user_id, 80)
  cache.set(cacheKey, brokerUserId)
  return brokerUserId
}

export async function GET(request: NextRequest) {
  if (!isWebhookEnabled()) {
    return NextResponse.json({ ok: false, error: 'META_WEBHOOK_ENABLED desabilitado.' }, { status: 503 })
  }

  const mode = request.nextUrl.searchParams.get('hub.mode')
  const token = request.nextUrl.searchParams.get('hub.verify_token')
  const challenge = request.nextUrl.searchParams.get('hub.challenge')

  const expectedToken = String(process.env.META_WEBHOOK_VERIFY_TOKEN || '').trim()
  if (!expectedToken) {
    return NextResponse.json({ ok: false, error: 'META_WEBHOOK_VERIFY_TOKEN nao configurado.' }, { status: 503 })
  }

  if (mode === 'subscribe' && token === expectedToken && challenge) {
    return new NextResponse(challenge, { status: 200 })
  }

  return NextResponse.json({ ok: false, error: 'Webhook verification failed.' }, { status: 403 })
}

export async function POST(request: NextRequest) {
  if (!isWebhookEnabled()) {
    return NextResponse.json({ ok: false, error: 'META_WEBHOOK_ENABLED desabilitado.' }, { status: 503 })
  }

  if (!hasValidOptionalToken(request)) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  const rawBody = await request.text()
  if (!hasValidMetaSignature(request, rawBody)) {
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
  const objectType = String(root.object || '').trim().toLowerCase()
  if (objectType && objectType !== 'page' && objectType !== 'instagram') {
    return NextResponse.json({
      ok: true,
      processed: 0,
      skipped: 0,
      errors: [`Objeto ${objectType} nao suportado neste endpoint.`],
    })
  }

  const parsedMessages = extractInboundMessages(root)

  let processed = 0
  let skipped = 0
  const errors: string[] = []
  const brokerCache = new Map<string, string | null>()

  for (const message of parsedMessages) {
    const brokerUserId = await resolveBrokerByChannelAccount(
      message.channel,
      message.recipientAccountId,
      brokerCache
    )

    const upsertResult = await upsertInboundConversationMessage({
      channel: message.channel,
      externalConversationId: message.externalConversationId,
      brokerUserId,
      subject: message.senderName || message.senderExternalId || message.externalConversationId,
      text:
        message.text ||
        `Mensagem inbound ${message.channel === 'instagram' ? 'Instagram' : 'Facebook'} (${message.messageType}).`,
      mediaUrl: message.mediaUrl,
      messageType: message.messageType,
      providerMessageId: message.providerMessageId,
      senderName: message.senderName || message.senderExternalId,
      senderExternalId: message.senderExternalId,
      occurredAt: message.occurredAt,
      payload: message.payload,
      metadata: {
        source: 'meta_graph_webhook',
        recipient_account_id: message.recipientAccountId,
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
