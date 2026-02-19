'use client'

import { useMemo, useState, useTransition, type FormEvent } from 'react'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/Textarea'
import { Select } from '@/components/ui/Select'
import { useToast } from '@/components/ui/Toast'
import { supabase } from '@/lib/supabaseClient'
import { addPropertyMedia, removePropertyMedia, updatePropertyBasics } from './actions'

type AnyRow = Record<string, unknown>

interface PropertyMediaRow {
  id: string
  url: string
  kind: string
  position: number | null
}

interface ChecklistResult {
  canPublish: boolean
  missing: string[]
}

interface ImóvelDetailClientProps {
  property: AnyRow
  media: PropertyMediaRow[]
  checklist: ChecklistResult
  propertyCategories: { id: string; name: string }[]
}

type ProfileLike = { full_name?: string | null; email?: string | null } | null

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
  people: 'Pessoas'
}

function formatDbFieldLabel(key: string) {
  const mapped = DB_FIELD_LABELS[key]
  if (mapped) return mapped

  return key
    .replace(/_/g, ' ')
    .replace(/\bid\b/g, 'ID')
    .replace(/\b\w/g, (char) => char.toUpperCase())
}

function asProfileLike(value: unknown): ProfileLike {
  if (!value || typeof value !== 'object') return null
  const v = value as Record<string, unknown>
  return {
    full_name: typeof v.full_name === 'string' ? v.full_name : (v.full_name as any) ?? null,
    email: typeof v.email === 'string' ? v.email : (v.email as any) ?? null
  }
}

