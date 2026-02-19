'use server'

import { revalidatePath } from 'next/cache'

import { requireActiveUser, requireRole } from '@/lib/auth'
import {
  buildProposalEmailHtml,
  sendProposalByWhatsApp,
  sendProposalPdfByEmail,
} from '@/lib/incorporations/proposalDelivery'
import { buildIncorporationProposalPdf } from '@/lib/incorporations/proposalPdf'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabaseServer'

type ReserveUnitRpcRow = {
  reservation_id: string
  reserved_unit_id: string
  reserved_incorporation_id: string
  unit_status: string
  expires_at: string
}

type ConvertReservationRpcRow = {
  proposal_id: string
  payment_id: string | null
  reservation_id_out: string
  unit_id: string
  incorporation_id: string
  commission_percent: number
  commission_value: number
  broker_commission_value: number
  company_commission_value: number
  partner_commission_value: number
}

export interface IncorporationFeatureCatalogItem {
  id: string
  key: string
  label_pt: string
  group_name?: string | null
  type: string
  options?: unknown
  position?: number | null
}

export interface IncorporationFeatureValueRow {
  feature_id: string
  value_boolean: boolean | null
  value_number: number | null
  value_text: string | null
  value_json: unknown | null
}

export interface UpdateIncorporationFeatureItem {
  feature_id: string
  type: string
  value: unknown
}

export type ReserveUnitActionInput = {
  unitId: string
  leadId?: string | null
  clientNote?: string | null
  incorporationId?: string | null
}

export type ReserveUnitActionResult =
  | {
      success: true
      data: {
        reservationId: string
        unitId: string
        incorporationId: string
        unitStatus: string
        expiresAt: string
      }
    }
  | {
      success: false
      error: string
    }

type CreateIncorporationProposalActionResult =
  | {
      success: true
      data: {
        proposalId: string
        status: string
        emailDeliveryStatus?: 'pending' | 'sent' | 'skipped' | 'error'
        whatsappDeliveryStatus?: 'pending' | 'sent' | 'skipped' | 'error'
        proposalPdfUrl?: string | null
        deliveryMessage?: string | null
      }
    }
  | {
      success: false
      error: string
    }

function normalizeRpcRow(data: unknown): ReserveUnitRpcRow | null {
  if (!data) return null
  if (Array.isArray(data)) {
    const first = data[0]
    if (!first || typeof first !== 'object') return null
    return first as ReserveUnitRpcRow
  }
  if (typeof data === 'object') {
    return data as ReserveUnitRpcRow
  }
  return null
}

function normalizeConvertReservationRpcRow(data: unknown): ConvertReservationRpcRow | null {
  if (!data) return null
  if (Array.isArray(data)) {
    const first = data[0]
    if (!first || typeof first !== 'object') return null
    return first as ConvertReservationRpcRow
  }
  if (typeof data === 'object') {
    return data as ConvertReservationRpcRow
  }
  return null
}

function normalizeDigits(value: string): string {
  return value.replace(/\D/g, '')
}

function slugify(value: string): string {
  const ascii = value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
  return ascii
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
}

function parseDecimal(value: string | null | undefined): number | null {
  const normalized = String(value || '')
    .trim()
    .replace(',', '.')
  if (!normalized) return null
  const parsed = Number(normalized)
  if (!Number.isFinite(parsed)) return null
  return parsed
}

function parseInteger(value: string | null | undefined): number | null {
  const normalized = String(value || '').trim()
  if (!normalized) return null
  const parsed = Number.parseInt(normalized, 10)
  if (!Number.isFinite(parsed)) return null
  return parsed
}

function parseOptionalHttpUrl(value: string | null | undefined): { value: string | null; error?: string } {
  const raw = String(value || '').trim()
  if (!raw) return { value: null }

  try {
    const url = new URL(raw)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return { value: null, error: 'A URL deve comecar com http:// ou https://.' }
    }
    return { value: url.toString() }
  } catch {
    return { value: null, error: 'URL inválida.' }
  }
}

function normalizeTowerKey(value: string | null | undefined): string {
  const normalized = String(value || '').trim().toUpperCase()
  return normalized || 'SEM BLOCO'
}

function towerValueFromKey(towerKey: string): string | null {
  const normalized = normalizeTowerKey(towerKey)
  if (normalized === 'SEM BLOCO') return null
  return normalized
}

function towerCodeFromKey(towerKey: string): string {
  const normalized = normalizeTowerKey(towerKey)
  if (normalized === 'SEM BLOCO') return 'SB'
  const compact = normalized.replace(/[^A-Z0-9]/g, '')
  return compact || 'SB'
}

function compareStackValues(a: string, b: string): number {
  const left = String(a || '').trim().toUpperCase()
  const right = String(b || '').trim().toUpperCase()
  const aNum = Number(left)
  const bNum = Number(right)
  if (Number.isFinite(aNum) && Number.isFinite(bNum)) return aNum - bNum
  return left.localeCompare(right, 'pt-BR', { sensitivity: 'base' })
}

function stackCodeFromNumber(index: number): string {
  if (index <= 99) return String(index).padStart(2, '0')
  return `S${index}`
}

function blockLabelFromIndex(index: number): string {
  let value = index
  let label = ''
  do {
    label = String.fromCharCode(65 + (value % 26)) + label
    value = Math.floor(value / 26) - 1
  } while (value >= 0)
  return label
}

function sanitizeFileName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
}

function normalizeIncorporationMediaScope(value: string | null | undefined): 'incorporation' | 'project' | 'common_areas' | 'plan' {
  const raw = String(value || '').trim().toLowerCase()
  if (raw === 'project') return 'project'
  if (raw === 'common_areas') return 'common_areas'
  if (raw === 'plan') return 'plan'
  return 'incorporation'
}

function normalizeIncorporationMediaKind(value: string | null | undefined, mime: string | null | undefined): 'image' | 'video' | 'document' | 'floorplate' {
  const raw = String(value || '').trim().toLowerCase()
  if (raw === 'image' || raw === 'video' || raw === 'document' || raw === 'floorplate') {
    return raw
  }

  const normalizedMime = String(mime || '').toLowerCase()
  if (normalizedMime.startsWith('image/')) return 'image'
  if (normalizedMime.startsWith('video/')) return 'video'
  return 'document'
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
    normalizedMessage.includes('column') ||
    normalizedMessage.includes('schema cache')
  )
}

function asUploadFile(input: FormDataEntryValue | null): File | null {
  if (!input) return null
  if (typeof input === 'string') return null
  if (!(input instanceof File)) return null
  if (!input.size) return null
  return input
}

async function uploadDeveloperImage(
  file: File,
  params: { slug: string; kind: 'logo' | 'cover' }
): Promise<{ path: string } | { error: string }> {
  const maxSizeBytes = 10 * 1024 * 1024
  if (!file.type.startsWith('image/')) {
    return { error: `Arquivo de ${params.kind} precisa ser uma imagem.` }
  }
  if (file.size > maxSizeBytes) {
    return { error: `Arquivo de ${params.kind} excede 10MB.` }
  }

  const extFromName = file.name.includes('.') ? file.name.split('.').pop() || '' : ''
  const extFromMime = file.type.replace('image/', '')
  const ext = sanitizeFileName(extFromName || extFromMime || 'jpg') || 'jpg'
  const fileName = `${params.kind}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${ext}`
  const path = `developers/${params.slug}/${fileName}`

  const admin = createAdminClient()
  const { error } = await admin.storage.from('incorporation-media').upload(path, file, {
    upsert: false,
    contentType: file.type || undefined,
    cacheControl: '3600',
  })

  if (error) {
    return { error: error.message || `Erro ao enviar imagem de ${params.kind}.` }
  }

  return { path }
}

async function buildUniqueDeveloperSlug(baseSlug: string) {
  const supabase = await createClient()
  const base = baseSlug || `construtora-${Date.now()}`

  for (let i = 0; i < 100; i += 1) {
    const candidate = i === 0 ? base : `${base}-${i + 1}`
    const { data } = await supabase.from('developers').select('id').eq('slug', candidate).maybeSingle()
    if (!data) return candidate
  }

  return `${base}-${Date.now()}`
}

async function buildUniqueIncorporationSlug(baseSlug: string) {
  const supabase = await createClient()
  const base = baseSlug || `empreendimento-${Date.now()}`

  for (let i = 0; i < 100; i += 1) {
    const candidate = i === 0 ? base : `${base}-${i + 1}`
    const { data } = await supabase.from('incorporations').select('id').eq('slug', candidate).maybeSingle()
    if (!data) return candidate
  }

  return `${base}-${Date.now()}`
}

export async function reserveUnitAction(input: ReserveUnitActionInput): Promise<ReserveUnitActionResult> {
  await requireActiveUser()

  const unitId = String(input?.unitId || '').trim()
  if (!unitId) {
    return { success: false, error: 'Unidade inválida para reserva.' }
  }

  const clientNote = String(input?.clientNote || '').trim() || null

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('reserve_unit', {
    unit_id: unitId,
    lead_id: input?.leadId ?? null,
    client_note: clientNote,
  })

  if (error) {
    return {
      success: false,
      error: error.message || 'Não foi possível reservar a unidade.',
    }
  }

  const row = normalizeRpcRow(data)
  if (!row?.reservation_id || !row?.reserved_unit_id || !row?.reserved_incorporation_id || !row?.expires_at) {
    return {
      success: false,
      error: 'Resposta da reserva inválida. Verifique a migration de incorporações.',
    }
  }

  const incorporationId = row.reserved_incorporation_id || input?.incorporationId || ''
  if (incorporationId) {
    revalidatePath(`/properties/incorporations/${incorporationId}`)
  }
  revalidatePath('/properties/incorporations')

  return {
    success: true,
    data: {
      reservationId: row.reservation_id,
      unitId: row.reserved_unit_id,
      incorporationId: row.reserved_incorporation_id,
      unitStatus: row.unit_status,
      expiresAt: row.expires_at,
    },
  }
}

