import 'server-only'

import type { AmenitySnapshotCategory, AmenitiesSnapshotData } from '@/lib/maps/types'

type NearbyPlaceRow = {
  place_id?: string
  name?: string
  vicinity?: string
  geometry?: {
    location?: {
      lat?: number
      lng?: number
    }
  }
}

type NearbySearchResponse = {
  status?: string
  error_message?: string
  results?: NearbyPlaceRow[]
}

type AmenityCategorySpec = {
  key: string
  label: string
  type: string
}

const AMENITY_CATEGORY_SPECS: AmenityCategorySpec[] = [
  { key: 'school', label: 'Escolas', type: 'school' },
  { key: 'supermarket', label: 'Mercados', type: 'supermarket' },
  { key: 'pharmacy', label: 'Farmácias', type: 'pharmacy' },
  { key: 'hospital', label: 'Hospitais e postos', type: 'hospital' },
  { key: 'park', label: 'Parques e áreas verdes', type: 'park' },
  { key: 'gym', label: 'Academias', type: 'gym' },
]

const MAX_TOP_PER_CATEGORY = 5

function toFiniteNumber(value: unknown): number | null {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function clampRadius(radiusM: number): number {
  if (!Number.isFinite(radiusM)) return 1000
  if (radiusM < 100) return 100
  if (radiusM > 5000) return 5000
  return Math.round(radiusM)
}

function haversineDistanceM(
  originLat: number,
  originLng: number,
  targetLat: number,
  targetLng: number
): number {
  const toRad = (value: number) => (value * Math.PI) / 180
  const dLat = toRad(targetLat - originLat)
  const dLng = toRad(targetLng - originLng)
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(originLat)) * Math.cos(toRad(targetLat)) * Math.sin(dLng / 2) * Math.sin(dLng / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return Math.round(6371000 * c)
}

function assertServerKey() {
  const key = String(process.env.GOOGLE_MAPS_SERVER_KEY || '').trim()
  if (!key) {
    throw new Error('GOOGLE_MAPS_SERVER_KEY não configurada.')
  }
  return key
}

async function fetchNearbyPlaces(params: {
  lat: number
  lng: number
  radiusM: number
  type: string
  apiKey: string
}): Promise<NearbyPlaceRow[]> {
  const query = new URLSearchParams({
    location: `${params.lat},${params.lng}`,
    radius: String(params.radiusM),
    type: params.type,
    key: params.apiKey,
    language: 'pt-BR',
    region: 'br',
  })

  const url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?${query.toString()}`
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
    },
    cache: 'no-store',
  })

  const json = (await response.json().catch(() => null)) as NearbySearchResponse | null
  if (!response.ok) {
    throw new Error(`Google Places HTTP ${response.status}`)
  }

  const status = String(json?.status || '').trim().toUpperCase()
  if (!status || status === 'ZERO_RESULTS') return []

  if (status !== 'OK') {
    const providerMessage = String(json?.error_message || '').trim()
    throw new Error(providerMessage ? `Google Places: ${providerMessage}` : `Google Places status ${status}`)
  }

  return Array.isArray(json?.results) ? json!.results! : []
}

function buildCategoryResult(params: {
  key: string
  label: string
  places: NearbyPlaceRow[]
  originLat: number
  originLng: number
}): AmenitySnapshotCategory {
  const normalized = params.places
    .map((place) => {
      const lat = toFiniteNumber(place.geometry?.location?.lat)
      const lng = toFiniteNumber(place.geometry?.location?.lng)
      const distance = lat !== null && lng !== null ? haversineDistanceM(params.originLat, params.originLng, lat, lng) : null
      return {
        name: String(place.name || '').trim(),
        place_id: String(place.place_id || '').trim() || null,
        vicinity: String(place.vicinity || '').trim() || null,
        distance_m: distance,
      }
    })
    .filter((item) => item.name.length > 0)
    .sort((a, b) => {
      if (a.distance_m === null && b.distance_m === null) return 0
      if (a.distance_m === null) return 1
      if (b.distance_m === null) return -1
      return a.distance_m - b.distance_m
    })

  return {
    key: params.key,
    label: params.label,
    count: normalized.length,
    top: normalized.slice(0, MAX_TOP_PER_CATEGORY),
  }
}

export async function buildAmenitiesSnapshot(params: {
  lat: number
  lng: number
  radiusM?: number
}): Promise<AmenitiesSnapshotData> {
  const apiKey = assertServerKey()
  const radiusM = clampRadius(params.radiusM ?? 1000)

  const results = await Promise.all(
    AMENITY_CATEGORY_SPECS.map(async (category) => {
      const places = await fetchNearbyPlaces({
        lat: params.lat,
        lng: params.lng,
        radiusM,
        type: category.type,
        apiKey,
      })

      return buildCategoryResult({
        key: category.key,
        label: category.label,
        places,
        originLat: params.lat,
        originLng: params.lng,
      })
    })
  )

  return {
    radius_m: radiusM,
    categories: results,
  }
}

