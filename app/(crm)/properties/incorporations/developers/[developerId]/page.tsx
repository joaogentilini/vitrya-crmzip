import Link from 'next/link'
import { notFound } from 'next/navigation'

import AdminDeleteActionButton from '@/components/admin/AdminDeleteActionButton'
import { Badge } from '@/components/ui/Badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { requireRole } from '@/lib/auth'
import { getSignedIncorporationMediaUrl } from '@/lib/incorporations/media'
import { createClient } from '@/lib/supabaseServer'

import { deleteDeveloperAction, updateDeveloperCommissionPercentAction } from '../../actions'
import CreateIncorporationFormClient from '../../CreateIncorporationFormClient'

export const dynamic = 'force-dynamic'
export const revalidate = 0

type DeveloperRow = {
  id: string
  name: string
  slug: string
  logo_media_path: string | null
  commission_percent: number | null
  is_active: boolean
}

type IncorporationRow = {
  id: string
  slug: string
  name: string
  city: string | null
  neighborhood: string | null
  status: string
  is_active: boolean
  cover_media_path: string | null
}

function formatCurrency(value: number | null | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '-'
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value)
}

export default async function DeveloperIncorporationsPage({
  params,
}: {
  params: Promise<{ developerId: string }>
}) {
  const viewer = await requireRole(['admin', 'gestor', 'corretor'])
  const isManager = viewer.role === 'admin' || viewer.role === 'gestor'
  const isAdmin = viewer.role === 'admin'
  const { developerId } = await params
  const supabase = await createClient()

  const [developerRes, incorporationsRes] = await Promise.all([
    supabase
      .from('developers')
      .select('id, name, slug, logo_media_path, commission_percent, is_active')
      .eq('id', developerId)
      .maybeSingle(),
    supabase
      .from('incorporations')
      .select('id, slug, name, city, neighborhood, status, is_active, cover_media_path')
      .eq('developer_id', developerId)
      .order('created_at', { ascending: false }),
  ])

  if (developerRes.error) {
    const message = developerRes.error.message || 'Erro ao carregar construtora.'
    return (
      <main className="p-6">
        <p className="text-sm text-[var(--destructive)]">{message}</p>
      </main>
    )
  }

  if (!developerRes.data) return notFound()

  if (incorporationsRes.error) {
    return (
      <main className="p-6 space-y-4">
        <Link href="/properties/incorporations" className="text-sm text-[var(--muted-foreground)] hover:underline">
          Incorporações
        </Link>
        <h1 className="text-2xl font-bold text-[var(--foreground)]">{developerRes.data.name}</h1>
        <p className="text-sm text-[var(--destructive)]">
          Erro ao carregar empreendimentos: {incorporationsRes.error.message}
        </p>
      </main>
    )
  }

  const developer = developerRes.data as DeveloperRow
  const incorporations = (incorporationsRes.data || []) as IncorporationRow[]
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

  const developerLogoUrl = await getSignedIncorporationMediaUrl(developer.logo_media_path)
  const signedCoverList = await Promise.all(
    incorporations.map(async (row) => ({
      id: row.id,
      coverUrl: await getSignedIncorporationMediaUrl(row.cover_media_path),
    }))
  )
  const coverByIncorporationId = new Map(signedCoverList.map((item) => [item.id, item.coverUrl]))

  async function saveDeveloperCommissionAction(formData: FormData) {
    'use server'
    await updateDeveloperCommissionPercentAction(formData)
  }

  return (
    <main className="space-y-6 p-6">
      <div className="space-y-1">
        <Link href="/properties/incorporations" className="text-sm text-[var(--muted-foreground)] hover:underline">
          Incorporações
        </Link>
        <div className="flex flex-wrap items-center gap-3">
          <div className="h-12 w-12 rounded-xl border border-black/10 bg-black/5 overflow-hidden grid place-items-center">
            {developerLogoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={developerLogoUrl} alt={developer.name} className="h-full w-full object-cover" />
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
          <div>
            <h1 className="text-2xl font-bold text-[var(--foreground)]">{developer.name}</h1>
            <p className="text-sm text-[var(--muted-foreground)]">
              {developer.slug} - {incorporations.length} empreendimento(s)
            </p>
            <p className="text-xs text-[var(--muted-foreground)]">
              Comissão da construtora:{' '}
              <span className="font-semibold text-[var(--foreground)]">
                {typeof developer.commission_percent === 'number' ? `${developer.commission_percent.toFixed(2)}%` : '-'}
              </span>
            </p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            {isAdmin ? (
              <AdminDeleteActionButton
                action={deleteDeveloperAction.bind(null, developer.id)}
                confirmMessage="Deseja excluir esta construtora? Todos os empreendimentos vinculados tambem serao excluidos."
                successMessage="Construtora excluida com sucesso."
                fallbackErrorMessage="Nao foi possivel excluir a construtora."
                redirectTo="/properties/incorporations"
                label="Excluir construtora"
              />
            ) : null}
            <Badge variant={developer.is_active ? 'success' : 'secondary'}>
              {developer.is_active ? 'Ativa' : 'Inativa'}
            </Badge>
          </div>
        </div>
      </div>

      <Card className="overflow-hidden border-black/10 bg-white shadow-sm">
        <div className="grid gap-4 bg-gradient-to-r from-slate-950 via-slate-900 to-indigo-900 px-5 py-5 text-white lg:grid-cols-3">
          <div className="rounded-lg border border-white/15 bg-white/10 px-3 py-2">
            <p className="text-[11px] text-white/70">Empreendimentos</p>
            <p className="text-lg font-bold">{incorporations.length}</p>
          </div>
          <div className="rounded-lg border border-white/15 bg-white/10 px-3 py-2">
            <p className="text-[11px] text-white/70">Comissão base</p>
            <p className="text-lg font-bold">
              {typeof developer.commission_percent === 'number' ? `${developer.commission_percent.toFixed(2)}%` : '-'}
            </p>
          </div>
          <div className="rounded-lg border border-white/15 bg-white/10 px-3 py-2">
            <p className="text-[11px] text-white/70">Status</p>
            <p className="text-lg font-bold">{developer.is_active ? 'Ativa' : 'Inativa'}</p>
          </div>
        </div>
      </Card>

      {isManager ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Novo empreendimento para {developer.name}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 pt-0">
            <form action={saveDeveloperCommissionAction} className="grid gap-2 sm:grid-cols-[220px_auto]">
              <input type="hidden" name="developerId" value={developer.id} />
              <label className="grid gap-1 text-xs text-[var(--muted-foreground)]">
                <span>Comissão da construtora (%)</span>
                <input
                  name="commissionPercent"
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  defaultValue={typeof developer.commission_percent === 'number' ? developer.commission_percent.toFixed(2) : '5.00'}
                  className="h-9 rounded-[var(--radius)] border border-[var(--border)] bg-white px-3 text-sm text-[var(--foreground)]"
                />
              </label>
              <div className="flex items-end">
                <button
                  type="submit"
                  className="h-9 rounded-[var(--radius)] bg-[var(--primary)] px-3 text-xs font-semibold text-white"
                >
                  Salvar comissão
                </button>
              </div>
            </form>

            <CreateIncorporationFormClient
              developers={[{ id: developer.id, name: developer.name }]}
              defaultDeveloperId={developer.id}
            />
          </CardContent>
        </Card>
      ) : null}

      {incorporations.length === 0 ? (
        <Card>
          <CardContent className="pt-6 text-sm text-[var(--muted-foreground)]">
            Nenhum empreendimento cadastrado para esta construtora.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {incorporations.map((incorporation) => {
            const coverUrl = coverByIncorporationId.get(incorporation.id) || null
            const location = [incorporation.neighborhood, incorporation.city].filter(Boolean).join(', ') || '-'
            return (
              <Link key={incorporation.id} href={`/properties/incorporations/${incorporation.id}`} className="group">
                <Card className="overflow-hidden border-black/10 bg-white shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-lg">
                  <div
                    className="h-28 border-b border-black/10"
                    style={{
                      background: coverUrl
                        ? `linear-gradient(180deg, rgba(23,26,33,.10), rgba(23,26,33,.55)), url(${coverUrl}) center/cover`
                        : 'linear-gradient(130deg, rgba(23,26,33,.92), rgba(41,68,135,.88))',
                    }}
                  />
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base text-[var(--foreground)]">{incorporation.name}</CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={incorporation.is_active ? 'success' : 'secondary'}>
                        {incorporation.is_active ? 'Ativo' : 'Inativo'}
                      </Badge>
                      <Badge variant="outline">{incorporation.status}</Badge>
                    </div>
                    <p className="text-sm text-[var(--muted-foreground)]">{location}</p>
                    <p className="text-sm font-semibold text-[var(--foreground)]">
                      A partir de {formatCurrency(minPriceByIncorporationId.get(incorporation.id) ?? null)}
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
