import Link from 'next/link'

import { Badge } from '@/components/ui/Badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { getSignedIncorporationMediaUrl } from '@/lib/incorporations/media'
import { createPublicClient } from '@/lib/supabase/publicServer'

export const dynamic = 'force-dynamic'
export const revalidate = 0

type DeveloperRelation = { name: string } | Array<{ name: string }> | null

type IncorporationRow = {
  id: string
  developer_id: string
  slug: string
  name: string
  headline: string | null
  city: string | null
  neighborhood: string | null
  state: string | null
  status: string
  cover_media_path: string | null
  developers: DeveloperRelation
}

type DeveloperFilterRow = {
  id: string
  name: string
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

export default async function PublicIncorporationsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const params = await searchParams
  const selectedDeveloperId = typeof params.developer === 'string' ? params.developer : null
  const supabase = createPublicClient()

  let incorporationsQuery = supabase
    .from('incorporations')
    .select(
      `
      id,
      developer_id,
      slug,
      name,
      headline,
      city,
      neighborhood,
      state,
      status,
      cover_media_path,
      developers ( name )
    `
    )
    .eq('is_active', true)
    .order('created_at', { ascending: false })

  if (selectedDeveloperId) {
    incorporationsQuery = incorporationsQuery.eq('developer_id', selectedDeveloperId)
  }

  const [{ data, error }, { data: developersData }] = await Promise.all([
    incorporationsQuery,
    supabase.from('developers').select('id,name').eq('is_active', true).order('name', { ascending: true }),
  ])

  if (error) {
    return (
      <main className="mx-auto w-full max-w-6xl space-y-4 px-4 py-8">
        <h1 className="text-3xl font-bold text-[var(--foreground)]">Empreendimentos</h1>
        <p className="text-sm text-[var(--destructive)]">Erro ao carregar empreendimentos: {error.message}</p>
      </main>
    )
  }

  const incorporations = (data || []) as IncorporationRow[]
  const developers = (developersData || []) as DeveloperFilterRow[]
  const selectedDeveloper = developers.find((developer) => developer.id === selectedDeveloperId) || null
  const incorporationIds = incorporations.map((row) => row.id)
  const { data: planRows } =
    incorporationIds.length > 0
      ? await supabase
          .from('incorporation_plans')
          .select('incorporation_id, price_from, is_active')
          .in('incorporation_id', incorporationIds)
      : { data: [] as Array<{ incorporation_id: string; price_from: number | null; is_active: boolean }> }

  const minPriceByIncorporationId = new Map<string, number>()
  for (const row of (planRows || []) as Array<{ incorporation_id: string; price_from: number | null; is_active: boolean }>) {
    if (!row.is_active || typeof row.price_from !== 'number' || row.price_from <= 0) continue
    const current = minPriceByIncorporationId.get(row.incorporation_id)
    if (typeof current !== 'number' || row.price_from < current) {
      minPriceByIncorporationId.set(row.incorporation_id, row.price_from)
    }
  }

  const signedCovers = await Promise.all(
    incorporations.map(async (item) => ({
      id: item.id,
      cover: await getSignedIncorporationMediaUrl(item.cover_media_path),
    }))
  )
  const coverById = new Map(signedCovers.map((item) => [item.id, item.cover]))

  return (
    <main className="mx-auto w-full max-w-6xl space-y-6 px-4 py-8">
      <header className="space-y-2">
        <h1 className="text-3xl font-bold text-[var(--foreground)]">Empreendimentos</h1>
        <p className="text-sm text-[var(--muted-foreground)]">
          Conheca os lancamentos e empreendimentos ativos da Vitrya.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/empreendimentos"
            className={`rounded-full border px-3 py-1 text-xs font-semibold ${
              !selectedDeveloper
                ? 'border-[var(--foreground)] bg-[var(--foreground)] text-white'
                : 'border-[var(--border)] text-[var(--foreground)]'
            }`}
          >
            Todos
          </Link>
          {developers.map((developer) => {
            const active = selectedDeveloperId === developer.id
            return (
              <Link
                key={developer.id}
                href={`/empreendimentos?developer=${developer.id}`}
                className={`rounded-full border px-3 py-1 text-xs font-semibold ${
                  active
                    ? 'border-[var(--foreground)] bg-[var(--foreground)] text-white'
                    : 'border-[var(--border)] text-[var(--foreground)]'
                }`}
              >
                {developer.name}
              </Link>
            )
          })}
        </div>
        {selectedDeveloper ? (
          <p className="text-xs text-[var(--muted-foreground)]">
            Filtro ativo: construtora <span className="font-semibold text-[var(--foreground)]">{selectedDeveloper.name}</span>
          </p>
        ) : null}
      </header>

      {incorporations.length === 0 ? (
        <Card>
          <CardContent className="pt-6 text-sm text-[var(--muted-foreground)]">
            Nenhum empreendimento ativo para exibição neste momento.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {incorporations.map((incorporation) => {
            const developer = asSingleRelation(incorporation.developers)
            const cover = coverById.get(incorporation.id) || null
            const location =
              [incorporation.neighborhood, incorporation.city, incorporation.state].filter(Boolean).join(' • ') || '-'

            return (
              <Link key={incorporation.id} href={`/empreendimentos/${incorporation.slug}`} className="group">
                <Card className="overflow-hidden border-black/10 bg-white shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-lg">
                  <div
                    className="h-40 border-b border-black/10"
                    style={{
                      background: cover
                        ? `linear-gradient(180deg, rgba(23,26,33,.14), rgba(23,26,33,.65)), url(${cover}) center/cover`
                        : 'linear-gradient(130deg, rgba(23,26,33,.92), rgba(41,68,135,.88))',
                    }}
                  />
                  <CardHeader className="pb-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="success">Ativo</Badge>
                      <Badge variant="outline">{incorporation.status}</Badge>
                    </div>
                    <CardTitle className="text-lg">{incorporation.name}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 pt-0">
                    <p className="line-clamp-2 text-sm text-[var(--muted-foreground)]">
                      {incorporation.headline || 'Empreendimento premium Vitrya'}
                    </p>
                    <p className="text-sm text-[var(--muted-foreground)]">{location}</p>
                    <p className="text-sm font-semibold text-[var(--foreground)]">
                      A partir de {formatCurrency(minPriceByIncorporationId.get(incorporation.id) ?? null)}
                    </p>
                    <p className="text-xs text-[var(--muted-foreground)]">Construtora: {developer?.name || '-'}</p>
                  </CardContent>
                </Card>
              </Link>
            )
          })}
        </div>
      )}
    </main>
  )
}
