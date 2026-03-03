type PayloadRecord = Record<string, unknown>

export type EvolutionInstanceSummary = {
  instanceName: string
  connectionStatus: string | null
  ownerJid: string | null
  profileName: string | null
  raw: PayloadRecord
}

export type EvolutionQrResult = {
  qrCodeBase64: string | null
  pairingCode: string | null
  connectionStatus: string | null
  raw: unknown
}

export type EvolutionApiResult<T> = {
  ok: boolean
  status: number
  data: T | null
  error: string | null
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
  const baseUrl = normalizeBaseUrl(process.env.EVOLUTION_API_BASE_URL)
  if (!baseUrl) return null
  return `${baseUrl}${path}`
}

function instanceNameFromRow(row: PayloadRecord): string | null {
  return (
    compactText(row.instanceName, 160) ||
    compactText(row.instance_name, 160) ||
    compactText(asRecord(row.instance).instanceName, 160) ||
    compactText(asRecord(row.instance).instance_name, 160) ||
    compactText(asRecord(row.instance).name, 160) ||
    compactText(row.name, 160)
  )
}

function connectionStatusFromRow(row: PayloadRecord): string | null {
  return (
    compactText(row.connectionStatus, 60) ||
    compactText(row.connection_status, 60) ||
    compactText(row.status, 60) ||
    compactText(asRecord(row.instance).connectionStatus, 60) ||
    compactText(asRecord(row.instance).status, 60) ||
    compactText(asRecord(row.state).status, 60)
  )
}

function ownerJidFromRow(row: PayloadRecord): string | null {
  return (
    compactText(row.ownerJid, 200) ||
    compactText(row.owner_jid, 200) ||
    compactText(asRecord(row.instance).ownerJid, 200) ||
    compactText(asRecord(row.instance).owner_jid, 200)
  )
}

function profileNameFromRow(row: PayloadRecord): string | null {
  return (
    compactText(row.profileName, 160) ||
    compactText(row.profile_name, 160) ||
    compactText(row.pushName, 160) ||
    compactText(asRecord(row.instance).profileName, 160)
  )
}

function extractQrBase64(body: unknown): string | null {
  const root = asRecord(body)
  const candidates = [
    root.base64,
    root.qrcode,
    root.qr,
    asRecord(root.qrcode).base64,
    asRecord(root.qrCode).base64,
    asRecord(root.data).base64,
    asRecord(root.data).qrcode,
    asRecord(asRecord(root.data).qrcode).base64,
    asRecord(root.instance).qrcode,
    asRecord(asRecord(root.instance).qrcode).base64,
  ]

  for (const candidate of candidates) {
    const normalized = compactText(candidate, 250000)
    if (normalized) return normalized
  }
  return null
}

function extractPairingCode(body: unknown): string | null {
  const root = asRecord(body)
  const candidates = [
    root.pairingCode,
    root.pairing_code,
    root.code,
    asRecord(root.data).pairingCode,
    asRecord(root.data).pairing_code,
    asRecord(root.data).code,
  ]
  for (const candidate of candidates) {
    const normalized = compactText(candidate, 240)
    if (normalized) return normalized
  }
  return null
}

function extractConnectionStatus(body: unknown): string | null {
  const root = asRecord(body)
  const candidates = [
    root.connectionStatus,
    root.connection_status,
    root.status,
    asRecord(root.state).status,
    asRecord(root.instance).connectionStatus,
    asRecord(root.instance).status,
    asRecord(root.data).connectionStatus,
    asRecord(root.data).status,
  ]
  for (const candidate of candidates) {
    const normalized = compactText(candidate, 80)
    if (normalized) return normalized
  }
  return null
}

function toList(value: unknown): PayloadRecord[] {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => asRecord(item))
    .filter((item) => Object.keys(item).length > 0)
}

function extractInstances(body: unknown): EvolutionInstanceSummary[] {
  const root = asRecord(body)
  const arrays = [
    toList(root.instances),
    toList(root.data),
    toList(asRecord(root.data).instances),
    toList(asRecord(root.response).instances),
    toList(root.response),
  ]

  const rows = arrays.find((arr) => arr.length > 0) || []
  const items: EvolutionInstanceSummary[] = []
  const seen = new Set<string>()

  for (const row of rows) {
    const instanceName = instanceNameFromRow(row)
    if (!instanceName) continue
    if (seen.has(instanceName)) continue
    seen.add(instanceName)

    items.push({
      instanceName,
      connectionStatus: connectionStatusFromRow(row),
      ownerJid: ownerJidFromRow(row),
      profileName: profileNameFromRow(row),
      raw: row,
    })
  }

  return items
}

function buildErrorMessage(status: number, body: unknown): string {
  const root = asRecord(body)
  return (
    compactText(root.message, 280) ||
    compactText(asRecord(root.error).message, 280) ||
    compactText(root.error, 280) ||
    compactText(root.response, 280) ||
    `Falha na Evolution API (${status}).`
  )
}

export function isEvolutionApiEnabled(): boolean {
  const hasFlag = String(process.env.EVOLUTION_API_ENABLED || '').trim().length > 0
  if (!hasFlag) return false
  return boolFromEnv('EVOLUTION_API_ENABLED')
}

