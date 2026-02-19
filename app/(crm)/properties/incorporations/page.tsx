import Link from 'next/link'

import { Badge } from '@/components/ui/Badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { requireRole } from '@/lib/auth'
import { getSignedIncorporationMediaUrl } from '@/lib/incorporations/media'
import { createClient } from '@/lib/supabaseServer'

import CreateDeveloperFormClient from './CreateDeveloperFormClient'
import CreateIncorporationFormClient from './CreateIncorporationFormClient'

export const dynamic = 'force-dynamic'
export const revalidate = 0

type DeveloperRow = {
  id: string
  name: string
  slug: string
  logo_media_path: string | null
  cover_media_path: string | null
  is_active: boolean
}

type IncorporationStatRow = {
  developer_id: string
  is_active: boolean
}

function isMissingRelationError(errorMessage: string): boolean {
  const message = String(errorMessage || '').toLowerCase()
  return message.includes('relation') && message.includes('does not exist')
}

export default async function IncorporationsDevelopersPage() {
  const viewer = await requireRole(['admin', 'gestor', 'corretor'])
  const isManager = viewer.role === 'admin' || viewer.role === 'gestor'
  const supabase = await createClient()

  const [developersRes, incorporationsRes] = await Promise.all([
    supabase
      .from('developers')
      .select('id, name, slug, logo_media_path, cover_media_path, is_active')
      .order('name', { ascending: true }),
    supabase.from('incorporations').select('developer_id, is_active'),
  ])

  if (developersRes.error || incorporationsRes.error) {
    const message = developersRes.error?.message || incorporationsRes.error?.message || 'Erro desconhecido.'
    if (isMissingRelationError(message)) {
      return (
        <main className="p-6 space-y-4">
          <h1 className="text-2xl font-bold text-[var(--foreground)]">Incorporações</h1>
          <Card>
            <CardContent className="pt-6 space-y-2">
              <Badge variant="warning">Migration pendente</Badge>
              <p className="text-sm text-[var(--muted-foreground)]">
                Execute a migration `202602171500_incorporations_foundation.sql` no Supabase para habilitar este modulo.
              </p>
              <p className="text-xs text-[var(--muted-foreground)]">{message}</p>
            </CardContent>
          </Card>
        </main>
      )
    }

    return (
      <main className="p-6">
        <h1 className="text-2xl font-bold text-[var(--foreground)]">Incorporações</h1>
        <p className="text-sm text-[var(--destructive)]">Erro ao carregar construtoras: {message}</p>
      </main>
    )
  }

  const activeCountByDeveloper = new Map<string, number>()
  for (const row of (incorporationsRes.data || []) as IncorporationStatRow[]) {
    if (!row?.developer_id) continue
    if (!row.is_active) continue
    activeCountByDeveloper.set(row.developer_id, (activeCountByDeveloper.get(row.developer_id) || 0) + 1)
  }

  const developers = ((developersRes.data || []) as DeveloperRow[]).map((row) => ({
    ...row,
    active_incorporations: activeCountByDeveloper.get(row.id) || 0,
  }))
  const totalDevelopers = developers.length
  const activeDevelopers = developers.filter((item) => item.is_active).length
  const totalActiveIncorporations = developers.reduce(
    (acc, item) => acc + (item.active_incorporations || 0),
    0
  )

  const signedAssets = await Promise.all(
    developers.map(async (developer) => {
      const [logoUrl, coverUrl] = await Promise.all([
        getSignedIncorporationMediaUrl(developer.logo_media_path),
        getSignedIncorporationMediaUrl(developer.cover_media_path),
      ])
      return { id: developer.id, logoUrl, coverUrl }
    })
  )
  const assetsByDeveloperId = new Map(
    signedAssets.map((asset) => [asset.id, { logoUrl: asset.logoUrl, coverUrl: asset.coverUrl }])
  )
  const developerOptions = developers.map((developer) => ({ id: developer.id, name: developer.name }))

  return (
    <main className="space-y-6 p-6">
      <div className="space-y-2">
        <Link href="/properties" className="text-sm text-[var(--muted-foreground)] hover:underline">
          Imóveis
        </Link>
        <h1 className="text-2xl font-bold text-[var(--foreground)]">Incorporações</h1>
        <p className="text-sm text-[var(--muted-foreground)]">
          Consulte construtoras e acesse os empreendimentos para disponibilidade e reserva de unidades.
        </p>
      </div>

      <Card className="overflow-hidden border-black/10 bg-white shadow-sm">
        <div className="grid gap-4 bg-gradient-to-r from-slate-950 via-slate-900 to-orange-900 px-5 py-5 text-white lg:grid-cols-[1fr_auto] lg:items-center">
          <div>
            <p className="text-xs uppercase tracking-[0.16em] text-white/70">Painel de incorporações</p>
            <p className="mt-1 text-lg font-semibold">Operacao centralizada por construtora e empreendimento</p>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-lg border border-white/15 bg-white/10 px-3 py-2">
              <p className="text-[11px] text-white/70">Construtoras</p>
              <p className="text-lg font-bold">{totalDevelopers}</p>
            </div>
            <div className="rounded-lg border border-white/15 bg-white/10 px-3 py-2">
              <p className="text-[11px] text-white/70">Ativas</p>
              <p className="text-lg font-bold">{activeDevelopers}</p>
            </div>
            <div className="rounded-lg border border-white/15 bg-white/10 px-3 py-2">
              <p className="text-[11px] text-white/70">Empreend. ativos</p>
              <p className="text-lg font-bold">{totalActiveIncorporations}</p>
            </div>
          </div>
        </div>
      </Card>

      {isManager ? (
        <div className="grid gap-4 xl:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Nova Construtora (PJ)</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <CreateDeveloperFormClient />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Novo Empreendimento</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <CreateIncorporationFormClient developers={developerOptions} />
            </CardContent>
          </Card>
        </div>
      ) : null}

      {developers.length === 0 ? (
        <Card>
          <CardContent className="pt-6 text-sm text-[var(--muted-foreground)]">
            Nenhuma construtora cadastrada ainda.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {developers.map((developer) => {
            const assets = assetsByDeveloperId.get(developer.id)
            const coverUrl = assets?.coverUrl || null
            const logoUrl = assets?.logoUrl || null

            return (
              <Link key={developer.id} href={`/properties/incorporations/developers/${developer.id}`} className="group">
                <Card className="overflow-hidden border-black/10 bg-white shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-lg">
                  <div
                    className="relative h-28 w-full border-b border-black/10"
                    style={{
                      background: coverUrl
                        ? `linear-gradient(180deg, rgba(23,26,33,.12), rgba(23,26,33,.58)), url(${coverUrl}) center/cover`
                        : 'linear-gradient(135deg, rgba(41,68,135,.9), rgba(255,104,31,.75))',
                    }}
                  >
                    <div className="absolute inset-0 p-4 flex items-end justify-between">
                      <Badge variant={developer.is_active ? 'success' : 'secondary'}>
                        {developer.is_active ? 'Ativa' : 'Inativa'}
                      </Badge>
                      <Badge variant="info">{developer.active_incorporations} empreend. ativos</Badge>
                    </div>
                  </div>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base text-[var(--foreground)]">{developer.name}</CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0 flex items-center gap-3">
                    <div className="h-12 w-12 rounded-xl border border-black/10 bg-black/5 overflow-hidden grid place-items-center">
                      {logoUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={logoUrl} alt={developer.name} className="h-full w-full object-cover" />
                      ) : (
                        <span className="text-xs font-semibold text-black/60">
                          {developer.name
                            .split(' ')
                            .filter(Boolean)
                            .slice(0, 2)
                            .map((part) => part[0]?.toUpperCase())
                            .join('') || 'DV'}
                        </span>
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-[var(--foreground)] truncate">{developer.slug}</p>
                      <p className="text-xs text-[var(--muted-foreground)] truncate">
                        Clique para ver os empreendimentos
                      </p>
                    </div>
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
