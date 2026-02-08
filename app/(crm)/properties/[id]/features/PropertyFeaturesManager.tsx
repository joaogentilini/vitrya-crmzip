'use client'

import { useMemo, useState, useTransition } from 'react'
import { Button } from '@/components/ui/Button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { useToast } from '@/components/ui/Toast'
import { updatePropertyFeatures } from '../actions'

interface FeatureCatalogItem {
  id: string
  key: string
  label_pt: string
  group?: string | null
  type: string
  options?: unknown
  position?: number | null
}

interface FeatureValueRow {
  feature_id: string
  value_boolean: boolean | null
  value_number: number | null
  value_text: string | null
  value_json: unknown | null
}

interface PropertyFeaturesManagerProps {
  propertyId: string
  catalog: FeatureCatalogItem[]
  initialValues: FeatureValueRow[]
  aliasesToClear: FeatureCatalogItem[]
}

type FeatureValueState = Record<string, boolean | string | string[]>

type NormalizedOption = { value: string; label: string }

/**
 * Consolidação canônica: "Tipo de piso"
 * - Renderiza somente flooring_type
 * - Usa aliases (piso/tipos_piso) como fallback na carga
 */
const FLOORING_CANONICAL_KEY = 'flooring_type'
const FLOORING_ALIAS_KEYS = ['piso', 'tipos_piso'] as const

function normalizeOptions(options: unknown): NormalizedOption[] {
  if (!Array.isArray(options)) return []
  return options
    .map((option) => {
      if (typeof option === 'string') {
        return { value: option, label: option }
      }
      if (option && typeof option === 'object') {
        const value = String((option as any).value ?? '')
        const label = String((option as any).label ?? value)
        if (!value) return null
        return { value, label }
      }
      return null
    })
    .filter(Boolean) as NormalizedOption[]
}

function getFeatureByKey(catalog: FeatureCatalogItem[], key: string) {
  return catalog.find((f) => f.key === key) ?? null
}

function buildInitialState(
  catalog: FeatureCatalogItem[],
  values: FeatureValueRow[]
): FeatureValueState {
  const valuesMap = new Map(values.map((item) => [item.feature_id, item]))
  const state: FeatureValueState = {}

  catalog.forEach((feature) => {
    const current = valuesMap.get(feature.id)

    if (feature.type === 'boolean') {
      state[feature.id] = current?.value_boolean ?? false
      return
    }

    if (feature.type === 'multi_enum') {
      state[feature.id] = Array.isArray(current?.value_json) ? (current?.value_json as any) : []
      return
    }

    if (feature.type === 'number') {
      state[feature.id] =
        typeof current?.value_number === 'number' ? String(current.value_number) : ''
      return
    }

    // enum/text/etc
    state[feature.id] = current?.value_text ?? ''
  })

  // 🔽 Consolidação inicial (fallback de aliases -> canônico)
  const canonical = getFeatureByKey(catalog, FLOORING_CANONICAL_KEY)
  const aliasFeatures = FLOORING_ALIAS_KEYS.map((k) => getFeatureByKey(catalog, k)).filter(
    Boolean
  ) as FeatureCatalogItem[]

  if (canonical) {
    const canonicalValue = state[canonical.id]
    const canonicalIsEmpty =
      canonicalValue === '' ||
      canonicalValue === null ||
      typeof canonicalValue === 'undefined' ||
      (Array.isArray(canonicalValue) && canonicalValue.length === 0)

    if (canonicalIsEmpty) {
      // procura primeiro alias com valor "preenchido"
      for (const alias of aliasFeatures) {
        const v = state[alias.id]
        const hasValue =
          v !== '' &&
          v !== null &&
          typeof v !== 'undefined' &&
          (!Array.isArray(v) || v.length > 0)

        if (hasValue) {
          state[canonical.id] = v as any
          break
        }
      }
    }
  }

  return state
}

function isFlooringAlias(feature: FeatureCatalogItem) {
  return FLOORING_ALIAS_KEYS.includes(feature.key as any)
}