export function getEvolutionEnvSummary() {
  const baseUrl = normalizeBaseUrl(process.env.EVOLUTION_API_BASE_URL)
  const apiKey = String(process.env.EVOLUTION_API_KEY || '').trim()
  const webhookUrl = String(process.env.EVOLUTION_WEBHOOK_URL || '').trim()
  return {
    enabled: isEvolutionApiEnabled(),
    base_url_set: Boolean(baseUrl),
    api_key_set: Boolean(apiKey),
    webhook_url_set: Boolean(webhookUrl),
    base_url_preview: baseUrl ? baseUrl.replace(/^https?:\/\//, '') : null,
  }
}

export function normalizeEvolutionInstanceName(value: string): string {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)
}

async function evolutionRequest<T>(params: {
  path: string
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'
  body?: Record<string, unknown> | null
  timeoutMs?: number
  parser?: (body: unknown) => T
}): Promise<EvolutionApiResult<T>> {
  const url = buildUrl(params.path)
  const apiKey = String(process.env.EVOLUTION_API_KEY || '').trim()

  if (!url || !apiKey) {
    return {
      ok: false,
      status: 500,
      data: null,
      error: 'EVOLUTION_API_BASE_URL ou EVOLUTION_API_KEY nao configurado.',
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
      error: error?.name === 'AbortError' ? 'Timeout na Evolution API.' : error?.message || 'Falha ao chamar Evolution API.',
      raw: null,
    }
  } finally {
    clearTimeout(timer)
  }
}

export async function listEvolutionInstances(): Promise<EvolutionApiResult<EvolutionInstanceSummary[]>> {
  const fetchPath = normalizePath(process.env.EVOLUTION_FETCH_INSTANCES_PATH, '/instance/fetchInstances')
  return evolutionRequest<EvolutionInstanceSummary[]>({
    path: fetchPath,
    method: 'GET',
    parser: extractInstances,
  })
}

export async function createEvolutionInstance(input: {
  instanceName: string
}): Promise<EvolutionApiResult<PayloadRecord>> {
  const createPath = normalizePath(process.env.EVOLUTION_CREATE_INSTANCE_PATH, '/instance/create')
  const webhookUrl = String(process.env.EVOLUTION_WEBHOOK_URL || '').trim()

  const body: Record<string, unknown> = {
    instanceName: input.instanceName,
    qrcode: true,
    integration: 'WHATSAPP-BAILEYS',
  }

  if (webhookUrl) {
    body.webhook = webhookUrl
    body.webhook_by_events = true
    body.events = ['MESSAGES_UPSERT', 'CONNECTION_UPDATE']
  }

  return evolutionRequest<PayloadRecord>({
    path: createPath,
    method: 'POST',
    body,
    parser: (raw) => asRecord(raw),
  })
}

async function connectWithMethod(
  instanceName: string,
  method: 'GET' | 'POST'
): Promise<EvolutionApiResult<EvolutionQrResult>> {
  const connectPathTemplate = normalizePath(process.env.EVOLUTION_CONNECT_INSTANCE_PATH, '/instance/connect/{instance}')
  const connectPath = connectPathTemplate.replace('{instance}', encodeURIComponent(instanceName))
  return evolutionRequest<EvolutionQrResult>({
    path: connectPath,
    method,
    parser: (raw) => ({
      qrCodeBase64: extractQrBase64(raw),
      pairingCode: extractPairingCode(raw),
      connectionStatus: extractConnectionStatus(raw),
      raw,
    }),
  })
}

export async function fetchEvolutionQr(instanceName: string): Promise<EvolutionApiResult<EvolutionQrResult>> {
  const byGet = await connectWithMethod(instanceName, 'GET')
  if (byGet.ok) return byGet

  const byPost = await connectWithMethod(instanceName, 'POST')
  if (byPost.ok) return byPost

  return byGet
}

export async function fetchEvolutionConnectionState(instanceName: string): Promise<EvolutionApiResult<PayloadRecord>> {
  const statePathTemplate = normalizePath(
    process.env.EVOLUTION_CONNECTION_STATE_PATH,
    '/instance/connectionState/{instance}'
  )
  const statePath = statePathTemplate.replace('{instance}', encodeURIComponent(instanceName))

  return evolutionRequest<PayloadRecord>({
    path: statePath,
    method: 'GET',
    parser: (raw) => asRecord(raw),
  })
}

export async function deleteEvolutionInstance(instanceName: string): Promise<EvolutionApiResult<PayloadRecord>> {
  const deletePathTemplate = normalizePath(process.env.EVOLUTION_DELETE_INSTANCE_PATH, '/instance/delete/{instance}')
  const deletePath = deletePathTemplate.replace('{instance}', encodeURIComponent(instanceName))
  const byDelete = await evolutionRequest<PayloadRecord>({
    path: deletePath,
    method: 'DELETE',
    parser: (raw) => asRecord(raw),
  })
  if (byDelete.ok) return byDelete

  const byPost = await evolutionRequest<PayloadRecord>({
    path: deletePath,
    method: 'POST',
    parser: (raw) => asRecord(raw),
  })
  return byPost.ok ? byPost : byDelete
}
