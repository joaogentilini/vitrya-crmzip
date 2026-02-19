import { NextResponse } from 'next/server'

import { createAdminClient } from '@/lib/supabase/admin'
import { buildGrupoOlxFeedXml, type FeedListing } from '@/lib/integrations/portals/grupoolxFeedXml'
import { isPortalIntegrationsEnabled, isValidQueryToken } from '@/lib/integrations/portals/security'

export const runtime = 'nodejs'

type PropertyRow = {
  id: string
  status: string | null
  purpose: string | null
  title: string | null
  description: string | null
  price: number | null
  rent_price: number | null
  condo_fee: number | null
  city: string | null
  neighborhood: string | null
  address: string | null
  postal_code: string | null
  state: string | null
  area_m2: number | null
  built_area_m2: number | null
  land_area_m2: number | null
  bedrooms: number | null
  bathrooms: number | null
  suites: number | null
  parking: number | null
  created_at: string | null
  updated_at: string | null
  cover_media_url: string | null
}

type MediaRow = {
  property_id: string
  url: string | null
  kind: string | null
}

type ListingRow = {
  property_id: string
  status: string | null
}

function isHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value)
}

async function resolveImageUrl(
  admin: ReturnType<typeof createAdminClient>,
  cache: Map<string, string | null>,
  rawValue: string | null | undefined
): Promise<string | null> {
  const path = String(rawValue || '').trim()
  if (!path) return null
  if (isHttpUrl(path)) return path
  if (cache.has(path)) return cache.get(path) ?? null

  const signed = await admin.storage.from('property-media').createSignedUrl(path, 60 * 60 * 24)
  const signedUrl = signed.error ? null : signed.data?.signedUrl ?? null
  cache.set(path, signedUrl)
  return signedUrl
}

export async function GET(request: Request) {
  if (!isPortalIntegrationsEnabled()) {
    return NextResponse.json(
      { ok: false, error: 'PORTAL_INTEGRATIONS_ENABLED desabilitado.' },
      { status: 503 }
    )
  }

  const expectedToken = process.env.GRUPO_OLX_FEED_TOKEN
  if (!isValidQueryToken(request, expectedToken, 'token')) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient()

  const propertiesRes = await admin
    .from('properties')
    .select(
      'id,status,purpose,title,description,price,rent_price,condo_fee,city,neighborhood,address,postal_code,state,area_m2,built_area_m2,land_area_m2,bedrooms,bathrooms,suites,parking,created_at,updated_at,cover_media_url'
    )
    .eq('status', 'active')
    .order('updated_at', { ascending: false })

  if (propertiesRes.error) {
    return NextResponse.json(
      { ok: false, error: propertiesRes.error.message || 'Erro ao carregar imóveis para feed.' },
      { status: 500 }
    )
  }

  const properties = (propertiesRes.data || []) as PropertyRow[]
  const propertyIds = properties.map((row) => row.id)

  const [mediaRes, listingsRes] = await Promise.all([
    propertyIds.length
      ? admin
          .from('property_media')
          .select('property_id,url,kind,position')
          .in('property_id', propertyIds)
          .eq('kind', 'image')
          .order('position', { ascending: true })
      : Promise.resolve({ data: [], error: null }),
    propertyIds.length
      ? admin
          .from('property_portal_listings')
          .select('property_id,status')
          .eq('provider', 'grupoolx')
          .in('property_id', propertyIds)
      : Promise.resolve({ data: [], error: null }),
  ])

  if (mediaRes.error) {
    return NextResponse.json({ ok: false, error: mediaRes.error.message || 'Erro ao carregar mídias.' }, { status: 500 })
  }

  if (listingsRes.error) {
    return NextResponse.json(
      { ok: false, error: listingsRes.error.message || 'Erro ao carregar estado de publicação.' },
      { status: 500 }
    )
  }

  const mediaRows = (mediaRes.data || []) as MediaRow[]
  const listingRows = (listingsRes.data || []) as ListingRow[]

  const listingStatusByProperty = new Map<string, string | null>()
  for (const row of listingRows) {
    listingStatusByProperty.set(row.property_id, row.status)
  }

  const mediaByProperty = new Map<string, string[]>()
  for (const row of mediaRows) {
    if (!row.property_id || !row.url) continue
    const existing = mediaByProperty.get(row.property_id) || []
    existing.push(row.url)
    mediaByProperty.set(row.property_id, existing)
  }

  const signedCache = new Map<string, string | null>()
  const listings: FeedListing[] = []

  for (const property of properties) {
    const listingStatus = String(listingStatusByProperty.get(property.id) || '').toLowerCase()
    if (listingStatus === 'unpublished') continue

    const rawImages = [...(mediaByProperty.get(property.id) || [])]
    if (property.cover_media_url) rawImages.unshift(property.cover_media_url)

    const uniqueRawImages = Array.from(new Set(rawImages)).slice(0, 20)
    const resolvedImages = (
      await Promise.all(uniqueRawImages.map((item) => resolveImageUrl(admin, signedCache, item)))
    ).filter((item): item is string => Boolean(item))

    listings.push({
      id: property.id,
      title: property.title,
      description: property.description,
      purpose: property.purpose,
      price: property.price,
      rent_price: property.rent_price,
      condo_fee: property.condo_fee,
      city: property.city,
      neighborhood: property.neighborhood,
      address: property.address,
      postal_code: property.postal_code,
      state: property.state,
      area_m2: property.area_m2,
      built_area_m2: property.built_area_m2,
      land_area_m2: property.land_area_m2,
      bedrooms: property.bedrooms,
      bathrooms: property.bathrooms,
      suites: property.suites,
      parking: property.parking,
      created_at: property.created_at,
      updated_at: property.updated_at,
      images: resolvedImages,
    })
  }

  const xml = buildGrupoOlxFeedXml(listings)
  return new Response(xml, {
    status: 200,
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'no-store, max-age=0',
    },
  })
}

