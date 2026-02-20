function toFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const normalized = value.trim().replace(',', '.')
    const parsed = Number(normalized)
    if (Number.isFinite(parsed)) return parsed
  }
  return null
}

function toDate(value: unknown): Date | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value
  }

  if (typeof value === 'string' || typeof value === 'number') {
    const parsed = new Date(value)
    return Number.isNaN(parsed.getTime()) ? null : parsed
  }

  return null
}

export function formatCurrencyBRL(value: unknown): string {
  const parsed = toFiniteNumber(value)
  if (parsed === null) return ''
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(parsed)
}

export function formatPercent(value: unknown, maximumFractionDigits = 2): string {
  const parsed = toFiniteNumber(value)
  if (parsed === null) return ''
  return `${new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: 0,
    maximumFractionDigits,
  }).format(parsed)}%`
}

export function formatDateBR(value: unknown): string {
  const parsed = toDate(value)
  if (!parsed) return ''
  return new Intl.DateTimeFormat('pt-BR').format(parsed)
}

export function formatDateTimeBR(value: unknown): string {
  const parsed = toDate(value)
  if (!parsed) return ''
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(parsed)
}
