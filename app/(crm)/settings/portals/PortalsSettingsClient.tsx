'use client'

import { useMemo, useState } from 'react'

import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { useToast } from '@/components/ui/Toast'

type Provider = 'grupoolx' | 'olx' | 'meta'

type IntegrationRow = {
  id: string
  provider: Provider
  is_enabled: boolean
  settings: Record<string, unknown>
  created_at: string
  updated_at: string
}

type EventRow = {
  id: string
  provider: Provider
  status: 'received' | 'duplicate' | 'processed' | 'ignored' | 'error'
  event_type: string | null
  received_at: string
  processed_at: string | null
  error_message: string | null
}

type EnvFlags = {
  portal_integrations_enabled: boolean
  grupoolx_webhook_token_set: boolean
  grupoolx_feed_token_set: boolean
  olx_webhook_token_set: boolean
  olx_client_id_set: boolean
  olx_client_secret_set: boolean
  olx_redirect_uri_set: boolean
}

type SummaryByProvider = Record<Provider, { processed: number; errors: number; duplicates: number }>

interface PortalsSettingsClientProps {
  schemaMissing: boolean
  schemaErrorMessage: string | null
  integrations: IntegrationRow[]
  recentEvents: EventRow[]
  envFlags: EnvFlags
  appBaseUrl: string
}

const PROVIDERS: Array<{
  key: Provider
  title: string
  subtitle: string
  endpoints: string[]
}> = [
  {
    key: 'grupoolx',
    title: 'Grupo OLX (ZAP + VivaReal)',
    subtitle: 'Publicação via feed XML + recebimento de leads por webhook.',
    endpoints: ['GET /api/integrations/grupoolx/feed.xml?token=...', 'POST /api/integrations/grupoolx/leads'],
  },
  {
    key: 'olx',
    title: 'OLX',
    subtitle: 'Webhook de leads pronto + estrutura de jobs para publish/update/unpublish.',
    endpoints: ['POST /api/integrations/olx/leads', 'POST /api/integrations/olx/publish'],
  },
  {
    key: 'meta',
    title: 'Meta (futuro)',
    subtitle: 'Estrutura preparada para futuras origens de lead.',
    endpoints: ['(futuro) webhook dedicado'],
  },
]

function statusVariant(status: EventRow['status']): 'success' | 'destructive' | 'warning' | 'info' | 'secondary' {
  if (status === 'processed') return 'success'
  if (status === 'error') return 'destructive'
  if (status === 'duplicate') return 'warning'
  if (status === 'ignored') return 'secondary'
  return 'info'
}

function formatDate(iso: string | null): string {
  if (!iso) return '-'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleString('pt-BR')
}

function buildSummary(rows: EventRow[]): SummaryByProvider {
  const summary: SummaryByProvider = {
    grupoolx: { processed: 0, errors: 0, duplicates: 0 },
    olx: { processed: 0, errors: 0, duplicates: 0 },
    meta: { processed: 0, errors: 0, duplicates: 0 },
  }
  for (const row of rows) {
    if (row.status === 'processed') summary[row.provider].processed += 1
    if (row.status === 'error') summary[row.provider].errors += 1
    if (row.status === 'duplicate') summary[row.provider].duplicates += 1
  }
  return summary
}

