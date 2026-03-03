import { NextRequest, NextResponse } from 'next/server'

import { createAdminClient } from '@/lib/supabase/admin'
import { upsertInboundConversationMessage } from '@/lib/chat/inbox'
import { normalizeBrazilianPhone } from '@/lib/phone'

export const runtime = 'nodejs'

type PayloadRecord = Record<string, unknown>

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
  const hasFlag = String(process.env.WHATSAPP_WEBHOOK_ENABLED || '').trim().length > 0
  if (!hasFlag) return true
  return boolFromEnv('WHATSAPP_WEBHOOK_ENABLED')
}

function hasValidOptionalToken(request: NextRequest): boolean {
  const expected = String(process.env.WHATSAPP_WEBHOOK_TOKEN || '').trim()
  if (!expected) return true

  const fromHeader = String(request.headers.get('x-webhook-token') || '').trim()
  if (fromHeader && fromHeader === expected) return true

  const auth = String(request.headers.get('authorization') || '').trim()
  if (auth.toLowerCase().startsWith('bearer ')) {
    const token = auth.slice(7).trim()
    if (token === expected) return true
  }

  return false
}

function extractTextAndType(message: PayloadRecord): {
  type: 'text' | 'image' | 'audio' | 'video' | 'document' | 'event'
  text: string | null
  mediaRef: string | null
} {
  const messageType = String(message.type || '').trim().toLowerCase()

  if (messageType === 'text') {
    const text = compactText(asRecord(message.text).body)
    return { type: 'text', text, mediaRef: null }
  }

  if (messageType === 'image') {
    const image = asRecord(message.image)
    const text = compactText(image.caption)
    const mediaId = compactText(image.id, 300)
    return { type: 'image', text, mediaRef: mediaId ? `meta-media:${mediaId}` : null }
  }

  if (messageType === 'audio') {
    const audio = asRecord(message.audio)
    const mediaId = compactText(audio.id, 300)
    return { type: 'audio', text: null, mediaRef: mediaId ? `meta-media:${mediaId}` : null }
  }

  if (messageType === 'video') {
    const video = asRecord(message.video)
    const text = compactText(video.caption)
    const mediaId = compactText(video.id, 300)
    return { type: 'video', text, mediaRef: mediaId ? `meta-media:${mediaId}` : null }
  }

  if (messageType === 'document') {
    const document = asRecord(message.document)
    const text = compactText(document.caption)
    const mediaId = compactText(document.id, 300)
    return { type: 'document', text, mediaRef: mediaId ? `meta-media:${mediaId}` : null }
  }

  const fallbackText = compactText(messageType ? `[${messageType}]` : '[evento]')
  return { type: 'event', text: fallbackText, mediaRef: null }
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

export async function GET(request: NextRequest) {
  if (!isWebhookEnabled()) {
    return NextResponse.json({ ok: false, error: 'WHATSAPP_WEBHOOK_ENABLED desabilitado.' }, { status: 503 })
  }

  const mode = request.nextUrl.searchParams.get('hub.mode')
  const token = request.nextUrl.searchParams.get('hub.verify_token')
  const challenge = request.nextUrl.searchParams.get('hub.challenge')

  const expectedToken = String(process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN || '').trim()
  if (!expectedToken) {
    return NextResponse.json({ ok: false, error: 'WHATSAPP_WEBHOOK_VERIFY_TOKEN nao configurado.' }, { status: 503 })
  }

  if (mode === 'subscribe' && token === expectedToken && challenge) {
    return new NextResponse(challenge, { status: 200 })
  }

  return NextResponse.json({ ok: false, error: 'Webhook verification failed.' }, { status: 403 })
}

export async function POST(request: NextRequest) {
  if (!isWebhookEnabled()) {
    return NextResponse.json({ ok: false, error: 'WHATSAPP_WEBHOOK_ENABLED desabilitado.' }, { status: 503 })
  }

  if (!hasValidOptionalToken(request)) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  const payload = await request.json().catch(() => null)
  if (!payload || typeof payload !== 'object') {
    return NextResponse.json({ ok: false, error: 'Payload JSON invalido.' }, { status: 400 })
  }

  const root = asRecord(payload)
  const entries = Array.isArray(root.entry) ? root.entry : []

  let processed = 0
  let skipped = 0
  const errors: string[] = []

  for (const entryRaw of entries) {
    const entry = asRecord(entryRaw)
    const changes = Array.isArray(entry.changes) ? entry.changes : []

    for (const changeRaw of changes) {
      const change = asRecord(changeRaw)
      const value = asRecord(change.value)
      const contacts = Array.isArray(value.contacts) ? value.contacts : []
      const messages = Array.isArray(value.messages) ? value.messages : []

      const contactNameByWaId = new Map<string, string>()
      for (const contactRaw of contacts) {
        const contact = asRecord(contactRaw)
        const waId = compactText(contact.wa_id, 100)
        const profile = asRecord(contact.profile)
        const name = compactText(profile.name, 160)
        if (waId && name) {
          contactNameByWaId.set(waId, name)
        }
      }

      for (const messageRaw of messages) {
        const message = asRecord(messageRaw)
        const fromRaw = compactText(message.from, 100)
        const providerMessageId = compactText(message.id, 190)
        const timestampRaw = compactText(message.timestamp, 40)
        const timestamp = timestampRaw && Number.isFinite(Number(timestampRaw))
          ? new Date(Number(timestampRaw) * 1000).toISOString()
          : new Date().toISOString()

        const normalized = fromRaw ? normalizeBrazilianPhone(fromRaw) : { isValid: false, e164: null }
        const phoneE164 = normalized.isValid ? normalized.e164 : null
        const context = await resolveContextByPhone(phoneE164)

        const extracted = extractTextAndType(message)
        const senderName = (fromRaw && contactNameByWaId.get(fromRaw)) || null

        const upsertResult = await upsertInboundConversationMessage({
          channel: 'whatsapp',
          externalConversationId: fromRaw,
          externalLeadId: context.leadId,
          leadId: context.leadId,
          personId: context.personId,
          propertyId: context.propertyId,
          brokerUserId: context.brokerUserId,
          subject: context.subject || senderName || phoneE164 || fromRaw,
          text: extracted.text || `Mensagem inbound WhatsApp (${extracted.type}).`,
          mediaUrl: extracted.mediaRef,
          messageType: extracted.type,
          providerMessageId,
          senderName: senderName || phoneE164 || fromRaw,
          senderExternalId: fromRaw,
          occurredAt: timestamp,
          payload: {
            source: 'meta_whatsapp_webhook',
            value_metadata: asRecord(value.metadata),
            message,
          },
          metadata: {
            source: 'meta_whatsapp_webhook',
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
    }
  }

  return NextResponse.json({
    ok: true,
    processed,
    skipped,
    errors: errors.slice(0, 20),
  })
}
