import { NextRequest, NextResponse } from 'next/server'

import { getOpenClawEnvSummary, normalizeOpenClawAccountId } from '@/lib/integrations/openclaw/client'
import { createAdminClient } from '@/lib/supabase/admin'
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

function normalizeChannel(value: unknown): string {
  const normalized = String(value || '').trim().toLowerCase()
  if (normalized === 'whatsapp') return 'whatsapp'
  if (normalized === 'instagram') return 'instagram'
  if (normalized === 'facebook') return 'facebook'
  if (normalized === 'olx') return 'olx'
  if (normalized === 'grupoolx') return 'grupoolx'
  if (normalized === 'meta') return 'meta'
  return 'other'
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

function isOpenClawMapping(row: ChatChannelAccountRow): boolean {
  const provider = compactText(asRecord(row.settings).provider, 40)
  if (String(provider || '').toLowerCase() === 'openclaw') return true
  return String(row.provider_account_id || '').toLowerCase().startsWith('openclaw:')
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

  const admin = createAdminClient()
  const [mappingsRes, brokersRes] = await Promise.all([
    admin
      .from('chat_channel_accounts')
      .select('id, channel, provider_account_id, account_name, broker_user_id, is_active, settings, created_at, updated_at')
      .order('updated_at', { ascending: false })
      .limit(1000),
    admin
      .from('profiles')
      .select('id, full_name, email, role, is_active')
      .eq('is_active', true)
      .order('full_name', { ascending: true }),
  ])

  if (mappingsRes.error) {
    const errorMessage = isSchemaMissingError(mappingsRes.error.code, mappingsRes.error.message)
      ? 'Tabela chat_channel_accounts nao encontrada. Aplique as migrations da Fase 3.'
      : mappingsRes.error.message
    return NextResponse.json({ error: errorMessage }, { status: 500 })
  }

  if (brokersRes.error) {
    return NextResponse.json({ error: brokersRes.error.message }, { status: 500 })
  }

  const mappings = ((mappingsRes.data || []) as ChatChannelAccountRow[]).filter(isOpenClawMapping)
  const brokers = ((brokersRes.data || []) as ProfileRow[]).filter((row) => isValidBrokerRole(row.role || null))

  return NextResponse.json({
    env: getOpenClawEnvSummary(),
    mappings,
    brokers,
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

  const admin = createAdminClient()

  if (action === 'upsert_mapping') {
    const channel = normalizeChannel(body.channel)
    const rawAccountId = compactText(body.provider_account_id, 120) || compactText(body.account_id, 120)
    if (!rawAccountId) {
      return NextResponse.json({ error: 'provider_account_id obrigatorio.' }, { status: 400 })
    }

    const normalizedAccount = normalizeOpenClawAccountId(rawAccountId)
    if (!normalizedAccount) {
      return NextResponse.json({ error: 'provider_account_id invalido.' }, { status: 400 })
    }

    const storageAccountId = normalizedAccount.startsWith('openclaw:')
      ? normalizedAccount
      : `openclaw:${normalizedAccount}`
    const accountName = compactText(body.account_name, 160) || normalizedAccount
    const brokerUserId = compactText(body.broker_user_id, 80)
    const isActive = body.is_active === false ? false : true

    const existingRes = await admin
      .from('chat_channel_accounts')
      .select('settings')
      .eq('channel', channel)
      .eq('provider_account_id', storageAccountId)
      .limit(1)
      .maybeSingle()

    const mergedSettings: PayloadRecord = {
      ...asRecord(existingRes.data?.settings),
      provider: 'openclaw',
      account_id: normalizedAccount,
      original_provider_account_id: rawAccountId,
      updated_at: new Date().toISOString(),
    }

    const upsertRes = await admin
      .from('chat_channel_accounts')
      .upsert(
        {
          channel,
          provider_account_id: storageAccountId,
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
      return NextResponse.json({ error: upsertRes.error.message || 'Falha ao salvar mapping.' }, { status: 500 })
    }

    await writeAuditLog({
      actorId: auth.user.id,
      action: 'openclaw_mapping_upserted',
      details: {
        channel,
        provider_account_id: storageAccountId,
        broker_user_id: brokerUserId,
        is_active: isActive,
      },
    })

    return NextResponse.json({
      ok: true,
      mapping: upsertRes.data || null,
    })
  }

  if (action === 'deactivate_mapping') {
    const mappingId = compactText(body.id, 120)
    const channel = normalizeChannel(body.channel)
    const rawAccountId =
      compactText(body.provider_account_id, 120) ||
      compactText(body.account_id, 120)
    const normalizedAccount = rawAccountId ? normalizeOpenClawAccountId(rawAccountId) : null
    const storageAccountId = normalizedAccount
      ? normalizedAccount.startsWith('openclaw:')
        ? normalizedAccount
        : `openclaw:${normalizedAccount}`
      : null

    let updateQuery = admin
      .from('chat_channel_accounts')
      .update({ is_active: false })
      .select('id, channel, provider_account_id, account_name, broker_user_id, is_active, settings, created_at, updated_at')

    if (mappingId) {
      updateQuery = updateQuery.eq('id', mappingId)
    } else if (storageAccountId) {
      updateQuery = updateQuery.eq('channel', channel).eq('provider_account_id', storageAccountId)
    } else {
      return NextResponse.json({ error: 'Informe id ou provider_account_id para desativar.' }, { status: 400 })
    }

    const updateRes = await updateQuery.maybeSingle()
    if (updateRes.error) {
      return NextResponse.json({ error: updateRes.error.message || 'Falha ao desativar mapping.' }, { status: 500 })
    }

    await writeAuditLog({
      actorId: auth.user.id,
      action: 'openclaw_mapping_deactivated',
      details: {
        id: mappingId,
        channel,
        provider_account_id: storageAccountId,
      },
    })

    return NextResponse.json({
      ok: true,
      mapping: updateRes.data || null,
    })
  }

  return NextResponse.json({ error: 'action invalida.' }, { status: 400 })
}
