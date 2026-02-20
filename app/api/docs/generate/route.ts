import { NextResponse } from 'next/server'

import { createAdminClient } from '@/lib/supabase/admin'
import { createZapSignDocument, resolveWebhookCallbackUrl } from '@/lib/integrations/esign/zapsign'
import {
  getActorProfile,
  mapTemplateCodeToDocType,
  prepareDocumentContext,
  type GenerateBody,
} from './shared'

export const runtime = 'nodejs'

async function tryCreateLegacyDocumentAndLinks(params: {
  admin: ReturnType<typeof createAdminClient>
  templateCode: string
  title: string
  status: string
  notes: string
  propertyId: string | null
  ownerPersonId: string | null
  primaryPersonId: string | null
}): Promise<string | null> {
  const { admin, templateCode, title, status, notes, propertyId, ownerPersonId, primaryPersonId } = params

  let legacyDocumentId: string | null = null

  try {
    const insertBase = {
      title,
      status,
      notes,
      doc_type: mapTemplateCodeToDocType(templateCode),
    }

    let inserted: { id: string } | null = null

    const firstTry = await admin.from('documents').insert(insertBase).select('id').maybeSingle()
    if (!firstTry.error && firstTry.data?.id) {
      inserted = firstTry.data as { id: string }
    } else {
      const secondTry = await admin
        .from('documents')
        .insert({
          ...insertBase,
          document_type: mapTemplateCodeToDocType(templateCode),
        } as Record<string, unknown>)
        .select('id')
        .maybeSingle()

      if (!secondTry.error && secondTry.data?.id) {
        inserted = secondTry.data as { id: string }
      }
    }

    if (!inserted?.id) return null

    legacyDocumentId = inserted.id

    const links: Array<{ document_id: string; entity_type: string; entity_id: string }> = []
    if (propertyId) {
      links.push({ document_id: inserted.id, entity_type: 'property', entity_id: propertyId })
    }
    if (ownerPersonId) {
      links.push({ document_id: inserted.id, entity_type: 'person', entity_id: ownerPersonId })
    }
    if (primaryPersonId && primaryPersonId !== ownerPersonId) {
      links.push({ document_id: inserted.id, entity_type: 'person', entity_id: primaryPersonId })
    }

    for (const link of links) {
      await admin.from('document_links').insert(link)
    }
  } catch {
    return legacyDocumentId
  }

  return legacyDocumentId
}

