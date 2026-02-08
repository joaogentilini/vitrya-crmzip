import Link from 'next/link'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import CampaignsBoard from './CampaignsBoard'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export type PropertyRow = {
  id: string
  title: string | null
  status: string | null
  city: string | null
  neighborhood: string | null
  created_at: string
  property_category_id: string | null

  property_categories?: { id: string; name: string } | { id: string; name: string }[] | null

  cover_media_url: string | null
  cover_url?: string | null
}

export type TaskAggRow = {
  property_id: string
  tasks_total: number
  pending_total: number
  done_total: number
  overdue: number
  due_today: number
  due_week: number
}

async function supabaseServer() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }: any) =>
              (cookieStore as any).set(name, value, options)
            )
          } catch {
            // Server Component: ignore
          }
        },
      },
    }
  )
}

function normalizeCategory(
  raw: PropertyRow['property_categories']
): { id: string; name: string } | null {
  if (!raw) return null
  return Array.isArray(raw) ? (raw[0] ?? null) : raw
}

async function attachCoverSignedUrls(supabase: any, properties: PropertyRow[]) {
  const paths = Array.from(
    new Set(
      properties
        .map((p) => p.cover_media_url?.trim())
        .filter((p): p is string => !!p)
    )
  )

  if (paths.length === 0) return properties.map((p) => ({ ...p, cover_url: null }))

  const { data, error } = await supabase.storage
    .from('property-media')
    .createSignedUrls(paths, 60 * 30)

  if (error || !data) return properties.map((p) => ({ ...p, cover_url: null }))

  const map = new Map<string, string>()
  for (const item of data) {
    if (item?.path && item?.signedUrl) map.set(item.path, item.signedUrl)
  }

  return properties.map((p) => ({
    ...p,
    cover_url: p.cover_media_url ? map.get(p.cover_media_url) ?? null : null,
  }))
}

export default async function CampaignsPage() {
  const supabase = await supabaseServer()

  const { data: propertiesRaw, error: pErr } = await supabase
    .from('properties')
    .select(
      'id, title, status, city, neighborhood, created_at, property_category_id, cover_media_url, property_categories ( id, name )'
    )
    .order('created_at', { ascending: false })
    .returns<PropertyRow[]>()

  if (pErr) return <div className="p-6">Erro: {pErr.message}</div>

  const normalizedRaw =
    (propertiesRaw ?? []).map((p) => ({
      ...p,
      property_categories: normalizeCategory(p.property_categories),
    })) as PropertyRow[]

  const properties = await attachCoverSignedUrls(supabase, normalizedRaw)

  const propertyIds = properties.map((p) => p.id)
  const safeIds =
    propertyIds.length > 0 ? propertyIds : ['00000000-0000-0000-0000-000000000000']

  const { data: tasks, error: tErr } = await supabase
    .from('property_campaign_tasks')
    .select('property_id, due_date, done_at')
    .in('property_id', safeIds)

  if (tErr) return <div className="p-6">Erro: {tErr.message}</div>

  const today = new Date()
  const todayYMD = today.toISOString().slice(0, 10)

  const weekEnd = new Date(today)
  weekEnd.setDate(weekEnd.getDate() + 7)
  const weekEndYMD = weekEnd.toISOString().slice(0, 10)

  const aggMap = new Map<string, TaskAggRow>()

  for (const row of tasks ?? []) {
    const pid = row.property_id as string
    const due = row.due_date as string
    const doneAt = row.done_at as string | null

    if (!aggMap.has(pid)) {
      aggMap.set(pid, {
        property_id: pid,
        tasks_total: 0,
        pending_total: 0,
        done_total: 0,
        overdue: 0,
        due_today: 0,
        due_week: 0,
      })
    }

    const a = aggMap.get(pid)!
    a.tasks_total += 1

    if (doneAt) {
      a.done_total += 1
    } else {
      a.pending_total += 1
      if (due < todayYMD) a.overdue += 1
      if (due === todayYMD) a.due_today += 1
      if (due > todayYMD && due <= weekEndYMD) a.due_week += 1
    }
  }

  const aggs = Array.from(aggMap.values())

  return (
    <div className="p-6">
      <div className="mx-auto max-w-[1200px] space-y-4">
        {/* Header premium alinhado ao Plano */}
        <div className="rounded-3xl border border-black/10 bg-white p-5 shadow-sm">
  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
    <div className="min-w-0">
      <h1 className="text-xl font-extrabold tracking-tight text-black/90">
        Campanhas
      </h1>
      <p className="mt-1 text-sm text-black/60">
        Operação por imóvel: atrasadas, hoje, semana e pendentes.
      </p>
    </div>

    <div className="flex gap-2">
      <Link
        href="/properties/my"
        className="rounded-xl border border-black/10 bg-white px-3 py-2 text-sm text-black/80 hover:bg-black/5"
      >
        Meus imóveis
      </Link>
      <Link
        href="/settings/campaigns"
        className="rounded-xl border border-black/10 bg-white px-3 py-2 text-sm text-black/80 hover:bg-black/5"
      >
        Editor de campanhas
      </Link>
    </div>
  </div>
</div>

        <CampaignsBoard properties={properties} aggs={aggs} />
      </div>
    </div>
  )
}
