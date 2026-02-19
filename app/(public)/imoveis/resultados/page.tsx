import Link from 'next/link'

import { createAdminClient } from '@/lib/supabase/admin'
import { createPublicClient } from '@/lib/supabase/publicServer'
import { getSignedIncorporationMediaUrl } from '@/lib/incorporations/media'
import { getSignedImageUrl } from '@/lib/media/getPublicImageUrl'

import { ThumbCarousel } from './ThumbCarousel'

export const dynamic = 'force-dynamic'

type PublicProperty = {
  id: string
  status: string
  purpose: 'sale' | 'rent' | string
  title: string | null
  city: string | null
  neighborhood: string | null
  address: string | null
  price: number | null
  rent_price: number | null
  area_m2: number | null
  bedrooms: number | null
  bathrooms: number | null
  parking: number | null
  cover_media_url: string | null
  created_at: string
  property_category_id?: string | null
  property_category_name?: string | null
  broker_id?: string | null
  broker_public_name?: string | null
  broker_full_name?: string | null
}

type MediaRow = {
  property_id: string
  url: string
  kind: 'image' | 'video' | string
  position: number | null
}

type PublicPropertyWithImages = PublicProperty & {
  imageUrls: string[]
}

type PlanShowcaseRow = {
  id: string
  incorporation_id: string
  name: string
  area_m2: number | null
  rooms_count: number | null
  bedrooms: number | null
  suites: number | null
  parking: number | null
  price_from: number | null
  incorporations:
    | {
        id: string
        name: string
        slug: string
        city: string | null
        neighborhood: string | null
        cover_media_path: string | null
      }
    | Array<{
        id: string
        name: string
        slug: string
        city: string | null
        neighborhood: string | null
        cover_media_path: string | null
      }>
    | null
}

function fmtMoney(value: number | null): string | null {
  if (value == null) return null
  return `R$ ${Number(value).toLocaleString('pt-BR')}`
}

function isHttpUrl(value: string) {
  return /^https?:\/\//i.test(value)
}

async function resolvePropertyMediaUrl(raw: string | null | undefined) {
  const value = String(raw || '').trim()
  if (!value) return null
  if (isHttpUrl(value)) return value
  try {
    return await getSignedImageUrl(value)
  } catch {
    return null
  }
}

function asSingleRelation<T>(input: T | T[] | null | undefined): T | null {
  if (!input) return null
  if (Array.isArray(input)) return input[0] ?? null
  return input
}

