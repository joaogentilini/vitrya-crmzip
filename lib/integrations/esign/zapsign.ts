export type ESignDocumentStatus = 'draft' | 'sent' | 'viewed' | 'signed' | 'refused' | 'voided' | 'error'

export type ESignSignerInput = {
  role: string
  name: string
  email: string
  phone?: string | null
}

export type CreateZapSignDocumentInput = {
  instanceId: string
  templateCode: string
  title: string
  providerTemplateId?: string | null
  webhookUrl?: string | null
  fields: Record<string, unknown>
  signers: ESignSignerInput[]
}

export type CreateZapSignDocumentResult = {
  ok: boolean
  status: ESignDocumentStatus
  providerDocumentId: string | null
  providerSigners: Array<{ email: string; providerSignerId: string | null }>
  raw: unknown
  error?: string
}

type AnyRecord = Record<string, unknown>

function asRecord(value: unknown): AnyRecord | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as AnyRecord
}

function pickString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return null
}

function boolFromEnv(name: string, defaultValue = false): boolean {
  const raw = String(process.env[name] || '').trim().toLowerCase()
  if (!raw) return defaultValue
  return raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on'
}

export function isZapSignEnabled(): boolean {
  return boolFromEnv('ZAPSIGN_ENABLED', true)
}

export function mapProviderStatus(rawStatus: unknown): ESignDocumentStatus {
  const status = String(rawStatus || '').trim().toLowerCase()
  if (!status) return 'draft'

  if (['sent', 'pending', 'created', 'processing'].includes(status)) return 'sent'
  if (['viewed', 'opened', 'visualized'].includes(status)) return 'viewed'
  if (['signed', 'completed', 'done', 'finished'].includes(status)) return 'signed'
  if (['refused', 'rejected', 'declined'].includes(status)) return 'refused'
  if (['voided', 'cancelled', 'canceled'].includes(status)) return 'voided'
  if (['error', 'failed'].includes(status)) return 'error'

  return 'draft'
}

function resolveBaseUrl(): string {
  const env = String(process.env.ZAPSIGN_API_BASE_URL || '').trim()
  if (env) return env.replace(/\/$/, '')
  return 'https://api.zapsign.com.br/api/v1'
}

export function resolveWebhookCallbackUrl(): string | null {
  const manual = String(process.env.ZAPSIGN_WEBHOOK_URL || '').trim()
  if (manual) return manual

  const site = String(process.env.NEXT_PUBLIC_SITE_URL || '').trim().replace(/\/$/, '')
  const token = String(process.env.ZAPSIGN_WEBHOOK_TOKEN || '').trim()
  if (!site) return null

  const suffix = token ? `?token=${encodeURIComponent(token)}` : ''
  return `${site}/api/esign/zapsign/webhook${suffix}`
}

function resolveCreateUrl(): string {
  const manual = String(process.env.ZAPSIGN_CREATE_DOCUMENT_URL || '').trim()
  if (manual) return manual
  return `${resolveBaseUrl()}/docs/`
}

function resolveModelCreateUrl(): string {
  return `${resolveBaseUrl()}/models/create-doc/`
}

function resolveAddSignerUrl(providerDocumentId: string): string {
  return `${resolveBaseUrl()}/docs/${encodeURIComponent(providerDocumentId)}/add-signer/`
}

function resolveAuthHeader(): string | null {
  const key = String(process.env.ZAPSIGN_API_KEY || process.env.ZAPSIGN_API_TOKEN || '').trim()
  if (!key) return null
  return `Bearer ${key}`
}

function toTemplatePlaceholder(key: string): string {
  const clean = String(key || '').trim()
  if (!clean) return ''
  if (clean.startsWith('{{') && clean.endsWith('}}')) return clean
  return `{{${clean}}}`
}

function toTemplateValue(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'bigint') return String(value)
  if (typeof value === 'boolean') return value ? 'SIM' : 'NAO'
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

function splitPhone(phone?: string | null): { country: string | null; number: string | null } {
  const digits = String(phone || '').replace(/\D/g, '')
  if (!digits) return { country: null, number: null }

  if (digits.startsWith('55') && digits.length >= 12) {
    return { country: '55', number: digits.slice(2) }
  }

  if (digits.length === 10 || digits.length === 11) {
    return { country: '55', number: digits }
  }

  if (digits.length > 11) {
    return { country: digits.slice(0, 2), number: digits.slice(2) }
  }

  return { country: null, number: digits }
}

