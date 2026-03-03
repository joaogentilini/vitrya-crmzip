import { NextRequest, NextResponse } from 'next/server'

import { upsertInboundConversationMessage } from '@/lib/chat/inbox'
import { normalizeEvolutionInstanceName } from '@/lib/integrations/evolution/client'
import { normalizeBrazilianPhone } from '@/lib/phone'
import { createAdminClient } from '@/lib/supabase/admin'

type PayloadRecord = Record<string, unknown>

type ParsedInboundItem = {
  instanceName: string | null
  remoteJid: string | null
  senderName: string | null
  providerMessageId: string | null
  occurredAt: string
  text: string | null
  mediaUrl: string | null
  messageType: 'text' | 'image' | 'audio' | 'video' | 'document' | 'event'
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
  const hasFlag = String(process.env.EVOLUTION_WEBHOOK_ENABLED || '').trim().length > 0
  if (!hasFlag) return true
  return boolFromEnv('EVOLUTION_WEBHOOK_ENABLED')
}

function hasValidOptionalToken(request: NextRequest): boolean {
  const expected = String(process.env.EVOLUTION_WEBHOOK_TOKEN || '').trim()
  if (!expected) return true

  const candidates = [
    request.headers.get('x-webhook-token'),
    request.headers.get('apikey'),
    request.nextUrl.searchParams.get('token'),
  ]

  const auth = String(request.headers.get('authorization') || '').trim()
  if (auth.toLowerCase().startsWith('bearer ')) {
    candidates.push(auth.slice(7).trim())
  }

  for (const raw of candidates) {
    const token = String(raw || '').trim()
    if (token && token === expected) return true
  }

  return false
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

function normalizeEventName(value: string | null | undefined): string {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[.-]/g, '_')
}

function isMessageUpsertEvent(value: string | null | undefined): boolean {
  const normalized = normalizeEventName(value)
  return (
    normalized === 'messages_upsert' ||
    normalized === 'message_upsert' ||
    normalized === 'messagesupsert' ||
    normalized === 'messageupsert'
  )
}

function unwrapMessageNode(input: PayloadRecord): PayloadRecord {
  let current = input
  for (let i = 0; i < 8; i += 1) {
    if (Object.keys(current).length === 0) return {}

    const ephemeral = asRecord(current.ephemeralMessage)
    if (Object.keys(ephemeral).length > 0) {
      const nested = asRecord(ephemeral.message)
      if (Object.keys(nested).length > 0) {
        current = nested
        continue
      }
    }

    const viewOnce = asRecord(current.viewOnceMessage)
    if (Object.keys(viewOnce).length > 0) {
      const nested = asRecord(viewOnce.message)
      if (Object.keys(nested).length > 0) {
        current = nested
        continue
      }
    }

    const viewOnceV2 = asRecord(current.viewOnceMessageV2)
    if (Object.keys(viewOnceV2).length > 0) {
      const nested = asRecord(viewOnceV2.message)
      if (Object.keys(nested).length > 0) {
        current = nested
        continue
      }
    }

    const viewOnceV2Ext = asRecord(current.viewOnceMessageV2Extension)
    if (Object.keys(viewOnceV2Ext).length > 0) {
      const nested = asRecord(viewOnceV2Ext.message)
      if (Object.keys(nested).length > 0) {
        current = nested
        continue
      }
    }

    break
  }

  return current
}