export async function createDeveloperAction(formData: FormData) {
  const viewer = await requireRole(['admin', 'gestor'])
  const supabase = await createClient()

  const name = String(formData.get('name') || '').trim()
  const legalName = String(formData.get('legalName') || '').trim() || null
  const cnpjRaw = String(formData.get('cnpj') || '').trim()
  const cnpj = cnpjRaw ? normalizeDigits(cnpjRaw) : null
  const websiteUrl = String(formData.get('websiteUrl') || '').trim() || null
  const description = String(formData.get('description') || '').trim() || null
  const slugInput = String(formData.get('slug') || '').trim()
  const commissionPercent = parseDecimal(String(formData.get('commissionPercent') || ''))
  const isActive = String(formData.get('isActive') || '').toLowerCase() === 'on'
  const logoFile = asUploadFile(formData.get('logoFile'))
  const coverFile = asUploadFile(formData.get('coverFile'))

  if (!name) {
    return { success: false as const, error: 'Nome fantasia da construtora e obrigatório.' }
  }

  if (cnpj && cnpj.length !== 14) {
    return { success: false as const, error: 'CNPJ inválido. Informe 14 dígitos.' }
  }

  if (commissionPercent === null || commissionPercent < 0 || commissionPercent > 100) {
    return { success: false as const, error: 'Comissão da construtora inválida. Use valor entre 0 e 100.' }
  }

  if (cnpj) {
    const { data: existingByCnpj } = await supabase.from('developers').select('id').eq('cnpj', cnpj).maybeSingle()
    if (existingByCnpj?.id) {
      return { success: false as const, error: 'Ja existe construtora cadastrada com este CNPJ.' }
    }
  }

  const baseSlug = slugify(slugInput || name)
  const slug = await buildUniqueDeveloperSlug(baseSlug)
  let logoPath: string | null = null
  let coverPath: string | null = null

  if (logoFile) {
    const uploaded = await uploadDeveloperImage(logoFile, { slug, kind: 'logo' })
    if ('error' in uploaded) {
      return { success: false as const, error: uploaded.error }
    }
    logoPath = uploaded.path
  }

  if (coverFile) {
    const uploaded = await uploadDeveloperImage(coverFile, { slug, kind: 'cover' })
    if ('error' in uploaded) {
      return { success: false as const, error: uploaded.error }
    }
    coverPath = uploaded.path
  }

  const { data, error } = await supabase
    .from('developers')
    .insert({
      name,
      slug,
      legal_name: legalName,
      cnpj,
      website_url: websiteUrl,
      description,
      commission_percent: commissionPercent,
      logo_media_path: logoPath,
      cover_media_path: coverPath,
      is_active: isActive,
      created_by_profile_id: viewer.id,
      updated_by_profile_id: viewer.id,
    })
    .select('id')
    .single()

  if (error || !data?.id) {
    return {
      success: false as const,
      error: error?.message || 'Não foi possível criar a construtora.',
    }
  }

  revalidatePath('/properties/incorporations')
  return { success: true as const, data: { developerId: data.id } }
}

export async function createIncorporationAction(formData: FormData) {
  const viewer = await requireRole(['admin', 'gestor'])
  const supabase = await createClient()

  const developerId = String(formData.get('developerId') || '').trim()
  const name = String(formData.get('name') || '').trim()
  const slugInput = String(formData.get('slug') || '').trim()
  const headline = String(formData.get('headline') || '').trim() || null
  const description = String(formData.get('description') || '').trim() || null
  const city = String(formData.get('city') || '').trim() || null
  const neighborhood = String(formData.get('neighborhood') || '').trim() || null
  const state = String(formData.get('state') || '').trim() || null
  const address = String(formData.get('address') || '').trim() || null
  const postalCode = String(formData.get('postalCode') || '').trim() || null
  const riNumber = String(formData.get('riNumber') || '').trim() || null
  const riOffice = String(formData.get('riOffice') || '').trim() || null
  const status = String(formData.get('status') || '').trim() || 'draft'
  const launchDate = String(formData.get('launchDate') || '').trim() || null
  const deliveryDate = String(formData.get('deliveryDate') || '').trim() || null
  const isActive = String(formData.get('isActive') || '').toLowerCase() === 'on'

  if (!developerId) {
    return { success: false as const, error: 'Selecione a construtora.' }
  }

  if (!name) {
    return { success: false as const, error: 'Nome do empreendimento e obrigatório.' }
  }

  const allowedStatuses = new Set([
    'draft',
    'pre_launch',
    'launch',
    'construction',
    'delivered',
    'paused',
    'archived',
  ])

  if (!allowedStatuses.has(status)) {
    return { success: false as const, error: 'Status inválido para o empreendimento.' }
  }

  const { data: developer } = await supabase.from('developers').select('id').eq('id', developerId).maybeSingle()
  if (!developer?.id) {
    return { success: false as const, error: 'Construtora não encontrada.' }
  }

  const baseSlug = slugify(slugInput || name)
  const slug = await buildUniqueIncorporationSlug(baseSlug)

  const { data, error } = await supabase
    .from('incorporations')
    .insert({
      developer_id: developerId,
      name,
      slug,
      headline,
      description,
      city,
      neighborhood,
      state,
      address,
      postal_code: postalCode,
      ri_number: riNumber,
      ri_office: riOffice,
      status,
      is_active: isActive,
      launch_date: launchDate,
      delivery_date: deliveryDate,
      created_by_profile_id: viewer.id,
      updated_by_profile_id: viewer.id,
    })
    .select('id')
    .single()

  if (error || !data?.id) {
    return {
      success: false as const,
      error: error?.message || 'Não foi possível criar o empreendimento.',
    }
  }

  revalidatePath('/properties/incorporations')
  revalidatePath(`/properties/incorporations/developers/${developerId}`)
  return { success: true as const, data: { incorporationId: data.id } }
}

export async function createIncorporationPlanAction(formData: FormData) {
  const viewer = await requireRole(['admin', 'gestor'])
  const supabase = await createClient()

  const incorporationId = String(formData.get('incorporationId') || '').trim()
  const name = String(formData.get('name') || '').trim()
  const description = String(formData.get('description') || '').trim() || null
  const isActive = String(formData.get('isActive') || '').toLowerCase() === 'on'
  const generateUnitsNow = String(formData.get('generateUnitsNow') || '').toLowerCase() === 'on'

  const bedrooms = parseInteger(String(formData.get('bedrooms') || ''))
  const roomsCount = parseInteger(String(formData.get('roomsCount') || ''))
  const suites = parseInteger(String(formData.get('suites') || ''))
  const bathrooms = parseInteger(String(formData.get('bathrooms') || ''))
  const parking = parseInteger(String(formData.get('parking') || ''))
  const areaM2 = parseDecimal(String(formData.get('areaM2') || ''))
  const priceFrom = parseDecimal(String(formData.get('priceFrom') || ''))

  const blocksCount = parseInteger(String(formData.get('blocksCount') || '')) ?? 1
  const floorsPerBlock = parseInteger(String(formData.get('floorsPerBlock') || '')) ?? 1
  const unitsPerFloor = parseInteger(String(formData.get('unitsPerFloor') || '')) ?? 1
  const blockPrefix = String(formData.get('blockPrefix') || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 8)

  if (!incorporationId) {
    return { success: false as const, error: 'Empreendimento inválido.' }
  }

  if (!name) {
    return { success: false as const, error: 'Nome da tipologia e obrigatório.' }
  }

  if (blocksCount < 1 || blocksCount > 50) {
    return { success: false as const, error: 'Quantidade de blocos inválida (1 a 50).' }
  }

  if (floorsPerBlock < 1 || floorsPerBlock > 300) {
    return { success: false as const, error: 'Quantidade de andares por bloco inválida (1 a 300).' }
  }

  if (unitsPerFloor < 1 || unitsPerFloor > 50) {
    return { success: false as const, error: 'Quantidade de apartamentos por andar inválida (1 a 50).' }
  }

  const totalUnits = blocksCount * floorsPerBlock * unitsPerFloor
  if (totalUnits > 3000) {
    return {
      success: false as const,
      error: 'Geracao muito grande para uma única tipologia. Reduza para no máximo 3000 unidades.',
    }
  }

  const { data: incorporation } = await supabase
    .from('incorporations')
    .select('id')
    .eq('id', incorporationId)
    .maybeSingle()

  if (!incorporation?.id) {
    return { success: false as const, error: 'Empreendimento não encontrado.' }
  }

  const { data: latestPlan } = await supabase
    .from('incorporation_plans')
    .select('position')
    .eq('incorporation_id', incorporationId)
    .order('position', { ascending: false })
    .limit(1)
    .maybeSingle()

  const nextPosition =
    latestPlan && typeof latestPlan.position === 'number' && Number.isFinite(latestPlan.position)
      ? latestPlan.position + 1
      : 0

  const { data: plan, error: planError } = await supabase
    .from('incorporation_plans')
    .insert({
      incorporation_id: incorporationId,
      name,
      description,
      bedrooms,
      rooms_count: roomsCount,
      suites,
      bathrooms,
      parking,
      area_m2: areaM2,
      price_from: priceFrom,
      is_active: isActive,
      position: nextPosition,
      blocks_count: blocksCount,
      floors_per_block: floorsPerBlock,
      units_per_floor: unitsPerFloor,
      block_prefix: blockPrefix || null,
      created_by_profile_id: viewer.id,
      updated_by_profile_id: viewer.id,
    })
    .select('id')
    .single()

  if (planError || !plan?.id) {
    return {
      success: false as const,
      error: planError?.message || 'Não foi possível criar a tipologia.',
    }
  }

  let generatedUnits = 0
  if (generateUnitsNow) {
    const { data: existingUnits, error: existingUnitsError } = await supabase
      .from('incorporation_units')
      .select('unit_code')
      .eq('incorporation_id', incorporationId)

    if (existingUnitsError) {
      return {
        success: false as const,
        error: existingUnitsError.message || 'Falha ao validar códigos de unidades existentes.',
      }
    }

    const existingCodeSet = new Set(
      ((existingUnits || []) as Array<{ unit_code: string | null }>)
        .map((row) => String(row.unit_code || '').trim().toUpperCase())
        .filter(Boolean)
    )

    const unitsToInsert: Array<{
      incorporation_id: string
      plan_id: string
      unit_code: string
      tower: string
      floor: number
      stack: string
      bedrooms: number | null
      suites: number | null
      bathrooms: number | null
      parking: number | null
      area_m2: number | null
      list_price: number | null
      status: string
      created_by_profile_id: string
      updated_by_profile_id: string
    }> = []

    for (let blockIndex = 0; blockIndex < blocksCount; blockIndex += 1) {
      const blockLabel = blockLabelFromIndex(blockIndex)
      const towerLabel = blockPrefix ? `${blockPrefix}${blockLabel}` : blockLabel
      for (let floor = 1; floor <= floorsPerBlock; floor += 1) {
        const floorCode = String(floor).padStart(2, '0')
        for (let apartment = 1; apartment <= unitsPerFloor; apartment += 1) {
          const apartmentCode = String(apartment).padStart(2, '0')
          const unitCode = `${towerLabel}${floorCode}${apartmentCode}`.toUpperCase()

          if (existingCodeSet.has(unitCode)) {
            return {
              success: false as const,
              error: `Código de unidade ja existe: ${unitCode}. Ajuste o prefixo da tipologia.`,
            }
          }

          existingCodeSet.add(unitCode)
          unitsToInsert.push({
            incorporation_id: incorporationId,
            plan_id: plan.id,
            unit_code: unitCode,
            tower: towerLabel,
            floor,
            stack: apartmentCode,
            bedrooms,
            suites,
            bathrooms,
            parking,
            area_m2: areaM2,
            list_price: priceFrom,
            status: 'available',
            created_by_profile_id: viewer.id,
            updated_by_profile_id: viewer.id,
          })
        }
      }
    }

    for (let index = 0; index < unitsToInsert.length; index += 500) {
      const chunk = unitsToInsert.slice(index, index + 500)
      const { error: insertUnitsError } = await supabase.from('incorporation_units').insert(chunk)
      if (insertUnitsError) {
        return {
          success: false as const,
          error:
            insertUnitsError.message ||
            'A tipologia foi criada, mas houve falha ao gerar unidades automáticas.',
        }
      }
      generatedUnits += chunk.length
    }
  }

  revalidatePath(`/properties/incorporations/${incorporationId}`)
  revalidatePath('/properties/incorporations')
  revalidatePath('/empreendimentos')

  return {
    success: true as const,
    data: {
      planId: plan.id,
      generatedUnits,
    },
  }
}

