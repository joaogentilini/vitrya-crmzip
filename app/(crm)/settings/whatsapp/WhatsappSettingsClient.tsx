'use client'

import Image from 'next/image'
import { useMemo, useState } from 'react'

import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Input } from '@/components/ui/Input'
import { Select } from '@/components/ui/Select'
import { useToast } from '@/components/ui/Toast'

type ChatChannelAccountRow = {
  id: string
  channel: string
  provider_account_id: string
  account_name: string | null
  broker_user_id: string | null
  is_active: boolean
  settings: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

type ProfileRow = {
  id: string
  full_name: string | null
  email: string | null
  role: string | null
  is_active: boolean | null
}

type EnvSummary = {
  enabled: boolean
  base_url_set: boolean
  api_key_set: boolean
  webhook_url_set: boolean
  base_url_preview: string | null
}

type EvolutionInstanceSummary = {
  instanceName: string
  connectionStatus: string | null
  ownerJid: string | null
  profileName: string | null
}

type QrState = {
  instanceName: string
  dataUri: string | null
  pairingCode: string | null
  status: string | null
}

interface WhatsappSettingsClientProps {
  schemaMissing: boolean
  schemaErrorMessage: string | null
  mappings: ChatChannelAccountRow[]
  brokers: ProfileRow[]
  env: EnvSummary
  appBaseUrl: string
}

function compactText(value: string, limit: number): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, limit)
}

function formatDate(iso: string | null): string {
  if (!iso) return '-'
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleString('pt-BR')
}

function statusVariant(status: string | null): 'success' | 'warning' | 'destructive' | 'secondary' {
  const normalized = String(status || '').trim().toLowerCase()
  if (
    normalized === 'open' ||
    normalized === 'connected' ||
    normalized === 'online' ||
    normalized === 'ready' ||
    normalized === 'connectedinstance'
  ) {
    return 'success'
  }
  if (normalized === 'close' || normalized === 'connecting' || normalized === 'qr' || normalized === 'pending') {
    return 'warning'
  }
  if (normalized === 'disconnected' || normalized === 'error' || normalized === 'closed') {
    return 'destructive'
  }
  return 'secondary'
}

