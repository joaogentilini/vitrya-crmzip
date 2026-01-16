import { randomUUID } from 'crypto'

const isDev = process.env.NODE_ENV !== 'production'

export interface LogContext {
  requestId: string
  endpoint?: string
  userId?: string
  [key: string]: unknown
}

function sanitize(obj: unknown): unknown {
  if (typeof obj !== 'object' || obj === null) return obj
  
  const sensitiveKeys = [
    'password', 'token', 'secret', 'key', 'authorization',
    'cookie', 'session', 'credit_card', 'ssn', 'api_key'
  ]
  
  if (Array.isArray(obj)) {
    return obj.map(sanitize)
  }
  
  const sanitized: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    const keyLower = k.toLowerCase()
    if (sensitiveKeys.some(sk => keyLower.includes(sk))) {
      sanitized[k] = '[REDACTED]'
    } else if (typeof v === 'object' && v !== null) {
      sanitized[k] = sanitize(v)
    } else {
      sanitized[k] = v
    }
  }
  return sanitized
}

function formatLog(level: string, message: string, context: LogContext, data?: unknown): string {
  const timestamp = new Date().toISOString()
  const base = {
    timestamp,
    level,
    requestId: context.requestId,
    endpoint: context.endpoint,
    userId: context.userId,
    message
  }
  
  if (isDev) {
    return JSON.stringify({ ...base, data }, null, 2)
  }
  
  return JSON.stringify({ ...base, data: data ? sanitize(data) : undefined })
}

export function createLogger(endpoint: string, userId?: string) {
  const requestId = randomUUID().slice(0, 8)
  const context: LogContext = { requestId, endpoint, userId }
  
  return {
    requestId,
    context,
    
    info(message: string, data?: unknown) {
      console.log(formatLog('INFO', message, context, data))
    },
    
    warn(message: string, data?: unknown) {
      console.warn(formatLog('WARN', message, context, data))
    },
    
    error(message: string, error?: unknown, data?: unknown) {
      const errorData = error instanceof Error 
        ? { name: error.name, message: error.message, stack: isDev ? error.stack : undefined }
        : error
      console.error(formatLog('ERROR', message, context, { error: errorData, ...((data as object) || {}) }))
    },
    
    debug(message: string, data?: unknown) {
      if (isDev) {
        console.debug(formatLog('DEBUG', message, context, data))
      }
    }
  }
}

export function withErrorHandler<T>(
  log: ReturnType<typeof createLogger>,
  operation: string,
  fn: () => Promise<T>
): Promise<{ data: T | null; error: string | null }> {
  return fn()
    .then(data => ({ data, error: null }))
    .catch(err => {
      log.error(`${operation} failed`, err)
      return { 
        data: null, 
        error: err instanceof Error ? err.message : 'Erro desconhecido' 
      }
    })
}