export async function updateIncorporationPlanAction(formData: FormData) {
  const viewer = await requireRole(['admin', 'gestor'])
  const supabase = await createClient()

  const incorporationId = String(formData.get('incorporationId') || '').trim()
  const planId = String(formData.get('planId') || '').trim()
  const name = String(formData.get('name') || '').trim()
  const description = String(formData.get('description') || '').trim() || null
  const isActive = String(formData.get('isActive') || '').toLowerCase() === 'on'

  const bedrooms = parseInteger(String(formData.get('bedrooms') || ''))
  const roomsCount = parseInteger(String(formData.get('roomsCount') || ''))
  const suites = parseInteger(String(formData.get('suites') || ''))
  const bathrooms = parseInteger(String(formData.get('bathrooms') || ''))
  const parking = parseInteger(String(formData.get('parking') || ''))
  const areaM2 = parseDecimal(String(formData.get('areaM2') || ''))
  const priceFrom = parseDecimal(String(formData.get('priceFrom') || ''))
  const blocksCount = parseInteger(String(formData.get('blocksCount') || '')) ?? 1
  const floorsPerBlock = parseInteger(String(formData.get('floorsPerBlock') || '')) ?? 1
  const unitsPerFloor = parseInteger(String(formData.get('unitsPerFloor') || '')) ?? 1
  const blockPrefix = String(formData.get('blockPrefix') || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 8)
  const virtualTourParsed = parseOptionalHttpUrl(String(formData.get('virtualTourUrl') || ''))

  if (!incorporationId || !planId) {
    return { success: false as const, error: 'Empreendimento ou tipologia inválida.' }
  }

  if (!name) {
    return { success: false as const, error: 'Nome da tipologia e obrigatório.' }
  }

  if (virtualTourParsed.error) {
    return { success: false as const, error: `Tour virtual: ${virtualTourParsed.error}` }
  }

  if (blocksCount < 1 || blocksCount > 50) {
    return { success: false as const, error: 'Quantidade de blocos inválida (1 a 50).' }
  }

  if (floorsPerBlock < 1 || floorsPerBlock > 300) {
    return { success: false as const, error: 'Quantidade de andares por bloco inválida (1 a 300).' }
  }

  if (unitsPerFloor < 1 || unitsPerFloor > 50) {
    return { success: false as const, error: 'Quantidade de apartamentos por andar inválida (1 a 50).' }
  }

  const { data: plan } = await supabase
    .from('incorporation_plans')
    .select('id')
    .eq('id', planId)
    .eq('incorporation_id', incorporationId)
    .maybeSingle()
  if (!plan?.id) {
    return { success: false as const, error: 'Tipologia não encontrada neste empreendimento.' }
  }

  const { error } = await supabase
    .from('incorporation_plans')
    .update({
      name,
      description,
      bedrooms,
      rooms_count: roomsCount,
      suites,
      bathrooms,
      parking,
      area_m2: areaM2,
      price_from: priceFrom,
      is_active: isActive,
      blocks_count: blocksCount,
      floors_per_block: floorsPerBlock,
      units_per_floor: unitsPerFloor,
      block_prefix: blockPrefix || null,
      virtual_tour_url: virtualTourParsed.value,
      updated_by_profile_id: viewer.id,
    })
    .eq('id', planId)
    .eq('incorporation_id', incorporationId)

  if (error) {
    return {
      success: false as const,
      error: error.message || 'Não foi possível atualizar a tipologia.',
    }
  }

  revalidatePath(`/properties/incorporations/${incorporationId}`)
  revalidatePath('/empreendimentos')
  return { success: true as const }
}

