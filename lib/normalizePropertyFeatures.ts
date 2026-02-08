export type FeatureCatalogItem = {
  id: string
  key: string
  label_pt: string
  group?: string | null
  type: string
  options?: unknown
  position?: number | null
}

export type FeatureValueRow = {
  feature_id: string
  value_boolean: boolean | null
  value_number: number | null
  value_text: string | null
  value_json: unknown | null
}

type NormalizedFeaturesResult = {
  catalog: FeatureCatalogItem[]
  values: FeatureValueRow[]
  aliasesToClear: FeatureCatalogItem[]
}

const FLOORING_CANONICAL_KEY = 'flooring_type'
const FLOORING_ALIAS_KEYS = ['tipos_piso', 'piso']
const FLOORING_LABEL_PT = 'Tipo de piso'

function hasFeatureValue(row?: FeatureValueRow | null): boolean {
  if (!row) return false
  if (row.value_boolean !== null) return true
  if (row.value_number !== null) return true
  if (typeof row.value_text === 'string' && row.value_text.trim()) return true
  if (Array.isArray(row.value_json)) return row.value_json.length > 0
  return row.value_json !== null
}

export function normalizePropertyFeatures(
  catalog: FeatureCatalogItem[],
  values: FeatureValueRow[]
): NormalizedFeaturesResult {
  const catalogByKey = new Map(catalog.map((item) => [item.key, item]))
  const canonical = catalogByKey.get(FLOORING_CANONICAL_KEY)

  if (!canonical) {
    return { catalog, values, aliasesToClear: [] }
  }

  const aliases = FLOORING_ALIAS_KEYS.map((key) => catalogByKey.get(key)).filter(
    Boolean
  ) as FeatureCatalogItem[]
  const aliasIds = new Set(aliases.map((item) => item.id))

  const normalizedCatalog = catalog
    .filter((item) => !aliasIds.has(item.id))
    .map((item) =>
      item.key === FLOORING_CANONICAL_KEY
        ? {
            ...item,
            label_pt: FLOORING_LABEL_PT,
          }
        : item
    )

  const valuesById = new Map(values.map((item) => [item.feature_id, item]))
  const canonicalValue = valuesById.get(canonical.id)
  const canonicalHasValue = hasFeatureValue(canonicalValue)

  let fallbackValue: FeatureValueRow | undefined
  if (!canonicalHasValue) {
    for (const alias of aliases) {
      const aliasValue = valuesById.get(alias.id)
      if (hasFeatureValue(aliasValue)) {
        fallbackValue = aliasValue
        break
      }
    }
  }

  let normalizedValues = values.filter((item) => !aliasIds.has(item.feature_id))

  if (fallbackValue && !canonicalHasValue) {
    const mergedValue = { ...fallbackValue, feature_id: canonical.id }
    if (canonicalValue) {
      normalizedValues = normalizedValues.map((item) =>
        item.feature_id === canonical.id ? mergedValue : item
      )
    } else {
      normalizedValues = [...normalizedValues, mergedValue]
    }
  }

  return {
    catalog: normalizedCatalog,
    values: normalizedValues,
    aliasesToClear: aliases,
  }
}
