'use client'

import { useMemo, useState, useTransition } from 'react'

import { Button } from '@/components/ui/Button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { useToast } from '@/components/ui/Toast'

import { updateIncorporationFeaturesAction } from './actions'

type FeatureCatalogItem = {
  id: string
  key: string
  label_pt: string
  group_name?: string | null
  type: string
  options?: unknown
  position?: number | null
}

type FeatureValueRow = {
  feature_id: string
  value_boolean: boolean | null
  value_number: number | null
  value_text: string | null
  value_json: unknown | null
}

type FeatureValueState = Record<string, boolean | string | string[]>

type NormalizedOption = { value: string; label: string }

function normalizeOptions(options: unknown): NormalizedOption[] {
  if (!Array.isArray(options)) return []
  return options
    .map((option) => {
      if (typeof option === 'string') return { value: option, label: option }
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

function buildInitialState(catalog: FeatureCatalogItem[], values: FeatureValueRow[]): FeatureValueState {
  const valuesMap = new Map(values.map((item) => [item.feature_id, item]))
  const state: FeatureValueState = {}

  for (const feature of catalog) {
    const current = valuesMap.get(feature.id)
    if (feature.type === 'boolean') {
      state[feature.id] = current?.value_boolean ?? false
      continue
    }
    if (feature.type === 'multi_enum') {
      state[feature.id] = Array.isArray(current?.value_json) ? (current?.value_json as string[]) : []
      continue
    }
    if (feature.type === 'number') {
      state[feature.id] =
        typeof current?.value_number === 'number' && Number.isFinite(current.value_number)
          ? String(current.value_number)
          : ''
      continue
    }
    state[feature.id] = current?.value_text ?? ''
  }

  return state
}

function mapToSavePayload(catalog: FeatureCatalogItem[], state: FeatureValueState) {
  return catalog.map((feature) => {
    const rawValue = state[feature.id]

    if (feature.type === 'number') {
      if (rawValue === '' || rawValue === null || typeof rawValue === 'undefined') {
        return { feature_id: feature.id, type: feature.type, value: null }
      }
      const parsed = Number(String(rawValue).replace(',', '.'))
      return {
        feature_id: feature.id,
        type: feature.type,
        value: Number.isFinite(parsed) ? parsed : null,
      }
    }

    return { feature_id: feature.id, type: feature.type, value: rawValue }
  })
}

export default function IncorporationFeaturesManager({
  incorporationId,
  catalog,
  initialValues,
}: {
  incorporationId: string
  catalog: FeatureCatalogItem[]
  initialValues: FeatureValueRow[]
}) {
  const { success: showSuccess, error: showError } = useToast()
  const [search, setSearch] = useState('')
  const [isSaving, startTransition] = useTransition()
  const [values, setValues] = useState<FeatureValueState>(() => buildInitialState(catalog, initialValues))

  const filteredCatalog = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return catalog
    return catalog.filter((item) => item.label_pt?.toLowerCase().includes(term))
  }, [catalog, search])

  const groups = useMemo(() => {
    const map = new Map<string, FeatureCatalogItem[]>()
    for (const item of filteredCatalog) {
      const group = item.group_name?.trim() || 'Outros'
      const current = map.get(group) || []
      current.push(item)
      map.set(group, current)
    }

    return Array.from(map.entries()).map(([groupName, items]) => [
      groupName,
      items.sort((a, b) => (a.position ?? 0) - (b.position ?? 0)),
    ]) as Array<[string, FeatureCatalogItem[]]>
  }, [filteredCatalog])

  const handleSave = () => {
    startTransition(async () => {
      const payload = mapToSavePayload(catalog, values)
      const result = await updateIncorporationFeaturesAction(incorporationId, payload)
      if (result.success) {
        showSuccess('Características do empreendimento salvas com sucesso.')
        return
      }
      showError(result.error || 'Erro ao salvar características.')
    })
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Características dinamicas do empreendimento</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input
            placeholder="Buscar caracteristica..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <p className="text-xs text-[var(--muted-foreground)]">
            As tipologias/herdaram automaticamente estas características, salvo ajustes especificos por planta.
          </p>
        </CardContent>
      </Card>

      {groups.length === 0 ? (
        <Card>
          <CardContent className="py-6 text-sm text-[var(--muted-foreground)]">
            Nenhuma caracteristica ativa encontrada.
          </CardContent>
        </Card>
      ) : null}

      {groups.map(([groupName, items]) => (
        <Card key={groupName}>
          <CardHeader>
            <CardTitle>{groupName}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((feature) => {
              const currentValue = values[feature.id]
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
                        setValues((prev) => ({ ...prev, [feature.id]: event.target.checked }))
                      }
                    />
                    <span>{feature.label_pt}</span>
                  </label>
                )
              }

              if (feature.type === 'enum') {
                const options = [{ value: '', label: 'Sem seleção' }, ...normalizeOptions(feature.options)]
                return (
                  <Select
                    key={feature.id}
                    label={feature.label_pt}
                    options={options}
                    value={typeof currentValue === 'string' ? currentValue : ''}
                    onChange={(event) =>
                      setValues((prev) => ({ ...prev, [feature.id]: event.target.value }))
                    }
                  />
                )
              }

              if (feature.type === 'multi_enum') {
                const options = normalizeOptions(feature.options)
                const selected = Array.isArray(currentValue) ? currentValue : []
                return (
                  <div key={feature.id} className="space-y-2 sm:col-span-2 lg:col-span-3">
                    <p className="text-sm font-medium text-[var(--foreground)]">{feature.label_pt}</p>
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
                              setValues((prev) => ({ ...prev, [feature.id]: next }))
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
                    label={feature.label_pt}
                    type="number"
                    value={typeof currentValue === 'string' ? currentValue : ''}
                    onChange={(event) =>
                      setValues((prev) => ({ ...prev, [feature.id]: event.target.value }))
                    }
                  />
                )
              }

              return (
                <Input
                  key={feature.id}
                  label={feature.label_pt}
                  value={typeof currentValue === 'string' ? currentValue : ''}
                  onChange={(event) =>
                    setValues((prev) => ({ ...prev, [feature.id]: event.target.value }))
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