function roleToQualification(role: string): string {
  const normalized = String(role || '').trim().toLowerCase()
  if (normalized === 'owner' || normalized === 'seller' || normalized === 'locador') return 'proprietario'
  if (normalized === 'buyer' || normalized === 'tenant' || normalized === 'inquilino') return 'cliente'
  if (normalized === 'witness' || normalized === 'testemunha') return 'testemunha'
  if (normalized === 'broker' || normalized === 'corretor') return 'corretor'
  if (normalized === 'vitrya') return 'vitrya'
  return ''
}

function extractProviderError(raw: unknown): string | null {
  if (typeof raw === 'string' && raw.trim()) return raw.trim()

  const root = asRecord(raw)
  if (!root) return null

  const data = asRecord(root.data)
  const error = asRecord(root.error)

  const candidates = [
    pickString(root.detail, root.message, root.error, root.non_field_errors),
    pickString(data?.detail, data?.message, data?.error, data?.non_field_errors),
    pickString(error?.detail, error?.message, error?.error),
  ]

  for (const item of candidates) {
    if (item) return item
  }

  const errors = root.errors
  if (Array.isArray(errors)) {
    const first = errors[0]
    if (typeof first === 'string' && first.trim()) return first.trim()
    const firstObj = asRecord(first)
    if (firstObj) {
      const msg = pickString(firstObj.detail, firstObj.message, firstObj.error)
      if (msg) return msg
    }
  }

  return null
}

function normalizeProviderSigners(raw: unknown): Array<{ email: string; providerSignerId: string | null }> {
  const out: Array<{ email: string; providerSignerId: string | null }> = []
  const root = asRecord(raw)
  if (!root) return out

  const candidates: unknown[] = []
  candidates.push(root.signers)
  candidates.push(root.signer)
  const dataRecord = asRecord(root.data)
  if (dataRecord) {
    candidates.push(dataRecord.signers)
    candidates.push(dataRecord.signer)
  }
  const docRecord = asRecord(root.document)
  if (docRecord) {
    candidates.push(docRecord.signers)
    candidates.push(docRecord.signer)
  }

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      for (const item of candidate) {
        const row = asRecord(item)
        if (!row) continue
        const email = pickString(row.email, row.signer_email, row.mail)
        if (!email) continue
        const providerSignerId = pickString(row.id, row.token, row.signer_id, row.uuid)
        out.push({ email, providerSignerId })
      }
      continue
    }

    const row = asRecord(candidate)
    if (row) {
      const email = pickString(row.email, row.signer_email, row.mail)
      if (!email) continue
      const providerSignerId = pickString(row.id, row.token, row.signer_id, row.uuid)
      out.push({ email, providerSignerId })
    }
  }

  return out
}

function extractProviderDocumentId(raw: unknown): string | null {
  const root = asRecord(raw)
  if (!root) return null

  const dataRecord = asRecord(root.data)
  const documentRecord = asRecord(root.document)
  const resultRecord = asRecord(root.result)

  return pickString(
    root.token,
    root.id,
    root.document_id,
    root.doc_id,
    root.uuid,
    dataRecord?.token,
    dataRecord?.id,
    dataRecord?.document_id,
    dataRecord?.doc_id,
    dataRecord?.uuid,
    documentRecord?.token,
    documentRecord?.id,
    documentRecord?.document_id,
    documentRecord?.doc_id,
    resultRecord?.id,
    resultRecord?.document_id
  )
}

function extractProviderStatus(raw: unknown): ESignDocumentStatus {
  const root = asRecord(raw)
  if (!root) return 'draft'

  const dataRecord = asRecord(root.data)
  const documentRecord = asRecord(root.document)

  return mapProviderStatus(
    pickString(
      root.status,
      root.event,
      dataRecord?.status,
      dataRecord?.event,
      documentRecord?.status,
      documentRecord?.event
    )
  )
}

