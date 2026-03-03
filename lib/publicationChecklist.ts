type UnknownRecord = Record<string, unknown>

function hasNonEmptyText(value: unknown): boolean {
  return typeof value === 'string' && value.trim().length > 0
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const normalized = value.trim().replace(',', '.')
    if (!normalized) return null
    const parsed = Number(normalized)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

function hasOwnKey(input: unknown, key: string): boolean {
  return Boolean(input && typeof input === 'object' && Object.prototype.hasOwnProperty.call(input as UnknownRecord, key))
}

export type PublicVisibilityInput = {
  mediaCount: number
  city: unknown
  neighborhood: unknown
  address?: unknown
  latitude?: unknown
  longitude?: unknown
  requireAddressLine?: boolean
  requireCoordinates?: boolean
}

export type PublicVisibilityResult = {
  mediaOk: boolean
  cityOk: boolean
  neighborhoodOk: boolean
  addressOk: boolean
  coordinatesOk: boolean
  locationOk: boolean
  publicReady: boolean
  missing: string[]
}

export function evaluatePublicVisibility(input: PublicVisibilityInput): PublicVisibilityResult {
  const requireAddressLine = input.requireAddressLine !== false
  const requireCoordinates = input.requireCoordinates !== false

  const mediaOk = input.mediaCount > 0
  const cityOk = hasNonEmptyText(input.city)
  const neighborhoodOk = hasNonEmptyText(input.neighborhood)
  const addressOk = hasNonEmptyText(input.address)

  const latitude = toFiniteNumber(input.latitude)
  const longitude = toFiniteNumber(input.longitude)
  const coordinatesOk =
    latitude !== null &&
    longitude !== null &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180

  const locationOk =
    cityOk &&
    neighborhoodOk &&
    (!requireAddressLine || addressOk) &&
    (!requireCoordinates || coordinatesOk)

  const missing: string[] = []
  if (!mediaOk) missing.push('Adicionar ao menos 1 imagem para publicacao.')

  if (!cityOk || !neighborhoodOk || (requireAddressLine && !addressOk)) {
    missing.push(
      requireAddressLine
        ? 'Preencher cidade, bairro e endereco completo.'
        : 'Preencher cidade e bairro.'
    )
  }

  if (requireCoordinates && !coordinatesOk) {
    missing.push('Definir latitude e longitude validas no mapa.')
  }

  return {
    mediaOk,
    cityOk,
    neighborhoodOk,
    addressOk,
    coordinatesOk,
    locationOk,
    publicReady: mediaOk && locationOk,
    missing,
  }
}

export type PublicationChecklistInput = PublicVisibilityInput & {
  hasAuthorization: boolean
  authorizationReason?: string | null
}

export type PublicationChecklistResult = PublicVisibilityResult & {
  authorizationOk: boolean
  canPublish: boolean
  publishMissing: string[]
}

export function evaluatePublicationChecklist(
  input: PublicationChecklistInput
): PublicationChecklistResult {
  const visibility = evaluatePublicVisibility(input)
  const authorizationOk = Boolean(input.hasAuthorization)

  const publishMissing = [...visibility.missing]
  if (!authorizationOk) {
    publishMissing.push(
      input.authorizationReason?.trim() || 'Autorizacao digital assinada e obrigatoria para publicar.'
    )
  }

  return {
    ...visibility,
    authorizationOk,
    canPublish: visibility.publicReady && authorizationOk,
    publishMissing,
  }
}

export function shouldRequireStreetAddressFromRow(row: unknown): boolean {
  return hasOwnKey(row, 'address')
}

export function shouldRequireCoordinatesFromRow(row: unknown): boolean {
  return hasOwnKey(row, 'latitude') || hasOwnKey(row, 'longitude')
}

type TestListingInput = {
  title?: unknown
  description?: unknown
  publicCode?: unknown
}

function normalizeText(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : ''
}

const TEST_KEYWORDS = [
  'teste',
  'aprovacao',
  'homolog',
  'dummy',
  'mock',
  'fake',
  'sample',
  'sandbox',
  'rascunho',
]

export function isLikelyTestListing(input: TestListingInput): boolean {
  const title = normalizeText(input.title)
  const description = normalizeText(input.description)
  const publicCode = normalizeText(input.publicCode)
  const merged = `${title} ${description} ${publicCode}`.trim()
  if (!merged) return false
  return TEST_KEYWORDS.some((keyword) => merged.includes(keyword))
}
