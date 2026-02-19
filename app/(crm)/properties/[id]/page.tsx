import Link from 'next/link'
import PropertyTabs from './PropertyTabs'
import { createClient } from '@/lib/supabaseServer'
import { getPropertyFeaturesData } from './actions'
import { normalizePropertyFeatures } from '@/lib/normalizePropertyFeatures'

type CategoryRel = { id: string; name: string } | { id: string; name: string }[] | null
type CommissionSettingsRow = {
  sale_commission_percent?: number | null
  sale_broker_split_percent?: number | null
  sale_partner_split_percent?: number | null
  rent_initial_commission_percent?: number | null
  rent_recurring_commission_percent?: number | null
  rent_broker_split_percent?: number | null
  rent_partner_split_percent?: number | null
}

function getCategoryName(rel: CategoryRel): string | null {
  if (!rel) return null
  if (Array.isArray(rel)) return rel[0]?.name ?? null
  return rel.name ?? null
}

function safeNumber(value: unknown, fallback: number) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

export default async function PropertyDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { id: propertyId } = await params
  const resolvedSearchParams = await searchParams
  const siteBase = (process.env.NEXT_PUBLIC_SITE_URL || '').replace(/\/$/, '')

  const supabase = await createClient()

  // Viewer (server-first): pega user e role/is_active para repassar ao client sem supabase.auth no browser
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
        <p className="text-sm text-[var(--destructive)]">Erro ao carregar imóvel: {propertyRes.error.message}</p>
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

  const [ownerProfileRes, createdByProfileRes, ownerPersonRes, categoriesRes, features, commissionSettingsRes] =
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
            .select('id, full_name, email, phone_e164, document_id, owner_profile_id')
            .eq('id', ownerClientId)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      supabase
        .from('property_categories')
        .select('id, name')
        .eq('is_active', true)
        .order('position', { ascending: true }),
      getPropertyFeaturesData(propertyId),
      supabase
        .from('property_commission_settings')
        .select(
          `
          sale_commission_percent,
          sale_broker_split_percent,
          sale_partner_split_percent,
          rent_initial_commission_percent,
          rent_recurring_commission_percent,
          rent_broker_split_percent,
          rent_partner_split_percent
        `
        )
        .eq('property_id', propertyId)
        .maybeSingle(),
    ])

  const property_category_name = getCategoryName((property as any)?.property_categories as CategoryRel)

  const owner = ownerProfileRes.data
  const ownerLabel = owner?.full_name || owner?.email || (owner?.id ? owner.id.slice(0, 8) : '-')

  const createdBy = createdByProfileRes.data
  const createdByLabel = createdBy?.full_name || createdBy?.email || (createdBy?.id ? createdBy.id.slice(0, 8) : '-')

  const isManagerViewer = viewerRole === 'admin' || viewerRole === 'gestor'
  const isResponsibleViewer = !!viewerId && !!ownerUserId && ownerUserId === viewerId
  const canViewLegalData = isManagerViewer || isResponsibleViewer
  const canEditOverviewData = isManagerViewer || isResponsibleViewer

  const ownerPersonRaw = ownerPersonRes.data as
    | {
        id: string
        full_name?: string | null
        email?: string | null
        phone_e164?: string | null
        document_id?: string | null
        owner_profile_id?: string | null
      }
    | null

  const ownerPersonOwnerProfileId = ownerPersonRaw?.owner_profile_id ?? null
  const ownerPersonRestricted =
    !!ownerPersonRaw &&
    !isManagerViewer &&
    (!viewerId || !ownerPersonOwnerProfileId || ownerPersonOwnerProfileId !== viewerId)

  const ownerPersonForUi = ownerPersonRaw
    ? {
        id: ownerPersonRaw.id,
        full_name: ownerPersonRestricted ? null : ownerPersonRaw.full_name ?? null,
        email: ownerPersonRestricted ? null : ownerPersonRaw.email ?? null,
        phone_e164: ownerPersonRestricted ? null : ownerPersonRaw.phone_e164 ?? null,
        document_id: ownerPersonRestricted ? null : ownerPersonRaw.document_id ?? null,
      }
    : null

  const commissionSettings = (commissionSettingsRes?.data ?? null) as CommissionSettingsRow | null
  const saleCommissionPercent = safeNumber(
    commissionSettings?.sale_commission_percent ?? (property as any).commission_percent,
    5
  )
  const saleBrokerSplitPercent = safeNumber(commissionSettings?.sale_broker_split_percent, 50)
  const salePartnerSplitPercent = safeNumber(commissionSettings?.sale_partner_split_percent, 0)
  const rentInitialCommissionPercent = safeNumber(commissionSettings?.rent_initial_commission_percent, 10)
  const rentRecurringCommissionPercent = safeNumber(commissionSettings?.rent_recurring_commission_percent, 8)
  const rentBrokerSplitPercent = safeNumber(commissionSettings?.rent_broker_split_percent, 50)
  const rentPartnerSplitPercent = safeNumber(commissionSettings?.rent_partner_split_percent, 0)

  const propertyForTabs = {
    ...property,
    property_category_name,
    owner_profile: ownerProfileRes.data ?? null,
    created_by_profile: createdByProfileRes.data ?? null,
    owner_person: ownerPersonForUi,
    owner_person_restricted: ownerPersonRestricted,
    property_commission_settings: commissionSettings,
    sale_commission_percent: saleCommissionPercent,
    sale_broker_split_percent: saleBrokerSplitPercent,
    sale_partner_split_percent: salePartnerSplitPercent,
    rent_initial_commission_percent: rentInitialCommissionPercent,
    rent_recurring_commission_percent: rentRecurringCommissionPercent,
    rent_broker_split_percent: rentBrokerSplitPercent,
    rent_partner_split_percent: rentPartnerSplitPercent,
    commission_percent: saleCommissionPercent, // compatibilidade legada
    can_view_legal_data: canViewLegalData,
    can_edit_overview_data: canEditOverviewData,
    can_edit_commission_percent: canEditOverviewData,
    registry_number: canViewLegalData ? (property.registry_number ?? null) : null,
    registry_office: canViewLegalData ? (property.registry_office ?? null) : null,
  }

  const normalizedFeatures = normalizePropertyFeatures(features?.catalog ?? [], features?.values ?? [])

  const featuresCatalog = (normalizedFeatures.catalog ?? []).filter((feature) => {
    const key = feature?.key
    return key ? !propertyKeys.has(key) : true
  })

  const rawTab = resolvedSearchParams?.tab
  const tab = typeof rawTab === 'string' ? rawTab : null
  const initialTab =
    tab === 'overview' ||
    tab === 'features' ||
    tab === 'media' ||
    (tab === 'documents' && canViewLegalData) ||
    tab === 'publish' ||
    tab === 'campaign' ||
    tab === 'negociacoes'
      ? tab
      : null

  const initialNegotiationId =
    typeof resolvedSearchParams?.negotiationId === 'string' ? resolvedSearchParams.negotiationId : null
  const initialProposalId =
    typeof resolvedSearchParams?.proposalId === 'string' ? resolvedSearchParams.proposalId : null

  const propertyCategories = categoriesRes?.data ?? []

  return (
    <main className="p-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <Link href="/properties" className="text-sm text-[var(--muted-foreground)] hover:underline">
            Imóveis
          </Link>
          <h1 className="text-2xl font-bold text-[var(--foreground)]">{property.title ? String(property.title) : 'Imóvel'}</h1>
          <p className="text-xs text-[var(--muted-foreground)]">ID: {propertyId}</p>
          <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-xs text-[var(--muted-foreground)]">
            <span>
              Responsável: <span className="font-medium text-[var(--foreground)]">{ownerLabel}</span>
            </span>
            <span>
              Criado por: <span className="font-medium text-[var(--foreground)]">{createdByLabel}</span>
            </span>
          </div>
        </div>
        <Link
          href={`${siteBase}/imóveis/${propertyId}`}
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
          initialTab={initialTab as any}
          initialNegotiationId={initialNegotiationId}
          initialProposalId={initialProposalId}
          canViewLegalData={canViewLegalData}
          viewerRole={viewerRole}
          viewerIsActive={viewerIsActive}
        />
      </div>
    </main>
  )
}
