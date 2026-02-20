export const AUTHORIZATION_TEMPLATE_CODES = ['AUT_VENDA_V1', 'AUT_GESTAO_V1'] as const

type AuthorizationSnapshot = {
  registry_number: string | null
  full_address: string | null
  sale_price: number | null
  commission_percent: number | null
  authorization_started_at: string | null
  authorization_expires_at: string | null
  authorization_is_exclusive: boolean
}

function toCompactString(value: unknown): string | null {
  if (value === null || value === undefined) return null
  const text = String(value).trim()
  return text || null
}

function toIsoDateString(value: unknown): string | null {
  const text = toCompactString(value)
  if (!text) return null
  const parsed = new Date(text)
  if (Number.isNaN(parsed.getTime())) return text
  return parsed.toISOString()
}

function toNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const normalized = value.trim().replace(',', '.')
    const parsed = Number(normalized)
    if (Number.isFinite(parsed)) return parsed
  }
  return null
}

function normalizeAddress(input: {
  address?: unknown
  address_number?: unknown
  address_complement?: unknown
  neighborhood?: unknown
  city?: unknown
  state?: unknown
  postal_code?: unknown
}): string | null {
  const parts = [
    toCompactString(input.address),
    toCompactString(input.address_number),
    toCompactString(input.address_complement),
    toCompactString(input.neighborhood),
    toCompactString(input.city),
    toCompactString(input.state),
    toCompactString(input.postal_code),
  ].filter(Boolean)

  if (parts.length === 0) return null
  return parts.join(', ')
}

export function buildAuthorizationSnapshot(input: {
  registry_number?: unknown
  address?: unknown
  address_number?: unknown
  address_complement?: unknown
  neighborhood?: unknown
  city?: unknown
  state?: unknown
  postal_code?: unknown
  sale_price?: unknown
  commission_percent?: unknown
  authorization_started_at?: unknown
  authorization_expires_at?: unknown
  authorization_is_exclusive?: unknown
}): AuthorizationSnapshot {
  return {
    registry_number: toCompactString(input.registry_number),
    full_address: normalizeAddress(input),
    sale_price: toNumber(input.sale_price),
    commission_percent: toNumber(input.commission_percent),
    authorization_started_at: toIsoDateString(input.authorization_started_at),
    authorization_expires_at: toIsoDateString(input.authorization_expires_at),
    authorization_is_exclusive: Boolean(input.authorization_is_exclusive),
  }
}

export function hasAuthorizationSnapshotMismatch(input: {
  snapshot: unknown
  current: AuthorizationSnapshot
}): boolean {
  if (!input.snapshot || typeof input.snapshot !== 'object' || Array.isArray(input.snapshot)) return true
  const snapshot = input.snapshot as Record<string, unknown>

  const expected = buildAuthorizationSnapshot({
    registry_number: snapshot.registry_number,
    address: snapshot.full_address,
    sale_price: snapshot.sale_price,
    commission_percent: snapshot.commission_percent,
    authorization_started_at: snapshot.authorization_started_at,
    authorization_expires_at: snapshot.authorization_expires_at,
    authorization_is_exclusive: snapshot.authorization_is_exclusive,
  })

  const current = input.current

  if ((expected.registry_number || '') !== (current.registry_number || '')) return true
  if ((expected.full_address || '') !== (current.full_address || '')) return true
  if ((expected.sale_price ?? null) !== (current.sale_price ?? null)) return true
  if ((expected.commission_percent ?? null) !== (current.commission_percent ?? null)) return true
  if ((expected.authorization_started_at || '') !== (current.authorization_started_at || '')) return true
  if ((expected.authorization_expires_at || '') !== (current.authorization_expires_at || '')) return true
  if (Boolean(expected.authorization_is_exclusive) !== Boolean(current.authorization_is_exclusive)) return true

  return false
}

export function isDigitalAuthorizationRequired(): boolean {
  const raw = String(process.env.PROPERTY_PUBLISH_REQUIRE_DIGITAL_AUTHORIZATION || '').trim().toLowerCase()
  if (!raw) return true
  return raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on'
}