export function WhatsappSettingsClient({
  schemaMissing,
  schemaErrorMessage,
  mappings: initialMappings,
  brokers,
  env: initialEnv,
  appBaseUrl,
}: WhatsappSettingsClientProps) {
  const { success, error } = useToast()

  const [mappings, setMappings] = useState<ChatChannelAccountRow[]>(initialMappings)
  const [env, setEnv] = useState<EnvSummary>(initialEnv)
  const [remoteInstances, setRemoteInstances] = useState<EvolutionInstanceSummary[]>([])
  const [refreshing, setRefreshing] = useState(false)
  const [createLoading, setCreateLoading] = useState(false)
  const [rowBusy, setRowBusy] = useState<string | null>(null)
  const [deleteRemote, setDeleteRemote] = useState(false)
  const [qr, setQr] = useState<QrState | null>(null)
  const [form, setForm] = useState({
    instance_name: '',
    account_name: '',
    broker_user_id: '',
    phone_number: '',
  })

  const brokerById = useMemo(() => {
    const map = new Map<string, ProfileRow>()
    for (const row of brokers) map.set(row.id, row)
    return map
  }, [brokers])

  const remoteByInstance = useMemo(() => {
    const map = new Map<string, EvolutionInstanceSummary>()
    for (const row of remoteInstances) map.set(String(row.instanceName), row)
    return map
  }, [remoteInstances])

  const brokerOptions = useMemo(
    () => [
      { value: '', label: 'Sem corretor (fila gerencial)' },
      ...brokers.map((row) => ({
        value: row.id,
        label: row.full_name || row.email || row.id,
      })),
    ],
    [brokers]
  )

  const webhookPreview = appBaseUrl
    ? `${appBaseUrl}/api/integrations/whatsapp/evolution/webhook`
    : '/api/integrations/whatsapp/evolution/webhook'

  async function refreshPanel() {
    setRefreshing(true)
    try {
      const res = await fetch('/api/admin/integrations/whatsapp/evolution', {
        method: 'GET',
        cache: 'no-store',
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json?.error || 'Falha ao atualizar painel WhatsApp.')

      const nextMappings = Array.isArray(json?.mappings) ? (json.mappings as ChatChannelAccountRow[]) : []
      const nextEnv = (json?.env || null) as EnvSummary | null
      const instances = Array.isArray(json?.evolution?.instances)
        ? (json.evolution.instances as EvolutionInstanceSummary[])
        : []

      setMappings(nextMappings)
      setRemoteInstances(instances)
      if (nextEnv) setEnv(nextEnv)
    } catch (err: any) {
      error(err?.message || 'Erro ao atualizar painel WhatsApp.')
    } finally {
      setRefreshing(false)
    }
  }

  async function createInstance() {
    const instanceName = compactText(form.instance_name, 80)
    if (!instanceName) {
      error('Informe o nome da instância.')
      return
    }

    setCreateLoading(true)
    try {
      const res = await fetch('/api/admin/integrations/whatsapp/evolution', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create_instance',
          instance_name: instanceName,
          account_name: compactText(form.account_name, 160) || null,
          broker_user_id: form.broker_user_id || null,
          phone_number: compactText(form.phone_number, 40) || null,
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json?.error || 'Falha ao criar instância.')

      success(`Instância ${String(json?.instance_name || instanceName)} criada.`)
      setQr({
        instanceName: String(json?.instance_name || instanceName),
        dataUri: String(json?.qr?.data_uri || '') || null,
        pairingCode: String(json?.qr?.pairing_code || '') || null,
        status: String(json?.qr?.status || '') || null,
      })
      setForm({
        instance_name: '',
        account_name: '',
        broker_user_id: '',
        phone_number: '',
      })
      await refreshPanel()
    } catch (err: any) {
      error(err?.message || 'Erro ao criar instância.')
    } finally {
      setCreateLoading(false)
    }
  }

  async function fetchQr(instanceName: string) {
    setRowBusy(instanceName)
    try {
      const res = await fetch('/api/admin/integrations/whatsapp/evolution', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'fetch_qr',
          instance_name: instanceName,
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json?.error || 'Falha ao buscar QR.')

      setQr({
        instanceName,
        dataUri: String(json?.qr?.data_uri || '') || null,
        pairingCode: String(json?.qr?.pairing_code || '') || null,
        status: String(json?.qr?.status || '') || null,
      })
      success(`QR atualizado para ${instanceName}.`)
      await refreshPanel()
    } catch (err: any) {
      error(err?.message || 'Erro ao buscar QR.')
    } finally {
      setRowBusy(null)
    }
  }

  async function refreshInstanceState(instanceName: string) {
    setRowBusy(instanceName)
    try {
      const res = await fetch('/api/admin/integrations/whatsapp/evolution', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'refresh_state',
          instance_name: instanceName,
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json?.error || 'Falha ao atualizar estado.')

      success(`Estado atualizado para ${instanceName}.`)
      await refreshPanel()
    } catch (err: any) {
      error(err?.message || 'Erro ao atualizar estado.')
    } finally {
      setRowBusy(null)
    }
  }

  async function deactivateInstance(instanceName: string) {
    setRowBusy(instanceName)
    try {
      const res = await fetch('/api/admin/integrations/whatsapp/evolution', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'delete_instance',
          instance_name: instanceName,
          delete_remote: deleteRemote,
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json?.error || 'Falha ao desativar instância.')

      success(`Instância ${instanceName} desativada no CRM.`)
      await refreshPanel()
    } catch (err: any) {
      error(err?.message || 'Erro ao desativar instância.')
    } finally {
      setRowBusy(null)
    }
  }

  if (schemaMissing) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>WhatsApp Evolution</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Badge variant="destructive">Schema pendente</Badge>
          <p className="text-sm text-[var(--muted-foreground)]">
            A tabela `chat_channel_accounts` ainda nao esta acessivel no ambiente.
          </p>
          <pre className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--muted)] p-3 text-xs">
            {schemaErrorMessage || 'Aplique as migrations da Fase 3 (chat inbox).'}
          </pre>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>WhatsApp Evolution (Self-hosted)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={env.enabled ? 'success' : 'warning'}>EVOLUTION_API_ENABLED: {env.enabled ? 'ON' : 'OFF'}</Badge>
            <Badge variant={env.base_url_set ? 'success' : 'warning'}>EVOLUTION_API_BASE_URL</Badge>
            <Badge variant={env.api_key_set ? 'success' : 'warning'}>EVOLUTION_API_KEY</Badge>
            <Badge variant={env.webhook_url_set ? 'success' : 'secondary'}>EVOLUTION_WEBHOOK_URL</Badge>
          </div>
          <p className="text-xs text-[var(--muted-foreground)]">
            Base: <code>{env.base_url_preview || 'nao configurada'}</code>
          </p>
          <p className="text-xs text-[var(--muted-foreground)]">
            Webhook recomendado na Evolution: <code>{webhookPreview}</code>
          </p>
          <Button variant="outline" size="sm" onClick={refreshPanel} loading={refreshing}>
            Atualizar painel
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Criar instância por corretor</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2">
          <Input
            label="Nome da instância"
            value={form.instance_name}
            onChange={(event) => setForm((prev) => ({ ...prev, instance_name: event.target.value }))}
            placeholder="corretor-joao"
            required
            hint="Somente letras, numeros, _ e - (normalizado automaticamente)."
          />
          <Input
            label="Nome exibido"
            value={form.account_name}
            onChange={(event) => setForm((prev) => ({ ...prev, account_name: event.target.value }))}
            placeholder="WhatsApp Joao"
          />
          <Select
            label="Corretor responsavel"
            options={brokerOptions}
            value={form.broker_user_id}
            onChange={(event) => setForm((prev) => ({ ...prev, broker_user_id: event.target.value }))}
          />
          <Input
            label="Telefone (opcional)"
            value={form.phone_number}
            onChange={(event) => setForm((prev) => ({ ...prev, phone_number: event.target.value }))}
            placeholder="+5566999999999"
          />
          <div className="md:col-span-2">
            <Button onClick={createInstance} loading={createLoading}>
              Criar instância + obter QR
            </Button>
          </div>
        </CardContent>
      </Card>

      {qr ? (
        <Card>
          <CardHeader>
            <CardTitle>QR de conexão: {qr.instanceName}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={statusVariant(qr.status)}>{qr.status || 'status nao informado'}</Badge>
              {qr.pairingCode ? <Badge variant="info">pairing: {qr.pairingCode}</Badge> : null}
            </div>
            {qr.dataUri ? (
              <Image
                src={qr.dataUri}
                alt={`QR ${qr.instanceName}`}
                width={256}
                height={256}
                unoptimized
                className="h-64 w-64 rounded-[var(--radius)] border border-[var(--border)] bg-white p-2"
              />
            ) : (
              <p className="text-sm text-[var(--muted-foreground)]">
                QR nao retornado pela API. Use o pairing code (se disponivel) ou tente atualizar QR.
              </p>
            )}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Instâncias mapeadas no CRM</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <label className="flex items-center gap-2 text-sm text-[var(--muted-foreground)]">
            <input
              type="checkbox"
              checked={deleteRemote}
              onChange={(event) => setDeleteRemote(event.target.checked)}
            />
            Desativar também na Evolution API (delete remoto)
          </label>

          {mappings.length === 0 ? (
            <p className="text-sm text-[var(--muted-foreground)]">
              Nenhuma instância cadastrada ainda.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="text-xs uppercase text-[var(--muted-foreground)]">
                  <tr>
                    <th className="px-2 py-2">Instância</th>
                    <th className="px-2 py-2">Corretor</th>
                    <th className="px-2 py-2">Status remoto</th>
                    <th className="px-2 py-2">Ativo CRM</th>
                    <th className="px-2 py-2">Atualizado</th>
                    <th className="px-2 py-2">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {mappings.map((row) => {
                    const instanceName = String(row.provider_account_id || '')
                    const broker = row.broker_user_id ? brokerById.get(row.broker_user_id) : null
                    const remote = remoteByInstance.get(instanceName)
                    const remoteStatus = remote?.connectionStatus || null
                    return (
                      <tr key={row.id} className="border-t border-[var(--border)]">
                        <td className="px-2 py-2">
                          <div className="font-medium text-[var(--foreground)]">{instanceName}</div>
                          <div className="text-xs text-[var(--muted-foreground)]">
                            {row.account_name || '-'}
                          </div>
                        </td>
                        <td className="px-2 py-2">
                          {broker ? (
                            <div>
                              <div className="font-medium text-[var(--foreground)]">
                                {broker.full_name || broker.email || broker.id}
                              </div>
                              <div className="text-xs text-[var(--muted-foreground)]">{broker.role || '-'}</div>
                            </div>
                          ) : (
                            <span className="text-[var(--muted-foreground)]">Sem corretor</span>
                          )}
                        </td>
                        <td className="px-2 py-2">
                          <Badge variant={statusVariant(remoteStatus)}>{remoteStatus || 'desconhecido'}</Badge>
                        </td>
                        <td className="px-2 py-2">
                          <Badge variant={row.is_active ? 'success' : 'secondary'}>
                            {row.is_active ? 'ativo' : 'inativo'}
                          </Badge>
                        </td>
                        <td className="px-2 py-2">{formatDate(row.updated_at)}</td>
                        <td className="px-2 py-2">
                          <div className="flex flex-wrap gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              loading={rowBusy === instanceName}
                              onClick={() => fetchQr(instanceName)}
                            >
                              QR
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              loading={rowBusy === instanceName}
                              onClick={() => refreshInstanceState(instanceName)}
                            >
                              Estado
                            </Button>
                            <Button
                              size="sm"
                              variant="destructive"
                              loading={rowBusy === instanceName}
                              onClick={() => deactivateInstance(instanceName)}
                            >
                              Desativar
                            </Button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