export default function PropertyFeaturesManager({
  propertyId,
  catalog,
  initialValues,
  aliasesToClear,
}: PropertyFeaturesManagerProps) {
  const { success: showSuccess, error: showError } = useToast()
  const [search, setSearch] = useState('')
  const [isSaving, startTransition] = useTransition()

  const [values, setValues] = useState<FeatureValueState>(() =>
    buildInitialState(catalog, initialValues)
  )

  // Catálogo efetivo para UI: remove aliases do Tipo de piso (piso/tipos_piso)
  const uiCatalog = useMemo(() => {
    return catalog.filter((item) => !isFlooringAlias(item))
  }, [catalog])

  const filteredCatalog = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return uiCatalog
    return uiCatalog.filter((item) => item.label_pt?.toLowerCase().includes(term))
  }, [uiCatalog, search])

  const groups = useMemo(() => {
    const map = new Map<string, FeatureCatalogItem[]>()
    filteredCatalog.forEach((item) => {
      const groupName = item.group?.trim() || 'Outros'
      const list = map.get(groupName) ?? []
      list.push(item)
      map.set(groupName, list)
    })

    return Array.from(map.entries()).map(([groupName, items]) => [
      groupName,
      items.sort((a, b) => (a.position ?? 0) - (b.position ?? 0)),
    ]) as Array<[string, FeatureCatalogItem[]]>
  }, [filteredCatalog])

  const handleSave = () => {
    // Salva apenas o catálogo exibido (sem aliases de piso/tipos_piso)
    const payload = uiCatalog.map((feature) => {
      const rawValue = values[feature.id]

      if (feature.type === 'number') {
        if (rawValue === '' || rawValue === null || typeof rawValue === 'undefined') {
          return { feature_id: feature.id, type: feature.type, value: null }
        }
        const normalized = Number(String(rawValue).replace(',', '.'))
        return {
          feature_id: feature.id,
          type: feature.type,
          value: Number.isNaN(normalized) ? null : normalized,
        }
      }

      return { feature_id: feature.id, type: feature.type, value: rawValue }
    })

    // Limpa aliases (inclusive piso/tipos_piso) conforme instrução do backend
    const aliasPayload = aliasesToClear.map((feature) => {
      if (feature.type === 'boolean') {
        return { feature_id: feature.id, type: feature.type, value: false }
      }
      if (feature.type === 'multi_enum') {
        return { feature_id: feature.id, type: feature.type, value: [] }
      }
      if (feature.type === 'number') {
        return { feature_id: feature.id, type: feature.type, value: null }
      }
      return { feature_id: feature.id, type: feature.type, value: '' }
    })

    startTransition(async () => {
      const result = await updatePropertyFeatures(propertyId, [...payload, ...aliasPayload])
      if (result?.success) {
        showSuccess('Características salvas com sucesso.')
        return
      }
      showError(result?.error ?? 'Erro ao salvar características.')
    })
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Características</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Input
            placeholder="Buscar característica..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <p className="text-xs text-[var(--muted-foreground)]">
            Edite apenas características dinâmicas que não fazem parte do formulário padrão do imóvel.
          </p>
        </CardContent>
      </Card>

      {groups.length === 0 && (
        <Card>
          <CardContent className="py-6 text-sm text-[var(--muted-foreground)]">
            Nenhuma característica disponível.
          </CardContent>
        </Card>
      )}

      {groups.map(([groupName, items]) => (
        <Card key={groupName}>
          <CardHeader>
            <CardTitle>{groupName}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((feature) => {
              const currentValue = values[feature.id]
              const fieldLabel =
                feature.key === FLOORING_CANONICAL_KEY ? 'Tipo de piso' : feature.label_pt

              if (feature.type === 'boolean') {
                return (
                  <label
                    key={feature.id}
                    className="flex items-center gap-2 rounded-[var(--radius)] border border-[var(--input)] px-3 py-2 text-sm"
                  >
                    <input
                      type="checkbox"
                      checked={Boolean(currentValue)}
                      onChange={(event) =>
                        setValues((prev) => ({
                          ...prev,
                          [feature.id]: event.target.checked,
                        }))
                      }
                    />
                    <span>{fieldLabel}</span>
                  </label>
                )
              }

              if (feature.type === 'enum') {
                const options = [
                  { value: '', label: 'Sem seleção' },
                  ...normalizeOptions(feature.options),
                ]
                return (
                  <Select
                    key={feature.id}
                    label={fieldLabel}
                    options={options}
                    value={typeof currentValue === 'string' ? currentValue : ''}
                    onChange={(event) =>
                      setValues((prev) => ({
                        ...prev,
                        [feature.id]: event.target.value,
                      }))
                    }
                  />
                )
              }

              if (feature.type === 'multi_enum') {
                const options = normalizeOptions(feature.options)
                const selected = Array.isArray(currentValue) ? currentValue : []
                return (
                  <div key={feature.id} className="space-y-2 sm:col-span-2 lg:col-span-3">
                    <p className="text-sm font-medium text-[var(--foreground)]">{fieldLabel}</p>
                    {options.length === 0 && (
                      <p className="text-xs text-[var(--muted-foreground)]">Sem opções.</p>
                    )}
                    <div className="flex flex-wrap gap-3">
                      {options.map((opt) => (
                        <label key={opt.value} className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={selected.includes(opt.value)}
                            onChange={(event) => {
                              const next = event.target.checked
                                ? [...selected, opt.value]
                                : selected.filter((item) => item !== opt.value)
                              setValues((prev) => ({
                                ...prev,
                                [feature.id]: next,
                              }))
                            }}
                          />
                          <span>{opt.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )
              }

              if (feature.type === 'number') {
                return (
                  <Input
                    key={feature.id}
                    label={fieldLabel}
                    type="number"
                    value={typeof currentValue === 'string' ? currentValue : ''}
                    onChange={(event) =>
                      setValues((prev) => ({
                        ...prev,
                        [feature.id]: event.target.value,
                      }))
                    }
                  />
                )
              }

              return (
                <Input
                  key={feature.id}
                  label={fieldLabel}
                  value={typeof currentValue === 'string' ? currentValue : ''}
                  onChange={(event) =>
                    setValues((prev) => ({
                      ...prev,
                      [feature.id]: event.target.value,
                    }))
                  }
                />
              )
            })}
          </CardContent>
        </Card>
      ))}

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={isSaving}>
          {isSaving ? 'Salvando...' : 'Salvar características'}
        </Button>
      </div>
    </div>
  )
}
