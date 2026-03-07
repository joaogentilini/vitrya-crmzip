type PayloadRecord = Record<string, unknown>

export type OpenClawChannel = 'whatsapp' | 'instagram' | 'facebook' | 'olx' | 'grupoolx' | 'meta' | 'other'

export type OpenClawApiResult<T> = {
  ok: boolean
  status: number
  data: T | null
  error: string | null
  raw: unknown
}

export type OpenClawSendTextResult = {
  providerMessageId: string | null
  externalConversationId: string | null
  raw: unknown
}

function asRecord(value: unknown): PayloadRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return value as PayloadRecord
}

function compactText(value: unknown, limit = 240): string | null {
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

function normalizeBaseUrl(value: string | undefined): string {
  return String(value || '').trim().replace(/\/+$/, '')
}

function normalizePath(value: string | undefined, fallback: string): string {
  const raw = String(value || '').trim()
  if (!raw) return fallback
  return raw.startsWith('/') ? raw : `/${raw}`
}

function buildUrl(path: string): string | null {
  const baseUrl = normalizeBaseUrl(process.env.OPENCLAW_API_BASE_URL)
  if (!baseUrl) return null
  return `${baseUrl}${path}`
}

function normalizeChannel(value: string | null | undefined): OpenClawChannel {
  const normalized = String(value || '').trim().toLowerCase()
  if (normalized === 'whatsapp') return 'whatsapp'
  if (normalized === 'instagram') return 'instagram'
  if (normalized === 'facebook') return 'facebook'
  if (normalized === 'olx') return 'olx'
  if (normalized === 'grupoolx') return 'grupoolx'
  if (normalized === 'meta') return 'meta'
  return 'other'
}

function buildErrorMessage(status: number, body: unknown): string {
  const root = asRecord(body)
  return (
    compactText(root.message, 280) ||
    compactText(asRecord(root.error).message, 280) ||
    compactText(root.error, 280) ||
    compactText(root.response, 280) ||
    `Falha na OpenClaw API (${status}).`
  )
}

function extractProviderMessageId(body: unknown): string | null {
  const root = asRecord(body)
  return (
    compactText(root.message_id, 220) ||
    compactText(root.id, 220) ||
    compactText(asRecord(root.message).id, 220) ||
    compactText(asRecord(root.data).message_id, 220) ||
    compactText(asRecord(root.data).id, 220) ||
    compactText(asRecord(asRecord(root.data).message).id, 220) ||
    null
  )
}

function extractExternalConversationId(body: unknown): string | null {
  const root = asRecord(body)
  return (
    compactText(root.conversation_id, 220) ||
    compactText(root.chat_id, 220) ||
    compactText(root.thread_id, 220) ||
    compactText(asRecord(root.data).conversation_id, 220) ||
    compactText(asRecord(root.data).chat_id, 220) ||
    compactText(asRecord(root.data).thread_id, 220) ||
    null
  )
}

export function isOpenClawApiEnabled(): boolean {
  const hasFlag = String(process.env.OPENCLAW_API_ENABLED || '').trim().length > 0
  if (!hasFlag) return false
  return boolFromEnv('OPENCLAW_API_ENABLED')
}

export function getOpenClawEnvSummary() {
  const baseUrl = normalizeBaseUrl(process.env.OPENCLAW_API_BASE_URL)
  const apiKey = String(process.env.OPENCLAW_API_KEY || '').trim()
  const webhookToken = String(process.env.OPENCLAW_WEBHOOK_TOKEN || '').trim()
  const webhookSecret = String(process.env.OPENCLAW_WEBHOOK_SECRET || '').trim()
  const webhookEnabledFlag = String(process.env.OPENCLAW_WEBHOOK_ENABLED || '').trim()
  const webhookEnabled = webhookEnabledFlag ? boolFromEnv('OPENCLAW_WEBHOOK_ENABLED') : true

  return {
    enabled: isOpenClawApiEnabled(),
    base_url_set: Boolean(baseUrl),
    api_key_set: Boolean(apiKey),
    webhook_enabled: webhookEnabled,
    webhook_token_set: Boolean(webhookToken),
    webhook_secret_set: Boolean(webhookSecret),
    base_url_preview: baseUrl ? baseUrl.replace(/^https?:\/\//, '') : null,
  }
}

export function normalizeOpenClawAccountId(value: string): string {
  return String(value || '')
    .replace(/\s+/g, '')
    .trim()
    .slice(0, 120)
}

async function openClawRequest<T>(params: {
  path: string
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'
  body?: Record<string, unknown> | null
  timeoutMs?: number
  parser?: (body: unknown) => T
}): Promise<OpenClawApiResult<T>> {
  const url = buildUrl(params.path)
  const apiKey = String(process.env.OPENCLAW_API_KEY || '').trim()

  if (!url || !apiKey) {
    return {
      ok: false,
      status: 500,
      data: null,
      error: 'OPENCLAW_API_BASE_URL ou OPENCLAW_API_KEY nao configurado.',
      raw: null,
    }
  }

  const controller = new AbortController()
  const timeoutMs = Math.max(2000, Math.min(45000, Number(params.timeoutMs || 15000)))
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const response = await fetch(url, {
      method: params.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        'x-api-key': apiKey,
        apikey: apiKey,
      },
      body: params.body ? JSON.stringify(params.body) : undefined,
      cache: 'no-store',
      signal: controller.signal,
    })

    const raw = await response.json().catch(() => null)
    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        data: null,
        error: buildErrorMessage(response.status, raw),
        raw,
      }
    }

    const data = params.parser ? params.parser(raw) : ((raw as T) ?? null)
    return {
      ok: true,
      status: response.status,
      data,
      error: null,
      raw,
    }
  } catch (error: any) {
    return {
      ok: false,
      status: 500,
      data: null,
      error: error?.name === 'AbortError' ? 'Timeout na OpenClaw API.' : error?.message || 'Falha ao chamar OpenClaw API.',
      raw: null,
    }
  } finally {
    clearTimeout(timer)
  }
}

export async function sendOpenClawTextMessage(input: {
  channel: OpenClawChannel | string
  text: string
  externalConversationId?: string | null
  toExternalId?: string | null
  accountId?: string | null
}): Promise<OpenClawApiResult<OpenClawSendTextResult>> {
  const sendPath = normalizePath(process.env.OPENCLAW_SEND_TEXT_PATH, '/messages/send')

  const channel = normalizeChannel(input.channel)
  const text = compactText(input.text, 4000)
  const externalConversationId = compactText(input.externalConversationId, 180)
  const toExternalId = compactText(input.toExternalId, 180)
  const accountId = compactText(normalizeOpenClawAccountId(String(input.accountId || '')), 120)

  if (!text) {
    return {
      ok: false,
      status: 400,
      data: null,
      error: 'Texto obrigatorio para envio OpenClaw.',
      raw: null,
    }
  }

  const body: Record<string, unknown> = {
    channel,
    text,
    message: {
      type: 'text',
      text,
    },
  }

  if (externalConversationId) {
    body.conversation_id = externalConversationId
    body.external_conversation_id = externalConversationId
  }
  if (toExternalId) {
    body.to = toExternalId
    body.recipient_id = toExternalId
  }
  if (accountId) {
    body.account_id = accountId
  }

  return openClawRequest<OpenClawSendTextResult>({
    path: sendPath,
    method: 'POST',
    body,
    parser: (raw) => ({
      providerMessageId: extractProviderMessageId(raw),
      externalConversationId: extractExternalConversationId(raw) || externalConversationId,
      raw,
    }),
  })
}