export async function createZapSignDocument(
  input: CreateZapSignDocumentInput
): Promise<CreateZapSignDocumentResult> {
  if (!isZapSignEnabled()) {
    return {
      ok: false,
      status: 'error',
      providerDocumentId: null,
      providerSigners: [],
      raw: null,
      error: 'ZAPSIGN_ENABLED desligado.',
    }
  }

  const authHeader = resolveAuthHeader()
  if (!authHeader) {
    return {
      ok: false,
      status: 'error',
      providerDocumentId: null,
      providerSigners: [],
      raw: null,
      error: 'ZAPSIGN_API_KEY não configurada.',
    }
  }
  if (input.providerTemplateId) {
    if (!input.signers.length) {
      return {
        ok: false,
        status: 'error',
        providerDocumentId: null,
        providerSigners: [],
        raw: null,
        error: 'Lista de assinantes vazia para criacao via modelo.',
      }
    }

    const [firstSigner, ...extraSigners] = input.signers
    const firstPhone = splitPhone(firstSigner.phone)
    const modelData = Object.entries(input.fields || {})
      .map(([key, value]) => {
        const de = toTemplatePlaceholder(key)
        if (!de) return null
        return {
          de,
          para: toTemplateValue(value),
        }
      })
      .filter(Boolean)

    const payload: AnyRecord = {
      template_id: input.providerTemplateId,
      signer_name: firstSigner.name,
      signer_email: firstSigner.email,
      external_id: input.instanceId,
      data: modelData,
      send_automatic_email: true,
      lang: 'pt-br',
    }

    if (firstPhone.country) payload.signer_phone_country = firstPhone.country
    if (firstPhone.number) payload.signer_phone_number = firstPhone.number

    const response = await fetch(resolveModelCreateUrl(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: authHeader,
      },
      body: JSON.stringify(payload),
    })

    const json = await response.json().catch(() => null)
    if (!response.ok) {
      const providerMessage = extractProviderError(json)
      return {
        ok: false,
        status: 'error',
        providerDocumentId: null,
        providerSigners: [],
        raw: json,
        error: providerMessage
          ? `ZapSign HTTP ${response.status}: ${providerMessage}`
          : `ZapSign HTTP ${response.status}`,
      }
    }

    const providerDocumentId = extractProviderDocumentId(json)
    if (!providerDocumentId) {
      return {
        ok: false,
        status: 'error',
        providerDocumentId: null,
        providerSigners: [],
        raw: json,
        error: 'ZapSign criou o documento, mas nao retornou provider_document_id.',
      }
    }

    const providerSigners = normalizeProviderSigners(json)
    const addSignerRaw: unknown[] = []

    for (const signer of extraSigners) {
      const phone = splitPhone(signer.phone)
      const addSignerPayload: AnyRecord = {
        name: signer.name,
        email: signer.email,
        qualification: roleToQualification(signer.role),
        send_automatic_email: true,
      }
      if (phone.country) addSignerPayload.phone_country = phone.country
      if (phone.number) addSignerPayload.phone_number = phone.number

      const addSignerResponse = await fetch(resolveAddSignerUrl(providerDocumentId), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: authHeader,
        },
        body: JSON.stringify(addSignerPayload),
      })

      const addSignerJson = await addSignerResponse.json().catch(() => null)
      addSignerRaw.push({
        signer: signer.email,
        status: addSignerResponse.status,
        response: addSignerJson,
      })

      if (!addSignerResponse.ok) {
        const providerMessage = extractProviderError(addSignerJson)
        return {
          ok: false,
          status: 'error',
          providerDocumentId,
          providerSigners,
          raw: {
            create: json,
            add_signers: addSignerRaw,
          },
          error: providerMessage
            ? `ZapSign add-signer HTTP ${addSignerResponse.status}: ${providerMessage}`
            : `ZapSign add-signer HTTP ${addSignerResponse.status}`,
        }
      }

      const addedSigner = normalizeProviderSigners(addSignerJson)
      for (const item of addedSigner) {
        providerSigners.push(item)
      }
    }

    return {
      ok: true,
      status: extractProviderStatus(json),
      providerDocumentId,
      providerSigners,
      raw: {
        create: json,
        add_signers: addSignerRaw,
      },
    }
  }

  const payload: AnyRecord = {
    name: input.title,
    external_id: input.instanceId,
    data: input.fields,
    signers: input.signers.map((signer) => ({
      role: signer.role,
      name: signer.name,
      email: signer.email,
      phone: signer.phone || null,
    })),
  }

  if (input.webhookUrl) payload.webhook_url = input.webhookUrl

  const response = await fetch(resolveCreateUrl(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: authHeader,
    },
    body: JSON.stringify(payload),
  })

  const json = await response.json().catch(() => null)
  if (!response.ok) {
    const providerMessage = extractProviderError(json)
    return {
      ok: false,
      status: 'error',
      providerDocumentId: null,
      providerSigners: [],
      raw: json,
      error: providerMessage ? `ZapSign HTTP ${response.status}: ${providerMessage}` : `ZapSign HTTP ${response.status}`,
    }
  }

  return {
    ok: true,
    status: extractProviderStatus(json),
    providerDocumentId: extractProviderDocumentId(json),
    providerSigners: normalizeProviderSigners(json),
    raw: json,
  }
}

