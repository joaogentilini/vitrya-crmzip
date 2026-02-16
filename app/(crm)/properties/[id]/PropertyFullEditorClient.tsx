'use client'

import { useMemo, useState, useTransition } from 'react'
import { Button } from '@/components/ui/Button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { Textarea } from '@/components/ui/Textarea'
import { useToast } from '@/components/ui/Toast'
import { searchPeople, updatePropertyBasics } from './actions'

type AnyRow = Record<string, unknown>

interface PropertyFullEditorClientProps {
  property: AnyRow
  propertyCategories: { id: string; name: string }[]
  onUpdated: (property: AnyRow) => void
}

type PersonSearchResult = {
  id: string
  full_name?: string | null
  email?: string | null
  document_id?: string | null
  phone_e164?: string | null
  kind_tags?: string[] | null
}

const DB_FIELD_LABELS: Record<string, string> = {
  owner_user_id: 'Responsável (ID de usuário)',
  owner_profile_id: 'Responsável (perfil)',
  owner_client_id: 'Proprietário (pessoa)',
  created_by: 'Criado por',
  created_by_profile_id: 'Criado por (perfil)',
  updated_at: 'Atualizado em',
  created_at: 'Criado em',
  property_id: 'Imóvel (ID)',
  person_id: 'Pessoa (ID)',
  lead_id: 'Lead (ID)',
  property_category_id: 'Categoria do imóvel (ID)',
  property_negotiations: 'Negociações do imóvel',
  property_proposals: 'Propostas do imóvel',
  profiles: 'Perfis',
  properties: 'Imóveis',
  people: 'Pessoas',
  accepts_financing: 'Aceita financiamento',
  accepts_trade: 'Aceita permuta',
  property_standard: 'Padrão do imóvel',
  artesian_well: 'Poço artesiano'
}

function formatDbFieldLabel(key: string) {
  const mapped = DB_FIELD_LABELS[key]
  if (mapped) return mapped

  return key
    .replace(/_/g, ' ')
    .replace(/\bid\b/g, 'ID')
    .replace(/\b\w/g, (char) => char.toUpperCase())
}

function formatValue(value: unknown, key?: string) {
  if (value === null || value === undefined || value === '') return '-'
  if (Array.isArray(value)) return value.length > 0 ? value.join(', ') : '-'
  if (typeof value === 'boolean') return value ? 'Sim' : 'Não'
  if (typeof value === 'number') return value.toString()
  if (typeof value === 'string') {
    if (key && key.endsWith('_at')) {
      const date = new Date(value)
      return Number.isNaN(date.getTime()) ? value : date.toLocaleString('pt-BR')
    }
    return value
  }
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

function parseNumberOrNull(value: string) {
  const trimmed = value.trim()
  if (!trimmed) return null
  const normalized = trimmed.replace(/\./g, '').replace(',', '.')
  const numberValue = Number(normalized)
  return Number.isNaN(numberValue) ? null : numberValue
}

function parseDecimalOrNull(value: string) {
  const trimmed = value.trim()
  if (!trimmed) return null
  const normalized = trimmed.replace(',', '.')
  const numberValue = Number(normalized)
  return Number.isNaN(numberValue) ? null : numberValue
}

function formatBRL(value?: number | null) {
  if (value === null || value === undefined || Number.isNaN(value)) return ''
  return new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value)
}

function parseBRL(value: string) {
  const trimmed = value.trim()
  if (!trimmed) return null
  const normalized = trimmed
    .replace(/[^\d,.-]/g, '')
    .replace(/\./g, '')
    .replace(',', '.')
  const numberValue = Number(normalized)
  return Number.isNaN(numberValue) ? null : numberValue
}

function getDaysSince(value?: string | null) {
  if (!value) return null
  const start = new Date(value)
  if (Number.isNaN(start.getTime())) return null
  const diff = Date.now() - start.getTime()
  if (diff <= 0) return 0
  return Math.floor(diff / (1000 * 60 * 60 * 24))
}

function MoneyInput({
  label,
  value,
  disabled,
  onChange,
  onBlur
}: {
  label: string
  value: string
  disabled?: boolean
  onChange: (value: string) => void
  onBlur?: () => void
}) {
  return (
    <div className="relative">
      <span className="absolute left-3 top-[34px] text-sm text-[var(--muted-foreground)]">R$</span>
      <Input
        label={label}
        value={value}
        disabled={disabled}
        inputMode="decimal"
        className="pl-10"
        onChange={(event) => onChange(event.target.value)}
        onBlur={onBlur}
      />
    </div>
  )
}

const STATUS_OPTIONS = [
  { value: 'draft', label: 'Rascunho' },
  { value: 'active', label: 'Ativo' },
  { value: 'archived', label: 'Arquivado' }
]

const PURPOSE_OPTIONS = [
  { value: 'sale', label: 'Venda' },
  { value: 'rent', label: 'Aluguel' }
]

const NUMBER_OPTIONS = Array.from({ length: 11 }, (_, index) => ({
  value: String(index),
  label: String(index)
}))

const CONDITION_OPTIONS = [
  { value: 'novo', label: 'Novo' },
  { value: 'bom', label: 'Bom' },
  { value: 'regular', label: 'Regular' },
  { value: 'precisa_reforma', label: 'Precisa reforma' }
]

const USAGE_OPTIONS = [
  { value: 'novo', label: 'Novo' },
  { value: 'usado', label: 'Usado' },
  { value: 'em_construcao', label: 'Em construção' }
]

