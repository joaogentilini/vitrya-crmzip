import { createHash } from 'node:crypto'

import type { PortalProvider } from './types'

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value)
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`
  }

  const entries = Object.entries(value as Record<string, unknown>)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, val]) => `${JSON.stringify(key)}:${stableStringify(val)}`)
  return `{${entries.join(',')}}`
}

function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex')
}

export interface IdempotencyInput {
  provider: PortalProvider
  eventType: string
  externalEventId: string | null
  externalLeadId: string | null
  externalConversationId: string | null
  propertyExternalId: string | null
  email: string | null
  phoneFingerprint: string | null
  messageFingerprint: string | null
  payload: unknown
}

export function buildIdempotencyKey(input: IdempotencyInput): string {
  if (input.externalEventId) {
    return `${input.provider}:event:${input.externalEventId}`
  }

  const canonical = {
    provider: input.provider,
    eventType: input.eventType,
    externalLeadId: input.externalLeadId,
    externalConversationId: input.externalConversationId,
    propertyExternalId: input.propertyExternalId,
    email: input.email,
    phoneFingerprint: input.phoneFingerprint,
    messageFingerprint: input.messageFingerprint,
    payload: input.payload,
  }

  return `${input.provider}:hash:${sha256(stableStringify(canonical))}`
}

export function buildLeadFingerprint(input: {
  provider: PortalProvider
  externalLeadId: string | null
  externalConversationId: string | null
  email: string | null
  phoneFingerprint: string | null
  propertyExternalId: string | null
  messageFingerprint: string | null
}): string {
  const canonical = {
    provider: input.provider,
    externalLeadId: input.externalLeadId,
    externalConversationId: input.externalConversationId,
    email: input.email,
    phoneFingerprint: input.phoneFingerprint,
    propertyExternalId: input.propertyExternalId,
    messageFingerprint: input.messageFingerprint,
  }
  return sha256(stableStringify(canonical))
}

