import Link from 'next/link'
import { notFound } from 'next/navigation'

import { Badge } from '@/components/ui/Badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { requireRole } from '@/lib/auth'
import { getSignedIncorporationMediaUrl } from '@/lib/incorporations/media'
import { createClient } from '@/lib/supabaseServer'

import {
  convertUnitReservationToSaleAction,
  getIncorporationFeaturesData,
} from '../actions'
import CreateIncorporationPlanFormClient from '../CreateIncorporationPlanFormClient'
import EditIncorporationPlanFormClient from '../EditIncorporationPlanFormClient'
import IncorporationHeaderCoverManagerClient from '../IncorporationHeaderCoverManagerClient'
import IncorporationMediaDocumentsManagerClient from '../IncorporationMediaDocumentsManagerClient'
import IncorporationFeaturesManager from '../IncorporationFeaturesManager'
import PlanMediaOrganizerClient from '../PlanMediaOrganizerClient'
import PlanUnitAssignmentClient from '../PlanUnitAssignmentClient'
import ReservationProposalFormClient from '../ReservationProposalFormClient'
import VirtualTourManagerClient from '../VirtualTourManagerClient'
import IncorporationUnitMirrorClient from './IncorporationUnitMirrorClient'
import type { IncorporationUnitVm, ReservationLeadOptionVm, UnitReservationVm } from './types'

export const dynamic = 'force-dynamic'
export const revalidate = 0

type TabKey = 'overview' | 'features' | 'plans' | 'media' | 'virtual_tour' | 'availability' | 'reservations'

type DeveloperRelation =
  | {
      id: string
      name: string
      logo_media_path: string | null
      cover_media_path: string | null
      commission_percent: number | null
    }
  | Array<{
      id: string
      name: string
      logo_media_path: string | null
      cover_media_path: string | null
      commission_percent: number | null
    }>
  | null

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
  ri_number: string | null
  ri_office: string | null
  status: string
  is_active: boolean
  launch_date: string | null
  delivery_date: string | null
  cover_media_path: string | null
  virtual_tour_url: string | null
  developers: DeveloperRelation
}

type PlanRow = {
  id: string
  name: string
  rooms_count: number | null
  bedrooms: number | null
  suites: number | null
  bathrooms: number | null
  parking: number | null
  area_m2: number | null
  description: string | null
  price_from: number | null
  is_active: boolean
  blocks_count: number
  floors_per_block: number
  units_per_floor: number
  block_prefix: string | null
  virtual_tour_url: string | null
}

type MediaRow = {
  id: string
  plan_id: string | null
  media_scope: string | null
  kind: string
  title: string | null
  path: string
  is_public: boolean
  is_cover: boolean
  position: number
}

type UnitRow = {
  id: string
  incorporation_id: string
  plan_id: string | null
  unit_code: string
  tower: string | null
  floor: number
  stack: string
  bedrooms: number | null
  suites: number | null
  bathrooms: number | null
  parking: number | null
  area_m2: number | null
  list_price: number | null
  status: string
  reserved_by_user_id: string | null
  reservation_expires_at: string | null
}

type ReservationUnitRelation =
  | { unit_code: string | null; floor: number | null; stack: string | null; list_price: number | null }
  | Array<{ unit_code: string | null; floor: number | null; stack: string | null; list_price: number | null }>
  | null

type ReservationRow = {
  id: string
  unit_id: string
  broker_user_id: string
  lead_id: string | null
  notes: string | null
  status: string
  expires_at: string
  created_at: string
  updated_at: string
  incorporation_units: ReservationUnitRelation
}

type SignedMediaRow = MediaRow & { signed_url: string | null }

type LeadRow = {
  id: string
  client_name: string | null
  phone_raw: string | null
  email: string | null
}

type IncorporationProposalRow = {
  id: string
  reservation_id: string | null
  unit_id: string
  lead_id: string | null
  client_name: string
  offer_value: number
  status: string
  recipient_email: string | null
  email_delivery_status?: string | null
  whatsapp_delivery_status?: string | null
  pdf_storage_path?: string | null
  sent_at: string | null
  created_at: string
}

function asSingle<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null
  if (Array.isArray(value)) return value[0] ?? null
  return value
}

function formatCurrency(value: number | null | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '-'
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(value)
}

function formatDate(value: string | null | undefined): string {
  if (!value) return '-'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return '-'
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium' }).format(d)
}

function normalizeTab(raw: string | undefined): TabKey {
  if (raw === 'overview' || raw === 'features' || raw === 'plans' || raw === 'media' || raw === 'virtual_tour' || raw === 'availability' || raw === 'reservations') {
    return raw
  }
  return 'overview'
}

function statusVariant(status: string): 'success' | 'warning' | 'info' | 'secondary' {
  if (status === 'launch' || status === 'delivered') return 'success'
  if (status === 'construction' || status === 'pre_launch') return 'warning'
  if (status === 'draft' || status === 'paused') return 'secondary'
  return 'info'
}

