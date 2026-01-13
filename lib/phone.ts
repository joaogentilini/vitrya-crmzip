/**
 * Brazilian phone number normalization to E.164 format
 * E.164 format: +55XXXXXXXXXXX (country code + DDD + number)
 */

export interface PhoneNormalizationResult {
  isValid: boolean
  e164: string | null
  raw: string
  error?: string
}

/**
 * Normalize a Brazilian phone number to E.164 format
 * Handles various input formats:
 * - (11) 99999-9999
 * - 11 99999 9999
 * - +55 11 99999-9999
 * - 5511999999999
 * - 11999999999
 */
export function normalizeBrazilianPhone(input: string): PhoneNormalizationResult {
  const raw = input.trim()
  
  if (!raw) {
    return { isValid: false, e164: null, raw, error: 'Telefone não informado' }
  }

  // Remove all non-digit characters
  let digits = raw.replace(/\D/g, '')

  // Handle country code
  if (digits.startsWith('55') && digits.length >= 12) {
    // Already has country code
    digits = digits.slice(2)
  } else if (digits.startsWith('0')) {
    // Remove leading 0 (old carrier prefix)
    digits = digits.slice(1)
  }

  // Validate length: DDD (2) + number (8 or 9)
  if (digits.length < 10 || digits.length > 11) {
    return { 
      isValid: false, 
      e164: null, 
      raw, 
      error: 'Telefone inválido. Use formato: (DDD) 9XXXX-XXXX' 
    }
  }

  // Extract DDD
  const ddd = digits.slice(0, 2)
  const dddNum = parseInt(ddd, 10)

  // Validate DDD range (11-99, but some are invalid)
  if (dddNum < 11 || dddNum > 99) {
    return { isValid: false, e164: null, raw, error: 'DDD inválido' }
  }

  // Extract number part
  let number = digits.slice(2)

  // Normalize 8-digit numbers to 9-digit (add 9 prefix for mobile)
  if (number.length === 8 && !number.startsWith('9')) {
    // Landline or old mobile - keep as is but prepend 9 for mobile detection
    // Actually, 8-digit starting with 9 should have another 9 prepended
    // This is complex, so we'll accept both 8 and 9 digits
  }

  // Final validation
  if (number.length < 8 || number.length > 9) {
    return { 
      isValid: false, 
      e164: null, 
      raw, 
      error: 'Número inválido. Verifique os dígitos.' 
    }
  }

  // Build E.164 format
  const e164 = `+55${ddd}${number}`

  return { isValid: true, e164, raw }
}

/**
 * Format E.164 phone for display
 * +5511999999999 -> (11) 99999-9999
 */
export function formatPhoneForDisplay(e164: string | null): string {
  if (!e164) return ''
  
  // Remove +55 prefix
  let digits = e164.replace(/^\+55/, '')
  
  if (digits.length < 10) return e164
  
  const ddd = digits.slice(0, 2)
  const rest = digits.slice(2)
  
  if (rest.length === 9) {
    // Mobile: 9 XXXX-XXXX
    return `(${ddd}) ${rest.slice(0, 5)}-${rest.slice(5)}`
  } else if (rest.length === 8) {
    // Landline: XXXX-XXXX
    return `(${ddd}) ${rest.slice(0, 4)}-${rest.slice(4)}`
  }
  
  return e164
}
