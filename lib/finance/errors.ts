export type FinanceErrorLike = {
  code?: string | null
  message?: string | null
}

export function isMissingRelationError(error: FinanceErrorLike | null): boolean {
  const code = String(error?.code || '')
  const message = String(error?.message || '').toLowerCase()

  return (
    code === '42P01' ||
    code === '42703' ||
    code === 'PGRST204' ||
    code === 'PGRST205' ||
    message.includes('does not exist') ||
    message.includes('schema cache')
  )
}

export function isUniqueViolation(error: FinanceErrorLike | null): boolean {
  return String(error?.code || '') === '23505'
}

export function toMessage(error: FinanceErrorLike | null, fallback: string): string {
  return String(error?.message || '').trim() || fallback
}