function formatValue(value: unknown, key?: string) {
  if (value === null || value === undefined || value === '') return '—'
  if (Array.isArray(value)) return value.length > 0 ? value.join(', ') : '—'
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

const STATUS_OPTIONS = [
  { value: 'draft', label: 'Rascunho' },
  { value: 'active', label: 'Ativo' },
  { value: 'archived', label: 'Arquivado' }
]

const PURPOSE_OPTIONS = [
  { value: 'sale', label: 'Venda' },
  { value: 'rent', label: 'Aluguel' }
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
          valueMap && Object.prototype.hasOwnProperty.call(valueMap, key) ? valueMap[key] : value
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

export default function ImóvelDetailClient({
  property,
  media,
  checklist,
  propertyCategories
}: ImóvelDetailClientProps) {
  const { success: showSuccess, error: showError } = useToast()
  const [isEditing, setIsEditing] = useState(false)
  const [isSaving, startTransition] = useTransition()

  const [mediaForm, setMediaForm] = useState({
    url: '',
    kind: 'image',
    position: ''
  })
  const [mediaSaving, startMediaTransition] = useTransition()

  const [form, setForm] = useState({
    status: String(property.status ?? ''),
    purpose: String(property.purpose ?? ''),
    title: String(property.title ?? ''),
    description: String(property.description ?? ''),
    city: String(property.city ?? ''),
    neighborhood: String(property.neighborhood ?? ''),
    address: String(property.address ?? ''),
    address_number: String(property.address_number ?? ''),
    address_complement: String(property.address_complement ?? ''),
    state: String(property.state ?? ''),
    postal_code: String(property.postal_code ?? ''),
    latitude: String(property.latitude ?? ''),
    longitude: String(property.longitude ?? ''),
    price: String(property.price ?? ''),
    rent_price: String(property.rent_price ?? ''),
    sale_value: String(property.sale_value ?? ''),
    appraisal_value: String(property.appraisal_value ?? ''),
    down_payment_value: String(property.down_payment_value ?? ''),
    usage: String(property.usage ?? ''),
    condition: String(property.condition ?? ''),
    area_m2: String(property.area_m2 ?? ''),
    bedrooms: String(property.bedrooms ?? ''),
    bathrooms: String(property.bathrooms ?? ''),
    parking: String(property.parking ?? ''),
    condo_fee: String(property.condo_fee ?? ''),
    registry_number: String(property.registry_number ?? ''),
    registry_office: String(property.registry_office ?? ''),
    iptu_value: String(property.iptu_value ?? ''),
    iptu_year: String(property.iptu_year ?? ''),
    iptu_is_paid: Boolean(property.iptu_is_paid ?? false),
    owner_client_id: String(property.owner_client_id ?? ''),
    owner_user_id: String(property.owner_user_id ?? ''),
    created_by: String(property.created_by ?? ''),
    created_at: String(property.created_at ?? ''),
    updated_at: String(property.updated_at ?? ''),
    lead_type_id: String(property.lead_type_id ?? ''),
    cover_media_url: String(property.cover_media_url ?? ''),
    property_category_id: String(property.property_category_id ?? ''),
    year_built: String(property.year_built ?? ''),
    is_renovated: Boolean(property.is_renovated ?? false),
    renovated_at: String(property.renovated_at ?? '')
  })

  // 🔒 Tipagem segura para perfis (evita TS2339)
  const ownerProfile = useMemo(() => asProfileLike(property.owner_profile), [property.owner_profile])
  const createdByProfile = useMemo(
    () => asProfileLike(property.created_by_profile),
    [property.created_by_profile]
  )

  const ownerPerson = property.owner_person as ProfileLike

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

  const categoryOptions = useMemo(() => {
    const options = propertyCategories.map((category) => ({
      value: category.id,
      label: category.name
    }))
    const currentId = form.property_category_id
    if (currentId && !options.some((option) => option.value === currentId)) {
      const fallbackLabel = (property as any)?.property_category_name || 'Categoria atual (inativa)'
      options.unshift({ value: currentId, label: String(fallbackLabel) })
    }
    return options
  }, [propertyCategories, form.property_category_id, property])

  const [ownerSearch, setOwnerSearch] = useState('')
  const [ownerResults, setOwnerResults] = useState<
    Array<{
      id: string
      full_name?: string | null
      email?: string | null
      phone_e164?: string | null
      document_id?: string | null
      kind_tags?: string[] | null
    }>
  >([])
  const [selectedOwner, setSelectedOwner] = useState<typeof ownerResults[number] | null>(null)
  const [isSearchingOwner, setIsSearchingOwner] = useState(false)
  const [ownerSearchError, setOwnerSearchError] = useState<string | null>(null)

  const selectedOwnerLabel =
    selectedOwner?.full_name ||
    selectedOwner?.email ||
    selectedOwner?.document_id ||
    selectedOwner?.phone_e164 ||
    ownerPerson?.full_name ||
    ownerPerson?.email ||
    (form.owner_client_id ? 'Proprietário selecionado (carregando...)' : 'Nenhuma')

  const handleSearchOwner = async () => {
    const term = ownerSearch.trim()
    setOwnerSearchError(null)
    if (!term) {
      setOwnerResults([])
      return
    }
    setIsSearchingOwner(true)
    try {
      const { data, error } = await supabase
        .from('people')
        .select('id, full_name, email, phone_e164, document_id, kind_tags')
        .or(`full_name.ilike.%${term}%,email.ilike.%${term}%,document_id.ilike.%${term}%`)
        .limit(20)

      if (error) throw new Error(error.message)

      const filtered =
        data?.filter((person) =>
          Array.isArray(person.kind_tags) ? person.kind_tags.includes('proprietario') : false
        ) ?? []

      setOwnerResults(filtered)
      if (filtered.length === 0) {
        setOwnerSearchError('Nenhum resultado encontrado.')
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao buscar pessoas.'
      setOwnerSearchError(message)
    } finally {
      setIsSearchingOwner(false)
    }
  }

  const handleSelectOwner = (person: typeof ownerResults[number]) => {
    setForm((prev) => ({ ...prev, owner_client_id: person.id }))
    setSelectedOwner(person)
    setOwnerResults([])
    setOwnerSearchError(null)
  }

  const explicitKeys = useMemo(
    () =>
      new Set([
        'status',
        'purpose',
        'title',
        'description',
        'city',
        'neighborhood',
        'address',
        'address_number',
        'address_complement',
        'state',
        'postal_code',
        'latitude',
        'longitude',
        'price',
        'rent_price',
        'sale_value',
        'appraisal_value',
        'down_payment_value',
        'usage',
        'condition',
        'area_m2',
        'bedrooms',
        'bathrooms',
        'parking',
        'condo_fee',
        'registry_number',
        'registry_office',
        'iptu_value',
        'iptu_year',
        'iptu_is_paid',
        'owner_client_id',
        'owner_user_id',
        'created_by',
        'created_at',
        'updated_at',
        'lead_type_id',
        'cover_media_url',
        'property_category_id',
        'year_built',
        'is_renovated',
        'renovated_at'
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
      owner_user_id: 'Responsável (corretor)',
      created_by: 'Criado por'
    }),
    []
  )

  const debugValueMap = useMemo(
    () => ({
      owner_client_id: selectedOwnerLabel,
      owner_user_id: ownerProfile?.full_name || ownerProfile?.email || form.owner_user_id,
      created_by: createdByProfile?.full_name || createdByProfile?.email || form.created_by
    }),
    [form.owner_user_id, form.created_by, ownerProfile, createdByProfile, selectedOwnerLabel]
  )

  const handleSave = () => {
    startTransition(async () => {
      try {
        await updatePropertyBasics(String(property.id), {
          status: form.status || null,
          purpose: form.purpose || null,
          title: form.title || null,
          description: form.description || null,
          city: form.city || null,
          neighborhood: form.neighborhood || null,
          address: form.address || null,
          address_number: form.address_number || null,
          address_complement: form.address_complement || null,
          state: form.state || null,
          postal_code: form.postal_code || null,
          latitude: parseNumberOrNull(form.latitude),
          longitude: parseNumberOrNull(form.longitude),
          price: parseNumberOrNull(form.price),
          rent_price: parseNumberOrNull(form.rent_price),
          sale_value: parseNumberOrNull(form.sale_value),
          appraisal_value: parseNumberOrNull(form.appraisal_value),
          down_payment_value: parseNumberOrNull(form.down_payment_value),
          usage: form.usage || null,
          condition: form.condition || null,
          area_m2: parseNumberOrNull(form.area_m2),
          bedrooms: parseNumberOrNull(form.bedrooms),
          bathrooms: parseNumberOrNull(form.bathrooms),
          parking: parseNumberOrNull(form.parking),
          condo_fee: parseNumberOrNull(form.condo_fee),
          registry_number: form.registry_number || null,
          registry_office: form.registry_office || null,
          iptu_value: parseNumberOrNull(form.iptu_value),
          iptu_year: parseNumberOrNull(form.iptu_year),
          iptu_is_paid: form.iptu_is_paid,
          owner_client_id: form.owner_client_id || null,
          owner_user_id: form.owner_user_id || null,
          created_by: form.created_by || null,
          created_at: form.created_at || null,
          updated_at: form.updated_at || null,
          lead_type_id: form.lead_type_id || null,
          cover_media_url: form.cover_media_url || null,
          property_category_id: form.property_category_id || null,
          year_built: parseNumberOrNull(form.year_built),
          is_renovated: form.is_renovated,
          renovated_at: form.renovated_at || null
        })
        showSuccess('Imóvel atualizado.')
        setIsEditing(false)
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Erro ao atualizar imóvel.'
        showError(message)
      }
    })
  }

  const handleAddMedia = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    startMediaTransition(async () => {
      try {
        if (!mediaForm.url.trim()) {
          showError('Informe a URL da mídia.')
          return
        }
        await addPropertyMedia(String(property.id), {
          url: mediaForm.url.trim(),
          kind: mediaForm.kind === 'video' ? 'video' : 'image',
          position: mediaForm.position ? Number(mediaForm.position) : null
        })
        setMediaForm({ url: '', kind: 'image', position: '' })
        showSuccess('Mídia adicionada.')
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Erro ao adicionar mídia.'
        showError(message)
      }
    })
  }

  const handleRemoveMedia = (mediaId: string) => {
    startMediaTransition(async () => {
      try {
        await removePropertyMedia(mediaId, String(property.id))
        showSuccess('Mídia removida.')
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Erro ao remover mídia.'
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
            <Button variant="outline" onClick={() => setIsEditing(!isEditing)}>
              {isEditing ? 'Cancelar' : 'Editar'}
            </Button>
            {isEditing && (
              <Button onClick={handleSave} disabled={isSaving}>
                {isSaving ? 'Salvando...' : 'Salvar'}
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Select
              label="Status"
              options={statusOptions}
              value={form.status}
              disabled={!isEditing}
              onChange={(event) => setForm((prev) => ({ ...prev, status: event.target.value }))}
            />
            <Select
              label="Finalidade"
              options={purposeOptions}
              value={form.purpose}
              disabled={!isEditing}
              onChange={(event) => setForm((prev) => ({ ...prev, purpose: event.target.value }))}
            />
            <Input
              label="Título"
              value={form.title}
              disabled={!isEditing}
              onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
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

          <div className="space-y-2">
            <p className="text-sm font-medium text-[var(--foreground)]">Proprietário (Pessoa)</p>
            <div className="flex flex-wrap items-end gap-2">
              <div className="min-w-[220px] flex-1">
                <Input
                  label="Buscar pessoa"
                  value={ownerSearch}
                  disabled={!isEditing}
                  placeholder="Nome, e-mail ou documento"
                  onChange={(event) => setOwnerSearch(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault()
                      handleSearchOwner()
                    }
                  }}
                />
              </div>
              <Button
                type="button"
                variant="outline"
                disabled={!isEditing || isSearchingOwner}
                onClick={handleSearchOwner}
              >
                {isSearchingOwner ? 'Buscando...' : 'Buscar'}
              </Button>
            </div>
            {ownerSearchError && <p className="text-sm text-[var(--destructive)]">{ownerSearchError}</p>}
            {ownerResults.length > 0 && (
              <div className="max-h-56 overflow-auto rounded-[var(--radius)] border border-[var(--border)] p-2">
                <div className="grid gap-2 sm:grid-cols-2">
                  {ownerResults.map((person) => (
                    <button
                      key={person.id}
                      type="button"
                      disabled={!isEditing}
                      onClick={() => handleSelectOwner(person)}
                      className="rounded-[var(--radius)] border border-[var(--input)] bg-transparent px-3 py-2 text-left text-sm hover:border-[var(--ring)] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <div className="font-medium text-[var(--foreground)]">
                        {person.full_name || person.email || 'Pessoa sem nome'}
                      </div>
                      <div className="text-xs text-[var(--muted-foreground)]">
                        {person.email || 'Sem e-mail'}
                        {person.document_id ? ` · ${person.document_id}` : ''}
                        {person.phone_e164 ? ` · ${person.phone_e164}` : ''}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
            <p className="text-sm text-[var(--muted-foreground)]">
              Selecionado: <span className="text-[var(--foreground)]">{selectedOwnerLabel}</span>
            </p>
          </div>

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
              onChange={(event) => setForm((prev) => ({ ...prev, postal_code: event.target.value }))}
            />
            <Input
              label="Latitude"
              value={form.latitude}
              disabled={!isEditing}
              onChange={(event) => setForm((prev) => ({ ...prev, latitude: event.target.value }))}
            />
            <Input
              label="Longitude"
              value={form.longitude}
              disabled={!isEditing}
              onChange={(event) => setForm((prev) => ({ ...prev, longitude: event.target.value }))}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Input
              label="Preço"
              value={form.price}
              disabled={!isEditing}
              onChange={(event) => setForm((prev) => ({ ...prev, price: event.target.value }))}
            />
            <Input
              label="Aluguel"
              value={form.rent_price}
              disabled={!isEditing}
              onChange={(event) => setForm((prev) => ({ ...prev, rent_price: event.target.value }))}
            />
            <Input
              label="Valor de venda"
              value={form.sale_value}
              disabled={!isEditing}
              onChange={(event) => setForm((prev) => ({ ...prev, sale_value: event.target.value }))}
            />
            <Input
              label="Valor de avaliação"
              value={form.appraisal_value}
              disabled={!isEditing}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, appraisal_value: event.target.value }))
              }
            />
            <Input
              label="Entrada"
              value={form.down_payment_value}
              disabled={!isEditing}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, down_payment_value: event.target.value }))
              }
            />
            <Input
              label="Condomínio"
              value={form.condo_fee}
              disabled={!isEditing}
              onChange={(event) => setForm((prev) => ({ ...prev, condo_fee: event.target.value }))}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Input
              label="Uso"
              value={form.usage}
              disabled={!isEditing}
              onChange={(event) => setForm((prev) => ({ ...prev, usage: event.target.value }))}
            />
            <Input
              label="Condição"
              value={form.condition}
              disabled={!isEditing}
              onChange={(event) => setForm((prev) => ({ ...prev, condition: event.target.value }))}
            />
            <Input
              label="Área (m²)"
              value={form.area_m2}
              disabled={!isEditing}
              onChange={(event) => setForm((prev) => ({ ...prev, area_m2: event.target.value }))}
            />
            <Input
              label="Quartos"
              value={form.bedrooms}
              disabled={!isEditing}
              onChange={(event) => setForm((prev) => ({ ...prev, bedrooms: event.target.value }))}
            />
            <Input
              label="Banheiros"
              value={form.bathrooms}
              disabled={!isEditing}
              onChange={(event) => setForm((prev) => ({ ...prev, bathrooms: event.target.value }))}
            />
            <Input
              label="Vagas"
              value={form.parking}
              disabled={!isEditing}
              onChange={(event) => setForm((prev) => ({ ...prev, parking: event.target.value }))}
            />
            <Input
              label="Ano de construção"
              value={form.year_built}
              disabled={!isEditing}
              onChange={(event) => setForm((prev) => ({ ...prev, year_built: event.target.value }))}
            />
            <Input
              label="Reformado em"
              value={form.renovated_at}
              disabled={!isEditing}
              onChange={(event) => setForm((prev) => ({ ...prev, renovated_at: event.target.value }))}
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
            <Input
              label="IPTU (valor)"
              value={form.iptu_value}
              disabled={!isEditing}
              onChange={(event) => setForm((prev) => ({ ...prev, iptu_value: event.target.value }))}
            />
            <Input
              label="IPTU (ano)"
              value={form.iptu_year}
              disabled={!isEditing}
              onChange={(event) => setForm((prev) => ({ ...prev, iptu_year: event.target.value }))}
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

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Input label="Proprietário (Pessoa)" value={selectedOwnerLabel} disabled />
            <Input
              label="Responsável (corretor)"
              value={String(ownerProfile?.full_name || ownerProfile?.email || form.owner_user_id || '—')}
              disabled
            />
            <Input
              label="Criado por"
              value={String(
                createdByProfile?.full_name || createdByProfile?.email || form.created_by || '—'
              )}
              disabled
            />
            <Input label="Criado em" value={form.created_at} disabled />
            <Input label="Atualizado em" value={form.updated_at} disabled />
          </div>

          {isEditing && (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Input label="Responsável (ID)" value={form.owner_user_id} disabled />
              <Input label="Criado por (ID)" value={form.created_by} disabled />
              <Input label="Proprietário (ID)" value={form.owner_client_id} disabled />
            </div>
          )}

          <div>
            <Textarea
              label="Descrição"
              value={form.description}
              disabled={!isEditing}
              onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Mídia</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {media.length > 0 ? (
            <div className="space-y-2">
              {media.map((item) => (
                <div
                  key={item.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius)] border border-[var(--border)] p-3 text-sm"
                >
                  <div>
                    <p className="font-medium text-[var(--foreground)]">{item.url}</p>
                    <p className="text-xs text-[var(--muted-foreground)]">
                      {item.kind} • posição {item.position ?? '—'}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    onClick={() => handleRemoveMedia(item.id)}
                    disabled={mediaSaving}
                  >
                    Remover
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-[var(--muted-foreground)]">Nenhuma mídia cadastrada.</p>
          )}

          <form onSubmit={handleAddMedia} className="grid gap-3 sm:grid-cols-3">
            <Input
              label="URL"
              value={mediaForm.url}
              onChange={(event) => setMediaForm((prev) => ({ ...prev, url: event.target.value }))}
            />
            <Select
              label="Tipo"
              options={[
                { value: 'image', label: 'Imagem' },
                { value: 'video', label: 'Vídeo' }
              ]}
              value={mediaForm.kind}
              onChange={(event) =>
                setMediaForm((prev) => ({
                  ...prev,
                  kind: (event.target as HTMLSelectElement).value
                }))
              }
            />
            <Input
              label="Posição"
              value={mediaForm.position}
              onChange={(event) => setMediaForm((prev) => ({ ...prev, position: event.target.value }))}
            />
            <div className="sm:col-span-3">
              <Button type="submit" variant="outline" disabled={mediaSaving}>
                {mediaSaving ? 'Salvando...' : 'Adicionar mídia'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Checklist de publicação</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-[var(--foreground)]">Pode publicar?</span>
            {checklist.canPublish ? (
              <Badge variant="secondary">Sim</Badge>
            ) : (
              <Badge variant="destructive">Não</Badge>
            )}
          </div>
          {!checklist.canPublish && (
            <ul className="list-disc pl-5 text-sm text-[var(--muted-foreground)]">
              {checklist.missing.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Dados do banco (debug)</CardTitle>
        </CardHeader>
        <CardContent>
          <details>
            <summary className="cursor-pointer text-sm font-medium text-[var(--foreground)]">
              Ver campos não renderizados
            </summary>
            <div className="mt-4">
              <KeyValueList data={debugData} labelMap={debugLabelMap} valueMap={debugValueMap} />
            </div>
          </details>
        </CardContent>
      </Card>
    </div>
  )
}
