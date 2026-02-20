import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabaseServer'

export const runtime = 'nodejs'

type PropertyRow = {
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

function normalizeCategory(
  raw: PropertyRow['property_categories']
): { id: string; name: string } | null {
  if (!raw) return null
  return Array.isArray(raw) ? raw[0] ?? null : raw
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

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ propertyId: string }> }
) {
  const { propertyId } = await params

  try {
    const supabase = await createClient()
    const { data: auth } = await supabase.auth.getUser()

    if (!auth?.user) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
    }

    const [{ data: propertyRaw, error: pErr }, { data: tasks, error: tErr }] =
      await Promise.all([
        supabase
          .from('properties')
          .select(
            'id, title, status, city, neighborhood, cover_media_url, created_at, property_category_id, property_categories ( id, name )'
          )
          .eq('id', propertyId)
          .maybeSingle(),
        supabase
          .from('property_campaign_tasks')
          .select(
            'id, property_id, day_offset, title, channel, is_required, due_date, done_at, whatsapp_text, reel_script, ads_checklist, position, created_at'
          )
          .eq('property_id', propertyId)
          .order('due_date', { ascending: true })
          .order('position', { ascending: true })
      ])

    if (pErr || !propertyRaw) {
      return NextResponse.json(
        { error: pErr?.message || 'Imóvel não encontrado.' },
        { status: 404 }
      )
    }

    if (tErr) {
      return NextResponse.json({ error: tErr.message }, { status: 500 })
    }

    const property_categories = normalizeCategory(propertyRaw.property_categories)
    const cover_url = await signedCoverUrl(supabase, propertyRaw.cover_media_url ?? null)

    const property: PropertyRow = {
      id: propertyRaw.id,
      title: propertyRaw.title ?? null,
      status: propertyRaw.status ?? null,
      city: propertyRaw.city ?? null,
      neighborhood: propertyRaw.neighborhood ?? null,
      created_at: propertyRaw.created_at,
      property_category_id: propertyRaw.property_category_id ?? null,
      property_categories,
      cover_media_url: propertyRaw.cover_media_url ?? null,
      cover_url
    }

    return NextResponse.json({ property, tasks: tasks ?? [] })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Erro interno do servidor' },
      { status: 500 }
    )
  }
}
