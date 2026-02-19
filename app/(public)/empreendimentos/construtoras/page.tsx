import Link from 'next/link'

import { Badge } from '@/components/ui/Badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { getSignedIncorporationMediaUrl } from '@/lib/incorporations/media'
import { createPublicClient } from '@/lib/supabase/publicServer'

export const dynamic = 'force-dynamic'
export const revalidate = 0

type DeveloperRow = {
  id: string
  name: string
  slug: string
  logo_media_path: string | null
  cover_media_path: string | null
  description: string | null
}

type IncorporationCountRow = {
  developer_id: string
  is_active: boolean
}

export default async function PublicDevelopersPage() {
  const supabase = createPublicClient()

  const [{ data: developersData, error: developersError }, { data: incorporationStats }] = await Promise.all([
    supabase
      .from('developers')
      .select('id,name,slug,logo_media_path,cover_media_path,description')
      .eq('is_active', true)
      .order('name', { ascending: true }),
    supabase.from('incorporations').select('developer_id,is_active'),
  ])

  if (developersError) {
    return (
      <main className="mx-auto w-full max-w-6xl space-y-4 px-4 py-8">
        <h1 className="text-3xl font-bold text-[var(--foreground)]">Construtoras</h1>
        <p className="text-sm text-[var(--destructive)]">Erro ao carregar construtoras: {developersError.message}</p>
      </main>
    )
  }

  const developers = (developersData || []) as DeveloperRow[]
  const stats = (incorporationStats || []) as IncorporationCountRow[]
  const activeCountByDeveloperId = new Map<string, number>()
  for (const row of stats) {
    if (!row.is_active) continue
    activeCountByDeveloperId.set(row.developer_id, (activeCountByDeveloperId.get(row.developer_id) || 0) + 1)
  }

  const signedAssets = await Promise.all(
    developers.map(async (developer) => ({
      id: developer.id,
      logo: await getSignedIncorporationMediaUrl(developer.logo_media_path),
      cover: await getSignedIncorporationMediaUrl(developer.cover_media_path),
    }))
  )
  const assetById = new Map(signedAssets.map((asset) => [asset.id, asset]))

  return (
    <main className="mx-auto w-full max-w-6xl space-y-6 px-4 py-8">
      <header className="space-y-2">
        <Link href="/empreendimentos" className="text-sm text-[var(--muted-foreground)] hover:underline">
          Empreendimentos
        </Link>
        <h1 className="text-3xl font-bold text-[var(--foreground)]">Construtoras</h1>
        <p className="text-sm text-[var(--muted-foreground)]">
          Navegue pelos empreendimentos por construtora.
        </p>
      </header>

      {developers.length === 0 ? (
        <Card>
          <CardContent className="pt-6 text-sm text-[var(--muted-foreground)]">
            Nenhuma construtora ativa encontrada.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {developers.map((developer) => {
            const asset = assetById.get(developer.id)
            const activeCount = activeCountByDeveloperId.get(developer.id) || 0
            return (
              <Link key={developer.id} href={`/empreendimentos?developer=${developer.id}`} className="group">
                <Card className="overflow-hidden border-black/10 bg-white shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-lg">
                  <div
                    className="h-36 border-b border-black/10"
                    style={{
                      background: asset?.cover
                        ? `linear-gradient(180deg, rgba(23,26,33,.14), rgba(23,26,33,.65)), url(${asset.cover}) center/cover`
                        : 'linear-gradient(130deg, rgba(23,26,33,.92), rgba(41,68,135,.88))',
                    }}
                  />
                  <CardHeader className="pb-3">
                    <div className="flex items-center gap-3">
                      <div className="h-11 w-11 overflow-hidden rounded-lg border border-black/10 bg-black/5">
                        {asset?.logo ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={asset.logo} alt={developer.name} className="h-full w-full object-cover" />
                        ) : null}
                      </div>
                      <div className="min-w-0">
                        <CardTitle className="truncate text-lg">{developer.name}</CardTitle>
                        <p className="truncate text-xs text-[var(--muted-foreground)]">{developer.slug}</p>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-2 pt-0">
                    <div className="flex items-center gap-2">
                      <Badge variant="success">Ativa</Badge>
                      <Badge variant="outline">{activeCount} empreendimento(s)</Badge>
                    </div>
                    <p className="line-clamp-2 text-sm text-[var(--muted-foreground)]">
                      {developer.description || 'Construtora parceira da Vitrya.'}
                    </p>
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
