import Link from 'next/link'
import PropertyTabs from './PropertyTabs'
import { createClient } from '@/lib/supabaseServer'
import { getPropertyFeaturesData } from './actions'
import { normalizePropertyFeatures } from '@/lib/normalizePropertyFeatures'

type CategoryRel = { id: string; name: string } | { id: string; name: string }[] | null

function getCategoryName(rel: CategoryRel): string | null {
  if (!rel) return null
  if (Array.isArray(rel)) return rel[0]?.name ?? null
  return rel.name ?? null
}

export default async function PropertyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id: propertyId } = await params
  const siteBase = (process.env.NEXT_PUBLIC_SITE_URL || '').replace(/\/$/, '')

  const supabase = await createClient()

  // ✅ Viewer (server-first): pega user e role/is_active para repassar ao client sem supabase.auth no browser
  const {
    data: { user: viewerUser },
  } = await supabase.auth.getUser()

  const viewerId = viewerUser?.id ?? null

  const viewerProfileRes = viewerId
    ? await supabase.from('profiles').select('role, is_active').eq('id', viewerId).maybeSingle()
    : { data: null, error: null }

  const viewerRole = (viewerProfileRes.data as any)?.role ?? null
  const viewerIsActive = (viewerProfileRes.data as any)?.is_active ?? null

  const [propertyRes] = await Promise.all([
    supabase
      .from('properties')
      .select('*, property_categories ( id, name )')
      .eq('id', propertyId)
      .maybeSingle(),
  ])

  if (propertyRes.error) {
    return (
      <main className="p-6">
        <h1 className="text-xl font-semibold text-[var(--foreground)]">Imóvel</h1>
        <p className="text-sm text-[var(--destructive)]">
          Erro ao carregar imóvel: {propertyRes.error.message}
        </p>
      </main>
    )
  }

  if (!propertyRes.data) {
    return (
      <main className="p-6">
        <h1 className="text-xl font-semibold text-[var(--foreground)]">Imóvel não encontrado</h1>
        <p className="text-sm text-[var(--muted-foreground)]">ID: {propertyId}</p>
      </main>
    )
  }

  const property = propertyRes.data as Record<string, unknown>
  const propertyKeys = new Set(Object.keys(property))
  const ownerUserId = property.owner_user_id as string | null
  const ownerClientId = property.owner_client_id as string | null
  const createdById = property.created_by as string | null

  const [ownerProfileRes, createdByProfileRes, ownerPersonRes, categoriesRes, features] =
    await Promise.all([
      ownerUserId
        ? supabase
            .from('profiles')
            .select('id, full_name, email')
            .eq('id', ownerUserId)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      createdById
        ? supabase
            .from('profiles')
            .select('id, full_name, email')
            .eq('id', createdById)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      ownerClientId
        ? supabase
            .from('people')
            .select('id, full_name, email, phone_e164, document_id')
            .eq('id', ownerClientId)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      supabase
        .from('property_categories')
        .select('id, name')
        .eq('is_active', true)
        .order('position', { ascending: true }),
      getPropertyFeaturesData(propertyId),
    ])

  const property_category_name = getCategoryName((property as any)?.property_categories as CategoryRel)

  const owner = ownerProfileRes.data
  const ownerLabel = owner?.full_name || owner?.email || (owner?.id ? owner.id.slice(0, 8) : '—')

  const createdBy = createdByProfileRes.data
  const createdByLabel =
    createdBy?.full_name || createdBy?.email || (createdBy?.id ? createdBy.id.slice(0, 8) : '—')

  const propertyForTabs = {
    ...property,
    property_category_name,
    owner_profile: ownerProfileRes.data ?? null,
    created_by_profile: createdByProfileRes.data ?? null,
    owner_person: ownerPersonRes.data ?? null,
  }

  const normalizedFeatures = normalizePropertyFeatures(features?.catalog ?? [], features?.values ?? [])

  const featuresCatalog = (normalizedFeatures.catalog ?? []).filter((feature) => {
    const key = feature?.key
    return key ? !propertyKeys.has(key) : true
  })

  const propertyCategories = categoriesRes?.data ?? []

  return (
    <main className="p-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <Link href="/properties" className="text-sm text-[var(--muted-foreground)] hover:underline">
            Imóveis
          </Link>
          <h1 className="text-2xl font-bold text-[var(--foreground)]">
            {property.title ? String(property.title) : 'Imóvel'}
          </h1>
          <p className="text-xs text-[var(--muted-foreground)]">ID: {propertyId}</p>
          <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-xs text-[var(--muted-foreground)]">
            <span>
              Responsável:{' '}
              <span className="font-medium text-[var(--foreground)]">{ownerLabel}</span>
            </span>
            <span>
              Criado por:{' '}
              <span className="font-medium text-[var(--foreground)]">{createdByLabel}</span>
            </span>
          </div>
        </div>
        <Link
          href={`${siteBase}/imoveis/${propertyId}`}
          target="_blank"
          rel="noreferrer"
          className="rounded-[var(--radius)] bg-[#17BEBB] px-4 py-2 text-sm font-medium text-white"
        >
          Ver no site
        </Link>
      </div>

      <div>
        <PropertyTabs
          property={propertyForTabs as any}
          propertyCategories={propertyCategories}
          featuresCatalog={featuresCatalog}
          featureValues={normalizedFeatures.values ?? []}
          featureAliasesToClear={normalizedFeatures.aliasesToClear}
          // ✅ novas props: usadas para PublishPanel sem auth no client
          viewerRole={viewerRole}
          viewerIsActive={viewerIsActive}
        />
      </div>
    </main>
  )
}