export async function POST(request: Request) {
  const actorRes = await getActorProfile()
  if (!actorRes.actor) {
    return NextResponse.json({ ok: false, error: actorRes.error || 'Unauthorized' }, { status: 401 })
  }

  const body = (await request.json().catch(() => null)) as GenerateBody | null
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ ok: false, error: 'Payload inválido.' }, { status: 400 })
  }

  const admin = createAdminClient()
  const prepared = await prepareDocumentContext({
    admin,
    actor: actorRes.actor,
    body,
    validateForCreation: true,
  })

  if (!prepared.ok) {
    return NextResponse.json(
      {
        ok: false,
        error: prepared.error,
        ...(prepared.missing_fields ? { missing_fields: prepared.missing_fields } : {}),
      },
      { status: prepared.status }
    )
  }

  const context = prepared.data
  const siteBase = String(process.env.NEXT_PUBLIC_SITE_URL || '')
    .trim()
    .replace(/\/$/, '')

  const { data: instanceData, error: instanceError } = await admin
    .from('document_instances')
    .insert({
      template_id: context.template.id,
      template_code: context.template.code,
      status: 'draft',
      provider: context.template.provider || 'zapsign',
      entity_type: context.entityType,
      entity_id: context.entityId,
      property_id: context.propertyId,
      owner_person_id: context.ownerPersonId,
      primary_person_id: context.primaryPersonId,
      negotiation_id: context.negotiationId,
      lease_id: context.leaseId,
      authorization_snapshot: context.authorizationSnapshot,
      audit_json: {
        request: {
          template_fields: context.templateFields,
          signers: context.signers,
        },
      },
      created_by: actorRes.actor.id,
    })
    .select('id, audit_json, document_number, verify_token')
    .single()

  if (instanceError || !instanceData) {
    return NextResponse.json(
      { ok: false, error: instanceError?.message || 'Erro ao criar instância de documento.' },
      { status: 500 }
    )
  }

  const instanceId = String(instanceData.id)
  const documentNumber = String((instanceData as { document_number?: string | null }).document_number || '')
  const verifyToken = String((instanceData as { verify_token?: string | null }).verify_token || '')
  const verifyUrl = verifyToken && siteBase ? `${siteBase}/verify/${verifyToken}` : ''
  const trackedTemplateFields: Record<string, unknown> = {
    ...context.templateFields,
    document_number: documentNumber || null,
    verify_url: verifyUrl || null,
  }
  const requestAudit = {
    request: {
      template_fields: trackedTemplateFields,
      signers: context.signers,
    },
  }
  const webhookUrl = resolveWebhookCallbackUrl()

  const providerRes = await createZapSignDocument({
    instanceId,
    templateCode: context.template.code,
    title: `${context.template.title} - ${context.property?.title || instanceId.slice(0, 8)}`,
    providerTemplateId: context.template.provider_template_id || null,
    webhookUrl,
    fields: trackedTemplateFields,
    signers: context.signers,
  })

  if (!providerRes.ok || !providerRes.providerDocumentId) {
    await admin
      .from('document_instances')
      .update({
        status: 'error',
        provider_payload: providerRes.raw,
        audit_json: {
          ...requestAudit,
          provider_error: providerRes.error || 'Erro ao criar documento no provedor.',
        },
      })
      .eq('id', instanceId)

    await admin.from('document_events').insert({
      document_id: instanceId,
      event_type: 'provider_error',
      payload: {
        error: providerRes.error || 'Erro ao criar documento no provedor.',
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
  const nextAudit = {
    ...requestAudit,
    create_response: providerRes.raw,
  }

  await admin
    .from('document_instances')
    .update({
      status: nextStatus,
      provider_document_id: providerRes.providerDocumentId,
      provider_payload: providerRes.raw,
      sent_at: ['sent', 'viewed', 'signed'].includes(nextStatus) ? nowIso : null,
      viewed_at: nextStatus === 'viewed' ? nowIso : null,
      signed_at: nextStatus === 'signed' ? nowIso : null,
      audit_json: nextAudit,
    })
    .eq('id', instanceId)

  const providerSignerByEmail = new Map<string, string | null>()
  for (const signer of providerRes.providerSigners) {
    providerSignerByEmail.set(signer.email.toLowerCase(), signer.providerSignerId)
  }

  const signerRows = context.signers.map((signer) => ({
    document_id: instanceId,
    role: signer.role,
    name: signer.name,
    email: signer.email,
    phone: signer.phone || null,
    status: nextStatus === 'signed' ? 'signed' : nextStatus === 'viewed' ? 'viewed' : 'pending',
    viewed_at: nextStatus === 'viewed' ? nowIso : null,
    signed_at: nextStatus === 'signed' ? nowIso : null,
    provider_signer_id: providerSignerByEmail.get(signer.email.toLowerCase()) ?? null,
  }))

  await admin.from('document_signers').insert(signerRows)
  await admin.from('document_events').insert({
    document_id: instanceId,
    event_type: 'provider_created',
    payload: {
      provider_document_id: providerRes.providerDocumentId,
      status: nextStatus,
      raw: providerRes.raw,
    },
  })

  const legacyDocumentId = await tryCreateLegacyDocumentAndLinks({
    admin,
    templateCode: context.template.code,
    title: context.template.title,
    status: nextStatus === 'signed' ? 'validated' : 'pending',
    notes: `Gerado via assinatura digital (${context.template.code}).`,
    propertyId: context.propertyId,
    ownerPersonId: context.ownerPersonId,
    primaryPersonId: context.primaryPersonId,
  })

  if (legacyDocumentId) {
    await admin.from('document_instances').update({ legacy_document_id: legacyDocumentId }).eq('id', instanceId)
  }

  return NextResponse.json({
    ok: true,
    data: {
      document_instance_id: instanceId,
      provider_document_id: providerRes.providerDocumentId,
      status: nextStatus,
      document_number: documentNumber || null,
      verify_url: verifyUrl || null,
    },
  })
}
