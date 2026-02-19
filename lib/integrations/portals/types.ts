export type PortalProvider = 'grupoolx' | 'olx' | 'meta'

export interface PortalIntegrationRow {
  id: string
  provider: PortalProvider
  is_enabled: boolean
  settings: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface PortalWebhookEventRow {
  id: string
  provider: PortalProvider
  external_event_id: string | null
  idempotency_key: string
  event_type: string | null
  payload: Record<string, unknown>
  headers: Record<string, unknown> | null
  status: 'received' | 'duplicate' | 'processed' | 'ignored' | 'error'
  error_message: string | null
  processing_result: Record<string, unknown> | null
  received_at: string
  processed_at: string | null
}