export type ZapSignWebhookInfo = {
  providerDocumentId: string | null
  providerEventId: string | null
  eventType: string
  status: ESignDocumentStatus
  signedPdfUrl: string | null
  auditTrailUrl: string | null
  signerEvents: Array<{
    email: string
    status: ESignDocumentStatus
    providerSignerId: string | null
    signedAt: string | null
    viewedAt: string | null
  }>
}

function normalizeSignerEvents(raw: unknown): ZapSignWebhookInfo['signerEvents'] {
  const result: ZapSignWebhookInfo['signerEvents'] = []
  const root = asRecord(raw)
  if (!root) return result

  const blocks = [root.signers, asRecord(root.data)?.signers, asRecord(root.document)?.signers]
  for (const block of blocks) {
    if (!Array.isArray(block)) continue
    for (const item of block) {
      const row = asRecord(item)
      if (!row) continue
      const email = pickString(row.email, row.signer_email, row.mail)
      if (!email) continue
      result.push({
        email,
        status: mapProviderStatus(pickString(row.status, row.event)),
        providerSignerId: pickString(row.id, row.signer_id, row.token, row.uuid),
        signedAt: pickString(row.signed_at, row.signedAt, row.completed_at),
        viewedAt: pickString(row.viewed_at, row.viewedAt, row.opened_at),
      })
    }
  }

  return result
}

export function parseZapSignWebhook(payload: unknown): ZapSignWebhookInfo {
  const root = asRecord(payload)
  const dataRecord = asRecord(root?.data)
  const documentRecord = asRecord(root?.document)

  const status = mapProviderStatus(
    pickString(
      root?.status,
      root?.event_type,
      root?.event,
      dataRecord?.status,
      dataRecord?.event_type,
      dataRecord?.event,
      documentRecord?.status
    )
  )

  return {
    providerDocumentId: pickString(
      root?.document_id,
      root?.id,
      root?.doc_id,
      dataRecord?.document_id,
      dataRecord?.id,
      documentRecord?.id,
      documentRecord?.document_id,
      root?.external_id
    ),
    providerEventId: pickString(
      root?.event_id,
      root?.id,
      dataRecord?.event_id,
      asRecord(root?.event)?.id
    ),
    eventType:
      pickString(
        root?.event_type,
        root?.event,
        dataRecord?.event_type,
        dataRecord?.event,
        documentRecord?.event
      ) || 'status_changed',
    status,
    signedPdfUrl: pickString(
      root?.signed_pdf_url,
      root?.signed_file_url,
      dataRecord?.signed_pdf_url,
      dataRecord?.signed_file_url,
      documentRecord?.signed_pdf_url,
      documentRecord?.signed_file_url,
      root?.download_url,
      dataRecord?.download_url
    ),
    auditTrailUrl: pickString(
      root?.audit_trail_url,
      root?.audit_url,
      dataRecord?.audit_trail_url,
      dataRecord?.audit_url,
      documentRecord?.audit_trail_url
    ),
    signerEvents: normalizeSignerEvents(payload),
  }
}

export function resolveSignedPdfUrl(providerDocumentId: string): string {
  const template = String(process.env.ZAPSIGN_SIGNED_PDF_URL_TEMPLATE || '').trim()
  if (template) {
    return template.replace('{document_id}', encodeURIComponent(providerDocumentId))
  }
  return `${resolveBaseUrl()}/docs/${encodeURIComponent(providerDocumentId)}/download/`
}

export function resolveAuditTrailUrl(providerDocumentId: string): string {
  const template = String(process.env.ZAPSIGN_AUDIT_TRAIL_URL_TEMPLATE || '').trim()
  if (template) {
    return template.replace('{document_id}', encodeURIComponent(providerDocumentId))
  }
  return `${resolveBaseUrl()}/docs/${encodeURIComponent(providerDocumentId)}/audit/`
}

export async function downloadProviderFile(url: string): Promise<Buffer> {
  const authHeader = resolveAuthHeader()
  const headers: Record<string, string> = {}
  if (authHeader) {
    headers.Authorization = authHeader
  }

  const response = await fetch(url, { method: 'GET', headers })
  if (!response.ok) {
    throw new Error(`Falha ao baixar arquivo do provedor (${response.status}).`)
  }

  const arrayBuffer = await response.arrayBuffer()
  return Buffer.from(arrayBuffer)
}