function parseMessageContent(node: PayloadRecord): {
  text: string | null
  mediaUrl: string | null
  messageType: 'text' | 'image' | 'audio' | 'video' | 'document' | 'event'
} {
  const message = unwrapMessageNode(node)

  const conversation = compactText(message.conversation, 4000)
  if (conversation) {
    return { text: conversation, mediaUrl: null, messageType: 'text' }
  }

  const extendedText = compactText(asRecord(message.extendedTextMessage).text, 4000)
  if (extendedText) {
    return { text: extendedText, mediaUrl: null, messageType: 'text' }
  }

  const image = asRecord(message.imageMessage)
  if (Object.keys(image).length > 0) {
    const text = compactText(image.caption, 4000)
    const mediaRef =
      compactText(image.url, 1400) ||
      compactText(image.directPath, 1400) ||
      compactText(image.mediaKey, 400)
    return {
      text,
      mediaUrl: mediaRef && !mediaRef.startsWith('http') ? `evo-media:${mediaRef}` : mediaRef,
      messageType: 'image',
    }
  }

  const video = asRecord(message.videoMessage)
  if (Object.keys(video).length > 0) {
    const text = compactText(video.caption, 4000)
    const mediaRef =
      compactText(video.url, 1400) ||
      compactText(video.directPath, 1400) ||
      compactText(video.mediaKey, 400)
    return {
      text,
      mediaUrl: mediaRef && !mediaRef.startsWith('http') ? `evo-media:${mediaRef}` : mediaRef,
      messageType: 'video',
    }
  }

  const document = asRecord(message.documentMessage)
  if (Object.keys(document).length > 0) {
    const text = compactText(document.caption, 4000) || compactText(document.fileName, 280)
    const mediaRef =
      compactText(document.url, 1400) ||
      compactText(document.directPath, 1400) ||
      compactText(document.mediaKey, 400)
    return {
      text,
      mediaUrl: mediaRef && !mediaRef.startsWith('http') ? `evo-media:${mediaRef}` : mediaRef,
      messageType: 'document',
    }
  }

  const audio = asRecord(message.audioMessage)
  if (Object.keys(audio).length > 0) {
    const mediaRef =
      compactText(audio.url, 1400) ||
      compactText(audio.directPath, 1400) ||
      compactText(audio.mediaKey, 400)
    return {
      text: null,
      mediaUrl: mediaRef && !mediaRef.startsWith('http') ? `evo-media:${mediaRef}` : mediaRef,
      messageType: 'audio',
    }
  }

  return { text: '[evento]', mediaUrl: null, messageType: 'event' }
}

function extractInstanceName(root: PayloadRecord, item: PayloadRecord): string | null {
  const value =
    compactText(item.instanceName, 120) ||
    compactText(item.instance, 120) ||
    compactText(asRecord(item.instance).instanceName, 120) ||
    compactText(root.instanceName, 120) ||
    compactText(root.instance, 120) ||
    compactText(asRecord(root.instance).instanceName, 120)
  if (!value) return null
  const normalized = normalizeEvolutionInstanceName(value)
  return normalized || null
}

function extractRemoteJid(item: PayloadRecord): string | null {
  const key = asRecord(item.key)
  return (
    compactText(key.remoteJid, 220) ||
    compactText(item.remoteJid, 220) ||
    compactText(asRecord(item.data).remoteJid, 220)
  )
}

function extractProviderMessageId(item: PayloadRecord): string | null {
  const key = asRecord(item.key)
  return compactText(key.id, 190) || compactText(item.id, 190) || compactText(asRecord(item.data).id, 190)
}

function isFromMe(item: PayloadRecord): boolean {
  const key = asRecord(item.key)
  const direct = item.fromMe
  if (direct === true) return true
  return key.fromMe === true
}

function extractSenderName(item: PayloadRecord): string | null {
  return (
    compactText(item.pushName, 180) ||
    compactText(item.notifyName, 180) ||
    compactText(asRecord(item.sender).name, 180)
  )
}

function extractJidDigits(remoteJid: string | null): string | null {
  if (!remoteJid) return null
  const local = remoteJid.includes('@') ? remoteJid.split('@')[0] : remoteJid
  const digits = local.replace(/\D/g, '')
  return digits || null
}

function extractItems(root: PayloadRecord): PayloadRecord[] {
  const data = root.data

  if (Array.isArray(data)) {
    return data.map((item) => asRecord(item)).filter((item) => Object.keys(item).length > 0)
  }

  const dataRecord = asRecord(data)
  if (Array.isArray(dataRecord.messages)) {
    const base = asRecord(dataRecord)
    return dataRecord.messages
      .map((entry) => {
        const msg = asRecord(entry)
        return {
          ...base,
          ...msg,
          key: {
            ...asRecord(base.key),
            ...asRecord(msg.key),
          },
          message: asRecord(msg.message),
        }
      })
      .map((item) => asRecord(item))
      .filter((item) => Object.keys(item).length > 0)
  }

  if (Object.keys(dataRecord).length > 0) {
    return [dataRecord]
  }

  if (Object.keys(asRecord(root.key)).length > 0 || Object.keys(asRecord(root.message)).length > 0) {
    return [root]
  }

  return []
}

