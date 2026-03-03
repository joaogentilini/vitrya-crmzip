import { NextRequest, NextResponse } from 'next/server'

import { createAdminClient } from '@/lib/supabase/admin'
import {
  createEvolutionInstance,
  deleteEvolutionInstance,
  fetchEvolutionConnectionState,
  fetchEvolutionQr,
  getEvolutionEnvSummary,
  isEvolutionApiEnabled,
  listEvolutionInstances,
  normalizeEvolutionInstanceName,
} from '@/lib/integrations/evolution/client'
import { createClient } from '@/lib/supabaseServer'

export const runtime = 'nodejs'

type PayloadRecord = Record<string, unknown>

type ChatChannelAccountRow = {
  id: string
  channel: string
  provider_account_id: string
  account_name: string | null
  broker_user_id: string | null
  is_active: boolean
  settings: PayloadRecord | null
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

function asRecord(value: unknown): PayloadRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return value as PayloadRecord
}

function compactText(value: unknown, limit = 240): string | null {
  const raw = typeof value === 'string' ? value : typeof value === 'number' ? String(value) : ''
  const normalized = raw.replace(/\s+/g, ' ').trim()
  if (!normalized) return null
  return normalized.slice(0, limit)
}

function isSchemaMissingError(code: string | null | undefined, message: string | null | undefined): boolean {
  const normalizedCode = String(code || '')
  const normalizedMessage = String(message || '').toLowerCase()
  return (
    normalizedCode === '42P01' ||
    normalizedCode === '42703' ||
    normalizedCode === 'PGRST204' ||
    normalizedCode === 'PGRST205' ||
    normalizedMessage.includes('does not exist') ||
    normalizedMessage.includes('schema cache')
  )
}

async function validateManager() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return null

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, role, is_active')
    .eq('id', user.id)
    .maybeSingle()

  if (!profile || profile.is_active !== true) return null
  if (profile.role !== 'admin' && profile.role !== 'gestor') return null

  return { user, profile }
}

function isValidBrokerRole(role: string | null): boolean {
  return role === 'admin' || role === 'gestor' || role === 'corretor'
}

async function loadSettingsData() {
  const admin = createAdminClient()
  const [mappingsRes, brokersRes] = await Promise.all([
    admin
      .from('chat_channel_accounts')
      .select('id, channel, provider_account_id, account_name, broker_user_id, is_active, settings, created_at, updated_at')
      .eq('channel', 'whatsapp')
      .order('updated_at', { ascending: false }),
    admin
      .from('profiles')
      .select('id, full_name, email, role, is_active')
      .eq('is_active', true)
      .order('full_name', { ascending: true }),
  ])

  if (mappingsRes.error) {
    return {
      ok: false as const,
      error:
        isSchemaMissingError(mappingsRes.error.code, mappingsRes.error.message)
          ? 'Tabela chat_channel_accounts nao encontrada. Aplique as migrations da Fase 3.'
          : mappingsRes.error.message,
      mappings: [] as ChatChannelAccountRow[],
      brokers: [] as ProfileRow[],
    }
  }

  if (brokersRes.error) {
    return {
      ok: false as const,
      error: brokersRes.error.message,
      mappings: [] as ChatChannelAccountRow[],
      brokers: [] as ProfileRow[],
    }
  }

  const brokers = ((brokersRes.data || []) as ProfileRow[]).filter((row) => isValidBrokerRole(row.role || null))

  return {
    ok: true as const,
    error: null as string | null,
    mappings: (mappingsRes.data || []) as ChatChannelAccountRow[],
    brokers,
  }
}

async function readExistingMapping(instanceName: string): Promise<ChatChannelAccountRow | null> {
  const admin = createAdminClient()
  const res = await admin
    .from('chat_channel_accounts')
    .select('id, channel, provider_account_id, account_name, broker_user_id, is_active, settings, created_at, updated_at')
    .eq('channel', 'whatsapp')
    .eq('provider_account_id', instanceName)
    .limit(1)
    .maybeSingle()

  if (res.error || !res.data) return null
  return res.data as ChatChannelAccountRow
}

function toQrDataUri(base64: string | null): string | null {
  const qr = compactText(base64, 250000)
  if (!qr) return null
  if (qr.startsWith('data:image')) return qr
  return `data:image/png;base64,${qr}`
}

async function writeAuditLog(input: {
  actorId: string
  action: string
  details: Record<string, unknown>
}) {
  const admin = createAdminClient()
  await admin.from('user_audit_logs').insert({
    actor_id: input.actorId,
    target_user_id: input.actorId,
    action: input.action,
    details: input.details,
    created_at: new Date().toISOString(),
  })
}

export async function GET() {
  const auth = await validateManager()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const dataRes = await loadSettingsData()
  if (!dataRes.ok) {
    return NextResponse.json({ error: dataRes.error }, { status: 500 })
  }

  const env = getEvolutionEnvSummary()
  const instancesRes = env.enabled && env.base_url_set && env.api_key_set ? await listEvolutionInstances() : null
  const remoteInstances = instancesRes?.ok ? instancesRes.data || [] : []

  return NextResponse.json({
    env,
    mappings: dataRes.mappings,
    brokers: dataRes.brokers,
    evolution: {
      ok: instancesRes ? instancesRes.ok : false,
      error: instancesRes?.error || null,
      instances: remoteInstances,
    },
  })
}