function KeyValueList({
  data,
  labelMap,
  valueMap
}: {
  data: Record<string, unknown>
  labelMap?: Record<string, string>
  valueMap?: Record<string, unknown>
}) {
  const entries = Object.entries(data)
  if (entries.length === 0) {
    return <p className="text-sm text-[var(--muted-foreground)]">Sem dados.</p>
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {entries.map(([key, value]) => {
        const label = labelMap?.[key] ?? formatDbFieldLabel(key)
        const resolvedValue =
          valueMap && Object.prototype.hasOwnProperty.call(valueMap, key)
            ? valueMap[key]
            : value
        return (
          <div key={key}>
            <p className="text-xs text-[var(--muted-foreground)]">{label}</p>
            <p className="text-sm font-medium text-[var(--foreground)]">
              {formatValue(resolvedValue, key)}
            </p>
          </div>
        )
      })}
    </div>
  )
}

export default function PropertyFullEditorClient({
  property,
  propertyCategories,
  onUpdated
}: PropertyFullEditorClientProps) {
  const { success: showSuccess, error: showError } = useToast()
  const [isEditing, setIsEditing] = useState(false)
  const [isSaving, startTransition] = useTransition()

  const [form, setForm] = useState({
    status: String(property.status ?? ''),
    purpose: String(property.purpose ?? ''),
    title: String(property.title ?? ''),
    description: String(property.description ?? ''),
    property_category_id: String(property.property_category_id ?? ''),
    lead_type_id: String(property.lead_type_id ?? ''),
    cover_media_url: String(property.cover_media_url ?? ''),
    address: String(property.address ?? ''),
    address_number: String(property.address_number ?? ''),
    address_complement: String(property.address_complement ?? ''),
    city: String(property.city ?? ''),
    neighborhood: String(property.neighborhood ?? ''),
    state: String(property.state ?? ''),
    postal_code: String(property.postal_code ?? ''),
    latitude: String(property.latitude ?? ''),
    longitude: String(property.longitude ?? ''),
    price: formatBRL(property.price as number | null),
    rent_price: formatBRL(property.rent_price as number | null),
    sale_value: formatBRL(property.sale_value as number | null),
    appraisal_value: formatBRL(property.appraisal_value as number | null),
    down_payment_value: formatBRL(property.down_payment_value as number | null),
    condo_fee: formatBRL(property.condo_fee as number | null),
    sale_commission_percent: String((property as any).sale_commission_percent ?? (property as any).commission_percent ?? 5),
    sale_broker_split_percent: String((property as any).sale_broker_split_percent ?? 50),
    sale_partner_split_percent: String((property as any).sale_partner_split_percent ?? 0),
    rent_initial_commission_percent: String((property as any).rent_initial_commission_percent ?? 10),
    rent_recurring_commission_percent: String((property as any).rent_recurring_commission_percent ?? 8),
    rent_broker_split_percent: String((property as any).rent_broker_split_percent ?? 50),
    rent_partner_split_percent: String((property as any).rent_partner_split_percent ?? 0),
    accepts_financing: Boolean((property as any).accepts_financing ?? false),
    accepts_trade: Boolean((property as any).accepts_trade ?? false),
    property_standard: String((property as any).property_standard ?? ''),
    artesian_well: Boolean((property as any).artesian_well ?? false),
    usage: String(property.usage ?? ''),
    condition: String(property.condition ?? ''),
    area_m2: String(property.area_m2 ?? ''),
    land_area_m2: String(property.land_area_m2 ?? ''),
    built_area_m2: String(property.built_area_m2 ?? ''),
    bedrooms: String(property.bedrooms ?? '0'),
    bathrooms: String(property.bathrooms ?? '0'),
    parking: String(property.parking ?? '0'),
    suites: String((property as any).suites ?? '0'),
    year_built: String(property.year_built ?? ''),
    is_renovated: Boolean(property.is_renovated ?? false),
    renovated_at: String(property.renovated_at ?? ''),
    registry_number: String(property.registry_number ?? ''),
    registry_office: String(property.registry_office ?? ''),
    iptu_value: formatBRL(property.iptu_value as number | null),
    iptu_year: String(property.iptu_year ?? ''),
    iptu_is_paid: Boolean(property.iptu_is_paid ?? false),
    owner_client_id: String(property.owner_client_id ?? ''),
    owner_user_id: String(property.owner_user_id ?? ''),
    created_by: String(property.created_by ?? ''),
    created_at: String(property.created_at ?? ''),
    updated_at: String(property.updated_at ?? '')
  })

  const [selectedOwner, setSelectedOwner] = useState<PersonSearchResult | null>(null)

  const ownerProfile = property.owner_profile as
    | { full_name?: string | null; email?: string | null }
    | null
  const createdByProfile = property.created_by_profile as
    | { full_name?: string | null; email?: string | null }
    | null
  const canViewLegalData = (property as any).can_view_legal_data !== false
  const canEditOverviewData =
    (property as any).can_edit_overview_data === true || canViewLegalData
  const canEditCommissionPercent =
    (property as any).can_edit_commission_percent === true || canEditOverviewData
  const legalDataRestricted = !canViewLegalData
  const ownerPersonRestricted = Boolean((property as any).owner_person_restricted)
  const ownerPerson = property.owner_person as
    | { full_name?: string | null; email?: string | null; phone_e164?: string | null; document_id?: string | null }
    | null

  const ownerDisplay = ownerProfile?.full_name || ownerProfile?.email || form.owner_user_id
  const createdByDisplay = createdByProfile?.full_name || createdByProfile?.email || form.created_by

  const ownerPersonLabel = ownerPersonRestricted
    ? 'Cliente oculto para este perfil'
    : ownerPerson?.full_name || selectedOwner?.full_name || (form.owner_client_id ? 'Proprietário selecionado' : '')

  const [ownerPickerOpen, setOwnerPickerOpen] = useState(false)
  const [ownerPickerQuery, setOwnerPickerQuery] = useState('')
  const [ownerPickerResults, setOwnerPickerResults] = useState<PersonSearchResult[]>([])
  const [isLoadingOwnerPicker, setIsLoadingOwnerPicker] = useState(false)
  const [ownerPickerError, setOwnerPickerError] = useState<string | null>(null)

  const selectedOwnerLabel = ownerPersonRestricted
    ? 'Cliente oculto para este perfil'
    : ownerPerson?.full_name || selectedOwner?.full_name || (form.owner_client_id ? 'Proprietário selecionado' : 'Nenhum')

  const statusOptions = useMemo(() => {
    if (form.status && !STATUS_OPTIONS.some((option) => option.value === form.status)) {
      return [{ value: form.status, label: form.status }, ...STATUS_OPTIONS]
    }
    return STATUS_OPTIONS
  }, [form.status])

  const purposeOptions = useMemo(() => {
    if (form.purpose && !PURPOSE_OPTIONS.some((option) => option.value === form.purpose)) {
      return [{ value: form.purpose, label: form.purpose }, ...PURPOSE_OPTIONS]
    }
    return PURPOSE_OPTIONS
  }, [form.purpose])

  const publicationDays = useMemo(() => getDaysSince(form.created_at), [form.created_at])
  const publicationLabel = useMemo(() => {
    if (form.status !== 'active') return 'Imovel nao publicado'
    if (publicationDays === null) return 'Tempo de publicacao sem data'
    return `${publicationDays} dia${publicationDays === 1 ? '' : 's'} de publicacao`
  }, [form.status, publicationDays])

  const categoryOptions = useMemo(() => {
    const options = propertyCategories.map((category) => ({
      value: category.id,
      label: category.name
    }))
    const currentId = form.property_category_id
    if (currentId && !options.some((option) => option.value === currentId)) {
      const fallbackLabel =
        (property as any)?.property_category_name || 'Categoria atual (inativa)'
      options.unshift({ value: currentId, label: String(fallbackLabel) })
    }
    return options
  }, [propertyCategories, form.property_category_id, property])

  const saleCommissionPercent = useMemo(
    () => parseDecimalOrNull(form.sale_commission_percent) ?? 0,
    [form.sale_commission_percent]
  )
  const rentInitialCommissionPercent = useMemo(
    () => parseDecimalOrNull(form.rent_initial_commission_percent) ?? 0,
    [form.rent_initial_commission_percent]
  )
  const rentRecurringCommissionPercent = useMemo(
    () => parseDecimalOrNull(form.rent_recurring_commission_percent) ?? 0,
    [form.rent_recurring_commission_percent]
  )

  const saleReferenceValue = useMemo(
    () => parseBRL(form.price) ?? parseBRL(form.sale_value) ?? 0,
    [form.price, form.sale_value]
  )
  const rentReferenceValue = useMemo(() => parseBRL(form.rent_price) ?? 0, [form.rent_price])

  const saleCommissionValue = useMemo(
    () => (saleReferenceValue * saleCommissionPercent) / 100,
    [saleReferenceValue, saleCommissionPercent]
  )
  const saleOwnerNetValue = useMemo(
    () => saleReferenceValue - saleCommissionValue,
    [saleReferenceValue, saleCommissionValue]
  )
  const rentInitialCommissionValue = useMemo(
    () => (rentReferenceValue * rentInitialCommissionPercent) / 100,
    [rentReferenceValue, rentInitialCommissionPercent]
  )
  const rentRecurringCommissionValue = useMemo(
    () => (rentReferenceValue * rentRecurringCommissionPercent) / 100,
    [rentReferenceValue, rentRecurringCommissionPercent]
  )

  const loadOwnerPicker = async (query: string) => {
    if (ownerPersonRestricted) return
    setOwnerPickerError(null)
    setIsLoadingOwnerPicker(true)
    try {
      const res = await searchPeople(query)

      if (!res.ok) {
        setOwnerPickerResults([])
        setOwnerPickerError(res.error || 'Erro ao buscar proprietarios.')
        return
      }

      setOwnerPickerResults(res.data)
      if (res.data.length === 0) {
        setOwnerPickerError('Nenhum resultado encontrado.')
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao buscar pessoas.'
      setOwnerPickerResults([])
      setOwnerPickerError(message)
    } finally {
      setIsLoadingOwnerPicker(false)
    }
  }

  const handleSelectOwner = (person: PersonSearchResult) => {
    if (ownerPersonRestricted) return
    setForm((prev) => ({ ...prev, owner_client_id: person.id }))
    setSelectedOwner(person)
    setOwnerPickerOpen(false)
    setOwnerPickerResults([])
    setOwnerPickerError(null)
  }

  const handleClearOwner = () => {
    if (ownerPersonRestricted) return
    setForm((prev) => ({ ...prev, owner_client_id: '' }))
    setSelectedOwner(null)
    setOwnerPickerError(null)
  }

  const handleOpenOwnerPicker = async () => {
    if (ownerPersonRestricted) return
    setOwnerPickerOpen(true)
    setOwnerPickerQuery('')
    await loadOwnerPicker('')
  }

  const explicitKeys = useMemo(
    () =>
      new Set([
        'status',
        'purpose',
        'title',
        'description',
        'property_category_id',
        'lead_type_id',
        'cover_media_url',
        'address',
        'address_number',
        'address_complement',
        'city',
        'neighborhood',
        'state',
        'postal_code',
        'latitude',
        'longitude',
        'price',
        'rent_price',
        'appraisal_value',
        'condo_fee',
        'sale_commission_percent',
        'sale_broker_split_percent',
        'sale_partner_split_percent',
        'rent_initial_commission_percent',
        'rent_recurring_commission_percent',
        'rent_broker_split_percent',
        'rent_partner_split_percent',
        'accepts_financing',
        'accepts_trade',
        'property_standard',
        'artesian_well',
        'usage',
        'condition',
        'area_m2',
        'land_area_m2',
        'built_area_m2',
        'bedrooms',
        'bathrooms',
        'parking',
        'suites',
        'year_built',
        'is_renovated',
        'renovated_at',
        'registry_number',
        'registry_office',
        'iptu_value',
        'iptu_year',
        'iptu_is_paid',
        'can_view_legal_data',
        'can_edit_overview_data',
        'can_edit_commission_percent',
        'property_commission_settings',
        'owner_person',
        'owner_person_restricted',
        'owner_client_id',
        'owner_user_id',
        'created_by',
        'created_at',
        'updated_at'
      ]),
    []
  )

  const hiddenKeys = useMemo(() => {
    const result: Record<string, unknown> = {}
    Object.entries(property).forEach(([key, value]) => {
      if (!explicitKeys.has(key)) {
        result[key] = value
      }
    })
    return result
  }, [explicitKeys, property])

  const debugData = useMemo(
    () => ({
      owner_client_id: form.owner_client_id,
      owner_user_id: form.owner_user_id,
      created_by: form.created_by,
      ...hiddenKeys
    }),
    [form.owner_client_id, form.owner_user_id, form.created_by, hiddenKeys]
  )

  const debugLabelMap = useMemo(
    () => ({
      owner_client_id: 'Proprietário',
      owner_user_id: 'Responsável (usuário)',
      created_by: 'Criado por'
    }),
    []
  )

  const debugValueMap = useMemo(
    () => ({
      owner_client_id: ownerPersonRestricted ? 'Oculto para este perfil' : ownerPersonLabel || form.owner_client_id,
      owner_user_id: ownerDisplay || form.owner_user_id,
      created_by: createdByDisplay || form.created_by
    }),
    [ownerPersonRestricted, ownerPersonLabel, ownerDisplay, createdByDisplay, form.owner_client_id, form.owner_user_id, form.created_by]
  )

  const handleSave = () => {
    if (!canEditOverviewData) {
      showError('Sem permissão: apenas responsável/admin/gestor pode editar.')
      return
    }

    startTransition(async () => {
      try {
        const payload: Record<string, unknown> = {
          status: form.status || null,
          purpose: form.purpose || null,
          title: form.title || null,
          description: form.description || null,
          property_category_id: form.property_category_id || null,
          lead_type_id: form.lead_type_id || null,
          cover_media_url: form.cover_media_url || null,
          address: form.address || null,
          address_number: form.address_number || null,
          address_complement: form.address_complement || null,
          city: form.city || null,
          neighborhood: form.neighborhood || null,
          state: form.state || null,
          postal_code: form.postal_code || null,
          latitude: parseNumberOrNull(form.latitude),
          longitude: parseNumberOrNull(form.longitude),
          price: parseBRL(form.price),
          rent_price: parseBRL(form.rent_price),
          appraisal_value: parseBRL(form.appraisal_value),
          condo_fee: parseBRL(form.condo_fee),
          accepts_financing: form.accepts_financing,
          accepts_trade: form.accepts_trade,
          property_standard: form.property_standard || null,
          artesian_well: form.artesian_well,
          usage: form.usage || null,
          condition: form.condition || null,
          area_m2: parseNumberOrNull(form.area_m2),
          land_area_m2: parseNumberOrNull(form.land_area_m2),
          built_area_m2: parseNumberOrNull(form.built_area_m2),
          bedrooms: parseNumberOrNull(form.bedrooms),
          bathrooms: parseNumberOrNull(form.bathrooms),
          parking: parseNumberOrNull(form.parking),
          suites: parseNumberOrNull(form.suites),
          year_built: parseNumberOrNull(form.year_built),
          is_renovated: form.is_renovated,
          renovated_at: form.renovated_at || null,
          iptu_value: parseBRL(form.iptu_value),
          iptu_year: parseNumberOrNull(form.iptu_year),
          iptu_is_paid: form.iptu_is_paid,
          owner_client_id: form.owner_client_id || null
        }

        if (canEditCommissionPercent) {
          payload.sale_commission_percent = parseDecimalOrNull(form.sale_commission_percent)
          payload.sale_broker_split_percent = parseDecimalOrNull(form.sale_broker_split_percent)
          payload.sale_partner_split_percent = parseDecimalOrNull(form.sale_partner_split_percent)
          payload.rent_initial_commission_percent = parseDecimalOrNull(form.rent_initial_commission_percent)
          payload.rent_recurring_commission_percent = parseDecimalOrNull(form.rent_recurring_commission_percent)
          payload.rent_broker_split_percent = parseDecimalOrNull(form.rent_broker_split_percent)
          payload.rent_partner_split_percent = parseDecimalOrNull(form.rent_partner_split_percent)
        }

        if (canViewLegalData) {
          payload.registry_number = form.registry_number || null
          payload.registry_office = form.registry_office || null
        }

        await updatePropertyBasics(String(property.id), payload as any)

        const updatedProperty = {
          ...property,
          status: form.status || null,
          purpose: form.purpose || null,
          title: form.title || null,
          description: form.description || null,
          property_category_id: form.property_category_id || null,
          lead_type_id: form.lead_type_id || null,
          cover_media_url: form.cover_media_url || null,
          address: form.address || null,
          address_number: form.address_number || null,
          address_complement: form.address_complement || null,
          city: form.city || null,
          neighborhood: form.neighborhood || null,
          state: form.state || null,
          postal_code: form.postal_code || null,
          latitude: parseNumberOrNull(form.latitude),
          longitude: parseNumberOrNull(form.longitude),
          price: parseBRL(form.price),
          rent_price: parseBRL(form.rent_price),
          appraisal_value: parseBRL(form.appraisal_value),
          condo_fee: parseBRL(form.condo_fee),
          accepts_financing: form.accepts_financing,
          accepts_trade: form.accepts_trade,
          property_standard: form.property_standard || null,
          artesian_well: form.artesian_well,
          usage: form.usage || null,
          condition: form.condition || null,
          area_m2: parseNumberOrNull(form.area_m2),
          land_area_m2: parseNumberOrNull(form.land_area_m2),
          built_area_m2: parseNumberOrNull(form.built_area_m2),
          bedrooms: parseNumberOrNull(form.bedrooms),
          bathrooms: parseNumberOrNull(form.bathrooms),
          parking: parseNumberOrNull(form.parking),
          suites: parseNumberOrNull(form.suites),
          year_built: parseNumberOrNull(form.year_built),
          is_renovated: form.is_renovated,
          renovated_at: form.renovated_at || null,
          registry_number: canViewLegalData ? form.registry_number || null : (property as any).registry_number ?? null,
          registry_office: canViewLegalData ? form.registry_office || null : (property as any).registry_office ?? null,
          iptu_value: parseBRL(form.iptu_value),
          iptu_year: parseNumberOrNull(form.iptu_year),
          iptu_is_paid: form.iptu_is_paid,
          owner_client_id: form.owner_client_id || null,
          sale_commission_percent: canEditCommissionPercent
            ? parseDecimalOrNull(form.sale_commission_percent)
            : (property as any).sale_commission_percent ?? (property as any).commission_percent ?? null,
          sale_broker_split_percent: canEditCommissionPercent
            ? parseDecimalOrNull(form.sale_broker_split_percent)
            : (property as any).sale_broker_split_percent ?? null,
          sale_partner_split_percent: canEditCommissionPercent
            ? parseDecimalOrNull(form.sale_partner_split_percent)
            : (property as any).sale_partner_split_percent ?? null,
          rent_initial_commission_percent: canEditCommissionPercent
            ? parseDecimalOrNull(form.rent_initial_commission_percent)
            : (property as any).rent_initial_commission_percent ?? null,
          rent_recurring_commission_percent: canEditCommissionPercent
            ? parseDecimalOrNull(form.rent_recurring_commission_percent)
            : (property as any).rent_recurring_commission_percent ?? null,
          rent_broker_split_percent: canEditCommissionPercent
            ? parseDecimalOrNull(form.rent_broker_split_percent)
            : (property as any).rent_broker_split_percent ?? null,
          rent_partner_split_percent: canEditCommissionPercent
            ? parseDecimalOrNull(form.rent_partner_split_percent)
            : (property as any).rent_partner_split_percent ?? null,
          commission_percent: canEditCommissionPercent
            ? parseDecimalOrNull(form.sale_commission_percent)
            : (property as any).commission_percent ?? null
        }

        onUpdated(updatedProperty)
        showSuccess('Imóvel atualizado.')
        setIsEditing(false)
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Erro ao atualizar imóvel.'
        showError(message)
      }
    })
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="text-base">Dados completos</CardTitle>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              disabled={!canEditOverviewData}
              onClick={() => setIsEditing(!isEditing)}
            >
              {isEditing ? 'Cancelar' : 'Editar'}
            </Button>
            {isEditing && canEditOverviewData && (
              <Button onClick={handleSave} disabled={isSaving || !canEditOverviewData}>
                {isSaving ? 'Salvando...' : 'Salvar'}
              </Button>
            )}
            {!canEditOverviewData && (
              <p className="self-center text-xs text-[var(--muted-foreground)]">
                Edição liberada para responsável, gestor ou admin.
              </p>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-[var(--foreground)]">Título & Descrição</h3>
              <Button type="button" variant="outline" disabled>
                Gerar com IA
              </Button>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label="Título"
                value={form.title}
                disabled={!isEditing}
                onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
              />
              <Textarea
                label="Descrição"
                value={form.description}
                disabled={!isEditing}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, description: event.target.value }))
                }
              />
            </div>
          </div>

          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-[var(--foreground)]">Básico</h3>
            <div className="rounded-[var(--radius)] border border-[var(--primary)] bg-[var(--primary)]/10 p-3">
              <p className="text-[11px] font-extrabold uppercase tracking-wide text-[var(--primary)]">Tempo de publicacao</p>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-[var(--primary)] bg-[var(--primary)] px-2.5 py-1 text-xs font-extrabold text-white">
                  {publicationLabel}
                </span>
                <span className="text-xs text-[var(--muted-foreground)]">
                  O indicador aparece tambem na aba de negociacoes e no painel de campanha.
                </span>
              </div>
            </div>
            <div className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <p className="text-xs text-[var(--muted-foreground)]">Responsável (Usuário)</p>
                <p className="font-medium text-[var(--foreground)]">{ownerDisplay || '-'}</p>
              </div>
              <div>
                <p className="text-xs text-[var(--muted-foreground)]">Criado por</p>
                <p className="font-medium text-[var(--foreground)]">{createdByDisplay || '-'}</p>
              </div>
              <div>
                <p className="text-xs text-[var(--muted-foreground)]">Proprietário (Pessoa)</p>
                <p className="font-medium text-[var(--foreground)]">
                  {ownerPersonLabel || '-'}
                </p>
              </div>
              <div className="sm:col-span-2 lg:col-span-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-medium text-[var(--muted-foreground)]">
                    Proprietário (Pessoa)
                  </p>
                  {!ownerPersonRestricted ? (
                    <div className="flex gap-2">
                      <Button type="button" variant="outline" disabled={!isEditing} onClick={handleOpenOwnerPicker}>
                        Buscar
                      </Button>
                      {form.owner_client_id && (
                        <Button type="button" variant="outline" disabled={!isEditing} onClick={handleClearOwner}>
                          Limpar
                        </Button>
                      )}
                    </div>
                  ) : (
                    <p className="text-xs text-[var(--muted-foreground)]">Oculto para este perfil.</p>
                  )}
                </div>
                <div className="mt-2 rounded-[var(--radius)] border border-[var(--border)] p-3">
                  <p className="text-sm font-medium text-[var(--foreground)]">{selectedOwnerLabel}</p>
                </div>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Select
                label="Status"
                options={statusOptions}
                value={form.status}
                disabled={!isEditing}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, status: event.target.value }))
                }
              />
              <Select
                label="Finalidade"
                options={purposeOptions}
                value={form.purpose}
                disabled={!isEditing}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, purpose: event.target.value }))
                }
              />
              <Select
                label="Categoria"
                options={categoryOptions}
                value={form.property_category_id}
                disabled={!isEditing}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, property_category_id: event.target.value }))
                }
              />
              <Input
                label="Tipo de lead"
                value={form.lead_type_id}
                disabled={!isEditing}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, lead_type_id: event.target.value }))
                }
              />
              <Input
                label="URL da capa"
                value={form.cover_media_url}
                disabled={!isEditing}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, cover_media_url: event.target.value }))
                }
              />
            </div>
          </div>

          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-[var(--foreground)]">Endereço & Geo</h3>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Input
                label="Endereço"
                value={form.address}
                disabled={!isEditing}
                onChange={(event) => setForm((prev) => ({ ...prev, address: event.target.value }))}
              />
              <Input
                label="Número"
                value={form.address_number}
                disabled={!isEditing}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, address_number: event.target.value }))
                }
              />
              <Input
                label="Complemento"
                value={form.address_complement}
                disabled={!isEditing}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, address_complement: event.target.value }))
                }
              />
              <Input
                label="Cidade"
                value={form.city}
                disabled={!isEditing}
                onChange={(event) => setForm((prev) => ({ ...prev, city: event.target.value }))}
              />
              <Input
                label="Bairro"
                value={form.neighborhood}
                disabled={!isEditing}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, neighborhood: event.target.value }))
                }
              />
              <Input
                label="Estado"
                value={form.state}
                disabled={!isEditing}
                onChange={(event) => setForm((prev) => ({ ...prev, state: event.target.value }))}
              />
              <Input
                label="CEP"
                value={form.postal_code}
                disabled={!isEditing}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, postal_code: event.target.value }))
                }
              />
              <Input
                label="Latitude"
                value={form.latitude}
                disabled={!isEditing}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, latitude: event.target.value }))
                }
              />
              <Input
                label="Longitude"
                value={form.longitude}
                disabled={!isEditing}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, longitude: event.target.value }))
                }
              />
            </div>
          </div>

          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-[var(--foreground)]">
              Valores & Financiamento
            </h3>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <MoneyInput
                label="Valor anunciado"
                value={form.price}
                disabled={!isEditing}
                onChange={(value) => setForm((prev) => ({ ...prev, price: value }))}
                onBlur={() =>
                  setForm((prev) => ({
                    ...prev,
                    price: formatBRL(parseBRL(prev.price) ?? null)
                  }))
                }
              />
              <MoneyInput
                label="Aluguel anunciado"
                value={form.rent_price}
                disabled={!isEditing}
                onChange={(value) => setForm((prev) => ({ ...prev, rent_price: value }))}
                onBlur={() =>
                  setForm((prev) => ({
                    ...prev,
                    rent_price: formatBRL(parseBRL(prev.rent_price) ?? null)
                  }))
                }
              />
              <MoneyInput
                label="Valor de avaliação"
                value={form.appraisal_value}
                disabled={!isEditing}
                onChange={(value) => setForm((prev) => ({ ...prev, appraisal_value: value }))}
                onBlur={() =>
                  setForm((prev) => ({
                    ...prev,
                    appraisal_value: formatBRL(parseBRL(prev.appraisal_value) ?? null)
                  }))
                }
              />
              <MoneyInput
                label="Condomínio"
                value={form.condo_fee}
                disabled={!isEditing}
                onChange={(value) => setForm((prev) => ({ ...prev, condo_fee: value }))}
                onBlur={() =>
                  setForm((prev) => ({
                    ...prev,
                    condo_fee: formatBRL(parseBRL(prev.condo_fee) ?? null)
                  }))
                }
              />
              <label className="flex items-center gap-2 text-sm text-[var(--foreground)]">
                <input
                  type="checkbox"
                  checked={form.accepts_financing}
                  disabled={!isEditing}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, accepts_financing: event.target.checked }))
                  }
                />
                Aceita financiamento
              </label>
              <label className="flex items-center gap-2 text-sm text-[var(--foreground)]">
                <input
                  type="checkbox"
                  checked={form.accepts_trade}
                  disabled={!isEditing}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, accepts_trade: event.target.checked }))
                  }
                />
                Aceita permuta
              </label>
              <Input
                label="Comissão venda (%)"
                value={form.sale_commission_percent}
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                disabled={!isEditing || !canEditCommissionPercent}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, sale_commission_percent: event.target.value }))
                }
              />
              <Input
                label="Split corretor venda (%)"
                value={form.sale_broker_split_percent}
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                disabled={!isEditing || !canEditCommissionPercent}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, sale_broker_split_percent: event.target.value }))
                }
              />
              <Input
                label="Split parceiro venda (%)"
                value={form.sale_partner_split_percent}
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                disabled={!isEditing || !canEditCommissionPercent}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, sale_partner_split_percent: event.target.value }))
                }
              />
              <Input
                label="Comissão aluguel inicial (%)"
                value={form.rent_initial_commission_percent}
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                disabled={!isEditing || !canEditCommissionPercent}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, rent_initial_commission_percent: event.target.value }))
                }
              />
              <Input
                label="Comissão aluguel recorrente (%)"
                value={form.rent_recurring_commission_percent}
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                disabled={!isEditing || !canEditCommissionPercent}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, rent_recurring_commission_percent: event.target.value }))
                }
              />
              <Input
                label="Split corretor aluguel (%)"
                value={form.rent_broker_split_percent}
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                disabled={!isEditing || !canEditCommissionPercent}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, rent_broker_split_percent: event.target.value }))
                }
              />
              <Input
                label="Split parceiro aluguel (%)"
                value={form.rent_partner_split_percent}
                type="number"
                inputMode="decimal"
                min="0"
                step="0.01"
                disabled={!isEditing || !canEditCommissionPercent}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, rent_partner_split_percent: event.target.value }))
                }
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-[var(--radius)] border border-[var(--border)] p-3">
                <p className="text-xs text-[var(--muted-foreground)]">Resumo venda</p>
                <p className="mt-1 text-sm font-medium text-[var(--foreground)]">
                  Base: {saleReferenceValue > 0 ? `R$ ${formatBRL(saleReferenceValue)}` : '-'}
                </p>
                <p className="text-sm text-[var(--foreground)]">
                  Comissão: {saleCommissionValue > 0 ? `R$ ${formatBRL(saleCommissionValue)}` : '-'}
                </p>
                <p className="text-sm text-[var(--foreground)]">
                  Líquido proprietário: {saleOwnerNetValue > 0 ? `R$ ${formatBRL(saleOwnerNetValue)}` : '-'}
                </p>
              </div>
              <div className="rounded-[var(--radius)] border border-[var(--border)] p-3">
                <p className="text-xs text-[var(--muted-foreground)]">Resumo aluguel</p>
                <p className="mt-1 text-sm font-medium text-[var(--foreground)]">
                  Base mensal: {rentReferenceValue > 0 ? `R$ ${formatBRL(rentReferenceValue)}` : '-'}
                </p>
                <p className="text-sm text-[var(--foreground)]">
                  Comissão inicial: {rentInitialCommissionValue > 0 ? `R$ ${formatBRL(rentInitialCommissionValue)}` : '-'}
                </p>
                <p className="text-sm text-[var(--foreground)]">
                  Comissão recorrente: {rentRecurringCommissionValue > 0 ? `R$ ${formatBRL(rentRecurringCommissionValue)}` : '-'}
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-[var(--foreground)]">Características</h3>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Input
                label="Area do terreno (m2)"
                value={form.land_area_m2}
                type="number"
                inputMode="decimal"
                disabled={!isEditing}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, land_area_m2: event.target.value }))
                }
              />
              <Input
                label="Area construida (m2)"
                value={form.built_area_m2}
                type="number"
                inputMode="decimal"
                disabled={!isEditing}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, built_area_m2: event.target.value }))
                }
              />
              <Input
                label="Padrão do imóvel"
                value={form.property_standard}
                disabled={!isEditing}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, property_standard: event.target.value }))
                }
              />
              <label className="flex items-center gap-2 text-sm text-[var(--foreground)]">
                <input
                  type="checkbox"
                  checked={form.artesian_well}
                  disabled={!isEditing}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, artesian_well: event.target.checked }))
                  }
                />
                Poço artesiano
              </label>
              <Select
                label="Quartos"
                options={NUMBER_OPTIONS}
                value={form.bedrooms}
                disabled={!isEditing}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, bedrooms: (event.target as HTMLSelectElement).value }))
                }
              />
              <Select
                label="Banheiros"
                options={NUMBER_OPTIONS}
                value={form.bathrooms}
                disabled={!isEditing}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, bathrooms: (event.target as HTMLSelectElement).value }))
                }
              />
              <Select
                label="Vagas"
                options={NUMBER_OPTIONS}
                value={form.parking}
                disabled={!isEditing}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, parking: (event.target as HTMLSelectElement).value }))
                }
              />
              <Select
                label="Suites"
                options={NUMBER_OPTIONS}
                value={form.suites}
                disabled={!isEditing}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, suites: (event.target as HTMLSelectElement).value }))
                }
              />
              <Select
                label="Situação do imóvel"
                options={USAGE_OPTIONS}
                value={form.usage}
                disabled={!isEditing}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, usage: (event.target as HTMLSelectElement).value }))
                }
              />
              <Select
                label="Condição"
                options={CONDITION_OPTIONS}
                value={form.condition}
                disabled={!isEditing}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, condition: (event.target as HTMLSelectElement).value }))
                }
              />
              <Input
                label="Ano de construção"
                value={form.year_built}
                type="number"
                disabled={!isEditing}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, year_built: event.target.value }))
                }
              />
              <Input
                label="Reformado em"
                value={form.renovated_at}
                type="date"
                disabled={!isEditing}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, renovated_at: event.target.value }))
                }
              />
              <label className="flex items-center gap-2 text-sm text-[var(--foreground)]">
                <input
                  type="checkbox"
                  checked={form.is_renovated}
                  disabled={!isEditing}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, is_renovated: event.target.checked }))
                  }
                />
                Reformado
              </label>
            </div>
          </div>

          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-[var(--foreground)]">Jurídico/Registro</h3>
            {!legalDataRestricted ? (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <Input
                  label="Matrícula"
                  value={form.registry_number}
                  disabled={!isEditing}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, registry_number: event.target.value }))
                  }
                />
                <Input
                  label="Cartório"
                  value={form.registry_office}
                  disabled={!isEditing}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, registry_office: event.target.value }))
                  }
                />
                <MoneyInput
                  label="IPTU (valor)"
                  value={form.iptu_value}
                  disabled={!isEditing}
                  onChange={(value) => setForm((prev) => ({ ...prev, iptu_value: value }))}
                  onBlur={() =>
                    setForm((prev) => ({
                      ...prev,
                      iptu_value: formatBRL(parseBRL(prev.iptu_value) ?? null)
                    }))
                  }
                />
                <Input
                  label="IPTU (ano)"
                  value={form.iptu_year}
                  type="number"
                  disabled={!isEditing}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, iptu_year: event.target.value }))
                  }
                />
                <label className="flex items-center gap-2 text-sm text-[var(--foreground)]">
                  <input
                    type="checkbox"
                    checked={form.iptu_is_paid}
                    disabled={!isEditing}
                    onChange={(event) =>
                      setForm((prev) => ({ ...prev, iptu_is_paid: event.target.checked }))
                    }
                  />
                  IPTU pago
                </label>
              </div>
            ) : (
              <div className="rounded-[var(--radius)] border border-[var(--border)] p-3 text-sm text-[var(--muted-foreground)]">
                Matrícula e documentos jurídicos ficam ocultos para corretor que não é responsável por este imóvel.
              </div>
            )}
          </div>

          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-[var(--foreground)]">Metadados</h3>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Input label="Criado em" value={form.created_at} disabled />
              <Input label="Atualizado em" value={form.updated_at} disabled />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Dados do banco (debug)</CardTitle>
        </CardHeader>
        <CardContent>
          <details>
            <summary className="cursor-pointer text-sm font-medium text-[var(--foreground)]">
              Ver campos do banco
            </summary>
            <div className="mt-4">
              <KeyValueList data={debugData} labelMap={debugLabelMap} valueMap={debugValueMap} />
            </div>
          </details>
        </CardContent>
      </Card>

      {ownerPickerOpen && !ownerPersonRestricted && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <Card className="w-full max-w-2xl">
            <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <CardTitle className="text-base">Selecionar proprietário</CardTitle>
              <Button variant="ghost" type="button" onClick={() => setOwnerPickerOpen(false)}>
                Fechar
              </Button>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap items-end gap-2">
                <div className="min-w-[220px] flex-1">
                  <Input
                    label="Buscar pessoa"
                    value={ownerPickerQuery}
                    placeholder="Nome, e-mail ou documento"
                    onChange={(event) => setOwnerPickerQuery(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault()
                        loadOwnerPicker(ownerPickerQuery)
                      }
                    }}
                  />
                </div>
                <Button type="button" variant="outline" onClick={() => loadOwnerPicker(ownerPickerQuery)}>
                  Pesquisar
                </Button>
              </div>

              {ownerPickerError && (
                <p className="text-sm text-[var(--destructive)]">{ownerPickerError}</p>
              )}

              {isLoadingOwnerPicker ? (
                <p className="text-sm text-[var(--muted-foreground)]">Carregando pessoas...</p>
              ) : (
                <div className="max-h-[360px] overflow-auto pr-1">
                  <div className="grid gap-2 sm:grid-cols-2">
                    {ownerPickerResults.map((person) => (
                      <button
                        key={person.id}
                        type="button"
                        onClick={() => handleSelectOwner(person)}
                        className="rounded-[var(--radius)] border border-[var(--input)] bg-transparent px-3 py-2 text-left text-sm hover:border-[var(--ring)]"
                      >
                        <div className="font-medium text-[var(--foreground)]">
                          {person.full_name || person.email || 'Pessoa sem nome'}
                        </div>
                        <div className="text-xs text-[var(--muted-foreground)]">
                          {person.email || 'Sem e-mail'}
                          {person.document_id ? ` ? ${person.document_id}` : ''}
                          {person.phone_e164 ? ` ? ${person.phone_e164}` : ''}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}


