import { buildWhatsAppLink, sanitizePhone } from '@/lib/whatsapp'

const DEFAULT_COMPANY_EMAIL = 'vitrya.imoveis@gmail.com'

export type EmailDeliveryResult = {
  ok: boolean
  status: 'sent' | 'skipped' | 'error'
  provider: 'resend'
  providerId: string | null
  message: string | null
  raw?: unknown
}

export type WhatsAppDeliveryResult = {
  ok: boolean
  status: 'sent' | 'skipped' | 'error'
  provider: 'meta' | 'wa_link'
  providerId: string | null
  message: string | null
  link: string | null
  raw?: unknown
}

function boolFromEnv(name: string): boolean {
  const normalized = String(process.env[name] || '')
    .trim()
    .toLowerCase()
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on'
}

function compact(value: string | null | undefined): string {
  return String(value || '').trim()
}

function money(value: number | null | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '-'
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 2,
  }).format(value)
}

export async function sendProposalPdfByEmail(input: {
  to: string | null
  subject: string
  html: string
  pdfFileName: string
  pdfBuffer: Buffer
  cc?: string[] | null
  fromEmail?: string | null
  replyTo?: string | null
}): Promise<EmailDeliveryResult> {
  const recipient = compact(input.to)
  if (!recipient) {
    return {
      ok: false,
      status: 'skipped',
      provider: 'resend',
      providerId: null,
      message: 'Email de destino não informado.',
    }
  }

  const apiKey = compact(process.env.RESEND_API_KEY)
  const fromEmail =
    compact(input.fromEmail) ||
    compact(process.env.RESEND_FROM_EMAIL_COMMERCIAL) ||
    compact(process.env.RESEND_FROM_EMAIL_COMERCIAL) ||
    compact(process.env.RESEND_FROM_EMAIL) ||
    DEFAULT_COMPANY_EMAIL
  const replyTo =
    compact(input.replyTo) ||
    compact(process.env.RESEND_REPLY_TO_COMMERCIAL) ||
    compact(process.env.RESEND_REPLY_TO_COMERCIAL) ||
    compact(process.env.COMPANY_COMMERCIAL_EMAIL) ||
    compact(process.env.COMPANY_COMERCIAL_EMAIL) ||
    DEFAULT_COMPANY_EMAIL
  const ccList = (input.cc || [])
    .map((value) => compact(value))
    .filter(Boolean)
    .filter((value) => value.toLowerCase() !== recipient.toLowerCase())
    .filter((value, index, arr) => arr.indexOf(value) === index)

  if (!apiKey) {
    return {
      ok: false,
      status: 'skipped',
      provider: 'resend',
      providerId: null,
      message: 'RESEND_API_KEY não configurada.',
    }
  }

  const payload = {
    from: fromEmail,
    to: [recipient],
    ...(ccList.length ? { cc: ccList } : {}),
    ...(replyTo ? { reply_to: [replyTo] } : {}),
    subject: input.subject,
    html: input.html,
    attachments: [
      {
        filename: input.pdfFileName,
        content: input.pdfBuffer.toString('base64'),
      },
    ],
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  const body = await response.json().catch(() => null)
  if (!response.ok) {
    return {
      ok: false,
      status: 'error',
      provider: 'resend',
      providerId: null,
      message: `Falha no envio de email (${response.status}).`,
      raw: body,
    }
  }

  return {
    ok: true,
    status: 'sent',
    provider: 'resend',
    providerId: String(body?.id || ''),
    message: null,
    raw: body,
  }
}

export async function sendProposalByWhatsApp(input: {
  toPhone: string | null
  message: string
  proposalUrl: string | null
}): Promise<WhatsAppDeliveryResult> {
  const recipientDigits = sanitizePhone(input.toPhone)
  const composedMessage = compact(input.message)
  const link = buildWhatsAppLink(recipientDigits, composedMessage || undefined)

  if (!recipientDigits) {
    return {
      ok: false,
      status: 'skipped',
      provider: 'wa_link',
      providerId: null,
      message: 'Telefone do cliente não informado para WhatsApp.',
      link: null,
    }
  }

  const metaEnabled = boolFromEnv('WHATSAPP_META_ENABLED')
  const metaToken = compact(process.env.WHATSAPP_CLOUD_API_TOKEN)
  const metaPhoneNumberId = compact(process.env.WHATSAPP_CLOUD_PHONE_NUMBER_ID)
  if (!metaEnabled || !metaToken || !metaPhoneNumberId) {
    return {
      ok: false,
      status: 'skipped',
      provider: 'wa_link',
      providerId: null,
      message: 'Envio automático via WhatsApp não configurado. Link pronto para envio manual.',
      link,
    }
  }

  const fullMessage = input.proposalUrl
    ? `${composedMessage}\n\nPDF: ${input.proposalUrl}`
    : composedMessage
  const payload = {
    messaging_product: 'whatsapp',
    to: recipientDigits,
    type: 'text',
    text: {
      body: fullMessage.slice(0, 4096),
    },
  }

  const response = await fetch(`https://graph.facebook.com/v22.0/${metaPhoneNumberId}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${metaToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })
  const body = await response.json().catch(() => null)
  if (!response.ok) {
    return {
      ok: false,
      status: 'error',
      provider: 'meta',
      providerId: null,
      message: `Falha no envio WhatsApp (${response.status}).`,
      link,
      raw: body,
    }
  }

  const messageId = Array.isArray(body?.messages) ? String(body.messages[0]?.id || '') : ''
  return {
    ok: true,
    status: 'sent',
    provider: 'meta',
    providerId: messageId || null,
    message: null,
    link,
    raw: body,
  }
}

export function buildProposalEmailHtml(input: {
  incorporationName: string
  developerName: string | null
  unitCode: string
  clientName: string
  offerValue: number
  brokerName: string | null
  proposalUrl: string | null
}): string {
  const developerLabel = compact(input.developerName) || '-'
  const brokerLabel = compact(input.brokerName) || '-'
  const proposalLink = compact(input.proposalUrl)

  return `
    <div style="font-family:Arial,sans-serif;color:#111827;line-height:1.5">
      <h2 style="margin:0 0 12px 0;">Nova proposta comercial - ${input.incorporationName}</h2>
      <p><strong>Construtora:</strong> ${developerLabel}</p>
      <p><strong>Unidade:</strong> ${input.unitCode}</p>
      <p><strong>Cliente:</strong> ${input.clientName}</p>
      <p><strong>Valor ofertado:</strong> ${money(input.offerValue)}</p>
      <p><strong>Corretor responsável:</strong> ${brokerLabel}</p>
      ${proposalLink ? `<p><a href="${proposalLink}" target="_blank" rel="noreferrer">Abrir PDF da proposta</a></p>` : ''}
      <p style="margin-top:18px;color:#6b7280;">Gerado automaticamente pelo CRM Vitrya.</p>
    </div>
  `.trim()
}