function featureValueToText(featureType: string, value: { value_boolean: boolean | null; value_number: number | null; value_text: string | null; value_json: unknown | null }): string | null {
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

function isSchemaMissingError(code: string | null | undefined, message: string | null | undefined): boolean {
  const normalizedCode = String(code || '')
  const normalizedMessage = String(message || '').toLowerCase()
  return (
    normalizedCode === '42703' ||
    normalizedCode === '42P01' ||
    normalizedCode === 'PGRST204' ||
    normalizedCode === 'PGRST205' ||
    normalizedMessage.includes('does not exist') ||
    normalizedMessage.includes('column')
  )
}

export default async function IncorporationDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ incorporationId: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const [viewer, resolvedParams, resolvedSearch] = await Promise.all([
    requireRole(['admin', 'gestor', 'corretor']),
    params,
    searchParams,
  ]) 

  const incorporationId = resolvedParams.incorporationId
  const tabParamRaw = resolvedSearch.tab
  const tabParam =
    Array.isArray(tabParamRaw) ? tabParamRaw[tabParamRaw.length - 1] : typeof tabParamRaw === 'string' ? tabParamRaw : undefined
  const currentTab = normalizeTab(tabParam)
  const planParamRaw = resolvedSearch.plan
  const selectedPlanIdFromQuery = (
    Array.isArray(planParamRaw) ? planParamRaw[planParamRaw.length - 1] : typeof planParamRaw === 'string' ? planParamRaw : null
  )?.trim() || null
  const isManager = viewer.role === 'admin' || viewer.role === 'gestor'

  const supabase = await createClient()
  let reservationsQuery = supabase
    .from('unit_reservations')
    .select('id,unit_id,broker_user_id,lead_id,notes,status,expires_at,created_at,updated_at,incorporation_units(unit_code,floor,stack,list_price)')
    .eq('incorporation_id', incorporationId)
    .order('created_at', { ascending: false })
    .limit(200)

  if (!isManager) reservationsQuery = reservationsQuery.eq('broker_user_id', viewer.id)

  const [incorporationRes, plansRes, mediaRes, unitsRes, reservationsRes, featuresData] = await Promise.all([
    supabase
      .from('incorporations')
      .select('id,slug,name,headline,description,city,neighborhood,state,address,ri_number,ri_office,status,is_active,launch_date,delivery_date,cover_media_path,virtual_tour_url,developers(id,name,logo_media_path,cover_media_path,commission_percent)')
      .eq('id', incorporationId)
      .maybeSingle(),
    supabase
      .from('incorporation_plans')
      .select('id,name,rooms_count,bedrooms,suites,bathrooms,parking,area_m2,description,price_from,is_active,blocks_count,floors_per_block,units_per_floor,block_prefix,virtual_tour_url,position')
      .eq('incorporation_id', incorporationId)
      .order('position', { ascending: true })
      .order('created_at', { ascending: true }),
    supabase
      .from('incorporation_media')
      .select('id,plan_id,media_scope,kind,title,path,is_public,is_cover,position,created_at')
      .eq('incorporation_id', incorporationId)
      .order('position', { ascending: true })
      .order('created_at', { ascending: true }),
    supabase
      .from('incorporation_units')
      .select('id,incorporation_id,plan_id,unit_code,tower,floor,stack,bedrooms,suites,bathrooms,parking,area_m2,list_price,status,reserved_by_user_id,reservation_expires_at')
      .eq('incorporation_id', incorporationId)
      .order('floor', { ascending: false })
      .order('stack', { ascending: true })
      .order('unit_code', { ascending: true }),
    reservationsQuery,
    getIncorporationFeaturesData(incorporationId),
  ])

  if (incorporationRes.error) {
    return (
      <main className="space-y-4 p-6">
        <Link href="/properties/incorporations" className="text-sm text-[var(--muted-foreground)] hover:underline">
          Incorporações
        </Link>
        <p className="text-sm text-[var(--destructive)]">{incorporationRes.error.message}</p>
      </main>
    )
  }

  const incorporation = incorporationRes.data as IncorporationRow | null
  if (!incorporation) return notFound()

  const plans = (plansRes.data || []) as PlanRow[]
  const mediaRows = (mediaRes.data || []) as MediaRow[]
  const unitRows = (unitsRes.data || []) as UnitRow[]
  const reservationRows = (reservationsRes.data || []) as ReservationRow[]

  const leadsQuery = supabase
    .from('leads')
    .select('id,client_name,phone_raw,email')
    .order('created_at', { ascending: false })
    .limit(300)
  if (!isManager) {
    leadsQuery.eq('owner_user_id', viewer.id)
  }
  const { data: leadsRows } = await leadsQuery
  const leadOptions = ((leadsRows || []) as LeadRow[])
    .filter((row) => row.client_name)
    .map((row) => ({
      id: row.id,
      clientName: row.client_name || `Lead ${row.id.slice(0, 8)}`,
      phone: row.phone_raw,
      email: row.email,
    })) as ReservationLeadOptionVm[]
  const leadById = new Map(leadOptions.map((row) => [row.id, row]))

  let proposalsRows: IncorporationProposalRow[] = []
  const proposalsQuery = supabase
    .from('incorporation_client_proposals')
    .select('id,reservation_id,unit_id,lead_id,client_name,offer_value,status,recipient_email,email_delivery_status,whatsapp_delivery_status,pdf_storage_path,sent_at,created_at')
    .eq('incorporation_id', incorporationId)
    .order('created_at', { ascending: false })
    .limit(500)

  if (!isManager) {
    proposalsQuery.eq('broker_user_id', viewer.id)
  }
  let { data: proposalsData, error: proposalsError } = await proposalsQuery
  if (proposalsError && isSchemaMissingError(proposalsError.code, proposalsError.message)) {
    let fallbackQuery = supabase
      .from('incorporation_client_proposals')
      .select('id,reservation_id,unit_id,lead_id,client_name,offer_value,status,recipient_email,sent_at,created_at')
      .eq('incorporation_id', incorporationId)
      .order('created_at', { ascending: false })
      .limit(500)
    if (!isManager) fallbackQuery = fallbackQuery.eq('broker_user_id', viewer.id)
    const fallbackRes = await fallbackQuery
    proposalsData = (fallbackRes.data as typeof proposalsData) || null
    proposalsError = fallbackRes.error
  }
  if (!proposalsError) {
    const normalizedRows = (proposalsData || []) as Array<Record<string, unknown>>
    proposalsRows = normalizedRows.map((item) => ({
      id: String(item.id || ''),
      reservation_id: item.reservation_id ? String(item.reservation_id) : null,
      unit_id: String(item.unit_id || ''),
      lead_id: item.lead_id ? String(item.lead_id) : null,
      client_name: String(item.client_name || ''),
      offer_value: Number(item.offer_value || 0),
      status: String(item.status || ''),
      recipient_email: item.recipient_email ? String(item.recipient_email) : null,
      email_delivery_status: item.email_delivery_status ? String(item.email_delivery_status) : null,
      whatsapp_delivery_status: item.whatsapp_delivery_status ? String(item.whatsapp_delivery_status) : null,
      pdf_storage_path: item.pdf_storage_path ? String(item.pdf_storage_path) : null,
      sent_at: item.sent_at ? String(item.sent_at) : null,
      created_at: String(item.created_at || ''),
    }))
  }
  const proposalPdfEntries = await Promise.all(
    proposalsRows.map(async (proposal) => ({
      id: proposal.id,
      signedUrl: await getSignedIncorporationMediaUrl(proposal.pdf_storage_path || null),
    }))
  )
  const proposalPdfUrlById = new Map(proposalPdfEntries.map((item) => [item.id, item.signedUrl]))
  const proposalsByReservationId = new Map<string, IncorporationProposalRow[]>()
  for (const proposal of proposalsRows) {
    if (!proposal.reservation_id) continue
    proposalsByReservationId.set(proposal.reservation_id, [
      ...(proposalsByReservationId.get(proposal.reservation_id) || []),
      proposal,
    ])
  }

  const developer = asSingle(incorporation.developers)
  const featureCatalog = featuresData.catalog
  const featureValues = featuresData.values

  const featureCatalogMap = new Map(featureCatalog.map((item) => [item.id, item]))
  const selectedFeatureSummaries = featureValues
    .map((value) => {
      const feature = featureCatalogMap.get(value.feature_id)
      if (!feature) return null
      const text = featureValueToText(feature.type, value)
      if (!text) return null
      if (feature.type === 'boolean') return feature.label_pt
      return `${feature.label_pt}: ${text}`
    })
    .filter((item): item is string => Boolean(item))

  const [coverUrl, developerLogoUrl, signedMedia] = await Promise.all([
    getSignedIncorporationMediaUrl(incorporation.cover_media_path),
    getSignedIncorporationMediaUrl(developer?.logo_media_path || null),
    Promise.all(
      mediaRows.map(async (item) => ({
        ...item,
        signed_url: await getSignedIncorporationMediaUrl(item.path),
      }))
    ),
  ])

  const activePlanPrices = plans
    .filter((plan) => plan.is_active && typeof plan.price_from === 'number' && plan.price_from > 0)
    .map((plan) => Number(plan.price_from))
  const minPrice = activePlanPrices.length > 0 ? Math.min(...activePlanPrices) : null
  const maxPrice = activePlanPrices.length > 0 ? Math.max(...activePlanPrices) : null

  const inheritedMedia = signedMedia.filter((item) => !item.plan_id && (item.media_scope === null || item.media_scope === 'incorporation' || item.media_scope === 'common_areas' || item.media_scope === 'project'))
  const ownMediaByPlan = new Map<string, SignedMediaRow[]>()
  for (const item of signedMedia) {
    if (!item.plan_id) continue
    ownMediaByPlan.set(item.plan_id, [...(ownMediaByPlan.get(item.plan_id) || []), item])
  }

  const unitsForMirror: IncorporationUnitVm[] = unitRows.map((row) => ({
    id: row.id,
    incorporationId: row.incorporation_id,
    planId: row.plan_id,
    unitCode: row.unit_code,
    tower: row.tower,
    floor: row.floor,
    stack: row.stack,
    bedrooms: row.bedrooms,
    suites: row.suites,
    bathrooms: row.bathrooms,
    parking: row.parking,
    areaM2: row.area_m2,
    listPrice: row.list_price,
    status: row.status,
    reservedByUserId: row.reserved_by_user_id,
    reservationExpiresAt: row.reservation_expires_at,
  }))

  const unitsCountByPlanId = new Map<string, number>()
  for (const unit of unitRows) {
    if (!unit.plan_id) continue
    if (unit.status === 'blocked') continue
    unitsCountByPlanId.set(unit.plan_id, (unitsCountByPlanId.get(unit.plan_id) || 0) + 1)
  }
  const unitsVisibleCount = unitRows.filter((unit) => unit.status !== 'blocked').length
  const unitsReservedCount = unitRows.filter((unit) => unit.status === 'reserved').length
  const unitsSoldCount = unitRows.filter((unit) => unit.status === 'sold').length
  const unitsAvailableCount = unitRows.filter((unit) => unit.status === 'available').length

  const selectedPlan =
    (selectedPlanIdFromQuery
      ? plans.find((plan) => plan.id === selectedPlanIdFromQuery)
      : null) || plans[0] || null

  const selectedPlanOwnMedia = selectedPlan ? ownMediaByPlan.get(selectedPlan.id) || [] : []
  const planNameById = new Map(plans.map((plan) => [plan.id, plan.name]))
  const planIdByUnitId = new Map(unitRows.map((unit) => [unit.id, unit.plan_id]))

  const reservations: UnitReservationVm[] = reservationRows.map((row) => {
    const rel = asSingle(row.incorporation_units)
    const lead = row.lead_id ? leadById.get(row.lead_id) : null
    const mappedPlanId = planIdByUnitId.get(row.unit_id) || null
    return {
      id: row.id,
      unitId: row.unit_id,
      brokerUserId: row.broker_user_id,
      brokerLabel: row.broker_user_id.slice(0, 8),
      leadId: row.lead_id,
      leadLabel: lead?.clientName || null,
      planLabel: mappedPlanId ? planNameById.get(mappedPlanId) || null : null,
      notes: row.notes || null,
      status: row.status,
      expiresAt: row.expires_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      unitCode: rel?.unit_code ?? null,
      floor: rel?.floor ?? null,
      stack: rel?.stack ?? null,
      listPrice: rel?.list_price ?? null,
    }
  })

  const tabs: Array<{ key: TabKey; label: string }> = [
    { key: 'overview', label: 'Visao geral' },
    { key: 'features', label: 'Características' },
    { key: 'plans', label: 'Plantas e tipologias' },
    { key: 'media', label: 'Mídias e documentos' },
    { key: 'virtual_tour', label: 'Tour virtual (RV)' },
    { key: 'availability', label: 'Disponibilidade' },
    { key: 'reservations', label: isManager ? 'Reservas' : 'Minhas reservas' },
  ]

  const locationLabel = [incorporation.address, incorporation.neighborhood, incorporation.city, incorporation.state].filter(Boolean).join(' / ') || '-'

  async function convertReservationFormAction(formData: FormData) {
    'use server'
    await convertUnitReservationToSaleAction(formData)
  }

  return (
    <main className="space-y-6 p-6">
      <div className="space-y-2">
        <Link href="/properties/incorporations" className="text-sm text-[var(--muted-foreground)] hover:underline">
          Incorporações
        </Link>
        <div className="overflow-hidden rounded-[var(--radius-lg)] border border-black/10 bg-white shadow-sm">
          <div
            className="relative min-h-[220px] border-b border-black/10"
            style={{
              background: coverUrl
                ? `linear-gradient(180deg, rgba(23,26,33,.16), rgba(23,26,33,.72)), url(${coverUrl}) center/cover`
                : 'linear-gradient(120deg, rgba(23,26,33,.95), rgba(41,68,135,.86), rgba(255,104,31,.72))',
            }}
          >
            <div className="absolute inset-0 flex flex-col justify-end gap-4 p-6 text-white">
              <div className="flex flex-wrap items-center gap-3">
                <Badge variant={incorporation.is_active ? 'success' : 'secondary'}>
                  {incorporation.is_active ? 'Ativo no público' : 'Não publicado'}
                </Badge>
                <Badge variant={statusVariant(incorporation.status)}>{incorporation.status}</Badge>
                {minPrice ? <Badge variant="warning">A partir de {formatCurrency(minPrice)}</Badge> : null}
              </div>
              <div className="flex flex-wrap items-center gap-4">
                <div className="min-w-0">
                  <h1 className="text-2xl font-bold">{incorporation.name}</h1>
                  <p className="text-sm text-white/85">{incorporation.headline || locationLabel}</p>
                </div>
                <div className="ml-auto flex min-w-[220px] items-center gap-3 rounded-xl border border-white/25 bg-white/10 px-3 py-2 backdrop-blur-sm">
                  <div className="h-10 w-10 overflow-hidden rounded-lg border border-white/20 bg-white/10">
                    {developerLogoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={developerLogoUrl} alt={developer?.name || 'Construtora'} className="h-full w-full object-cover" />
                    ) : null}
                  </div>
                  <div className="min-w-0">
                    <p className="text-[11px] uppercase tracking-wide text-white/70">Construtora</p>
                    <p className="truncate text-sm font-semibold text-white">{developer?.name || '-'}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 p-3">
            {tabs.map((tab) => (
              <Link
                key={tab.key}
                href={`/properties/incorporations/${incorporationId}?tab=${tab.key}`}
                scroll={false}
                prefetch={false}
                className={`rounded-[var(--radius)] border px-3 py-2 text-sm font-medium transition-colors ${
                  currentTab === tab.key
                    ? 'border-[var(--border)] bg-[var(--muted)] text-[var(--foreground)]'
                    : 'border-[var(--border)] bg-white text-[var(--muted-foreground)] hover:bg-[var(--accent)]'
                }`}
              >
                {tab.label}
              </Link>
            ))}
          </div>
        </div>

        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          <Card className="border-black/10 bg-white">
            <CardContent className="pt-4">
              <p className="text-[11px] uppercase tracking-wide text-[var(--muted-foreground)]">Unidades visiveis</p>
              <p className="mt-1 text-2xl font-bold text-[var(--foreground)]">{unitsVisibleCount}</p>
            </CardContent>
          </Card>
          <Card className="border-black/10 bg-white">
            <CardContent className="pt-4">
              <p className="text-[11px] uppercase tracking-wide text-[var(--muted-foreground)]">Disponíveis</p>
              <p className="mt-1 text-2xl font-bold text-emerald-600">{unitsAvailableCount}</p>
            </CardContent>
          </Card>
          <Card className="border-black/10 bg-white">
            <CardContent className="pt-4">
              <p className="text-[11px] uppercase tracking-wide text-[var(--muted-foreground)]">Reservadas</p>
              <p className="mt-1 text-2xl font-bold text-amber-600">{unitsReservedCount}</p>
            </CardContent>
          </Card>
          <Card className="border-black/10 bg-white">
            <CardContent className="pt-4">
              <p className="text-[11px] uppercase tracking-wide text-[var(--muted-foreground)]">Vendidas</p>
              <p className="mt-1 text-2xl font-bold text-sky-600">{unitsSoldCount}</p>
            </CardContent>
          </Card>
        </div>
      </div>

      {currentTab === 'overview' ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Dados do empreendimento</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p><span className="text-[var(--muted-foreground)]">Endereco:</span> {locationLabel}</p>
              <p><span className="text-[var(--muted-foreground)]">Slug público:</span> {incorporation.slug}</p>
              <p><span className="text-[var(--muted-foreground)]">Lancamento:</span> {formatDate(incorporation.launch_date)}</p>
              <p><span className="text-[var(--muted-foreground)]">Entrega:</span> {formatDate(incorporation.delivery_date)}</p>
              <p>
                <span className="text-[var(--muted-foreground)]">Preço por tipologia:</span>{' '}
                {minPrice && maxPrice ? `${formatCurrency(minPrice)} até ${formatCurrency(maxPrice)}` : 'Não informado'}
              </p>
              <p>
                <span className="text-[var(--muted-foreground)]">Comissão da construtora:</span>{' '}
                {typeof developer?.commission_percent === 'number' ? `${developer.commission_percent.toFixed(2)}%` : '-'}
              </p>
              {isManager && developer?.id ? (
                <Link
                  href={`/properties/incorporations/developers/${developer.id}`}
                  className="inline-flex rounded-[var(--radius)] border border-[var(--border)] px-3 py-2 text-xs font-medium text-[var(--foreground)] hover:bg-[var(--accent)]"
                >
                  Ajustar comissão na construtora
                </Link>
              ) : null}
              {isManager ? (
                <IncorporationHeaderCoverManagerClient
                  incorporationId={incorporation.id}
                  hasDeveloperCover={Boolean(developer?.cover_media_path)}
                  hasDeveloperLogo={Boolean(developer?.logo_media_path)}
                />
              ) : null}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Registro e herancas</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p><span className="text-[var(--muted-foreground)]">Numero RI:</span> {incorporation.ri_number || '-'}</p>
              <p><span className="text-[var(--muted-foreground)]">Cartorio:</span> {incorporation.ri_office || '-'}</p>
              <p><span className="text-[var(--muted-foreground)]">Status comercial:</span> {incorporation.status}</p>
              <p><span className="text-[var(--muted-foreground)]">Características herdadas:</span> {selectedFeatureSummaries.length}</p>
              <p><span className="text-[var(--muted-foreground)]">Mídias herdadas:</span> {inheritedMedia.length}</p>
              <p><span className="text-[var(--muted-foreground)]">Descrição:</span> {incorporation.description || '-'}</p>
            </CardContent>
          </Card>
        </div>
      ) : null}

      {currentTab === 'features' ? (
        isManager ? (
          <IncorporationFeaturesManager incorporationId={incorporation.id} catalog={featureCatalog} initialValues={featureValues} />
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>Características herdadas pelas tipologias</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              {selectedFeatureSummaries.length === 0 ? (
                <p className="text-sm text-[var(--muted-foreground)]">Sem características marcadas.</p>
              ) : (
                selectedFeatureSummaries.map((summary) => (
                  <Badge key={summary} variant="outline">
                    {summary}
                  </Badge>
                ))
              )}
            </CardContent>
          </Card>
        )
      ) : null}

      {currentTab === 'plans' ? (
        <div className="space-y-4">
          {isManager ? (
            <Card>
              <details>
                <summary className="cursor-pointer px-4 py-3">
                  <p className="text-base font-semibold text-[var(--foreground)]">Criar tipologia e gerar unidades</p>
                  <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                    Secao colapsavel para manter a tela limpa. Expanda apenas quando for cadastrar nova planta.
                  </p>
                </summary>
                <CardContent className="border-t border-[var(--border)] pt-4">
                  <CreateIncorporationPlanFormClient incorporationId={incorporation.id} />
                </CardContent>
              </details>
            </Card>
          ) : null}

          {plans.length === 0 ? (
            <Card><CardContent className="pt-6 text-sm text-[var(--muted-foreground)]">Nenhuma planta cadastrada.</CardContent></Card>
          ) : (
            <div className="space-y-3">
              <div className="space-y-3">
                <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
                  {plans.map((plan) => {
                    const ownMedia = ownMediaByPlan.get(plan.id) || []
                    const cover =
                      ownMedia.find((item) => item.is_cover && item.signed_url)?.signed_url ||
                      ownMedia.find((item) => item.signed_url)?.signed_url ||
                      inheritedMedia.find((item) => item.is_cover && item.signed_url)?.signed_url ||
                      inheritedMedia.find((item) => item.signed_url)?.signed_url ||
                      null
                    const expectedUnits = plan.blocks_count * plan.floors_per_block * plan.units_per_floor
                    const currentUnits = unitsCountByPlanId.get(plan.id) || 0
                    const isSelected = selectedPlan?.id === plan.id

                    return (
                      <Link
                        key={plan.id}
                        href={`/properties/incorporations/${incorporation.id}?tab=plans&plan=${plan.id}`}
                        scroll={false}
                        prefetch={false}
                        className={`group overflow-hidden rounded-[var(--radius-lg)] border bg-white shadow-sm transition ${
                          isSelected
                            ? 'border-[var(--primary)] ring-2 ring-[var(--primary)]/15'
                            : 'border-black/10 hover:border-[var(--primary)]/40'
                        }`}
                      >
                        <div
                          className="h-24 border-b border-black/10"
                          style={{
                            background: cover
                              ? `linear-gradient(180deg, rgba(23,26,33,.08), rgba(23,26,33,.48)), url(${cover}) center/cover`
                              : 'linear-gradient(130deg, rgba(41,68,135,.9), rgba(255,104,31,.72))',
                          }}
                        />
                        <div className="space-y-2 p-3">
                          <div className="flex items-center justify-between gap-2">
                            <p className="truncate text-sm font-semibold text-[var(--foreground)]">{plan.name}</p>
                            <Badge variant={plan.is_active ? 'success' : 'secondary'}>
                              {plan.is_active ? 'Ativa' : 'Inativa'}
                            </Badge>
                          </div>
                          <p className="text-xs text-[var(--muted-foreground)]">
                            {typeof plan.bedrooms === 'number' ? `${plan.bedrooms}q` : '-'} /{' '}
                            {typeof plan.rooms_count === 'number' ? `${plan.rooms_count} comodos` : '-'} /{' '}
                            {typeof plan.area_m2 === 'number' ? `${plan.area_m2} m2` : 'm2 n/i'}
                          </p>
                          <p className="text-xs font-semibold text-[var(--foreground)]">
                            {formatCurrency(plan.price_from)}
                          </p>
                          <p className="text-[11px] text-[var(--muted-foreground)]">
                            Unidades: {currentUnits} / {expectedUnits} | Mídias proprias: {ownMedia.length}
                          </p>
                        </div>
                      </Link>
                    )
                  })}
                </div>

                <Card>
                  <CardContent className="pt-4 text-xs text-[var(--muted-foreground)]">
                    Clique em uma planta para abrir o painel de edicao leve, organizar mídias e personalizar
                    unidades por bloco/andar/coluna.
                  </CardContent>
                </Card>
              </div>

              {selectedPlan ? (
                <div className="space-y-3">
                  <Card>
                    <details open={!isManager}>
                      <summary className="cursor-pointer px-4 py-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-base font-semibold text-[var(--foreground)]">
                            Editar tipologia: {selectedPlan.name}
                          </p>
                          <Badge variant={selectedPlan.is_active ? 'success' : 'secondary'}>
                            {selectedPlan.is_active ? 'Ativa' : 'Inativa'}
                          </Badge>
                        </div>
                        <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                          Abra para editar dados completos da planta/tipologia.
                        </p>
                      </summary>
                      <CardContent className="space-y-3 border-t border-[var(--border)] pt-4">
                        {isManager ? (
                          <EditIncorporationPlanFormClient
                            incorporationId={incorporation.id}
                            plan={{
                              id: selectedPlan.id,
                              name: selectedPlan.name,
                              roomsCount: selectedPlan.rooms_count,
                              bedrooms: selectedPlan.bedrooms,
                              suites: selectedPlan.suites,
                              bathrooms: selectedPlan.bathrooms,
                              parking: selectedPlan.parking,
                              areaM2: selectedPlan.area_m2,
                              description: selectedPlan.description,
                              priceFrom: selectedPlan.price_from,
                              isActive: selectedPlan.is_active,
                              blocksCount: selectedPlan.blocks_count,
                              floorsPerBlock: selectedPlan.floors_per_block,
                              unitsPerFloor: selectedPlan.units_per_floor,
                              blockPrefix: selectedPlan.block_prefix,
                              virtualTourUrl: selectedPlan.virtual_tour_url,
                            }}
                          />
                        ) : (
                          <div className="space-y-2 text-sm text-[var(--muted-foreground)]">
                            <p>{selectedPlan.description || 'Sem descrição da tipologia.'}</p>
                            <p>
                              Configuração: {selectedPlan.blocks_count} bloco(s), {selectedPlan.floors_per_block}{' '}
                              andares, {selectedPlan.units_per_floor} apt/andar
                            </p>
                          </div>
                        )}
                      </CardContent>
                    </details>
                  </Card>

                  <Card>
                    <details open={!isManager}>
                      <summary className="cursor-pointer px-4 py-3">
                        <p className="text-base font-semibold text-[var(--foreground)]">
                          Mídias da tipologia: {selectedPlan.name}
                        </p>
                        <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                          Organize capa, ordem e visibilidade das mídias vinculadas a esta planta.
                        </p>
                      </summary>
                      <CardContent className="border-t border-[var(--border)] pt-4">
                        {isManager ? (
                          <PlanMediaOrganizerClient
                            incorporationId={incorporation.id}
                            planId={selectedPlan.id}
                            ownMedia={selectedPlanOwnMedia.map((item) => ({
                              id: item.id,
                              title: item.title,
                              position: item.position,
                              isPublic: item.is_public,
                              isCover: item.is_cover,
                              signedUrl: item.signed_url,
                            }))}
                            inheritedMedia={inheritedMedia.map((item) => ({
                              id: item.id,
                              title: item.title,
                              mediaScope: item.media_scope,
                              signedUrl: item.signed_url,
                            }))}
                          />
                        ) : (
                          <div className="grid grid-cols-3 gap-2">
                            {[...selectedPlanOwnMedia.slice(0, 6), ...inheritedMedia.slice(0, 3)].map((item) => (
                              <div key={item.id} className="h-20 overflow-hidden rounded border border-[var(--border)] bg-[var(--muted)]/20">
                                {item.signed_url ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img src={item.signed_url} alt={item.title || selectedPlan.name} className="h-full w-full object-cover" />
                                ) : null}
                              </div>
                            ))}
                          </div>
                        )}
                      </CardContent>
                    </details>
                  </Card>

                  {isManager ? (
                    <Card>
                      <details>
                        <summary className="cursor-pointer px-4 py-3">
                          <p className="text-base font-semibold text-[var(--foreground)]">Aplicar tipologia em unidades</p>
                          <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                            Expanda para mapear unidades, editar andares e replicar configurações.
                          </p>
                        </summary>
                        <CardContent className="border-t border-[var(--border)] pt-4">
                          <PlanUnitAssignmentClient
                            incorporationId={incorporation.id}
                            planId={selectedPlan.id}
                            planName={selectedPlan.name}
                            availablePlans={plans.map((plan) => ({
                              id: plan.id,
                              name: plan.name,
                              isActive: plan.is_active,
                            }))}
                            units={unitRows.map((unit) => ({
                              id: unit.id,
                              unitCode: unit.unit_code,
                              tower: unit.tower,
                              floor: unit.floor,
                              stack: unit.stack,
                              status: unit.status,
                              planId: unit.plan_id,
                            }))}
                          />
                        </CardContent>
                      </details>
                    </Card>
                  ) : null}
                </div>
              ) : null}
            </div>
          )}
        </div>
      ) : null}

      {currentTab === 'media' ? (
        <IncorporationMediaDocumentsManagerClient
          incorporationId={incorporation.id}
          plans={plans.map((plan) => ({ id: plan.id, name: plan.name }))}
          canEdit={isManager}
          items={signedMedia.map((item) => ({
            id: item.id,
            title: item.title,
            kind: item.kind,
            mediaScope: item.media_scope,
            planId: item.plan_id,
            planName: item.plan_id ? planNameById.get(item.plan_id) || null : null,
            isPublic: item.is_public,
            isCover: item.is_cover,
            position: item.position,
            signedUrl: item.signed_url,
          }))}
        />
      ) : null}

      {currentTab === 'virtual_tour' ? (
        <Card>
          <CardHeader>
            <CardTitle>Tour virtual (RV)</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <VirtualTourManagerClient
              incorporationId={incorporation.id}
              incorporationTourUrl={incorporation.virtual_tour_url}
              plans={plans.map((plan) => ({
                id: plan.id,
                name: plan.name,
                isActive: plan.is_active,
                virtualTourUrl: plan.virtual_tour_url,
              }))}
              canEdit={isManager}
            />
          </CardContent>
        </Card>
      ) : null}

      {currentTab === 'availability' ? (
        <Card>
          <CardHeader><CardTitle>Espelho de disponibilidade</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-[var(--muted-foreground)]">
              Clique na unidade para abrir o drawer lateral e reservar.
            </p>
            <IncorporationUnitMirrorClient
              incorporationId={incorporation.id}
              initialUnits={unitsForMirror}
              canReserve={viewer.role === 'admin' || viewer.role === 'gestor' || viewer.role === 'corretor'}
              viewerId={viewer.id}
              leadOptions={leadOptions}
            />
          </CardContent>
        </Card>
      ) : null}

      {currentTab === 'reservations' ? (
        reservations.length === 0 ? (
          <Card><CardContent className="pt-6 text-sm text-[var(--muted-foreground)]">Sem reservas neste empreendimento.</CardContent></Card>
        ) : (
          <div className="grid gap-3">
            {reservations.map((reservation) => (
              <Card key={reservation.id}>
                <CardContent className="space-y-3 pt-6">
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="min-w-[220px]">
                      <p className="text-sm font-semibold text-[var(--foreground)]">
                        Unidade {reservation.unitCode || reservation.unitId}
                      </p>
                      <p className="text-xs text-[var(--muted-foreground)]">
                        Andar {reservation.floor ?? '-'} / Coluna {reservation.stack ?? '-'}
                      </p>
                      {reservation.planLabel ? (
                        <p className="text-xs text-[var(--muted-foreground)]">
                          Tipologia: <span className="font-medium text-[var(--foreground)]">{reservation.planLabel}</span>
                        </p>
                      ) : null}
                    </div>
                    <Badge variant={reservation.status === 'active' ? 'warning' : 'secondary'}>
                      {reservation.status}
                    </Badge>
                    <div className="text-sm text-[var(--muted-foreground)]">
                      Valor: <span className="font-medium text-[var(--foreground)]">{formatCurrency(reservation.listPrice)}</span>
                    </div>
                    {reservation.leadLabel ? (
                      <div className="text-xs text-[var(--muted-foreground)]">
                        Cliente: <span className="font-medium text-[var(--foreground)]">{reservation.leadLabel}</span>
                      </div>
                    ) : null}
                  </div>

                  {reservation.notes ? (
                    <div className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--muted)]/20 px-3 py-2 text-xs text-[var(--foreground)]">
                      <span className="font-semibold text-[var(--muted-foreground)]">Observação privada: </span>
                      {reservation.notes}
                    </div>
                  ) : null}

                  {(() => {
                    const reservationProposals = proposalsByReservationId.get(reservation.id) || []
                    if (reservationProposals.length === 0) return null
                    return (
                      <div className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--muted)]/20 p-3">
                        <p className="text-xs font-semibold text-[var(--foreground)]">Propostas vinculadas</p>
                        <div className="mt-2 grid gap-2">
                          {reservationProposals.slice(0, 5).map((proposal) => (
                            <div key={proposal.id} className="flex flex-wrap items-center gap-2 text-xs">
                              <Badge variant={proposal.status === 'sent' ? 'info' : 'secondary'}>{proposal.status}</Badge>
                              <span className="text-[var(--foreground)] font-medium">
                                {proposal.client_name}
                              </span>
                              <span className="text-[var(--muted-foreground)]">
                                {formatCurrency(proposal.offer_value)}
                              </span>
                              {proposal.status === 'sent' ? (
                                <>
                                  <Badge variant={proposal.email_delivery_status === 'sent' ? 'success' : proposal.email_delivery_status === 'error' ? 'destructive' : 'secondary'}>
                                    email {proposal.email_delivery_status || 'pending'}
                                  </Badge>
                                  <Badge variant={proposal.whatsapp_delivery_status === 'sent' ? 'success' : proposal.whatsapp_delivery_status === 'error' ? 'destructive' : 'secondary'}>
                                    whatsapp {proposal.whatsapp_delivery_status || 'pending'}
                                  </Badge>
                                </>
                              ) : null}
                              {proposal.recipient_email ? (
                                <span className="text-[var(--muted-foreground)]">
                                  / {proposal.recipient_email}
                                </span>
                              ) : null}
                              {proposalPdfUrlById.get(proposal.id) ? (
                                <a
                                  href={proposalPdfUrlById.get(proposal.id) || '#'}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="rounded border border-[var(--border)] px-2 py-1 text-[11px] font-medium text-[var(--foreground)] hover:bg-[var(--accent)]"
                                >
                                  PDF
                                </a>
                              ) : null}
                            </div>
                          ))}
                        </div>
                      </div>
                    )
                  })()}

                  <ReservationProposalFormClient
                    incorporationId={incorporation.id}
                    unitId={reservation.unitId}
                    reservationId={reservation.id}
                    defaultLeadId={reservation.leadId}
                    defaultClientName={reservation.leadLabel}
                    defaultClientPhone={reservation.leadId ? leadById.get(reservation.leadId)?.phone : null}
                    defaultClientEmail={reservation.leadId ? leadById.get(reservation.leadId)?.email : null}
                  />

                  {isManager && reservation.status !== 'converted' ? (
                    <form action={convertReservationFormAction} className="grid w-full gap-2 border-t border-[var(--border)] pt-3 md:w-auto md:grid-cols-[140px_1fr_auto] md:items-center md:border-0 md:pt-0">
                      <input type="hidden" name="reservationId" value={reservation.id} />
                      <input type="hidden" name="incorporationId" value={incorporation.id} />
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        name="saleValue"
                        defaultValue={typeof reservation.listPrice === 'number' ? reservation.listPrice.toFixed(2) : ''}
                        className="h-9 rounded-[var(--radius)] border border-[var(--border)] bg-white px-2 text-xs"
                        placeholder="Valor venda"
                      />
                      <input
                        type="text"
                        name="note"
                        className="h-9 rounded-[var(--radius)] border border-[var(--border)] bg-white px-2 text-xs"
                        placeholder="Observação opcional"
                      />
                      <button
                        type="submit"
                        className="h-9 rounded-[var(--radius)] bg-emerald-600 px-3 text-xs font-semibold text-white"
                      >
                        Converter em venda
                      </button>
                    </form>
                  ) : null}
                </CardContent>
              </Card>
            ))}
          </div>
        )
      ) : null}
    </main>
  )
}