export default async function PublicResultsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const params = await searchParams
  const supabase = createPublicClient()

  let query = supabase.from('v_public_properties_ext').select('*').eq('status', 'active')

  const category = typeof params.category === 'string' ? params.category : undefined
  if (category) query = query.eq('property_category_id', category)

  const broker = typeof params.broker === 'string' ? params.broker : undefined
  if (broker) query = query.eq('broker_id', broker)

  if (params.purpose && typeof params.purpose === 'string') {
    query = query.eq('purpose', params.purpose)
  }

  if (params.query && typeof params.query === 'string') {
    const searchTerm = `%${params.query}%`
    query = query.or(`city.ilike.${searchTerm},neighborhood.ilike.${searchTerm},address.ilike.${searchTerm}`)
  }

  if (params.min && typeof params.min === 'string') {
    const minPrice = Number.parseFloat(params.min)
    if (!Number.isNaN(minPrice)) {
      if (params.purpose === 'rent') query = query.gte('rent_price', minPrice)
      else query = query.gte('price', minPrice)
    }
  }

  if (params.max && typeof params.max === 'string') {
    const maxPrice = Number.parseFloat(params.max)
    if (!Number.isNaN(maxPrice)) {
      if (params.purpose === 'rent') query = query.lte('rent_price', maxPrice)
      else query = query.lte('price', maxPrice)
    }
  }

  if (params.bedrooms && typeof params.bedrooms === 'string') {
    const minBedrooms = Number.parseInt(params.bedrooms, 10)
    if (!Number.isNaN(minBedrooms)) query = query.gte('bedrooms', minBedrooms)
  }

  const { data, error } = await query.order('created_at', { ascending: false })
  if (error) {
    return (
      <div className="pv-container">
        <div className="pv-glass">
          <h1 style={{ marginTop: 0 }}>Erro</h1>
          <pre style={{ color: 'crimson', margin: 0 }}>{JSON.stringify(error, null, 2)}</pre>
        </div>
      </div>
    )
  }

  const properties = (data || []) as PublicProperty[]
  const propertyIds = properties.map((property) => property.id)

  let mediaByPropertyId: Record<string, MediaRow[]> = {}
  if (propertyIds.length > 0) {
    const { data: mediaRows, error: mediaError } = await supabase
      .from('property_media')
      .select('property_id,url,kind,position')
      .in('property_id', propertyIds)
      .eq('kind', 'image')
      .order('position', { ascending: true })

    let effectiveRows = (mediaRows || []) as MediaRow[]
    if (effectiveRows.length === 0) {
      const admin = createAdminClient()
      const { data: adminRows, error: adminError } = await admin
        .from('property_media')
        .select('property_id,url,kind,position')
        .in('property_id', propertyIds)
        .eq('kind', 'image')
        .order('position', { ascending: true })

      if (adminError) {
        if (mediaError) console.error('public media query error', mediaError)
        console.error('admin media fallback error', adminError)
      } else {
        effectiveRows = (adminRows || []) as MediaRow[]
      }
    }

    for (const row of effectiveRows) {
      if (!mediaByPropertyId[row.property_id]) mediaByPropertyId[row.property_id] = []
      mediaByPropertyId[row.property_id].push(row)
    }
  }

  const propertiesWithImages: PublicPropertyWithImages[] = await Promise.all(
    properties.map(async (property) => {
      const coverUrl = await resolvePropertyMediaUrl(property.cover_media_url)
      const mediaRows = mediaByPropertyId[property.id] || []
      const mediaPaths = mediaRows.map((item) => item.url).filter(Boolean)

      const uniquePaths: string[] = []
      if (property.cover_media_url) uniquePaths.push(property.cover_media_url)
      for (const path of mediaPaths) {
        if (!uniquePaths.includes(path)) uniquePaths.push(path)
      }

      const limitedPaths = uniquePaths.slice(0, 6)
      const signedUrls = await Promise.all(
        limitedPaths.map(async (path) => resolvePropertyMediaUrl(path))
      )
      const imageUrls = signedUrls.filter(Boolean) as string[]

      return {
        ...property,
        imageUrls: imageUrls.length > 0 ? imageUrls : coverUrl ? [coverUrl] : [],
      }
    })
  )

  let planRows: PlanShowcaseRow[] = []
  const plansPrimary = await supabase
    .from('incorporation_plans')
    .select('id,incorporation_id,name,area_m2,rooms_count,bedrooms,suites,parking,price_from,incorporations!inner(id,name,slug,city,neighborhood,cover_media_path)')
    .eq('is_active', true)
    .eq('incorporations.is_active', true)
    .order('created_at', { ascending: false })
    .limit(12)

  if (plansPrimary.error) {
    const plansFallback = await supabase
      .from('incorporation_plans')
      .select('id,incorporation_id,name,area_m2,bedrooms,suites,parking,price_from,incorporations!inner(id,name,slug,city,neighborhood,cover_media_path)')
      .eq('is_active', true)
      .eq('incorporations.is_active', true)
      .order('created_at', { ascending: false })
      .limit(12)

    planRows = ((plansFallback.data || []) as Array<Omit<PlanShowcaseRow, 'rooms_count'>>).map(
      (row) => ({ ...row, rooms_count: null })
    )
  } else {
    planRows = (plansPrimary.data || []) as PlanShowcaseRow[]
  }

  const planIds = planRows.map((plan) => plan.id)
  const { data: planMediaRows } =
    planIds.length > 0
      ? await supabase
          .from('incorporation_media')
          .select('plan_id,path,is_cover,position')
          .in('plan_id', planIds)
          .eq('is_public', true)
          .in('kind', ['image', 'floorplate'])
          .order('is_cover', { ascending: false })
          .order('position', { ascending: true })
      : { data: [] as Array<{ plan_id: string | null; path: string; is_cover: boolean; position: number | null }> }

  const mediaByPlanId = new Map<string, Array<{ path: string; is_cover: boolean }>>()
  for (const row of (planMediaRows || []) as Array<{ plan_id: string | null; path: string; is_cover: boolean }>) {
    if (!row.plan_id) continue
    mediaByPlanId.set(row.plan_id, [...(mediaByPlanId.get(row.plan_id) || []), { path: row.path, is_cover: row.is_cover }])
  }

  const uniquePlans = (() => {
    const seen = new Set<string>()
    const deduped: PlanShowcaseRow[] = []
    for (const plan of planRows) {
      if (seen.has(plan.id)) continue
      seen.add(plan.id)
      deduped.push(plan)
    }
    return deduped
  })()

  const planShowcase = await Promise.all(
    uniquePlans.map(async (plan) => {
      const incorporation = asSingleRelation(plan.incorporations)
      const ownMedia = mediaByPlanId.get(plan.id) || []
      const preferredPath =
        ownMedia.find((item) => item.is_cover)?.path ||
        ownMedia[0]?.path ||
        incorporation?.cover_media_path ||
        null
      const imageUrl = await getSignedIncorporationMediaUrl(preferredPath)
      return {
        ...plan,
        incorporation,
        imageUrl,
      }
    })
  )

  return (
    <div className="pv-container">
      <div className="pv-glass">
        <div style={{ marginBottom: '1.5rem' }}>
          <Link href="/imóveis" style={{ color: 'var(--cobalt)', textDecoration: 'none', fontWeight: 800 }}>
            ← Voltar para busca
          </Link>

          <h1 style={{ marginTop: '0.9rem', marginBottom: 0 }}>
            Imóveis {propertiesWithImages.length > 0 ? `(${propertiesWithImages.length} encontrados)` : ''}
          </h1>
        </div>

        {propertiesWithImages.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '2.5rem 1rem' }}>
            <h2 style={{ marginTop: 0 }}>Nenhum imóvel encontrado</h2>
            <p style={{ margin: '0.5rem 0 1rem', opacity: 0.8 }}>
              Tente ajustar os filtros de busca.
            </p>
            <Link href="/imóveis" style={{ color: 'var(--cobalt)', fontWeight: 800 }}>
              Voltar para busca
            </Link>
          </div>
        ) : (
          <section className="pv-grid">
            {propertiesWithImages.map((property) => {
              const location =
                [property.neighborhood, property.city].filter(Boolean).join(' / ') ||
                property.address ||
                'Localizacao não informada'

              const brokerName =
                property.broker_public_name || property.broker_full_name || null
              const price =
                property.purpose === 'rent'
                  ? fmtMoney(property.rent_price)
                  : fmtMoney(property.price)

              return (
                <Link key={property.id} href={`/imóveis/${property.id}`} className="pv-card">
                  <div className="pv-thumb" style={{ position: 'relative' }}>
                    {property.imageUrls.length ? (
                      <ThumbCarousel images={property.imageUrls} alt={property.title ?? 'Imóvel'} />
                    ) : (
                      <span>Sem foto</span>
                    )}
                  </div>

                  <div className="pv-cardbody">
                    <h3 className="pv-cardtitle">{property.title ?? 'Imóvel'}</h3>

                    {property.property_category_name ? (
                      <div className="pv-cardmeta" style={{ opacity: 0.85 }}>
                        {property.property_category_name}
                      </div>
                    ) : null}
                    <div className="pv-cardmeta">{location}</div>
                    {brokerName ? (
                      <div className="pv-cardmeta" style={{ opacity: 0.85 }}>
                        Corretor: {brokerName}
                      </div>
                    ) : null}

                    <div className="pv-pricerow">
                      {price ? <div className="pv-price">{price}</div> : null}
                      <div className="pv-muted">
                        {property.purpose === 'sale'
                          ? 'Venda'
                          : property.purpose === 'rent'
                          ? 'Locacao'
                          : property.purpose}
                      </div>
                    </div>

                    <div className="pv-pricerow" style={{ marginTop: 8 }}>
                      {property.area_m2 != null ? <span className="pv-muted">{property.area_m2} m2</span> : null}
                      {property.bedrooms != null ? <span className="pv-muted">{property.bedrooms} quartos</span> : null}
                      {property.bathrooms != null ? <span className="pv-muted">{property.bathrooms} banheiros</span> : null}
                      {property.parking != null ? <span className="pv-muted">{property.parking} vagas</span> : null}
                    </div>
                  </div>
                </Link>
              )
            })}
          </section>
        )}

        <section style={{ marginTop: '2rem' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <h2 style={{ margin: 0 }}>Tipologias de empreendimentos</h2>
            <Link href="/empreendimentos" style={{ color: 'var(--cobalt)', fontWeight: 800, textDecoration: 'none' }}>
              Ver empreendimentos
            </Link>
          </div>
          <p style={{ marginTop: 6, opacity: 0.8, fontSize: 14 }}>
            Plantas e tipologias divulgadas junto da vitrine de imóveis.
          </p>

          {planShowcase.length === 0 ? (
            <div style={{ marginTop: 10, opacity: 0.75 }}>Nenhuma tipologia ativa para exibição.</div>
          ) : (
            <div className="pv-grid" style={{ marginTop: 14 }}>
              {planShowcase.map((plan) => {
                const incorporation = plan.incorporation
                const location = [incorporation?.neighborhood, incorporation?.city].filter(Boolean).join(' / ') || '-'
                return (
                  <Link key={plan.id} href={incorporation ? `/empreendimentos/${incorporation.slug}` : '/empreendimentos'} className="pv-card">
                    <div className="pv-thumb">
                      {plan.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={plan.imageUrl} alt={plan.name} className="pv-thumb-img" />
                      ) : (
                        <span>Sem imagem</span>
                      )}
                    </div>
                    <div className="pv-cardbody">
                      <h3 className="pv-cardtitle">{plan.name}</h3>
                      <div className="pv-cardmeta">{incorporation?.name || 'Empreendimento'}</div>
                      <div className="pv-cardmeta">{location}</div>
                      <div className="pv-pricerow">
                        {plan.price_from != null ? <div className="pv-price">{fmtMoney(plan.price_from)}</div> : null}
                        <div className="pv-muted">Tipologia</div>
                      </div>
                      <div className="pv-pricerow" style={{ marginTop: 8 }}>
                        {plan.area_m2 != null ? <span className="pv-muted">{plan.area_m2} m2</span> : null}
                        {plan.rooms_count != null ? <span className="pv-muted">{plan.rooms_count} comodos</span> : null}
                        {plan.bedrooms != null ? <span className="pv-muted">{plan.bedrooms} quartos</span> : null}
                        {plan.suites != null ? <span className="pv-muted">{plan.suites} suites</span> : null}
                      </div>
                    </div>
                  </Link>
                )
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
