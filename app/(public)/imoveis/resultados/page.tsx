import Link from 'next/link'
import { unstable_cache } from 'next/cache'

import { createAdminClient } from '@/lib/supabase/admin'
import { createPublicClient } from '@/lib/supabase/publicServer'
import { getSignedIncorporationMediaUrlMap } from '@/lib/incorporations/media'
import { getSignedImageUrlMap } from '@/lib/media/getPublicImageUrl'

import { ThumbCarousel } from './ThumbCarousel'

export const revalidate = 60

type PublicProperty = {
  id: string
  public_code: string | null
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

type PublicPropertyMediaRow = {
  property_id: string
  url: string
  position: number | null
}

type PublicPropertyWithImages = PublicProperty & {
  imageUrls: string[]
}

type PublicResultsFilters = {
  category: string | null
  broker: string | null
  purpose: string | null
  cod: string | null
  query: string | null
  min: number | null
  max: number | null
  bedrooms: number | null
}

type PublicResultsResponse = {
  properties: PublicPropertyWithImages[]
  error: string | null
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

type PlanShowcaseItem = PlanShowcaseRow & {
  incorporation: {
    id: string
    name: string
    slug: string
    city: string | null
    neighborhood: string | null
    cover_media_path: string | null
  } | null
  imageUrl: string | null
}

const PUBLIC_PROPERTIES_SELECT =
  'id,public_code,status,purpose,title,city,neighborhood,address,price,rent_price,area_m2,bedrooms,bathrooms,parking,cover_media_url,created_at,property_category_id,property_category_name,broker_id,broker_public_name,broker_full_name'

const PUBLIC_PROPERTIES_SELECT_BASE =
  'id,public_code,status,purpose,title,city,neighborhood,address,price,rent_price,area_m2,bedrooms,bathrooms,parking,cover_media_url,created_at,property_category_id'

function fmtMoney(value: number | null): string | null {
  if (value == null) return null
  return `R$ ${Number(value).toLocaleString('pt-BR')}`
}

function asSingleRelation<T>(input: T | T[] | null | undefined): T | null {
  if (!input) return null
  if (Array.isArray(input)) return input[0] ?? null
  return input
}

function safeString(value: string | string[] | undefined) {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed || null
}

function normalizeCode(value: string | null) {
  if (!value) return null
  return value.trim().toUpperCase()
}

function safeNumber(value: string | string[] | undefined) {
  if (typeof value !== 'string') return null
  const normalized = value.trim()
  if (!normalized) return null
  const parsed = Number(normalized)
  return Number.isFinite(parsed) ? parsed : null
}

function normalizeFilters(params: { [key: string]: string | string[] | undefined }): PublicResultsFilters {
  return {
    category: safeString(params.category),
    broker: safeString(params.broker),
    purpose: safeString(params.purpose),
    cod: normalizeCode(safeString(params.cod)),
    query: safeString(params.query),
    min: safeNumber(params.min),
    max: safeNumber(params.max),
    bedrooms: safeNumber(params.bedrooms),
  }
}

function getSerializedFilters(filters: PublicResultsFilters) {
  return JSON.stringify(filters)
}

const getPublicResultsCached = unstable_cache(
  async (serializedFilters: string): Promise<PublicResultsResponse> => {
    const filters = JSON.parse(serializedFilters) as PublicResultsFilters
    const supabase = createPublicClient()

    const buildQuery = (view: 'v_public_properties_ext' | 'v_public_properties') => {
      let query = supabase
        .from(view)
        .select(view === 'v_public_properties_ext' ? PUBLIC_PROPERTIES_SELECT : PUBLIC_PROPERTIES_SELECT_BASE)

      if (filters.category) query = query.eq('property_category_id', filters.category)
      if (filters.broker && view === 'v_public_properties_ext') query = query.eq('broker_id', filters.broker)
      if (filters.purpose) query = query.eq('purpose', filters.purpose)
      if (filters.cod) query = query.eq('public_code', filters.cod)

      if (filters.query) {
        const searchTerm = `%${filters.query}%`
        query = query.or(
          `public_code.ilike.${searchTerm},city.ilike.${searchTerm},neighborhood.ilike.${searchTerm},address.ilike.${searchTerm}`
        )
      }

      if (filters.min != null) {
        if (filters.purpose === 'rent') query = query.gte('rent_price', filters.min)
        else query = query.gte('price', filters.min)
      }

      if (filters.max != null) {
        if (filters.purpose === 'rent') query = query.lte('rent_price', filters.max)
        else query = query.lte('price', filters.max)
      }

      if (filters.bedrooms != null) {
        query = query.gte('bedrooms', filters.bedrooms)
      }

      return query.order('created_at', { ascending: false })
    }

    const runQuery = async (view: 'v_public_properties_ext' | 'v_public_properties') => {
      const PAGE_SIZE = 1000
      let from = 0
      const rows: PublicProperty[] = []

      while (true) {
        const to = from + PAGE_SIZE - 1
        const pageResult = await buildQuery(view).range(from, to)
        if (pageResult.error) return pageResult

        const pageRows = ((pageResult.data || []) as unknown) as PublicProperty[]
        rows.push(...pageRows)

        if (pageRows.length < PAGE_SIZE) {
          return { data: rows, error: null }
        }

        from += PAGE_SIZE
      }
    }

    let { data, error } = await runQuery('v_public_properties_ext')
    if (error) {
      const message = String(error.message || '').toLowerCase()
      const shouldFallback =
        message.includes('does not exist') ||
        message.includes('relation') ||
        message.includes('schema cache') ||
        message.includes('view') ||
        message.includes('column')

      if (shouldFallback) {
        const baseRes = await runQuery('v_public_properties')
        data = baseRes.data
        error = baseRes.error
      }
    }

    if (error) {
      return { properties: [], error: error.message || 'Erro ao carregar resultados.' }
    }

    const properties = (data || []) as PublicProperty[]
    if (properties.length === 0) {
      return { properties: [], error: null }
    }

    const propertyIds = properties.map((property) => property.id)
    const admin = createAdminClient()

    const mediaRows: PublicPropertyMediaRow[] = []
    let mediaErrorMessage: string | null = null
    const MEDIA_CHUNK_SIZE = 200

    for (let offset = 0; offset < propertyIds.length; offset += MEDIA_CHUNK_SIZE) {
      const chunk = propertyIds.slice(offset, offset + MEDIA_CHUNK_SIZE)
      if (chunk.length === 0) continue

      const mediaChunkRes = await admin
        .from('property_media')
        .select('property_id,url,position')
        .in('property_id', chunk)
        .eq('kind', 'image')
        .order('position', { ascending: true })

      if (mediaChunkRes.error) {
        mediaErrorMessage = mediaChunkRes.error.message || 'Erro ao carregar media publica.'
        break
      }

      mediaRows.push(...(((mediaChunkRes.data || []) as unknown) as PublicPropertyMediaRow[]))
    }

    if (mediaErrorMessage) {
      console.error('Erro ao carregar media publica:', mediaErrorMessage)
    }

    const mediaByPropertyId: Record<string, PublicPropertyMediaRow[]> = {}
    for (const row of mediaRows) {
      if (!row?.property_id || !row?.url) continue
      if (!mediaByPropertyId[row.property_id]) mediaByPropertyId[row.property_id] = []
      mediaByPropertyId[row.property_id].push(row)
    }

    const selectedPathsByPropertyId = new Map<string, string[]>()
    const uniquePaths = new Set<string>()

    for (const property of properties) {
      const paths: string[] = []
      if (property.cover_media_url) paths.push(property.cover_media_url)

      for (const row of mediaByPropertyId[property.id] || []) {
        if (!paths.includes(row.url)) paths.push(row.url)
      }

      const limitedPaths = paths.slice(0, 6)
      selectedPathsByPropertyId.set(property.id, limitedPaths)
      for (const path of limitedPaths) uniquePaths.add(path)
    }

    const signedMap = await getSignedImageUrlMap(Array.from(uniquePaths))

    const propertiesWithImages = properties.map((property) => {
      const selectedPaths = selectedPathsByPropertyId.get(property.id) || []
      const imageUrls = selectedPaths
        .map((path) => signedMap.get(path) || null)
        .filter((item): item is string => Boolean(item))

      return {
        ...property,
        imageUrls,
      }
    })

    return {
      properties: propertiesWithImages,
      error: null,
    }
  },
  ['public-results-v2'],
  { revalidate: 60 }
)

const getPlanShowcaseCached = unstable_cache(
  async (): Promise<PlanShowcaseItem[]> => {
    const supabase = createPublicClient()

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

    if (planRows.length === 0) return []

    const planIds = planRows.map((plan) => plan.id)
    const { data: planMediaRows } = await supabase
      .from('incorporation_media')
      .select('plan_id,path,is_cover,position')
      .in('plan_id', planIds)
      .eq('is_public', true)
      .in('kind', ['image', 'floorplate'])
      .order('is_cover', { ascending: false })
      .order('position', { ascending: true })

    const mediaByPlanId = new Map<string, Array<{ path: string; is_cover: boolean }>>()
    for (const row of (planMediaRows || []) as Array<{ plan_id: string | null; path: string; is_cover: boolean }>) {
      if (!row.plan_id || !row.path) continue
      mediaByPlanId.set(row.plan_id, [...(mediaByPlanId.get(row.plan_id) || []), { path: row.path, is_cover: row.is_cover }])
    }

    const seen = new Set<string>()
    const dedupedPlans = planRows.filter((plan) => {
      if (seen.has(plan.id)) return false
      seen.add(plan.id)
      return true
    })

    const preferredPathByPlanId = new Map<string, string | null>()
    for (const plan of dedupedPlans) {
      const incorporation = asSingleRelation(plan.incorporations)
      const ownMedia = mediaByPlanId.get(plan.id) || []
      const preferredPath =
        ownMedia.find((item) => item.is_cover)?.path ||
        ownMedia[0]?.path ||
        incorporation?.cover_media_path ||
        null
      preferredPathByPlanId.set(plan.id, preferredPath)
    }

    const signedPathMap = await getSignedIncorporationMediaUrlMap(
      Array.from(preferredPathByPlanId.values())
    )

    return dedupedPlans.map((plan) => {
      const incorporation = asSingleRelation(plan.incorporations)
      const preferredPath = preferredPathByPlanId.get(plan.id) || null
      const imageUrl = preferredPath ? signedPathMap.get(preferredPath) || null : null

      return {
        ...plan,
        incorporation,
        imageUrl,
      }
    })
  },
  ['public-results-plans-v1'],
  { revalidate: 300 }
)

export default async function PublicResultsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const params = await searchParams
  const filters = normalizeFilters(params)

  const [results, planShowcase] = await Promise.all([
    getPublicResultsCached(getSerializedFilters(filters)),
    getPlanShowcaseCached(),
  ])

  if (results.error) {
    return (
      <div className="pv-container">
        <div className="pv-glass">
          <h1 style={{ marginTop: 0 }}>Erro</h1>
          <pre style={{ color: 'crimson', margin: 0 }}>{results.error}</pre>
        </div>
      </div>
    )
  }

  const propertiesWithImages = results.properties

  return (
    <div className="pv-container">
      <div className="pv-glass">
        <div style={{ marginBottom: '1.5rem' }}>
          <Link href="/imoveis" style={{ color: 'var(--cobalt)', textDecoration: 'none', fontWeight: 800 }}>
            Voltar para busca
          </Link>

          <h1 style={{ marginTop: '0.9rem', marginBottom: 0 }}>
            Imóveis {propertiesWithImages.length > 0 ? `(${propertiesWithImages.length} encontrados)` : ''}
          </h1>
        </div>

        {propertiesWithImages.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '2.5rem 1rem' }}>
            <h2 style={{ marginTop: 0 }}>Nenhum imóvel encontrado</h2>
            <p style={{ margin: '0.5rem 0 1rem', opacity: 0.8 }}>Tente ajustar os filtros de busca.</p>
            <Link href="/imoveis" style={{ color: 'var(--cobalt)', fontWeight: 800 }}>
              Voltar para busca
            </Link>
          </div>
        ) : (
          <section className="pv-grid">
            {propertiesWithImages.map((property, index) => {
              const location =
                [property.neighborhood, property.city].filter(Boolean).join(' / ') ||
                property.address ||
                'Localização não informada'

              const brokerName = property.broker_public_name || property.broker_full_name || null
              const price = property.purpose === 'rent' ? fmtMoney(property.rent_price) : fmtMoney(property.price)

              return (
                <Link key={property.id} href={`/imoveis/${property.id}`} className="pv-card">
                  <div className="pv-thumb" style={{ position: 'relative' }}>
                    {property.imageUrls.length > 1 ? (
                      <ThumbCarousel
                        images={property.imageUrls}
                        alt={property.title ?? 'Imóvel'}
                        priority={index < 3}
                      />
                    ) : property.imageUrls.length === 1 ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={property.imageUrls[0]}
                        alt={property.title ?? 'Imóvel'}
                        className="pv-thumb-img"
                        loading={index < 3 ? 'eager' : 'lazy'}
                        fetchPriority={index < 3 ? 'high' : 'low'}
                        decoding="async"
                      />
                    ) : (
                      <span>Sem foto</span>
                    )}
                  </div>

                  <div className="pv-cardbody">
                    <h3 className="pv-cardtitle">{property.title ?? 'Imóvel'}</h3>
                    {property.public_code ? (
                      <div className="pv-cardmeta" style={{ fontWeight: 700 }}>
                        Cód: {property.public_code}
                      </div>
                    ) : null}

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
                          ? 'Locação'
                          : property.purpose}
                      </div>
                    </div>

                    <div className="pv-pricerow" style={{ marginTop: 8 }}>
                      {property.area_m2 != null ? <span className="pv-muted">{property.area_m2} m²</span> : null}
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

        {propertiesWithImages.length > 0 ? (
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
                          <img src={plan.imageUrl} alt={plan.name} className="pv-thumb-img" loading="lazy" decoding="async" />
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
                          {plan.area_m2 != null ? <span className="pv-muted">{plan.area_m2} m²</span> : null}
                          {plan.rooms_count != null ? <span className="pv-muted">{plan.rooms_count} cômodos</span> : null}
                          {plan.bedrooms != null ? <span className="pv-muted">{plan.bedrooms} quartos</span> : null}
                          {plan.suites != null ? <span className="pv-muted">{plan.suites} suítes</span> : null}
                        </div>
                      </div>
                    </Link>
                  )
                })}
              </div>
            )}
          </section>
        ) : null}
      </div>
    </div>
  )
}

