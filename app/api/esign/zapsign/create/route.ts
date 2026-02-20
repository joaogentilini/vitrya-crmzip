import { NextResponse } from 'next/server'

import { createClient } from '@/lib/supabaseServer'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  createZapSignDocument,
  resolveWebhookCallbackUrl,
  type ESignSignerInput,
} from '@/lib/integrations/esign/zapsign'

export const runtime = 'nodejs'

type AnyRecord = Record<string, unknown>

type ActorProfile = {
  id: string
  role: string
  is_active: boolean
  full_name: string | null
  email: string | null
}

function asRecord(value: unknown): AnyRecord | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as AnyRecord
}

function asString(value: unknown): string {
  return String(value || '').trim()
}

function isManager(role: string | null | undefined): boolean {
  return role === 'admin' || role === 'gestor'
}

function normalizeSigners(value: unknown): ESignSignerInput[] {
  if (!Array.isArray(value)) return []

  const list: ESignSignerInput[] = []
  for (const item of value) {
    const row = asRecord(item)
    if (!row) continue
    const role = asString(row.role) || 'signer'
    const name = asString(row.name)
    const email = asString(row.email).toLowerCase()
    const phone = asString(row.phone)
    if (!name || !email) continue
    if (list.some((existing) => existing.email.toLowerCase() === email)) continue
    list.push({
      role,
      name,
      email,
      phone: phone || null,
    })
  }
  return list
}

async function getActorProfile(): Promise<{ actor: ActorProfile | null; error: string | null }> {
  const supabase = await createClient()
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) {
    return { actor: null, error: 'Não autenticado.' }
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id, role, is_active, full_name, email')
    .eq('id', user.id)
    .maybeSingle()

  if (profileError || !profile) {
    return { actor: null, error: profileError?.message || 'Perfil não encontrado.' }
  }
  if (profile.is_active !== true) {
    return { actor: null, error: 'Usuário inativo.' }
  }

  return {
    actor: {
      id: profile.id,
      role: profile.role,
      is_active: profile.is_active,
      full_name: profile.full_name ?? null,
      email: profile.email ?? null,
    },
    error: null,
  }
}

