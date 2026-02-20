import Link from 'next/link'
import { notFound } from 'next/navigation'

import { Badge } from '@/components/ui/Badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { getSignedIncorporationMediaUrl } from '@/lib/incorporations/media'
import { createPublicClient } from '@/lib/supabase/publicServer'
import { buildWhatsAppLink, sanitizePhone } from '@/lib/whatsapp'

export const dynamic = 'force-dynamic'
export const revalidate = 0

type DeveloperRelation = {
  name: string
}

type IncorporationRow = {
  id: string
  slug: string
  name: string
  headline: string | null
  description: string | null
  city: string | null
  neighborhood: string | null
  state: string | null
  address: string | null
  status: string
  launch_date: string | null
  delivery_date: string | null
  cover_media_path: string | null
  developers: DeveloperRelation | DeveloperRelation[] | null
}

type PlanRow = {
  id: string
  name: string
  rooms_count: number | null
  bedrooms: number | null
  suites: number | null
  parking: number | null
  area_m2: number | null
  description: string | null
  price_from: number | null
}

type MediaRow = {
  id: string
  plan_id: string | null
  media_scope: string | null
  title: string | null
  kind: string
  path: string
  is_cover: boolean
}

type FeatureCatalogRow = {
  id: string
  label_pt: string
  type: string
}

type FeatureValueRow = {
  feature_id: string
  value_boolean: boolean | null
  value_number: number | null
  value_text: string | null
  value_json: unknown | null
}

function asSingleRelation<T>(input: T | T[] | null | undefined): T | null {
  if (!input) return null
  if (Array.isArray(input)) return input[0] ?? null
  return input
}

function formatCurrency(value: number | null | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '-'
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 0,
  }).format(value)
}

function formatDate(value: string | null | undefined): string {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '-'
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium' }).format(date)
}

function featureValueToText(featureType: string, value: FeatureValueRow): string | null {
  if (featureType === 'boolean') return value.value_boolean ? 'Sim' : null
  if (featureType === 'number') {
    if (typeof value.value_number !== 'number' || !Number.isFinite(value.value_number)) return null
    return new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(value.value_number)
  }
  if (featureType === 'multi_enum') {
    if (!Array.isArray(value.value_json) || value.value_json.length === 0) return null
    return value.value_json.map((item) => String(item)).join(', ')
  }
  if (typeof value.value_text === 'string' && value.value_text.trim()) return value.value_text.trim()
  return null
}