async function handleCreateInstance(authUserId: string, body: PayloadRecord) {
  const normalizedInstanceName = normalizeEvolutionInstanceName(String(body.instance_name || ''))
  if (!normalizedInstanceName) {
    return NextResponse.json({ error: 'instance_name obrigatorio.' }, { status: 400 })
  }

  if (!isEvolutionApiEnabled()) {
    return NextResponse.json({ error: 'EVOLUTION_API_ENABLED desabilitado.' }, { status: 503 })
  }

  const brokerUserId = compactText(body.broker_user_id, 80)
  const accountName =
    compactText(body.account_name, 160) ||
    compactText(body.display_name, 160) ||
    normalizedInstanceName
  const phoneNumber = compactText(body.phone_number, 40)

  const createRes = await createEvolutionInstance({
    instanceName: normalizedInstanceName,
  })

  if (!createRes.ok) {
    return NextResponse.json({ error: createRes.error || 'Falha ao criar instancia na Evolution.' }, { status: 502 })
  }

  const qrRes = await fetchEvolutionQr(normalizedInstanceName)
  const stateRes = await fetchEvolutionConnectionState(normalizedInstanceName)

  const existing = await readExistingMapping(normalizedInstanceName)
  const mergedSettings: PayloadRecord = {
    ...(asRecord(existing?.settings) || {}),
    provider: 'evolution',
    instance_name: normalizedInstanceName,
    phone_number: phoneNumber,
    last_create_at: new Date().toISOString(),
    last_create_response: asRecord(createRes.raw),
    connection_state: asRecord(stateRes.raw),
  }

  const admin = createAdminClient()
  const upsertRes = await admin
    .from('chat_channel_accounts')
    .upsert(
      {
        channel: 'whatsapp',
        provider_account_id: normalizedInstanceName,
        account_name: accountName,
        broker_user_id: brokerUserId,
        is_active: true,
        settings: mergedSettings,
      },
      { onConflict: 'channel,provider_account_id' }
    )
    .select('id, channel, provider_account_id, account_name, broker_user_id, is_active, settings, created_at, updated_at')
    .maybeSingle()

  if (upsertRes.error) {
    return NextResponse.json({ error: upsertRes.error.message }, { status: 500 })
  }

  await writeAuditLog({
    actorId: authUserId,
    action: 'whatsapp_evolution_instance_created',
    details: {
      instance_name: normalizedInstanceName,
      broker_user_id: brokerUserId,
      phone_number: phoneNumber,
    },
  })

  return NextResponse.json({
    ok: true,
    instance_name: normalizedInstanceName,
    mapping: upsertRes.data || null,
    qr: {
      base64: qrRes.data?.qrCodeBase64 || null,
      data_uri: toQrDataUri(qrRes.data?.qrCodeBase64 || null),
      pairing_code: qrRes.data?.pairingCode || null,
      status: qrRes.data?.connectionStatus || null,
      error: qrRes.ok ? null : qrRes.error,
    },
    connection_state: stateRes.ok ? stateRes.data : null,
  })
}

async function handleFetchQr(body: PayloadRecord) {
  const normalizedInstanceName = normalizeEvolutionInstanceName(String(body.instance_name || ''))
  if (!normalizedInstanceName) {
    return NextResponse.json({ error: 'instance_name obrigatorio.' }, { status: 400 })
  }

  if (!isEvolutionApiEnabled()) {
    return NextResponse.json({ error: 'EVOLUTION_API_ENABLED desabilitado.' }, { status: 503 })
  }

  const qrRes = await fetchEvolutionQr(normalizedInstanceName)
  const stateRes = await fetchEvolutionConnectionState(normalizedInstanceName)

  if (!qrRes.ok) {
    return NextResponse.json({ error: qrRes.error || 'Falha ao buscar QR da instancia.' }, { status: 502 })
  }

  return NextResponse.json({
    ok: true,
    instance_name: normalizedInstanceName,
    qr: {
      base64: qrRes.data?.qrCodeBase64 || null,
      data_uri: toQrDataUri(qrRes.data?.qrCodeBase64 || null),
      pairing_code: qrRes.data?.pairingCode || null,
      status: qrRes.data?.connectionStatus || null,
    },
    connection_state: stateRes.ok ? stateRes.data : null,
  })
}

async function handleRefreshState(body: PayloadRecord) {
  const normalizedInstanceName = normalizeEvolutionInstanceName(String(body.instance_name || ''))
  if (!normalizedInstanceName) {
    return NextResponse.json({ error: 'instance_name obrigatorio.' }, { status: 400 })
  }

  if (!isEvolutionApiEnabled()) {
    return NextResponse.json({ error: 'EVOLUTION_API_ENABLED desabilitado.' }, { status: 503 })
  }

  const stateRes = await fetchEvolutionConnectionState(normalizedInstanceName)
  if (!stateRes.ok) {
    return NextResponse.json({ error: stateRes.error || 'Falha ao consultar estado da instancia.' }, { status: 502 })
  }

  return NextResponse.json({
    ok: true,
    instance_name: normalizedInstanceName,
    connection_state: stateRes.data,
  })
}