export function PortalsSettingsClient({
  schemaMissing,
  schemaErrorMessage,
  integrations: initialIntegrations,
  recentEvents: initialEvents,
  envFlags,
  appBaseUrl,
}: PortalsSettingsClientProps) {
  const { success, error } = useToast()
  const [integrations, setIntegrations] = useState<IntegrationRow[]>(initialIntegrations)
  const [events, setEvents] = useState<EventRow[]>(initialEvents)
  const [busyProvider, setBusyProvider] = useState<Provider | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  const integrationByProvider = useMemo(() => {
    const map = new Map<Provider, IntegrationRow>()
    for (const row of integrations) map.set(row.provider, row)
    return map
  }, [integrations])

  const summaryByProvider = useMemo(() => buildSummary(events), [events])

  const endpointBase = appBaseUrl || '[NEXT_PUBLIC_SITE_URL não definido]'
  const feedUrlPreview = appBaseUrl
    ? `${endpointBase}/api/integrations/grupoolx/feed.xml?token=SEU_TOKEN`
    : '/api/integrations/grupoolx/feed.xml?token=SEU_TOKEN'

  async function refreshData() {
    setRefreshing(true)
    try {
      const [integrationsRes, eventsRes] = await Promise.all([
        fetch('/api/admin/integrations/portals', { cache: 'no-store' }),
        fetch('/api/admin/integrations/portals/events?limit=50', { cache: 'no-store' }),
      ])

      if (!integrationsRes.ok) {
        const json = await integrationsRes.json().catch(() => ({}))
        throw new Error(json?.error || 'Falha ao atualizar integrações.')
      }
      if (!eventsRes.ok) {
        const json = await eventsRes.json().catch(() => ({}))
        throw new Error(json?.error || 'Falha ao atualizar eventos.')
      }

      const integrationsJson = (await integrationsRes.json()) as { integrations?: IntegrationRow[] }
      const eventsJson = (await eventsRes.json()) as { events?: EventRow[] }
      setIntegrations(Array.isArray(integrationsJson.integrations) ? integrationsJson.integrations : [])
      setEvents(Array.isArray(eventsJson.events) ? eventsJson.events : [])
    } catch (err: any) {
      error(err?.message || 'Erro ao atualizar dados.')
    } finally {
      setRefreshing(false)
    }
  }

  async function toggleProvider(provider: Provider) {
    const current = integrationByProvider.get(provider)
    if (!current) return

    setBusyProvider(provider)
    try {
      const res = await fetch('/api/admin/integrations/portals', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider,
          is_enabled: !current.is_enabled,
        }),
      })

      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(json?.error || 'Falha ao atualizar integracao.')
      }

      success(`Integracao ${provider.toUpperCase()} ${!current.is_enabled ? 'ativada' : 'desativada'}.`)
      await refreshData()
    } catch (err: any) {
      error(err?.message || 'Erro ao atualizar integracao.')
    } finally {
      setBusyProvider(null)
    }
  }

  if (schemaMissing) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Portais</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Badge variant="destructive">Schema pendente</Badge>
          <p className="text-sm text-[var(--muted-foreground)]">
            A migration de portais ainda não foi aplicada no Supabase.
          </p>
          <pre className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--muted)] p-3 text-xs">
            {schemaErrorMessage || 'Execute: supabase/migrations/202602171100_portals_stage1_foundation.sql'}
          </pre>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Integrações de Portais</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={envFlags.portal_integrations_enabled ? 'success' : 'warning'}>
              PORTAL_INTEGRATIONS_ENABLED: {envFlags.portal_integrations_enabled ? 'ON' : 'OFF'}
            </Badge>
            <Badge variant={envFlags.grupoolx_webhook_token_set ? 'success' : 'warning'}>
              GRUPO_OLX_WEBHOOK_TOKEN
            </Badge>
            <Badge variant={envFlags.grupoolx_feed_token_set ? 'success' : 'warning'}>
              GRUPO_OLX_FEED_TOKEN
            </Badge>
            <Badge variant={envFlags.olx_webhook_token_set ? 'success' : 'warning'}>
              OLX_WEBHOOK_TOKEN
            </Badge>
            <Badge variant={envFlags.olx_client_id_set ? 'success' : 'secondary'}>OLX_CLIENT_ID</Badge>
            <Badge variant={envFlags.olx_client_secret_set ? 'success' : 'secondary'}>OLX_CLIENT_SECRET</Badge>
            <Badge variant={envFlags.olx_redirect_uri_set ? 'success' : 'secondary'}>OLX_REDIRECT_URI</Badge>
          </div>
          <p className="text-xs text-[var(--muted-foreground)]">
            Tudo fica pronto no CRM, mas so processa trafego real quando o env global estiver ON e o provedor estiver ativado.
          </p>
          <Button variant="outline" size="sm" onClick={refreshData} loading={refreshing}>
            Atualizar painel
          </Button>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        {PROVIDERS.map((provider) => {
          const row = integrationByProvider.get(provider.key)
          const status = row?.is_enabled ? 'Ativo no CRM' : 'Desligado no CRM'
          const summary = summaryByProvider[provider.key]
          return (
            <Card key={provider.key}>
              <CardHeader>
                <CardTitle className="text-base">{provider.title}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-[var(--muted-foreground)]">{provider.subtitle}</p>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={row?.is_enabled ? 'success' : 'secondary'}>{status}</Badge>
                  <Badge variant="info">processados: {summary.processed}</Badge>
                  <Badge variant="warning">duplicados: {summary.duplicates}</Badge>
                  <Badge variant="destructive">erros: {summary.errors}</Badge>
                </div>
                <div className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--muted)] p-3">
                  <p className="mb-2 text-xs font-semibold text-[var(--foreground)]">Endpoints</p>
                  <ul className="space-y-1 text-xs text-[var(--muted-foreground)]">
                    {provider.endpoints.map((endpoint) => (
                      <li key={endpoint}>
                        <code>{endpoint}</code>
                      </li>
                    ))}
                  </ul>
                </div>
                <Button
                  variant={row?.is_enabled ? 'destructive' : 'default'}
                  size="sm"
                  onClick={() => toggleProvider(provider.key)}
                  loading={busyProvider === provider.key}
                >
                  {row?.is_enabled ? 'Desativar no CRM' : 'Ativar no CRM'}
                </Button>
              </CardContent>
            </Card>
          )
        })}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Preview tecnico</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-[var(--muted-foreground)]">
          <p>
            Feed Grupo OLX: <code>{feedUrlPreview}</code>
          </p>
          <p>
            Base de rotas: <code>{endpointBase || '[NEXT_PUBLIC_SITE_URL não definido]'}</code>
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Ultimos eventos recebidos</CardTitle>
        </CardHeader>
        <CardContent>
          {events.length === 0 ? (
            <p className="text-sm text-[var(--muted-foreground)]">Nenhum evento recebido ainda.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="text-xs uppercase text-[var(--muted-foreground)]">
                  <tr>
                    <th className="px-2 py-2">Provider</th>
                    <th className="px-2 py-2">Status</th>
                    <th className="px-2 py-2">Tipo</th>
                    <th className="px-2 py-2">Recebido</th>
                    <th className="px-2 py-2">Processado</th>
                    <th className="px-2 py-2">Erro</th>
                  </tr>
                </thead>
                <tbody>
                  {events.map((event) => (
                    <tr key={event.id} className="border-t border-[var(--border)]">
                      <td className="px-2 py-2">{event.provider}</td>
                      <td className="px-2 py-2">
                        <Badge variant={statusVariant(event.status)}>{event.status}</Badge>
                      </td>
                      <td className="px-2 py-2">{event.event_type || '-'}</td>
                      <td className="px-2 py-2">{formatDate(event.received_at)}</td>
                      <td className="px-2 py-2">{formatDate(event.processed_at)}</td>
                      <td className="px-2 py-2">{event.error_message || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

