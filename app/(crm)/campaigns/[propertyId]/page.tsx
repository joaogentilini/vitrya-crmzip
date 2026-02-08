import Link from 'next/link'
import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import CampaignDetailPage from './CampaignPropertyPage'
import ActivateCampaignCard from './ActivateCampaignCard'
import type { CampaignProperty, CampaignTask } from '../types'

export const dynamic = 'force-dynamic'
export const revalidate = 0

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

async function signedCoverUrl(supabase: any, coverPath: string | null) {
  if (!coverPath) return null
  const path = coverPath.trim()
  if (!path) return null

  const { data, error } = await supabase.storage
    .from('property-media')
    .createSignedUrl(path, 60 * 30)

  if (error) return null
  return data?.signedUrl ?? null
}

function normalizeCategory(raw: any): { id: string; name: string } | null {
  if (!raw) return null
  return Array.isArray(raw) ? (raw[0] ?? null) : raw
}

type PropertyRaw = {
  id: string
  title: string | null
  status: string | null
  city: string | null
  neighborhood: string | null
  cover_media_url: string | null
  created_at: string
  property_category_id: string | null
  property_categories?: any
}

export default async function CampaignByPropertyPage({
  params,
}: {
  params: Promise<{ propertyId: string }>
}) {
  const supabase = await supabaseServer()
  const { propertyId } = await params

  const [{ data: propertyRaw, error: pErr }, { data: tasks, error: tErr }] =
    await Promise.all([
      supabase
        .from('properties')
        .select(
          'id, title, status, city, neighborhood, cover_media_url, created_at, property_category_id, property_categories ( id, name )'
        )
        .eq('id', propertyId)
        .maybeSingle<PropertyRaw>(),
      supabase
        .from('property_campaign_tasks')
        .select(
          'id, property_id, day_offset, title, channel, is_required, due_date, done_at, whatsapp_text, reel_script, ads_checklist, position, created_at'
        )
        .eq('property_id', propertyId)
        .order('due_date', { ascending: true })
        .order('position', { ascending: true })
        .returns<CampaignTask[]>(),
    ])

  if (pErr) return <div className="p-6">Erro: {pErr.message}</div>
  if (!propertyRaw) return <div className="p-6">Imóvel não encontrado.</div>
  if (tErr) return <div className="p-6">Erro: {tErr.message}</div>

  const property_categories = normalizeCategory(propertyRaw.property_categories)
  const cover_media_url = propertyRaw.cover_media_url ?? null
  const cover_url = await signedCoverUrl(supabase, cover_media_url)

  const property: CampaignProperty = {
    id: propertyRaw.id,
    title: propertyRaw.title ?? null,
    status: propertyRaw.status ?? null,
    city: propertyRaw.city ?? null,
    neighborhood: propertyRaw.neighborhood ?? null,
    created_at: propertyRaw.created_at,

    // ✅ mantém alinhado com /campaigns (e evita TS reclamar)
    property_category_id: propertyRaw.property_category_id ?? null,
    property_categories,

    cover_media_url,
    cover_url,
  }

  const hasTasks = (tasks ?? []).length > 0
  const templates =
    !hasTasks
      ? ((
          await supabase
            .from('campaign_templates')
            .select('id, name')
            .eq('is_active', true)
            .order('created_at', { ascending: true })
        ).data ?? [])
      : []

  return (
    <div className="p-6">
      <div className="mx-auto max-w-[1200px] space-y-4">
        {/* Header premium do detalhe */}
        <div className="rounded-3xl border border-black/10 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="min-w-0">
              <div className="text-xs text-black/60">Campanhas • Detalhe do imóvel</div>
              <h1 className="mt-1 truncate text-xl font-extrabold tracking-tight text-black/90">
                {property.title?.trim() || `Imóvel ${property.id.slice(0, 6)}`}
              </h1>
              <p className="mt-1 text-sm text-black/60">
                Execute as tarefas e acompanhe métricas por período.
              </p>
            </div>

            <div className="flex gap-2">
              <Link
                href="/campaigns"
                className="rounded-xl border border-black/10 bg-white px-3 py-2 text-sm text-black/80 hover:bg-black/5"
              >
                Voltar
              </Link>
              <Link
                href={`/properties/${property.id}`}
                className="rounded-xl border border-black/10 bg-white px-3 py-2 text-sm text-black/80 hover:bg-black/5"
              >
                Abrir imóvel
              </Link>
            </div>
          </div>
        </div>

        {/* Conteúdo real (seu componente premium já existente) */}
        {hasTasks ? (
          <CampaignDetailPage property={property} tasks={tasks ?? []} />
        ) : (
          <ActivateCampaignCard propertyId={property.id} templates={templates} />
        )}
      </div>
    </div>
  )
}