async function handleUpsertMapping(authUserId: string, body: PayloadRecord) {
  const normalizedInstanceName = normalizeEvolutionInstanceName(String(body.instance_name || ''))
  if (!normalizedInstanceName) {
    return NextResponse.json({ error: 'instance_name obrigatorio.' }, { status: 400 })
  }

  const brokerUserId = compactText(body.broker_user_id, 80)
  const accountName = compactText(body.account_name, 160) || normalizedInstanceName
  const phoneNumber = compactText(body.phone_number, 40)
  const isActive = body.is_active === false ? false : true

  const existing = await readExistingMapping(normalizedInstanceName)
  const mergedSettings: PayloadRecord = {
    ...(asRecord(existing?.settings) || {}),
    provider: 'evolution',
    instance_name: normalizedInstanceName,
    phone_number: phoneNumber,
    last_mapping_update_at: new Date().toISOString(),
  }

  const admin = createAdminClient()
  const upsertRes = await admin
    .from('chat_channel_accounts')
    .upsert(
      {
        channel: 'whatsapp',
        provider_account_id: normalizedInstanceName,
        account_name: accountName,
        broker_user_id: brokerUserId,
        is_active: isActive,
        settings: mergedSettings,
      },
      { onConflict: 'channel,provider_account_id' }
    )
    .select('id, channel, provider_account_id, account_name, broker_user_id, is_active, settings, created_at, updated_at')
    .maybeSingle()

  if (upsertRes.error) {
    return NextResponse.json({ error: upsertRes.error.message }, { status: 500 })
  }

  await writeAuditLog({
    actorId: authUserId,
    action: 'whatsapp_evolution_mapping_updated',
    details: {
      instance_name: normalizedInstanceName,
      broker_user_id: brokerUserId,
      is_active: isActive,
    },
  })

  return NextResponse.json({
    ok: true,
    mapping: upsertRes.data || null,
  })
}

async function handleDeleteInstance(authUserId: string, body: PayloadRecord) {
  const normalizedInstanceName = normalizeEvolutionInstanceName(String(body.instance_name || ''))
  if (!normalizedInstanceName) {
    return NextResponse.json({ error: 'instance_name obrigatorio.' }, { status: 400 })
  }

  const deleteRemote = body.delete_remote === true
  if (deleteRemote && !isEvolutionApiEnabled()) {
    return NextResponse.json({ error: 'EVOLUTION_API_ENABLED desabilitado.' }, { status: 503 })
  }

  const remoteRes = deleteRemote ? await deleteEvolutionInstance(normalizedInstanceName) : null
  if (deleteRemote && remoteRes && !remoteRes.ok) {
    return NextResponse.json({ error: remoteRes.error || 'Falha ao remover instancia remota.' }, { status: 502 })
  }

  const existing = await readExistingMapping(normalizedInstanceName)
  const mergedSettings: PayloadRecord = {
    ...(asRecord(existing?.settings) || {}),
    last_deactivated_at: new Date().toISOString(),
  }

  const admin = createAdminClient()
  const updateRes = await admin
    .from('chat_channel_accounts')
    .update({
      is_active: false,
      settings: mergedSettings,
    })
    .eq('channel', 'whatsapp')
    .eq('provider_account_id', normalizedInstanceName)
    .select('id, channel, provider_account_id, account_name, broker_user_id, is_active, settings, created_at, updated_at')
    .maybeSingle()

  if (updateRes.error) {
    return NextResponse.json({ error: updateRes.error.message }, { status: 500 })
  }

  await writeAuditLog({
    actorId: authUserId,
    action: 'whatsapp_evolution_instance_deleted',
    details: {
      instance_name: normalizedInstanceName,
      delete_remote: deleteRemote,
    },
  })

  return NextResponse.json({
    ok: true,
    mapping: updateRes.data || null,
    remote: remoteRes?.data || null,
  })
}

export async function POST(request: NextRequest) {
  const auth = await validateManager()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = (await request.json().catch(() => ({}))) as PayloadRecord
  const action = String(body.action || '')
    .trim()
    .toLowerCase()

  if (!action) {
    return NextResponse.json({ error: 'action obrigatoria.' }, { status: 400 })
  }

  if (action === 'create_instance') {
    return handleCreateInstance(auth.user.id, body)
  }

  if (action === 'fetch_qr') {
    return handleFetchQr(body)
  }

  if (action === 'refresh_state') {
    return handleRefreshState(body)
  }

  if (action === 'upsert_mapping') {
    return handleUpsertMapping(auth.user.id, body)
  }

  if (action === 'delete_instance') {
    return handleDeleteInstance(auth.user.id, body)
  }

  return NextResponse.json({ error: 'action invalida.' }, { status: 400 })
}