async function resolveContextByPhone(phoneE164: string | null) {
  if (!phoneE164) {
    return {
      leadId: null as string | null,
      personId: null as string | null,
      propertyId: null as string | null,
      brokerUserId: null as string | null,
      subject: null as string | null,
    }
  }

  const admin = createAdminClient()

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

async function resolveBrokerByInstanceName(
  instanceName: string | null,
  cache: Map<string, string | null>
): Promise<string | null> {
  if (!instanceName) return null
  if (cache.has(instanceName)) return cache.get(instanceName) || null

  const admin = createAdminClient()
  const res = await admin
    .from('chat_channel_accounts')
    .select('broker_user_id')
    .eq('channel', 'whatsapp')
    .eq('provider_account_id', instanceName)
    .eq('is_active', true)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const brokerUserId = compactText(res.data?.broker_user_id, 80)
  cache.set(instanceName, brokerUserId)
  return brokerUserId
}

function parseItems(root: PayloadRecord, routeEvent: string | null): ParsedInboundItem[] {
  const rootEvent = compactText(root.event, 100)
  const normalizedRouteEvent = normalizeEventName(routeEvent || '')
  const normalizedRootEvent = normalizeEventName(rootEvent || '')
  const shouldParseAsMessages =
    !normalizedRouteEvent ||
    isMessageUpsertEvent(normalizedRouteEvent) ||
    !normalizedRootEvent ||
    isMessageUpsertEvent(normalizedRootEvent)

  if (!shouldParseAsMessages) return []

  const items = extractItems(root)
  const parsed: ParsedInboundItem[] = []

  for (const item of items) {
    if (isFromMe(item)) continue

    const remoteJid = extractRemoteJid(item)
    if (!remoteJid) continue
    if (remoteJid.includes('@g.us')) continue

    const messageNode = asRecord(item.message)
    if (Object.keys(messageNode).length === 0) continue

    const content = parseMessageContent(messageNode)
    const providerMessageId = extractProviderMessageId(item)
    const occurredAt = parseOccurredAt(
      item.messageTimestamp || item.messageTimestampMs || item.timestamp || root.date_time || root.dateTime
    )
    const instanceName = extractInstanceName(root, item)

    parsed.push({
      instanceName,
      remoteJid,
      senderName: extractSenderName(item),
      providerMessageId,
      occurredAt,
      text: content.text,
      mediaUrl: content.mediaUrl,
      messageType: content.messageType,
      payload: {
        source: 'evolution_webhook',
        route_event: routeEvent,
        root_event: rootEvent,
        instance_name: instanceName,
        item,
      },
    })
  }

  return parsed
}

export async function handleEvolutionWebhook(
  request: NextRequest,
  routeEvent: string | null = null
) {
  if (!isWebhookEnabled()) {
    return NextResponse.json({ ok: false, error: 'EVOLUTION_WEBHOOK_ENABLED desabilitado.' }, { status: 503 })
  }

  if (!hasValidOptionalToken(request)) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  const payload = await request.json().catch(() => null)
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return NextResponse.json({ ok: false, error: 'Payload JSON invalido.' }, { status: 400 })
  }

  const root = asRecord(payload)
  const parsedItems = parseItems(root, routeEvent)
  const brokerCache = new Map<string, string | null>()
  let processed = 0
  let skipped = 0
  const errors: string[] = []

  for (const item of parsedItems) {
    const jidDigits = extractJidDigits(item.remoteJid)
    const normalizedPhone = jidDigits ? normalizeBrazilianPhone(jidDigits) : { isValid: false, e164: null }
    const phoneE164 = normalizedPhone.isValid ? normalizedPhone.e164 : null
    const context = await resolveContextByPhone(phoneE164)
    const mappedBroker = await resolveBrokerByInstanceName(item.instanceName, brokerCache)

    const externalConversationId = item.instanceName
      ? compactText(`${item.instanceName}:${item.remoteJid}`, 160)
      : compactText(item.remoteJid, 160)

    const upsertResult = await upsertInboundConversationMessage({
      channel: 'whatsapp',
      externalConversationId,
      externalLeadId: context.leadId,
      leadId: context.leadId,
      personId: context.personId,
      propertyId: context.propertyId,
      brokerUserId: mappedBroker || context.brokerUserId,
      subject: context.subject || item.senderName || phoneE164 || item.remoteJid,
      text: item.text || `Mensagem inbound WhatsApp (${item.messageType}).`,
      mediaUrl: item.mediaUrl,
      messageType: item.messageType,
      providerMessageId: item.providerMessageId,
      senderName: item.senderName || phoneE164 || item.remoteJid,
      senderExternalId: item.remoteJid,
      occurredAt: item.occurredAt,
      payload: item.payload,
      metadata: {
        source: 'evolution_webhook',
        instance_name: item.instanceName,
        remote_jid: item.remoteJid,
        phone_e164: phoneE164,
      },
    })

    if (upsertResult.ok) processed += 1
    else {
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