export default async function PublicIncorporationDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const supabase = createPublicClient()

  const incorporationRes = await supabase
    .from('incorporations')
    .select(
      `
      id,
      slug,
      name,
      headline,
      description,
      city,
      neighborhood,
      state,
      address,
      status,
      launch_date,
      delivery_date,
      cover_media_path,
      developers ( name )
    `
    )
    .eq('slug', slug)
    .eq('is_active', true)
    .maybeSingle()

  if (incorporationRes.error) {
    return (
      <main className="mx-auto w-full max-w-5xl px-4 py-8">
        <p className="text-sm text-[var(--destructive)]">Erro ao carregar empreendimento: {incorporationRes.error.message}</p>
      </main>
    )
  }

  const incorporation = incorporationRes.data as IncorporationRow | null
  if (!incorporation) return notFound()

  const [plansPrimaryRes, mediaRes, featureValuesRes] = await Promise.all([
    supabase
      .from('incorporation_plans')
      .select('id,name,rooms_count,bedrooms,suites,parking,area_m2,description,price_from')
      .eq('incorporation_id', incorporation.id)
      .eq('is_active', true)
      .order('position', { ascending: true }),
    supabase
      .from('incorporation_media')
      .select('id,plan_id,media_scope,title,kind,path,is_cover')
      .eq('incorporation_id', incorporation.id)
      .eq('is_public', true)
      .neq('kind', 'document')
      .order('position', { ascending: true }),
    supabase
      .from('incorporation_feature_values')
      .select('feature_id,value_boolean,value_number,value_text,value_json')
      .eq('incorporation_id', incorporation.id),
  ])

  const plans =
    plansPrimaryRes.error
      ? (
          (
            await supabase
              .from('incorporation_plans')
              .select('id,name,bedrooms,suites,parking,area_m2,description,price_from')
              .eq('incorporation_id', incorporation.id)
              .eq('is_active', true)
              .order('position', { ascending: true })
          ).data || []
        ).map((row: any) => ({ ...row, rooms_count: null } as PlanRow))
      : ((plansPrimaryRes.data || []) as PlanRow[])
  const media = (mediaRes.data || []) as MediaRow[]
  const featureValues = (featureValuesRes.data || []) as FeatureValueRow[]

  const featureIds = featureValues.map((row) => row.feature_id)
  const { data: featureCatalogRows } =
    featureIds.length > 0
      ? await supabase
          .from('incorporation_features')
          .select('id,label_pt,type')
          .eq('is_active', true)
          .in('id', featureIds)
      : { data: [] as FeatureCatalogRow[] }

  const featureCatalog = (featureCatalogRows || []) as FeatureCatalogRow[]
  const featureById = new Map(featureCatalog.map((item) => [item.id, item]))
  const featureSummaries = featureValues
    .map((value) => {
      const feature = featureById.get(value.feature_id)
      if (!feature) return null
      const text = featureValueToText(feature.type, value)
      if (!text) return null
      if (feature.type === 'boolean') return feature.label_pt
      return `${feature.label_pt}: ${text}`
    })
    .filter((item): item is string => Boolean(item))

  const [coverUrl, signedMedia] = await Promise.all([
    getSignedIncorporationMediaUrl(incorporation.cover_media_path),
    Promise.all(
      media.map(async (item) => ({
        ...item,
        signed_url: await getSignedIncorporationMediaUrl(item.path),
      }))
    ),
  ])

  const inheritedMedia = signedMedia.filter(
    (item) =>
      !item.plan_id &&
      (item.media_scope === null ||
        item.media_scope === 'incorporation' ||
        item.media_scope === 'common_areas' ||
        item.media_scope === 'project')
  )
  const mediaByPlan = new Map<string, Array<MediaRow & { signed_url: string | null }>>()
  for (const item of signedMedia) {
    if (!item.plan_id) continue
    mediaByPlan.set(item.plan_id, [...(mediaByPlan.get(item.plan_id) || []), item])
  }

  const activePlanPrices = plans
    .filter((plan) => typeof plan.price_from === 'number' && plan.price_from > 0)
    .map((plan) => Number(plan.price_from))
  const minPlanPrice = activePlanPrices.length > 0 ? Math.min(...activePlanPrices) : null

  const developer = asSingleRelation(incorporation.developers)
  const location = [incorporation.address, incorporation.neighborhood, incorporation.city, incorporation.state].filter(Boolean).join(' / ') || '-'

  const whatsappNumber = sanitizePhone(process.env.NEXT_PUBLIC_WHATSAPP_NUMBER)
  const whatsappLink = buildWhatsAppLink(
    whatsappNumber,
    `Olá! Tenho interesse no empreendimento ${incorporation.name}.`
  )

  return (
    <main className="mx-auto w-full max-w-6xl space-y-6 px-4 py-8">
      <Link href="/empreendimentos" className="text-sm text-[var(--muted-foreground)] hover:underline">
        Empreendimentos
      </Link>

      <section className="overflow-hidden rounded-[var(--radius-lg)] border border-black/10 bg-white shadow-sm">
        <div
          className="relative min-h-[280px] border-b border-black/10"
          style={{
            background: coverUrl
              ? `linear-gradient(180deg, rgba(23,26,33,.22), rgba(23,26,33,.76)), url(${coverUrl}) center/cover`
              : 'linear-gradient(125deg, rgba(23,26,33,.92), rgba(41,68,135,.9), rgba(255,104,31,.78))',
          }}
        >
          <div className="absolute inset-0 flex flex-col justify-end gap-4 p-6 text-white">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="success">Ativo</Badge>
              <Badge variant="outline">{incorporation.status}</Badge>
            </div>
            <div>
              <h1 className="text-3xl font-bold">{incorporation.name}</h1>
              <p className="mt-1 text-sm text-white/85">{incorporation.headline || location}</p>
            </div>
            <div className="flex flex-wrap gap-4 text-sm text-white/85">
              <span>Construtora: {developer?.name || '-'}</span>
              <span>A partir de {formatCurrency(minPlanPrice)}</span>
              <span>Entrega: {formatDate(incorporation.delivery_date)}</span>
            </div>
          </div>
        </div>
        <div className="space-y-2 p-5 text-sm">
          <p className="text-[var(--muted-foreground)]">{incorporation.description || 'Descrição em atualização.'}</p>
          <div className="flex flex-wrap gap-3 text-xs text-[var(--muted-foreground)]">
            <span>Endereço: {location}</span>
            <span>Lançamento: {formatDate(incorporation.launch_date)}</span>
          </div>
        </div>
      </section>

      {featureSummaries.length > 0 ? (
        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-[var(--foreground)]">Diferenciais do empreendimento</h2>
          <div className="flex flex-wrap gap-2">
            {featureSummaries.map((item) => (
              <Badge key={item} variant="outline">
                {item}
              </Badge>
            ))}
          </div>
        </section>
      ) : null}

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-[var(--foreground)]">Plantas e tipologias</h2>

        {plans.length === 0 ? (
          <Card>
            <CardContent className="pt-6 text-sm text-[var(--muted-foreground)]">
              Nenhuma planta ativa disponível no momento.
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {plans.map((plan) => {
              const planMedia = mediaByPlan.get(plan.id) || []
              const image =
                planMedia.find((item) => item.is_cover && !!item.signed_url)?.signed_url ||
                planMedia.find((item) => !!item.signed_url)?.signed_url ||
                inheritedMedia.find((item) => item.is_cover && !!item.signed_url)?.signed_url ||
                inheritedMedia.find((item) => !!item.signed_url)?.signed_url ||
                null

              return (
                <Card key={plan.id} className="overflow-hidden border-black/10">
                  <div className="h-44 border-b border-black/10 bg-[var(--muted)]/20">
                    {image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={image} alt={plan.name} className="h-full w-full object-cover" />
                    ) : (
                      <div className="grid h-full place-items-center text-sm text-[var(--muted-foreground)]">
                        Planta sem imagem
                      </div>
                    )}
                  </div>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg">{plan.name}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 pt-0 text-sm">
                    <p className="text-[var(--muted-foreground)]">
                      {typeof plan.bedrooms === 'number' ? `${plan.bedrooms} quartos` : '-'} /{' '}
                      {typeof plan.suites === 'number' ? `${plan.suites} suítes` : '-'} /{' '}
                      {typeof plan.rooms_count === 'number' ? `${plan.rooms_count} cômodos` : '-'} /{' '}
                      {typeof plan.parking === 'number' ? `${plan.parking} vagas` : '-'}
                    </p>
                    <p className="text-[var(--muted-foreground)]">
                      {typeof plan.area_m2 === 'number' ? `${plan.area_m2} m² de área` : 'Metragem não informada'}
                    </p>
                    <p className="font-semibold text-[var(--foreground)]">A partir de {formatCurrency(plan.price_from)}</p>
                    <p className="line-clamp-4 text-xs text-[var(--muted-foreground)]">{plan.description || '-'}</p>
                    <p className="text-xs text-[var(--muted-foreground)]">
                      Mídias herdadas de empreendimento/projeto/áreas comuns: {inheritedMedia.length}
                    </p>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        )}
      </section>

      {inheritedMedia.length > 0 ? (
        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-[var(--foreground)]">Projeto e áreas comuns</h2>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {inheritedMedia.map((item) => (
              <Card key={item.id} className="overflow-hidden border-black/10">
                <div className="h-44 border-b border-black/10 bg-[var(--muted)]/20">
                  {item.signed_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={item.signed_url} alt={item.title || 'Mídia'} className="h-full w-full object-cover" />
                  ) : (
                    <div className="grid h-full place-items-center text-sm text-[var(--muted-foreground)]">
                      {item.kind}
                    </div>
                  )}
                </div>
                <CardContent className="space-y-2 pt-3 text-sm">
                  <p className="font-semibold text-[var(--foreground)]">{item.title || 'Mídia sem título'}</p>
                  <p className="text-xs text-[var(--muted-foreground)]">Escopo: {item.media_scope || 'incorporation'}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      ) : null}

      <section className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-white p-5">
        <h3 className="text-lg font-semibold text-[var(--foreground)]">Tenho interesse</h3>
        <p className="mt-1 text-sm text-[var(--muted-foreground)]">
          Fale com um corretor Vitrya para receber condições e disponibilidade atual.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          {whatsappLink ? (
            <a
              href={whatsappLink}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center rounded-[var(--radius)] bg-[#25D366] px-4 py-2 text-sm font-semibold text-white"
            >
              Falar com corretor
            </a>
          ) : (
            <span className="inline-flex items-center rounded-[var(--radius)] border border-[var(--border)] px-4 py-2 text-sm text-[var(--muted-foreground)]">
              WhatsApp indisponível no ambiente
            </span>
          )}
          <Link
            href="/imoveis"
            className="inline-flex items-center rounded-[var(--radius)] border border-[var(--border)] px-4 py-2 text-sm font-semibold text-[var(--foreground)]"
          >
            Ver mais imóveis
          </Link>
        </div>
      </section>
    </main>
  )
}