export async function addIncorporationPlanMediaAction(formData: FormData) {
  const viewer = await requireRole(['admin', 'gestor'])
  const supabase = await createClient()
  const admin = createAdminClient()

  const incorporationId = String(formData.get('incorporationId') || '').trim()
  const planId = String(formData.get('planId') || '').trim()
  const title = String(formData.get('title') || '').trim() || null
  const mediaScopeRaw = String(formData.get('mediaScope') || '').trim().toLowerCase()
  const mediaScope = mediaScopeRaw === 'plan' ? 'plan' : mediaScopeRaw === 'project' ? 'project' : mediaScopeRaw === 'common_areas' ? 'common_areas' : 'incorporation'
  const setAsCover = String(formData.get('isCover') || '').toLowerCase() === 'on'
  const isPublic = String(formData.get('isPublic') || '').toLowerCase() !== 'off'
  const mediaFile = asUploadFile(formData.get('mediaFile'))

  if (!incorporationId) {
    return { success: false as const, error: 'Empreendimento inválido.' }
  }

  if (!mediaFile) {
    return { success: false as const, error: 'Selecione um arquivo de imagem para enviar.' }
  }

  if (!mediaFile.type.startsWith('image/')) {
    return { success: false as const, error: 'Apenas imagens sao aceitas neste envio.' }
  }

  const maxSizeBytes = 15 * 1024 * 1024
  if (mediaFile.size > maxSizeBytes) {
    return { success: false as const, error: 'Imagem excede o limite de 15MB.' }
  }

  const { data: incorporation } = await supabase
    .from('incorporations')
    .select('id')
    .eq('id', incorporationId)
    .maybeSingle()
  if (!incorporation?.id) {
    return { success: false as const, error: 'Empreendimento não encontrado.' }
  }

  let normalizedPlanId: string | null = null
  if (planId) {
    const { data: plan } = await supabase
      .from('incorporation_plans')
      .select('id')
      .eq('id', planId)
      .eq('incorporation_id', incorporationId)
      .maybeSingle()
    if (!plan?.id) {
      return { success: false as const, error: 'Tipologia informada não encontrada neste empreendimento.' }
    }
    normalizedPlanId = plan.id
  }

  const extFromName = mediaFile.name.includes('.') ? mediaFile.name.split('.').pop() || '' : ''
  const extFromMime = mediaFile.type.replace('image/', '')
  const ext = sanitizeFileName(extFromName || extFromMime || 'jpg') || 'jpg'
  const fileBaseName = sanitizeFileName(mediaFile.name.replace(/\.[^/.]+$/, '')) || 'mídia'
  const folder = normalizedPlanId
    ? `incorporations/${incorporationId}/plans/${normalizedPlanId}`
    : `incorporations/${incorporationId}/general`
  const filePath = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 10)}-${fileBaseName}.${ext}`

  const { error: uploadError } = await admin.storage.from('incorporation-media').upload(filePath, mediaFile, {
    upsert: false,
    contentType: mediaFile.type || undefined,
    cacheControl: '3600',
  })
  if (uploadError) {
    return { success: false as const, error: uploadError.message || 'Erro ao enviar imagem.' }
  }

  const { data: lastPositionRow } = await supabase
    .from('incorporation_media')
    .select('position')
    .eq('incorporation_id', incorporationId)
    .match(normalizedPlanId ? { plan_id: normalizedPlanId } : { plan_id: null })
    .order('position', { ascending: false })
    .limit(1)
    .maybeSingle()

  const nextPosition =
    lastPositionRow && typeof lastPositionRow.position === 'number'
      ? lastPositionRow.position + 1
      : 0

  if (setAsCover) {
    const coverFilter = normalizedPlanId ? { plan_id: normalizedPlanId } : { plan_id: null }
    await supabase
      .from('incorporation_media')
      .update({ is_cover: false, updated_by_profile_id: viewer.id })
      .eq('incorporation_id', incorporationId)
      .match(coverFilter)
      .eq('is_cover', true)
  }

  const finalScope = normalizedPlanId ? 'plan' : mediaScope
  const { error: insertError } = await supabase.from('incorporation_media').insert({
    incorporation_id: incorporationId,
    plan_id: normalizedPlanId,
    media_scope: finalScope,
    kind: 'image',
    title,
    path: filePath,
    is_public: isPublic,
    is_cover: setAsCover,
    position: nextPosition,
    created_by_profile_id: viewer.id,
    updated_by_profile_id: viewer.id,
  })

  if (insertError) {
    return { success: false as const, error: insertError.message || 'Falha ao registrar a imagem da tipologia.' }
  }

  revalidatePath(`/properties/incorporations/${incorporationId}`)
  revalidatePath('/empreendimentos')
  return { success: true as const }
}

export async function updateIncorporationMediaAction(formData: FormData) {
  const viewer = await requireRole(['admin', 'gestor'])
  const supabase = await createClient()

  const incorporationId = String(formData.get('incorporationId') || '').trim()
  const mediaId = String(formData.get('mediaId') || '').trim()
  const title = String(formData.get('title') || '').trim() || null
  const positionInput = parseInteger(String(formData.get('position') || ''))
  const visibility = String(formData.get('visibility') || '').trim().toLowerCase()
  const coverMode = String(formData.get('coverMode') || 'keep').trim().toLowerCase()

  if (!incorporationId || !mediaId) {
    return { success: false as const, error: 'Mídia inválida.' }
  }

  if (positionInput !== null && positionInput < 0) {
    return { success: false as const, error: 'Posicao de ordenação inválida.' }
  }

  const { data: media } = await supabase
    .from('incorporation_media')
    .select('id,plan_id,is_cover,is_public,position')
    .eq('id', mediaId)
    .eq('incorporation_id', incorporationId)
    .maybeSingle()

  if (!media?.id) {
    return { success: false as const, error: 'Mídia não encontrada neste empreendimento.' }
  }

  const isPublic =
    visibility === 'public'
      ? true
      : visibility === 'internal'
        ? false
        : media.is_public

  const isCover =
    coverMode === 'set'
      ? true
      : coverMode === 'unset'
        ? false
        : media.is_cover

  if (coverMode === 'set') {
    const coverFilter = media.plan_id ? { plan_id: media.plan_id } : { plan_id: null }
    await supabase
      .from('incorporation_media')
      .update({ is_cover: false, updated_by_profile_id: viewer.id })
      .eq('incorporation_id', incorporationId)
      .match(coverFilter)
      .neq('id', mediaId)
      .eq('is_cover', true)
  }

  const { error } = await supabase
    .from('incorporation_media')
    .update({
      title,
      position: positionInput ?? media.position ?? 0,
      is_public: isPublic,
      is_cover: isCover,
      updated_by_profile_id: viewer.id,
    })
    .eq('id', mediaId)
    .eq('incorporation_id', incorporationId)

  if (error) {
    return { success: false as const, error: error.message || 'Não foi possível atualizar a mídia.' }
  }

  revalidatePath(`/properties/incorporations/${incorporationId}`)
  revalidatePath('/empreendimentos')
  return { success: true as const }
}

export async function reorderIncorporationMediaAction(formData: FormData) {
  const viewer = await requireRole(['admin', 'gestor'])
  const supabase = await createClient()

  const incorporationId = String(formData.get('incorporationId') || '').trim()
  const orderedIdsRaw = String(formData.get('orderedIds') || '').trim()

  if (!incorporationId) {
    return { success: false as const, error: 'Empreendimento inválido para ordenação.' }
  }

  let orderedIds: string[] = []
  try {
    const parsed = JSON.parse(orderedIdsRaw)
    if (!Array.isArray(parsed)) {
      return { success: false as const, error: 'Payload de ordenação inválido.' }
    }
    orderedIds = parsed.map((item) => String(item || '').trim()).filter(Boolean)
  } catch {
    return { success: false as const, error: 'Payload de ordenação inválido.' }
  }

  if (orderedIds.length === 0) {
    return { success: false as const, error: 'Nenhuma mídia enviada para ordenação.' }
  }

  const { data: rows, error: rowsError } = await supabase
    .from('incorporation_media')
    .select('id')
    .eq('incorporation_id', incorporationId)
    .in('id', orderedIds)

  if (rowsError) {
    return { success: false as const, error: rowsError.message || 'Erro ao validar mídias para ordenação.' }
  }

  const foundIds = new Set(((rows || []) as Array<{ id: string }>).map((row) => row.id))
  if (foundIds.size !== orderedIds.length) {
    return { success: false as const, error: 'Uma ou mais mídias não pertencem a este empreendimento.' }
  }

  for (let index = 0; index < orderedIds.length; index += 1) {
    const mediaId = orderedIds[index]
    const position = index * 10
    const { error } = await supabase
      .from('incorporation_media')
      .update({ position, updated_by_profile_id: viewer.id })
      .eq('id', mediaId)
      .eq('incorporation_id', incorporationId)

    if (error) {
      return { success: false as const, error: error.message || 'Erro ao salvar nova ordenação.' }
    }
  }

  revalidatePath(`/properties/incorporations/${incorporationId}`)
  revalidatePath('/empreendimentos')
  return { success: true as const }
}

export async function addIncorporationMediaAssetAction(formData: FormData) {
  const viewer = await requireRole(['admin', 'gestor'])
  const supabase = await createClient()
  const admin = createAdminClient()

  const incorporationId = String(formData.get('incorporationId') || '').trim()
  const planId = String(formData.get('planId') || '').trim()
  const title = String(formData.get('title') || '').trim() || null
  const mediaScope = normalizeIncorporationMediaScope(String(formData.get('mediaScope') || ''))
  const isPublic = String(formData.get('isPublic') || '').toLowerCase() !== 'off'
  const setAsCover = String(formData.get('isCover') || '').toLowerCase() === 'on'
  const mediaFiles = formData
    .getAll('mediaFiles')
    .map((entry) => asUploadFile(entry))
    .filter((entry): entry is File => Boolean(entry))
  if (mediaFiles.length === 0) {
    const fallbackSingle = asUploadFile(formData.get('mediaFile'))
    if (fallbackSingle) mediaFiles.push(fallbackSingle)
  }
  const kind = normalizeIncorporationMediaKind(String(formData.get('kind') || ''), mediaFiles[0]?.type || null)

  if (!incorporationId) {
    return { success: false as const, error: 'Empreendimento inválido.' }
  }

  if (mediaFiles.length === 0) {
    return { success: false as const, error: 'Selecione ao menos um arquivo para enviar.' }
  }

  if (mediaFiles.length > 20) {
    return { success: false as const, error: 'Envie no máximo 20 arquivos por lote.' }
  }

  const maxSizeBytes = 12 * 1024 * 1024
  for (const mediaFile of mediaFiles) {
    if (mediaFile.size > maxSizeBytes) {
      return { success: false as const, error: 'Cada arquivo deve ter no máximo 12MB.' }
    }

    if (kind === 'image' || kind === 'floorplate') {
      if (!mediaFile.type.startsWith('image/')) {
        return { success: false as const, error: 'Para este tipo, envie apenas arquivos de imagem.' }
      }
    } else if (kind === 'video') {
      if (!mediaFile.type.startsWith('video/')) {
        return { success: false as const, error: 'Para este tipo, envie apenas arquivos de video.' }
      }
    }
  }

  const { data: incorporation } = await supabase
    .from('incorporations')
    .select('id')
    .eq('id', incorporationId)
    .maybeSingle()
  if (!incorporation?.id) {
    return { success: false as const, error: 'Empreendimento não encontrado.' }
  }

  let normalizedPlanId: string | null = null
  if (planId) {
    const { data: plan } = await supabase
      .from('incorporation_plans')
      .select('id')
      .eq('id', planId)
      .eq('incorporation_id', incorporationId)
      .maybeSingle()
    if (!plan?.id) {
      return { success: false as const, error: 'Tipologia informada não encontrada neste empreendimento.' }
    }
    normalizedPlanId = plan.id
  }

  if (mediaScope === 'plan' && !normalizedPlanId) {
    return { success: false as const, error: 'Selecione a tipologia para escopo de mídia da planta.' }
  }

  const scopeFolder =
    mediaScope === 'project'
      ? 'project'
      : mediaScope === 'common_areas'
        ? 'common-areas'
        : mediaScope === 'plan'
          ? 'plans'
          : 'incorporation'
  const baseFolder = normalizedPlanId
    ? `incorporations/${incorporationId}/plans/${normalizedPlanId}`
    : `incorporations/${incorporationId}/${scopeFolder}`

  const { data: lastPositionRow } = await supabase
    .from('incorporation_media')
    .select('position')
    .eq('incorporation_id', incorporationId)
    .match(normalizedPlanId ? { plan_id: normalizedPlanId } : { plan_id: null })
    .order('position', { ascending: false })
    .limit(1)
    .maybeSingle()

  const nextPosition =
    lastPositionRow && typeof lastPositionRow.position === 'number'
      ? lastPositionRow.position + 10
      : 0

  const allowCover = kind === 'image' || kind === 'floorplate'
  if (setAsCover && allowCover) {
    const coverFilter = normalizedPlanId ? { plan_id: normalizedPlanId } : { plan_id: null }
    await supabase
      .from('incorporation_media')
      .update({ is_cover: false, updated_by_profile_id: viewer.id })
      .eq('incorporation_id', incorporationId)
      .match(coverFilter)
      .eq('is_cover', true)
  }

  const uploadedPaths: string[] = []
  const recordsToInsert: Array<{
    incorporation_id: string
    plan_id: string | null
    media_scope: string
    kind: string
    title: string | null
    path: string
    is_public: boolean
    is_cover: boolean
    position: number
    created_by_profile_id: string
    updated_by_profile_id: string
  }> = []

  for (let index = 0; index < mediaFiles.length; index += 1) {
    const mediaFile = mediaFiles[index]
    const extFromName = mediaFile.name.includes('.') ? mediaFile.name.split('.').pop() || '' : ''
    const extFromMime = mediaFile.type.split('/')[1] || ''
    const ext = sanitizeFileName(extFromName || extFromMime || 'bin') || 'bin'
    const fileBaseName = sanitizeFileName(mediaFile.name.replace(/\.[^/.]+$/, '')) || 'arquivo'
    const filePath = `${baseFolder}/${Date.now()}-${Math.random().toString(36).slice(2, 10)}-${fileBaseName}.${ext}`

    const { error: uploadError } = await admin.storage.from('incorporation-media').upload(filePath, mediaFile, {
      upsert: false,
      contentType: mediaFile.type || undefined,
      cacheControl: '3600',
    })

    if (uploadError) {
      if (uploadedPaths.length > 0) {
        await admin.storage.from('incorporation-media').remove(uploadedPaths)
      }
      return { success: false as const, error: uploadError.message || 'Erro ao enviar arquivo.' }
    }

    uploadedPaths.push(filePath)
    recordsToInsert.push({
      incorporation_id: incorporationId,
      plan_id: normalizedPlanId,
      media_scope: normalizedPlanId ? 'plan' : mediaScope,
      kind,
      title,
      path: filePath,
      is_public: isPublic,
      is_cover: setAsCover && allowCover && index === 0,
      position: nextPosition + index * 10,
      created_by_profile_id: viewer.id,
      updated_by_profile_id: viewer.id,
    })
  }

  const { error: insertError } = await supabase.from('incorporation_media').insert(recordsToInsert)

  if (insertError) {
    if (uploadedPaths.length > 0) {
      await admin.storage.from('incorporation-media').remove(uploadedPaths)
    }
    return { success: false as const, error: insertError.message || 'Falha ao registrar o arquivo.' }
  }

  revalidatePath(`/properties/incorporations/${incorporationId}`)
  revalidatePath('/empreendimentos')
  return { success: true as const, data: { created: recordsToInsert.length } }
}

export async function deleteIncorporationMediaAction(formData: FormData) {
  await requireRole(['admin', 'gestor'])
  const supabase = await createClient()
  const admin = createAdminClient()

  const incorporationId = String(formData.get('incorporationId') || '').trim()
  const mediaId = String(formData.get('mediaId') || '').trim()

  if (!incorporationId || !mediaId) {
    return { success: false as const, error: 'Mídia inválida para remocao.' }
  }

  const { data: media } = await supabase
    .from('incorporation_media')
    .select('id,path')
    .eq('id', mediaId)
    .eq('incorporation_id', incorporationId)
    .maybeSingle()

  if (!media?.id) {
    return { success: false as const, error: 'Mídia não encontrada.' }
  }

  const { error: deleteError } = await supabase
    .from('incorporation_media')
    .delete()
    .eq('id', mediaId)
    .eq('incorporation_id', incorporationId)

  if (deleteError) {
    return {
      success: false as const,
      error: deleteError.message || 'Não foi possível remover a mídia.',
    }
  }

  if (media.path) {
    await admin.storage.from('incorporation-media').remove([media.path])
  }

  revalidatePath(`/properties/incorporations/${incorporationId}`)
  revalidatePath('/empreendimentos')
  return { success: true as const }
}

export async function updateIncorporationVirtualTourAction(formData: FormData) {
  const viewer = await requireRole(['admin', 'gestor'])
  const supabase = await createClient()

  const incorporationId = String(formData.get('incorporationId') || '').trim()
  const parsedUrl = parseOptionalHttpUrl(String(formData.get('virtualTourUrl') || ''))

  if (!incorporationId) {
    return { success: false as const, error: 'Empreendimento inválido.' }
  }

  if (parsedUrl.error) {
    return { success: false as const, error: `Tour virtual do empreendimento: ${parsedUrl.error}` }
  }

  const { error } = await supabase
    .from('incorporations')
    .update({
      virtual_tour_url: parsedUrl.value,
      updated_by_profile_id: viewer.id,
    })
    .eq('id', incorporationId)

  if (error) {
    return {
      success: false as const,
      error: error.message || 'Não foi possível atualizar o tour virtual do empreendimento.',
    }
  }

  revalidatePath(`/properties/incorporations/${incorporationId}`)
  revalidatePath('/empreendimentos')
  return { success: true as const }
}

export async function updateIncorporationPlanVirtualTourAction(formData: FormData) {
  const viewer = await requireRole(['admin', 'gestor'])
  const supabase = await createClient()

  const incorporationId = String(formData.get('incorporationId') || '').trim()
  const planId = String(formData.get('planId') || '').trim()
  const parsedUrl = parseOptionalHttpUrl(String(formData.get('virtualTourUrl') || ''))

  if (!incorporationId || !planId) {
    return { success: false as const, error: 'Tipologia inválida para tour virtual.' }
  }

  if (parsedUrl.error) {
    return { success: false as const, error: `Tour virtual da tipologia: ${parsedUrl.error}` }
  }

  const { error } = await supabase
    .from('incorporation_plans')
    .update({
      virtual_tour_url: parsedUrl.value,
      updated_by_profile_id: viewer.id,
    })
    .eq('id', planId)
    .eq('incorporation_id', incorporationId)

  if (error) {
    return {
      success: false as const,
      error: error.message || 'Não foi possível atualizar o tour virtual da tipologia.',
    }
  }

  revalidatePath(`/properties/incorporations/${incorporationId}`)
  revalidatePath('/empreendimentos')
  return { success: true as const }
}

export async function setIncorporationHeaderCoverAction(formData: FormData) {
  const viewer = await requireRole(['admin', 'gestor'])
  const supabase = await createClient()
  const admin = createAdminClient()

  const incorporationId = String(formData.get('incorporationId') || '').trim()
  const source = String(formData.get('source') || '').trim().toLowerCase()
  const coverFile = asUploadFile(formData.get('coverFile'))

  if (!incorporationId) {
    return { success: false as const, error: 'Empreendimento inválido.' }
  }

  const { data: incorporation } = await supabase
    .from('incorporations')
    .select('id,developer_id')
    .eq('id', incorporationId)
    .maybeSingle()
  if (!incorporation?.id) {
    return { success: false as const, error: 'Empreendimento não encontrado.' }
  }

  let newCoverPath: string | null = null
  if (source === 'developer_cover' || source === 'developer_logo') {
    const { data: developer } = await supabase
      .from('developers')
      .select('cover_media_path,logo_media_path')
      .eq('id', incorporation.developer_id)
      .maybeSingle()

    const fromDeveloper = source === 'developer_cover' ? developer?.cover_media_path : developer?.logo_media_path
    if (!fromDeveloper) {
      return { success: false as const, error: 'A construtora não possui imagem neste tipo de origem.' }
    }
    newCoverPath = fromDeveloper
  } else if (source === 'upload') {
    if (!coverFile) {
      return { success: false as const, error: 'Selecione uma imagem para o fundo do cabeçalho.' }
    }
    if (!coverFile.type.startsWith('image/')) {
      return { success: false as const, error: 'A imagem de cabeçalho precisa ser um arquivo de imagem.' }
    }
    const maxSizeBytes = 12 * 1024 * 1024
    if (coverFile.size > maxSizeBytes) {
      return { success: false as const, error: 'Imagem excede o limite de 12MB.' }
    }

    const extFromName = coverFile.name.includes('.') ? coverFile.name.split('.').pop() || '' : ''
    const extFromMime = coverFile.type.split('/')[1] || ''
    const ext = sanitizeFileName(extFromName || extFromMime || 'jpg') || 'jpg'
    const fileBaseName = sanitizeFileName(coverFile.name.replace(/\.[^/.]+$/, '')) || 'cabeçalho'
    const path = `incorporations/${incorporationId}/header/${Date.now()}-${Math.random().toString(36).slice(2, 10)}-${fileBaseName}.${ext}`
    const { error: uploadError } = await admin.storage.from('incorporation-media').upload(path, coverFile, {
      upsert: false,
      contentType: coverFile.type || undefined,
      cacheControl: '3600',
    })
    if (uploadError) {
      return { success: false as const, error: uploadError.message || 'Erro ao enviar imagem de cabeçalho.' }
    }
    newCoverPath = path
  } else {
    return { success: false as const, error: 'Origem de capa inválida.' }
  }

  const { error: updateError } = await supabase
    .from('incorporations')
    .update({
      cover_media_path: newCoverPath,
      updated_by_profile_id: viewer.id,
    })
    .eq('id', incorporationId)

  if (updateError) {
    return {
      success: false as const,
      error: updateError.message || 'Não foi possível atualizar a capa do cabeçalho.',
    }
  }

  revalidatePath(`/properties/incorporations/${incorporationId}`)
  revalidatePath('/empreendimentos')
  return { success: true as const }
}

export async function assignPlanToExistingUnitsAction(formData: FormData) {
  const viewer = await requireRole(['admin', 'gestor'])
  const supabase = await createClient()

  const incorporationId = String(formData.get('incorporationId') || '').trim()
  const planId = String(formData.get('planId') || '').trim()
  const unitIdsRaw = String(formData.get('unitIds') || '').trim()
  const publishPlan = String(formData.get('publishPlan') || '').toLowerCase() !== 'off'
  const towersRaw = String(formData.get('towers') || '').trim()
  const stacksRaw = String(formData.get('stacks') || '').trim()
  const floorStart = parseInteger(String(formData.get('floorStart') || ''))
  const floorEnd = parseInteger(String(formData.get('floorEnd') || ''))

  if (!incorporationId || !planId) {
    return { success: false as const, error: 'Empreendimento ou tipologia inválida.' }
  }

  const { data: plan } = await supabase
    .from('incorporation_plans')
    .select('id,bedrooms,suites,bathrooms,parking,area_m2,price_from')
    .eq('id', planId)
    .eq('incorporation_id', incorporationId)
    .maybeSingle()

  if (!plan?.id) {
    return { success: false as const, error: 'Tipologia não encontrada para aplicar nas unidades.' }
  }

  let unitIds: string[] = []

  if (unitIdsRaw) {
    let parsed: unknown
    try {
      parsed = JSON.parse(unitIdsRaw)
    } catch {
      return { success: false as const, error: 'Lista de unidades inválida para aplicacao em lote.' }
    }

    if (!Array.isArray(parsed)) {
      return { success: false as const, error: 'Lista de unidades inválida para aplicacao em lote.' }
    }

    const parsedIds = Array.from(
      new Set(
        parsed
          .map((item) => String(item || '').trim())
          .filter(Boolean)
      )
    )

    if (parsedIds.length === 0) {
      return { success: false as const, error: 'Selecione ao menos uma unidade para aplicar a tipologia.' }
    }

    const { data: selectedUnits, error: selectedUnitsError } = await supabase
      .from('incorporation_units')
      .select('id,status')
      .eq('incorporation_id', incorporationId)
      .in('id', parsedIds)

    if (selectedUnitsError) {
      return { success: false as const, error: selectedUnitsError.message || 'Erro ao validar unidades selecionadas.' }
    }

    const selectedRows = (selectedUnits || []) as Array<{ id: string; status: string }>
    if (selectedRows.length !== parsedIds.length) {
      return { success: false as const, error: 'Uma ou mais unidades selecionadas não pertencem a este empreendimento.' }
    }

    const soldUnits = selectedRows.filter((row) => row.status === 'sold')
    if (soldUnits.length > 0) {
      return {
        success: false as const,
        error: `Não é permitido alterar tipologia de unidade vendida (${soldUnits.length} selecionada(s)).`,
      }
    }

    unitIds = selectedRows.map((row) => row.id)
  } else {
    let query = supabase
      .from('incorporation_units')
      .select('id')
      .eq('incorporation_id', incorporationId)

    if (Number.isFinite(floorStart as number)) {
      query = query.gte('floor', floorStart as number)
    }
    if (Number.isFinite(floorEnd as number)) {
      query = query.lte('floor', floorEnd as number)
    }

    const towers = towersRaw
      .split(',')
      .map((value) => value.trim().toUpperCase())
      .filter(Boolean)
    const stacks = stacksRaw
      .split(',')
      .map((value) => value.trim().toUpperCase())
      .filter(Boolean)

    if (towers.length > 0) {
      query = query.in('tower', towers)
    }
    if (stacks.length > 0) {
      query = query.in('stack', stacks)
    }

    const { data: units, error: unitsError } = await query
    if (unitsError) {
      return {
        success: false as const,
        error: unitsError.message || 'Erro ao localizar unidades para personalizacao.',
      }
    }
    unitIds = ((units || []) as Array<{ id: string }>).map((row) => row.id)
  }

  if (unitIds.length === 0) {
    return { success: false as const, error: 'Nenhuma unidade encontrada com os filtros informados.' }
  }

  const { error: updateError } = await supabase
    .from('incorporation_units')
    .update({
      plan_id: plan.id,
      bedrooms: plan.bedrooms,
      suites: plan.suites,
      bathrooms: plan.bathrooms,
      parking: plan.parking,
      area_m2: plan.area_m2,
      list_price: plan.price_from,
      updated_by_profile_id: viewer.id,
    })
    .in('id', unitIds)

  if (updateError) {
    return { success: false as const, error: updateError.message || 'Erro ao aplicar tipologia nas unidades selecionadas.' }
  }

  let publishedPlan = false
  let publishedPriceFrom: number | null = null

  if (publishPlan) {
    const { data: minUnitPriceRow } = await supabase
      .from('incorporation_units')
      .select('list_price')
      .eq('incorporation_id', incorporationId)
      .eq('plan_id', plan.id)
      .not('list_price', 'is', null)
      .order('list_price', { ascending: true })
      .limit(1)
      .maybeSingle()

    const resolvedPlanPrice =
      typeof minUnitPriceRow?.list_price === 'number' && Number.isFinite(minUnitPriceRow.list_price)
        ? minUnitPriceRow.list_price
        : plan.price_from

    const { error: publishError } = await supabase
      .from('incorporation_plans')
      .update({
        is_active: true,
        price_from: resolvedPlanPrice,
        updated_by_profile_id: viewer.id,
      })
      .eq('id', plan.id)
      .eq('incorporation_id', incorporationId)

    if (!publishError) {
      publishedPlan = true
      publishedPriceFrom = resolvedPlanPrice ?? null
    }

    const { data: incorporationMinPriceRow } = await supabase
      .from('incorporation_plans')
      .select('price_from')
      .eq('incorporation_id', incorporationId)
      .eq('is_active', true)
      .not('price_from', 'is', null)
      .order('price_from', { ascending: true })
      .limit(1)
      .maybeSingle()

    if (
      incorporationMinPriceRow &&
      typeof incorporationMinPriceRow.price_from === 'number' &&
      Number.isFinite(incorporationMinPriceRow.price_from)
    ) {
      await supabase
        .from('incorporations')
        .update({
          price_from: incorporationMinPriceRow.price_from,
          updated_by_profile_id: viewer.id,
        })
        .eq('id', incorporationId)
    }
  }

  revalidatePath(`/properties/incorporations/${incorporationId}`)
  revalidatePath('/properties/incorporations')
  revalidatePath('/imóveis/resultados')
  revalidatePath('/empreendimentos')
  return {
    success: true as const,
    data: {
      updatedUnits: unitIds.length,
      publishedPlan,
      publishedPriceFrom,
    },
  }
}

export async function reconfigureIncorporationFloorsAction(formData: FormData) {
  const viewer = await requireRole(['admin', 'gestor'])
  const supabase = await createClient()

  const incorporationId = String(formData.get('incorporationId') || '').trim()
  const planId = String(formData.get('planId') || '').trim()
  const sourceTower = normalizeTowerKey(String(formData.get('sourceTower') || 'SEM BLOCO'))
  const replicateToOtherBlocks = String(formData.get('replicateToOtherBlocks') || '').toLowerCase() === 'on'
  const publishPlan = String(formData.get('publishPlan') || '').toLowerCase() !== 'off'
  const targetUnitsPerFloor = parseInteger(String(formData.get('targetUnitsPerFloor') || ''))
  const floorNumbersRaw = String(formData.get('floorNumbers') || '').trim()

  if (!incorporationId || !planId) {
    return { success: false as const, error: 'Empreendimento ou tipologia inválida.' }
  }

  if (!Number.isFinite(targetUnitsPerFloor as number) || (targetUnitsPerFloor as number) < 1 || (targetUnitsPerFloor as number) > 50) {
    return {
      success: false as const,
      error: 'Quantidade de apartamentos por andar inválida (1 a 50).',
    }
  }

  let floorNumbers: number[] = []
  try {
    const parsed = JSON.parse(floorNumbersRaw)
    if (!Array.isArray(parsed)) {
      return { success: false as const, error: 'Lista de andares inválida.' }
    }
    floorNumbers = Array.from(
      new Set(
        parsed
          .map((value) => Number.parseInt(String(value), 10))
          .filter((value) => Number.isFinite(value) && value >= 0 && value <= 500)
      )
    ).sort((a, b) => b - a)
  } catch {
    return { success: false as const, error: 'Lista de andares inválida.' }
  }

  if (floorNumbers.length === 0) {
    return { success: false as const, error: 'Selecione ao menos um andar para reconfigurar.' }
  }

  const { data: plan } = await supabase
    .from('incorporation_plans')
    .select('id,name,bedrooms,suites,bathrooms,parking,area_m2,price_from')
    .eq('id', planId)
    .eq('incorporation_id', incorporationId)
    .maybeSingle()

  if (!plan?.id) {
    return { success: false as const, error: 'Tipologia não encontrada para o empreendimento.' }
  }

  const [unitsForFloorsRes, allTowersRes, allCodesRes] = await Promise.all([
    supabase
      .from('incorporation_units')
      .select('id,unit_code,tower,floor,stack,status,plan_id')
      .eq('incorporation_id', incorporationId)
      .in('floor', floorNumbers),
    supabase
      .from('incorporation_units')
      .select('tower')
      .eq('incorporation_id', incorporationId),
    supabase
      .from('incorporation_units')
      .select('unit_code')
      .eq('incorporation_id', incorporationId),
  ])

  if (unitsForFloorsRes.error) {
    return {
      success: false as const,
      error: unitsForFloorsRes.error.message || 'Não foi possível carregar unidades dos andares selecionados.',
    }
  }
  if (allTowersRes.error) {
    return {
      success: false as const,
      error: allTowersRes.error.message || 'Não foi possível carregar blocos do empreendimento.',
    }
  }
  if (allCodesRes.error) {
    return {
      success: false as const,
      error: allCodesRes.error.message || 'Não foi possível carregar códigos de unidades existentes.',
    }
  }

  const unitsForFloors = (unitsForFloorsRes.data || []) as Array<{
    id: string
    unit_code: string
    tower: string | null
    floor: number
    stack: string
    status: string
    plan_id: string | null
  }>
  const allTowerKeys = Array.from(
    new Set(
      ((allTowersRes.data || []) as Array<{ tower: string | null }>)
        .map((row) => normalizeTowerKey(row.tower))
        .filter(Boolean)
    )
  )
  const existingUnitCodes = new Set(
    ((allCodesRes.data || []) as Array<{ unit_code: string | null }>)
      .map((row) => String(row.unit_code || '').trim().toUpperCase())
      .filter(Boolean)
  )

  const towerKeys = replicateToOtherBlocks
    ? allTowerKeys.length > 0
      ? allTowerKeys
      : [sourceTower]
    : [sourceTower]

  const grouped = new Map<string, Array<{
    id: string
    unit_code: string
    tower: string | null
    floor: number
    stack: string
    status: string
    plan_id: string | null
  }>>()

  for (const row of unitsForFloors) {
    const key = `${normalizeTowerKey(row.tower)}::${row.floor}`
    const bucket = grouped.get(key) || []
    bucket.push(row)
    grouped.set(key, bucket)
  }

  let updatedUnits = 0
  let createdUnits = 0
  let blockedUnits = 0

  const upsertUnitPayload = {
    plan_id: plan.id,
    bedrooms: plan.bedrooms,
    suites: plan.suites,
    bathrooms: plan.bathrooms,
    parking: plan.parking,
    area_m2: plan.area_m2,
    list_price: plan.price_from,
    updated_by_profile_id: viewer.id,
  }

  for (const towerKey of towerKeys) {
    for (const floor of floorNumbers) {
      const groupKey = `${towerKey}::${floor}`
      const rows = (grouped.get(groupKey) || []).slice().sort((a, b) => compareStackValues(a.stack, b.stack))
      const targetCount = targetUnitsPerFloor as number

      if (rows.length > targetCount) {
        const rowsToBlock = rows.slice(targetCount)
        const blockedWithDeal = rowsToBlock.find((row) => row.status === 'reserved' || row.status === 'sold')
        if (blockedWithDeal) {
          return {
            success: false as const,
            error: `Não é possível reduzir apt/andar no bloco ${towerKey}, andar ${floor}. Existem unidades reservadas/vendidas fora do novo limite.`,
          }
        }

        for (const row of rowsToBlock) {
          const { error } = await supabase
            .from('incorporation_units')
            .update({
              status: 'blocked',
              updated_by_profile_id: viewer.id,
            })
            .eq('id', row.id)
          if (error) {
            return {
              success: false as const,
              error: error.message || 'Erro ao bloquear unidades excedentes no andar.',
            }
          }
          blockedUnits += 1
        }
      }

      const rowsToKeep = rows.slice(0, Math.min(rows.length, targetCount))
      for (const row of rowsToKeep) {
        if (row.status === 'sold' && row.plan_id && row.plan_id !== plan.id) {
          return {
            success: false as const,
            error: `Unidade vendida ${row.unit_code} ja vinculada a outra tipologia. Ajuste manualmente.`,
          }
        }

        const payload: {
          plan_id: string
          bedrooms: number | null
          suites: number | null
          bathrooms: number | null
          parking: number | null
          area_m2: number | null
          list_price: number | null
          updated_by_profile_id: string
          status?: string
        } = {
          ...upsertUnitPayload,
        }
        if (row.status === 'blocked') payload.status = 'available'

        const { error } = await supabase
          .from('incorporation_units')
          .update(payload)
          .eq('id', row.id)
        if (error) {
          return {
            success: false as const,
            error: error.message || 'Erro ao atualizar unidades dos andares selecionados.',
          }
        }
        updatedUnits += 1
      }

      const missing = targetCount - rows.length
      if (missing > 0) {
        const existingStackSet = new Set(
          rows
            .map((row) => String(row.stack || '').trim().toUpperCase())
            .filter(Boolean)
        )

        const inserts: Array<{
          incorporation_id: string
          plan_id: string
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
          created_by_profile_id: string
          updated_by_profile_id: string
        }> = []

        let stackIndex = 1
        while (inserts.length < missing && stackIndex <= 500) {
          const stackCode = stackCodeFromNumber(stackIndex).toUpperCase()
          stackIndex += 1
          if (existingStackSet.has(stackCode)) continue
          existingStackSet.add(stackCode)

          const towerCode = towerCodeFromKey(towerKey)
          const floorCode = String(floor).padStart(2, '0')
          const baseCode = `${towerCode}${floorCode}${stackCode}`.toUpperCase()
          let unitCode = baseCode
          let suffix = 1
          while (existingUnitCodes.has(unitCode)) {
            unitCode = `${baseCode}-${suffix}`
            suffix += 1
          }
          existingUnitCodes.add(unitCode)

          inserts.push({
            incorporation_id: incorporationId,
            plan_id: plan.id,
            unit_code: unitCode,
            tower: towerValueFromKey(towerKey),
            floor,
            stack: stackCode,
            bedrooms: plan.bedrooms,
            suites: plan.suites,
            bathrooms: plan.bathrooms,
            parking: plan.parking,
            area_m2: plan.area_m2,
            list_price: plan.price_from,
            status: 'available',
            created_by_profile_id: viewer.id,
            updated_by_profile_id: viewer.id,
          })
        }

        if (inserts.length !== missing) {
          return {
            success: false as const,
            error: `Não foi possível gerar todas as unidades faltantes no bloco ${towerKey}, andar ${floor}.`,
          }
        }

        const { error } = await supabase.from('incorporation_units').insert(inserts)
        if (error) {
          return {
            success: false as const,
            error: error.message || 'Erro ao criar unidades faltantes no andar.',
          }
        }
        createdUnits += inserts.length
      }
    }
  }

  let publishedPlan = false
  let publishedPriceFrom: number | null = null
  if (publishPlan) {
    const { data: minUnitPriceRow } = await supabase
      .from('incorporation_units')
      .select('list_price')
      .eq('incorporation_id', incorporationId)
      .eq('plan_id', plan.id)
      .not('list_price', 'is', null)
      .order('list_price', { ascending: true })
      .limit(1)
      .maybeSingle()

    const resolvedPlanPrice =
      typeof minUnitPriceRow?.list_price === 'number' && Number.isFinite(minUnitPriceRow.list_price)
        ? minUnitPriceRow.list_price
        : plan.price_from

    const { error: publishError } = await supabase
      .from('incorporation_plans')
      .update({
        is_active: true,
        price_from: resolvedPlanPrice,
        units_per_floor: targetUnitsPerFloor as number,
        updated_by_profile_id: viewer.id,
      })
      .eq('id', plan.id)
      .eq('incorporation_id', incorporationId)

    if (!publishError) {
      publishedPlan = true
      publishedPriceFrom = resolvedPlanPrice ?? null
    }

    const { data: incorporationMinPriceRow } = await supabase
      .from('incorporation_plans')
      .select('price_from')
      .eq('incorporation_id', incorporationId)
      .eq('is_active', true)
      .not('price_from', 'is', null)
      .order('price_from', { ascending: true })
      .limit(1)
      .maybeSingle()

    if (
      incorporationMinPriceRow &&
      typeof incorporationMinPriceRow.price_from === 'number' &&
      Number.isFinite(incorporationMinPriceRow.price_from)
    ) {
      await supabase
        .from('incorporations')
        .update({
          price_from: incorporationMinPriceRow.price_from,
          updated_by_profile_id: viewer.id,
        })
        .eq('id', incorporationId)
    }
  }

  revalidatePath(`/properties/incorporations/${incorporationId}`)
  revalidatePath('/properties/incorporations')
  revalidatePath('/imóveis/resultados')
  revalidatePath('/empreendimentos')

  return {
    success: true as const,
    data: {
      updatedUnits,
      createdUnits,
      blockedUnits,
      towersAffected: towerKeys.length,
      floorsAffected: floorNumbers.length,
      publishedPlan,
      publishedPriceFrom,
    },
  }
}

export async function createIncorporationProposalAction(formData: FormData): Promise<CreateIncorporationProposalActionResult> {
  const viewer = await requireRole(['admin', 'gestor', 'corretor'])
  const supabase = await createClient()
  const admin = createAdminClient()

  const incorporationId = String(formData.get('incorporationId') || '').trim()
  const unitId = String(formData.get('unitId') || '').trim()
  const reservationId = String(formData.get('reservationId') || '').trim() || null
  const leadId = String(formData.get('leadId') || '').trim() || null
  const clientName = String(formData.get('clientName') || '').trim()
  const clientEmail = String(formData.get('clientEmail') || '').trim() || null
  const clientPhone = String(formData.get('clientPhone') || '').trim() || null
  const offerValue = parseDecimal(String(formData.get('offerValue') || ''))
  const downPayment = parseDecimal(String(formData.get('downPayment') || ''))
  const financingType = String(formData.get('financingType') || '').trim() || null
  const paymentTerms = String(formData.get('paymentTerms') || '').trim() || null
  const proposalText = String(formData.get('proposalText') || '').trim() || null
  const recipientEmail = String(formData.get('recipientEmail') || '').trim() || null
  const recipientWhatsApp = String(formData.get('recipientWhatsApp') || '').trim() || null
  const submitMode = String(formData.get('submitMode') || '').trim().toLowerCase()

  if (!incorporationId || !unitId) {
    return { success: false, error: 'Empreendimento ou unidade inválida para proposta.' }
  }

  if (!clientName) {
    return { success: false, error: 'Nome do cliente e obrigatório para criar proposta.' }
  }

  if (offerValue === null || offerValue <= 0) {
    return { success: false, error: 'Valor da proposta inválido.' }
  }

  const status = submitMode === 'send' ? 'sent' : 'draft'
  const sentAt = status === 'sent' ? new Date().toISOString() : null

  const { data: reservation } =
    reservationId
      ? await supabase
          .from('unit_reservations')
          .select('id, broker_user_id, incorporation_id, unit_id')
          .eq('id', reservationId)
          .maybeSingle()
      : { data: null as { id: string; broker_user_id: string; incorporation_id: string; unit_id: string } | null }

  if (reservation && reservation.broker_user_id !== viewer.id && viewer.role === 'corretor') {
    return { success: false, error: 'Você não pode criar proposta para reserva de outro corretor.' }
  }

  const brokerUserId =
    reservation?.broker_user_id || viewer.id

  const { data, error } = await supabase
    .from('incorporation_client_proposals')
    .insert({
      incorporation_id: incorporationId,
      unit_id: unitId,
      reservation_id: reservation?.id || reservationId,
      broker_user_id: brokerUserId,
      lead_id: leadId,
      client_name: clientName,
      client_email: clientEmail,
      client_phone: clientPhone,
      offer_value: offerValue,
      down_payment: downPayment,
      financing_type: financingType,
      payment_terms: paymentTerms,
      proposal_text: proposalText,
      recipient_email: recipientEmail,
      status,
      sent_at: sentAt,
      created_by_profile_id: viewer.id,
      updated_by_profile_id: viewer.id,
    })
    .select('id,status')
    .single()

  if (error || !data?.id) {
    return {
      success: false,
      error: error?.message || 'Não foi possível criar a proposta para incorporadora.',
    }
  }

  let emailDeliveryStatus: 'pending' | 'sent' | 'skipped' | 'error' = 'pending'
  let whatsappDeliveryStatus: 'pending' | 'sent' | 'skipped' | 'error' = 'pending'
  let proposalPdfUrl: string | null = null
  let deliveryMessage: string | null = null

  if (status === 'sent') {
    const [incorporationRes, unitRes, brokerRes] = await Promise.all([
      supabase
        .from('incorporations')
        .select('id,name,developers(name)')
        .eq('id', incorporationId)
        .maybeSingle(),
      supabase
        .from('incorporation_units')
        .select('id,unit_code,tower,floor,stack')
        .eq('id', unitId)
        .maybeSingle(),
      supabase.from('profiles').select('id,full_name,email').eq('id', brokerUserId).maybeSingle(),
    ])

    const incorporationName = String((incorporationRes.data as { name?: string } | null)?.name || 'Empreendimento')
    const developerRel = (incorporationRes.data as { developers?: { name?: string } | Array<{ name?: string }> | null } | null)?.developers
    const developerName = Array.isArray(developerRel)
      ? String(developerRel[0]?.name || '')
      : String(developerRel?.name || '')
    const unitCode = String((unitRes.data as { unit_code?: string } | null)?.unit_code || unitId)
    const brokerName = String((brokerRes.data as { full_name?: string } | null)?.full_name || viewer.full_name || '')

    const pdfBuffer = buildIncorporationProposalPdf({
      proposalId: data.id,
      incorporationName,
      developerName: developerName || null,
      unitCode,
      brokerName: brokerName || null,
      clientName,
      clientEmail,
      clientPhone,
      offerValue,
      downPayment,
      financingType,
      paymentTerms,
      proposalText,
      createdAtIso: sentAt || new Date().toISOString(),
    })

    const pdfPath = `incorporations/${incorporationId}/proposals/${data.id}.pdf`
    const uploadResult = await admin.storage.from('incorporation-media').upload(pdfPath, pdfBuffer, {
      upsert: true,
      contentType: 'application/pdf',
      cacheControl: '3600',
    })

    if (!uploadResult.error) {
      const signedRes = await admin.storage
        .from('incorporation-media')
        .createSignedUrl(pdfPath, 60 * 60 * 24 * 7)
      if (!signedRes.error) proposalPdfUrl = signedRes.data?.signedUrl || null
    }

    const proposalMessage = `Proposta ${data.id.slice(0, 8)} - ${incorporationName} - unidade ${unitCode}.`
    const emailHtml = buildProposalEmailHtml({
      incorporationName,
      developerName: developerName || null,
      unitCode,
      clientName,
      offerValue,
      brokerName: brokerName || null,
      proposalUrl: proposalPdfUrl,
    })

    const emailResult = await sendProposalPdfByEmail({
      to: recipientEmail,
      subject: `Proposta comercial - ${incorporationName} - ${unitCode}`,
      html: emailHtml,
      pdfFileName: `proposta-${data.id.slice(0, 8)}.pdf`,
      pdfBuffer,
    })
    emailDeliveryStatus = emailResult.status

    const whatsappMessage = `${proposalMessage} Valor ofertado: ${new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
      maximumFractionDigits: 2,
    }).format(offerValue)}`
    const whatsappResult = await sendProposalByWhatsApp({
      toPhone: recipientWhatsApp || clientPhone,
      message: whatsappMessage,
      proposalUrl: proposalPdfUrl,
    })
    whatsappDeliveryStatus = whatsappResult.status

    const deliveryError =
      [emailResult.message, whatsappResult.message, uploadResult.error?.message]
        .filter(Boolean)
        .join(' | ') || null

    deliveryMessage = deliveryError

    const updatePayload: Record<string, unknown> = {
      updated_by_profile_id: viewer.id,
      erp_sync_status: 'synced',
      erp_synced_at: new Date().toISOString(),
      erp_last_error: null,
      delivery_last_error: deliveryError,
      external_reference: data.id,
    }
    if (!uploadResult.error) {
      updatePayload.pdf_storage_path = pdfPath
      updatePayload.pdf_generated_at = new Date().toISOString()
    }
    updatePayload.email_delivery_status = emailResult.status
    updatePayload.email_delivered_at = emailResult.status === 'sent' ? new Date().toISOString() : null
    updatePayload.whatsapp_delivery_status = whatsappResult.status
    updatePayload.whatsapp_delivered_at = whatsappResult.status === 'sent' ? new Date().toISOString() : null

    const { error: updateError } = await supabase
      .from('incorporation_client_proposals')
      .update(updatePayload)
      .eq('id', data.id)

    if (updateError && !isSchemaMissingError(updateError.code, updateError.message)) {
      return {
        success: false,
        error: updateError.message || 'Não foi possível atualizar status de entrega da proposta.',
      }
    }

    const nowIso = new Date().toISOString()
    const deliveryLogs = [
      {
        proposal_id: data.id,
        incorporation_id: incorporationId,
        channel: 'email',
        status: emailResult.status === 'sent' ? 'sent' : emailResult.status === 'error' ? 'error' : 'skipped',
        recipient: recipientEmail,
        payload: {
          subject: `Proposta comercial - ${incorporationName} - ${unitCode}`,
        },
        provider_response: emailResult.raw || null,
        error_message: emailResult.message,
        created_by_profile_id: viewer.id,
        created_at: nowIso,
      },
      {
        proposal_id: data.id,
        incorporation_id: incorporationId,
        channel: 'whatsapp',
        status: whatsappResult.status === 'sent' ? 'sent' : whatsappResult.status === 'error' ? 'error' : 'skipped',
        recipient: recipientWhatsApp || clientPhone,
        payload: {
          message: whatsappMessage,
          link: whatsappResult.link,
        },
        provider_response: whatsappResult.raw || null,
        error_message: whatsappResult.message,
        created_by_profile_id: viewer.id,
        created_at: nowIso,
      },
      {
        proposal_id: data.id,
        incorporation_id: incorporationId,
        channel: 'erp',
        status: 'synced',
        recipient: null,
        payload: {
          sync_status: 'synced',
          trigger: 'proposal_sent',
          sync_mode: 'internal_database',
        },
        provider_response: null,
        error_message: null,
        created_by_profile_id: viewer.id,
        created_at: nowIso,
      },
    ]

    const { error: deliveryLogError } = await supabase
      .from('incorporation_proposal_delivery_logs')
      .insert(deliveryLogs)
    if (deliveryLogError && !isSchemaMissingError(deliveryLogError.code, deliveryLogError.message)) {
      return {
        success: false,
        error: deliveryLogError.message || 'Não foi possível registrar logs de entrega da proposta.',
      }
    }
  }

  revalidatePath(`/properties/incorporations/${incorporationId}`)
  revalidatePath('/erp/financeiro')
  return {
    success: true,
    data: {
      proposalId: data.id,
      status: data.status,
      emailDeliveryStatus,
      whatsappDeliveryStatus,
      proposalPdfUrl,
      deliveryMessage,
    },
  }
}

export async function updateDeveloperCommissionPercentAction(formData: FormData) {
  const viewer = await requireRole(['admin', 'gestor'])

  const developerId = String(formData.get('developerId') || '').trim()
  const commissionPercentRaw = String(formData.get('commissionPercent') || '').trim().replace(',', '.')
  const commissionPercent = Number(commissionPercentRaw)

  if (!developerId) {
    return { success: false as const, error: 'Construtora inválida.' }
  }

  if (!Number.isFinite(commissionPercent) || commissionPercent < 0 || commissionPercent > 100) {
    return { success: false as const, error: 'Percentual de comissão inválido. Use valor entre 0 e 100.' }
  }

  const supabase = await createClient()
  const { error } = await supabase
    .from('developers')
    .update({
      commission_percent: commissionPercent,
      updated_by_profile_id: viewer.id,
    })
    .eq('id', developerId)

  if (error) {
    return {
      success: false as const,
      error: error.message || 'Erro ao atualizar comissão da construtora.',
    }
  }

  revalidatePath(`/properties/incorporations/developers/${developerId}`)
  revalidatePath('/properties/incorporations')
  return { success: true as const }
}

export async function getIncorporationFeaturesData(incorporationId: string) {
  await requireRole(['admin', 'gestor', 'corretor'])
  const supabase = await createClient()

  const [catalogRes, valuesRes] = await Promise.all([
    supabase
      .from('incorporation_features')
      .select('id,key,label_pt,group_name,type,options,position')
      .eq('is_active', true)
      .order('position', { ascending: true }),
    supabase
      .from('incorporation_feature_values')
      .select('feature_id,value_boolean,value_number,value_text,value_json')
      .eq('incorporation_id', incorporationId),
  ])

  if (catalogRes.error || valuesRes.error) {
    return { catalog: [] as IncorporationFeatureCatalogItem[], values: [] as IncorporationFeatureValueRow[] }
  }

  return {
    catalog: (catalogRes.data ?? []) as IncorporationFeatureCatalogItem[],
    values: (valuesRes.data ?? []) as IncorporationFeatureValueRow[],
  }
}

export async function updateIncorporationFeaturesAction(
  incorporationId: string,
  items: UpdateIncorporationFeatureItem[]
): Promise<{ success: boolean; error?: string }> {
  await requireRole(['admin', 'gestor'])
  const supabase = await createClient()
  const { data: authUser } = await supabase.auth.getUser()
  const actorId = authUser?.user?.id ?? null

  if (!incorporationId) {
    return { success: false, error: 'Empreendimento inválido.' }
  }

  const tasks = items.map((item) => {
    const featureId = item.feature_id
    const type = item.type
    const value = item.value

    if (type === 'boolean') {
      if (value === true) {
        return supabase.from('incorporation_feature_values').upsert(
          {
            incorporation_id: incorporationId,
            feature_id: featureId,
            value_boolean: true,
            value_number: null,
            value_text: null,
            value_json: null,
            updated_by_profile_id: actorId,
          },
          { onConflict: 'incorporation_id,feature_id' }
        )
      }
      return supabase
        .from('incorporation_feature_values')
        .delete()
        .eq('incorporation_id', incorporationId)
        .eq('feature_id', featureId)
    }

    if (type === 'enum' || type === 'text') {
      if (typeof value === 'string' && value.trim()) {
        return supabase.from('incorporation_feature_values').upsert(
          {
            incorporation_id: incorporationId,
            feature_id: featureId,
            value_boolean: null,
            value_number: null,
            value_text: value.trim(),
            value_json: null,
            updated_by_profile_id: actorId,
          },
          { onConflict: 'incorporation_id,feature_id' }
        )
      }
      return supabase
        .from('incorporation_feature_values')
        .delete()
        .eq('incorporation_id', incorporationId)
        .eq('feature_id', featureId)
    }

    if (type === 'multi_enum') {
      if (Array.isArray(value) && value.length > 0) {
        return supabase.from('incorporation_feature_values').upsert(
          {
            incorporation_id: incorporationId,
            feature_id: featureId,
            value_boolean: null,
            value_number: null,
            value_text: null,
            value_json: value,
            updated_by_profile_id: actorId,
          },
          { onConflict: 'incorporation_id,feature_id' }
        )
      }
      return supabase
        .from('incorporation_feature_values')
        .delete()
        .eq('incorporation_id', incorporationId)
        .eq('feature_id', featureId)
    }

    if (type === 'number') {
      if (typeof value === 'number' && !Number.isNaN(value)) {
        return supabase.from('incorporation_feature_values').upsert(
          {
            incorporation_id: incorporationId,
            feature_id: featureId,
            value_boolean: null,
            value_number: value,
            value_text: null,
            value_json: null,
            updated_by_profile_id: actorId,
          },
          { onConflict: 'incorporation_id,feature_id' }
        )
      }
      return supabase
        .from('incorporation_feature_values')
        .delete()
        .eq('incorporation_id', incorporationId)
        .eq('feature_id', featureId)
    }

    return supabase
      .from('incorporation_feature_values')
      .delete()
      .eq('incorporation_id', incorporationId)
      .eq('feature_id', featureId)
  })

  const results = await Promise.all(tasks)
  const firstError = results.find((res) => res.error)?.error
  if (firstError) {
    return { success: false, error: firstError.message }
  }

  revalidatePath(`/properties/incorporations/${incorporationId}`)
  revalidatePath('/properties/incorporations')
  return { success: true }
}

export async function convertUnitReservationToSaleAction(formData: FormData) {
  await requireRole(['admin', 'gestor'])

  const reservationId = String(formData.get('reservationId') || '').trim()
  const incorporationId = String(formData.get('incorporationId') || '').trim()
  const saleValueRaw = String(formData.get('saleValue') || '').trim().replace(',', '.')
  const noteRaw = String(formData.get('note') || '').trim()

  if (!reservationId) {
    return { success: false as const, error: 'Reserva inválida.' }
  }

  const saleValue = saleValueRaw ? Number(saleValueRaw) : null
  if (saleValueRaw && (saleValue === null || !Number.isFinite(saleValue) || saleValue <= 0)) {
    return { success: false as const, error: 'Valor de venda inválido.' }
  }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc('convert_unit_reservation_to_sale', {
    reservation_id: reservationId,
    sale_value: saleValue,
    note: noteRaw || null,
  })

  if (error) {
    return {
      success: false as const,
      error: error.message || 'Não foi possível converter a reserva em venda.',
    }
  }

  const row = normalizeConvertReservationRpcRow(data)
  if (!row?.proposal_id || !row?.unit_id || !row?.incorporation_id) {
    return {
      success: false as const,
      error: 'Resposta da conversão inválida. Verifique a migration de comissão de incorporações.',
    }
  }

  const incorporationIdToRefresh = row.incorporation_id || incorporationId
  if (incorporationIdToRefresh) {
    revalidatePath(`/properties/incorporations/${incorporationIdToRefresh}`)
  }
  revalidatePath('/erp/financeiro')
  revalidatePath('/properties/incorporations')

  return {
    success: true as const,
    data: {
      proposalId: row.proposal_id,
      paymentId: row.payment_id,
      unitId: row.unit_id,
      commissionPercent: row.commission_percent,
      commissionValue: row.commission_value,
      brokerCommissionValue: row.broker_commission_value,
      companyCommissionValue: row.company_commission_value,
      partnerCommissionValue: row.partner_commission_value,
    },
  }
}
