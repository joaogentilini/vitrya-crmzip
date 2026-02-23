import { createHash, timingSafeEqual } from 'node:crypto'

type AsaasRecord = Record<string, unknown>

type AsaasRequestOptions = {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  body?: Record<string, unknown> | null
}

function asaasBaseUrl(): string {
  const raw = String(process.env.ASAAS_API_BASE_URL || '').trim()
  if (raw) return raw.replace(/\/$/, '')
  return 'https://api.asaas.com/v3'
}

function asaasApiKey(): string | null {
  const raw = String(process.env.ASAAS_API_KEY || '').trim()
  return raw || null
}

function asaasDefaultBillingType(): string {
  const raw = String(process.env.ASAAS_DEFAULT_BILLING_TYPE || '').trim().toUpperCase()
  return raw || 'UNDEFINED'
}

function toErrorMessage(raw: unknown, fallback: string): string {
  if (typeof raw === 'string' && raw.trim()) return raw.trim()
  if (!raw || typeof raw !== 'object') return fallback
  const record = raw as AsaasRecord
  const direct = [record.message, record.error, record.detail].find(
    (value) => typeof value === 'string' && value.trim().length > 0
  ) as string | undefined
  if (direct) return direct
  const errors = record.errors
  if (Array.isArray(errors) && errors.length > 0) {
    const first = errors[0]
    if (typeof first === 'string' && first.trim()) return first.trim()
    if (first && typeof first === 'object') {
      const msg = (first as AsaasRecord).description || (first as AsaasRecord).message
      if (typeof msg === 'string' && msg.trim()) return msg.trim()
    }
  }
  return fallback
}

function normalizePath(path: string): string {
  if (!path.startsWith('/')) return `/${path}`
  return path
}

export async function asaasRequest(path: string, options: AsaasRequestOptions = {}) {
  const key = asaasApiKey()
  if (!key) {
    return { ok: false as const, status: 500, error: 'ASAAS_API_KEY não configurada.', data: null }
  }

  const url = `${asaasBaseUrl()}${normalizePath(path)}`
  const response = await fetch(url, {
    method: options.method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      access_token: key,
      Authorization: `Bearer ${key}`,
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  })

  const data = (await response.json().catch(() => null)) as AsaasRecord | null
  if (!response.ok) {
    return {
      ok: false as const,
      status: response.status,
      error: toErrorMessage(data, `Asaas HTTP ${response.status}`),
      data,
    }
  }

  return {
    ok: true as const,
    status: response.status,
    data,
  }
}

export type EnsureAsaasCustomerInput = {
  name: string
  cpfCnpj?: string | null
  email?: string | null
  phone?: string | null
}

export async function createAsaasCustomer(input: EnsureAsaasCustomerInput) {
  const payload: Record<string, unknown> = {
    name: input.name,
  }
  if (input.cpfCnpj) payload.cpfCnpj = input.cpfCnpj
  if (input.email) payload.email = input.email
  if (input.phone) payload.phone = input.phone
  return asaasRequest('/customers', { method: 'POST', body: payload })
}

export type CreateAsaasChargeInput = {
  customerId: string
  value: number
  dueDate: string
  description: string
  externalReference?: string | null
  walletId?: string | null
  billingType?: string | null
}

export async function createAsaasCharge(input: CreateAsaasChargeInput) {
  const payload: Record<string, unknown> = {
    customer: input.customerId,
    value: input.value,
    dueDate: input.dueDate,
    description: input.description,
    billingType: String(input.billingType || '').trim().toUpperCase() || asaasDefaultBillingType(),
  }
  if (input.externalReference) payload.externalReference = input.externalReference
  if (input.walletId) payload.walletId = input.walletId
  return asaasRequest('/payments', { method: 'POST', body: payload })
}

export async function updateAsaasChargeDueDate(asaasChargeId: string, dueDate: string) {
  return asaasRequest(`/payments/${encodeURIComponent(asaasChargeId)}`, {
    method: 'PUT',
    body: { dueDate },
  })
}

export async function cancelAsaasCharge(asaasChargeId: string) {
  return asaasRequest(`/payments/${encodeURIComponent(asaasChargeId)}`, {
    method: 'DELETE',
  })
}

export async function fetchAsaasPixQrCode(asaasChargeId: string) {
  return asaasRequest(`/payments/${encodeURIComponent(asaasChargeId)}/pixQrCode`)
}

function normalizeSecret(secret: string): Buffer {
  return Buffer.from(secret, 'utf8')
}

function equalsSecret(expected: string, received: string): boolean {
  const a = normalizeSecret(expected)
  const b = normalizeSecret(received)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

export function isValidAsaasWebhookSecret(request: Request, expectedSecret: string | undefined): boolean {
  if (!expectedSecret) return false

  const authHeader = request.headers.get('authorization') || ''
  const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null
  const directHeader =
    request.headers.get('asaas-access-token')?.trim() ||
    request.headers.get('x-asaas-access-token')?.trim() ||
    null
  const queryToken = new URL(request.url).searchParams.get('token')?.trim() || null

  const candidates = [bearer, directHeader, queryToken].filter((value): value is string => Boolean(value))
  return candidates.some((token) => equalsSecret(expectedSecret, token))
}

export function buildAsaasWebhookEventId(payload: unknown): string {
  if (payload && typeof payload === 'object') {
    const record = payload as AsaasRecord
    const direct = [record.id, record.eventId, record.event_id].find(
      (value) => typeof value === 'string' && value.trim().length > 0
    ) as string | undefined
    if (direct) return direct

    const event = String(record.event || record.type || '')
    const payment = record.payment && typeof record.payment === 'object' ? (record.payment as AsaasRecord) : null
    const paymentId = String(payment?.id || record.payment_id || '')
    if (event && paymentId) return `${event}:${paymentId}`
  }

  const raw = JSON.stringify(payload || {})
  const hash = createHash('sha256').update(raw).digest('hex')
  return `hash:${hash}`
}

export function extractAsaasEventType(payload: unknown): string {
  if (!payload || typeof payload !== 'object') return 'unknown'
  const record = payload as AsaasRecord
  const value = record.event || record.type || 'unknown'
  return String(value || 'unknown')
}

export function extractAsaasChargeId(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null
  const record = payload as AsaasRecord
  const payment = record.payment && typeof record.payment === 'object' ? (record.payment as AsaasRecord) : null
  const value = payment?.id || record.payment_id || record.id || null
  const text = String(value || '').trim()
  return text || null
}

export function extractAsaasChargeStatus(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null
  const record = payload as AsaasRecord
  const payment = record.payment && typeof record.payment === 'object' ? (record.payment as AsaasRecord) : null
  const value = payment?.status || record.status || null
  const text = String(value || '').trim()
  return text || null
}

export function asaasEventMarksPaid(eventType: string, chargeStatus: string | null): boolean {
  const normalizedEvent = String(eventType || '').trim().toUpperCase()
  if (
    normalizedEvent === 'PAYMENT_RECEIVED' ||
    normalizedEvent === 'PAYMENT_CONFIRMED' ||
    normalizedEvent === 'PAYMENT_RECEIVED_IN_CASH'
  ) {
    return true
  }

  const normalizedStatus = String(chargeStatus || '').trim().toUpperCase()
  return normalizedStatus === 'RECEIVED' || normalizedStatus === 'CONFIRMED'
}
