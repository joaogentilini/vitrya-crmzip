interface FeedListing {
  id: string
  title: string | null
  description: string | null
  purpose: string | null
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
  images: string[]
}

function escapeXml(raw: string): string {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function xmlNode(tag: string, value: string | number | null | undefined): string {
  if (value === null || typeof value === 'undefined') return `<${tag} />`
  const text = String(value).trim()
  if (!text) return `<${tag} />`
  return `<${tag}>${escapeXml(text)}</${tag}>`
}

function purposeLabel(value: string | null): string | null {
  const normalized = String(value || '').trim().toLowerCase()
  if (!normalized) return null
  if (normalized === 'sale' || normalized === 'venda') return 'sale'
  if (normalized === 'rent' || normalized === 'aluguel') return 'rent'
  return normalized
}

export function buildGrupoOlxFeedXml(listings: FeedListing[]): string {
  const generatedAt = new Date().toISOString()
  const nodes = listings
    .map((listing) => {
      const imageNodes = listing.images
        .filter(Boolean)
        .slice(0, 20)
        .map((url) => xmlNode('Image', url))
        .join('')

      return [
        '<Listing>',
        xmlNode('ListingID', listing.id),
        xmlNode('Purpose', purposeLabel(listing.purpose)),
        xmlNode('Title', listing.title),
        xmlNode('Description', listing.description),
        xmlNode('SalePrice', listing.price),
        xmlNode('RentPrice', listing.rent_price),
        xmlNode('CondoFee', listing.condo_fee),
        xmlNode('City', listing.city),
        xmlNode('Neighborhood', listing.neighborhood),
        xmlNode('Address', listing.address),
        xmlNode('PostalCode', listing.postal_code),
        xmlNode('State', listing.state),
        xmlNode('AreaM2', listing.area_m2),
        xmlNode('BuiltAreaM2', listing.built_area_m2),
        xmlNode('LandAreaM2', listing.land_area_m2),
        xmlNode('Bedrooms', listing.bedrooms),
        xmlNode('Bathrooms', listing.bathrooms),
        xmlNode('Suites', listing.suites),
        xmlNode('ParkingSpots', listing.parking),
        xmlNode('CreatedAt', listing.created_at),
        xmlNode('UpdatedAt', listing.updated_at),
        `<Images>${imageNodes}</Images>`,
        '</Listing>',
      ].join('')
    })
    .join('')

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<Listings generated_at="${escapeXml(generatedAt)}">`,
    nodes,
    '</Listings>',
  ].join('')
}

export type { FeedListing }