export async function POST(request: Request) {
  const actorRes = await getActorProfile()
  if (!actorRes.actor) {
    return NextResponse.json({ ok: false, error: actorRes.error || 'Unauthorized' }, { status: 401 })
  }

  const actor = actorRes.actor
  const body = (await request.json().catch(() => null)) as { document_instance_id?: string } | null
  const documentInstanceId = asString(body?.document_instance_id)

  if (!documentInstanceId) {
    return NextResponse.json({ ok: false, error: 'document_instance_id é obrigatório.' }, { status: 400 })
  }

  const admin = createAdminClient()

  const { data: instance, error: instanceError } = await admin
    .from('document_instances')
    .select(
      'id, template_id, template_code, status, provider, provider_document_id, property_id, created_by, audit_json'
    )
    .eq('id', documentInstanceId)
    .maybeSingle()

  if (instanceError || !instance) {
    return NextResponse.json(
      { ok: false, error: instanceError?.message || 'Instância de documento não encontrada.' },
      { status: 404 }
    )
  }

  let canAccess = isManager(actor.role) || instance.created_by === actor.id
  if (!canAccess && instance.property_id) {
    const { data: property } = await admin
      .from('properties')
      .select('id, owner_user_id')
      .eq('id', instance.property_id)
      .maybeSingle()
    if (property?.owner_user_id === actor.id) {
      canAccess = true
    }
  }

  if (!canAccess) {
    return NextResponse.json({ ok: false, error: 'Sem permissão para esta instância.' }, { status: 403 })
  }

  const currentStatus = String(instance.status || '').toLowerCase()
  if (instance.provider_document_id && ['sent', 'viewed', 'signed'].includes(currentStatus)) {
    return NextResponse.json({
      ok: true,
      data: {
        document_instance_id: instance.id,
        provider_document_id: instance.provider_document_id,
        status: currentStatus,
      },
    })
  }

  const templateQuery = admin
    .from('document_templates')
    .select('id, code, title, provider_template_id')

  const templateRes = instance.template_id
    ? await templateQuery.eq('id', instance.template_id).maybeSingle()
    : await templateQuery.eq('code', instance.template_code).maybeSingle()

  const { data: templateRow, error: templateError } = templateRes

  if (templateError || !templateRow) {
    return NextResponse.json(
      { ok: false, error: templateError?.message || 'Template da instância não encontrado.' },
      { status: 404 }
    )
  }

  const auditJson = asRecord(instance.audit_json) || {}
  const requestPayload = asRecord(auditJson.request) || {}
  const templateFields = asRecord(requestPayload.template_fields) || {}
  const signers = normalizeSigners(requestPayload.signers)

  if (Object.keys(templateFields).length === 0 || signers.length === 0) {
    return NextResponse.json(
      {
        ok: false,
        error:
          'Instância sem payload de criação. Gere novamente em /api/docs/generate para registrar template_fields e signers.',
      },
      { status: 422 }
    )
  }

  const providerRes = await createZapSignDocument({
    instanceId: instance.id,
    templateCode: templateRow.code,
    title: `${templateRow.title} - ${instance.id.slice(0, 8)}`,
    providerTemplateId: templateRow.provider_template_id || null,
    webhookUrl: resolveWebhookCallbackUrl(),
    fields: templateFields,
    signers,
  })

  if (!providerRes.ok || !providerRes.providerDocumentId) {
    await admin
      .from('document_instances')
      .update({
        status: 'error',
        provider_payload: providerRes.raw,
        audit_json: {
          ...auditJson,
          provider_error: providerRes.error || 'Falha no envio para ZapSign.',
        },
      })
      .eq('id', instance.id)

    await admin.from('document_events').insert({
      document_id: instance.id,
      event_type: 'provider_error',
      payload: {
        error: providerRes.error || 'Falha no envio para ZapSign.',
        raw: providerRes.raw,
      },
    })

    return NextResponse.json(
      { ok: false, error: providerRes.error || 'Falha ao criar documento na ZapSign.' },
      { status: 502 }
    )
  }

  const nowIso = new Date().toISOString()
  const nextStatus = providerRes.status === 'draft' ? 'sent' : providerRes.status

  await admin
    .from('document_instances')
    .update({
      status: nextStatus,
      provider_document_id: providerRes.providerDocumentId,
      provider_payload: providerRes.raw,
      sent_at: ['sent', 'viewed', 'signed'].includes(nextStatus) ? nowIso : null,
      viewed_at: nextStatus === 'viewed' ? nowIso : null,
      signed_at: nextStatus === 'signed' ? nowIso : null,
      audit_json: {
        ...auditJson,
        create_response: providerRes.raw,
      },
    })
    .eq('id', instance.id)

  await admin.from('document_signers').delete().eq('document_id', instance.id)

  const providerSignerMap = new Map<string, string | null>()
  for (const signer of providerRes.providerSigners) {
    providerSignerMap.set(signer.email.toLowerCase(), signer.providerSignerId)
  }

  await admin.from('document_signers').insert(
    signers.map((signer) => ({
      document_id: instance.id,
      role: signer.role,
      name: signer.name,
      email: signer.email,
      phone: signer.phone || null,
      status: nextStatus === 'signed' ? 'signed' : nextStatus === 'viewed' ? 'viewed' : 'pending',
      viewed_at: nextStatus === 'viewed' ? nowIso : null,
      signed_at: nextStatus === 'signed' ? nowIso : null,
      provider_signer_id: providerSignerMap.get(signer.email.toLowerCase()) ?? null,
    }))
  )

  await admin.from('document_events').insert({
    document_id: instance.id,
    event_type: 'provider_created',
    payload: {
      provider_document_id: providerRes.providerDocumentId,
      status: nextStatus,
      raw: providerRes.raw,
    },
  })

  return NextResponse.json({
    ok: true,
    data: {
      document_instance_id: instance.id,
      provider_document_id: providerRes.providerDocumentId,
      status: nextStatus,
    },
  })
}
