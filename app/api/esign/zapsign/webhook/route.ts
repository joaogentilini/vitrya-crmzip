import { NextResponse } from 'next/server'

import { createAdminClient } from '@/lib/supabase/admin'
import { isValidWebhookToken } from '@/lib/integrations/esign/security'
import {
  downloadProviderFile,
  parseZapSignWebhook,
  resolveAuditTrailUrl,
  resolveSignedPdfUrl,
} from '@/lib/integrations/esign/zapsign'

export const runtime = 'nodejs'

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

async function uploadBuffer(params: {
  admin: ReturnType<typeof createAdminClient>
  path: string
  contentType: string
  buffer: Buffer
}): Promise<string | null> {
  const upload = await params.admin.storage.from('documents').upload(params.path, params.buffer, {
    upsert: true,
    contentType: params.contentType,
  })
  if (upload.error) {
    return null
  }
  return params.path
}

export async function POST(request: Request) {
  const expectedToken = process.env.ZAPSIGN_WEBHOOK_TOKEN
  if (!isValidWebhookToken(request, expectedToken)) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  const payload = await request.json().catch(() => null)
  if (!payload || typeof payload !== 'object') {
    return NextResponse.json({ ok: false, error: 'Payload inválido.' }, { status: 400 })
  }

  const webhook = parseZapSignWebhook(payload)
  if (!webhook.providerDocumentId) {
    return NextResponse.json(
      { ok: false, error: 'providerDocumentId ausente no webhook.' },
      { status: 400 }
    )
  }

  const admin = createAdminClient()

  let instanceRes = await admin
    .from('document_instances')
    .select('id, legacy_document_id, provider_document_id, status, property_id, owner_person_id, primary_person_id')
    .eq('provider_document_id', webhook.providerDocumentId)
    .maybeSingle()

  if ((!instanceRes.data || instanceRes.error) && isUuid(webhook.providerDocumentId)) {
    instanceRes = await admin
      .from('document_instances')
      .select('id, legacy_document_id, provider_document_id, status, property_id, owner_person_id, primary_person_id')
      .eq('id', webhook.providerDocumentId)
      .maybeSingle()
  }

  if (instanceRes.error || !instanceRes.data) {
    return NextResponse.json(
      {
        ok: true,
        status: 'ignored',
        reason: 'document_instance_not_found',
        provider_document_id: webhook.providerDocumentId,
      },
      { status: 202 }
    )
  }

  const instance = instanceRes.data
  const nowIso = new Date().toISOString()

  await admin.from('document_events').insert({
    document_id: instance.id,
    event_type: webhook.eventType || 'provider_webhook',
    provider_event_id: webhook.providerEventId,
    payload: payload as Record<string, unknown>,
  })

  for (const signerEvent of webhook.signerEvents) {
    const patch: Record<string, unknown> = {
      status: signerEvent.status === 'signed' ? 'signed' : signerEvent.status === 'viewed' ? 'viewed' : 'pending',
      viewed_at: signerEvent.viewedAt || null,
      signed_at: signerEvent.signedAt || null,
    }

    let updated = false
    if (signerEvent.providerSignerId) {
      const byProvider = await admin
        .from('document_signers')
        .update(patch)
        .eq('document_id', instance.id)
        .eq('provider_signer_id', signerEvent.providerSignerId)
      updated = !byProvider.error
    }

    if (!updated && signerEvent.email) {
      await admin
        .from('document_signers')
        .update(patch)
        .eq('document_id', instance.id)
        .ilike('email', signerEvent.email)
    }
  }

  let signedPath: string | null = null
  let auditTrailPath: string | null = null

  if (webhook.status === 'signed') {
    const signedUrl = webhook.signedPdfUrl || resolveSignedPdfUrl(webhook.providerDocumentId)

    try {
      const signedBuffer = await downloadProviderFile(signedUrl)
      signedPath = await uploadBuffer({
        admin,
        path: `documents/${instance.id}/signed.pdf`,
        contentType: 'application/pdf',
        buffer: signedBuffer,
      })
    } catch {
      signedPath = null
    }

    const auditUrl = webhook.auditTrailUrl || resolveAuditTrailUrl(webhook.providerDocumentId)
    try {
      const auditBuffer = await downloadProviderFile(auditUrl)
      auditTrailPath = await uploadBuffer({
        admin,
        path: `documents/${instance.id}/audit.bin`,
        contentType: 'application/octet-stream',
        buffer: auditBuffer,
      })
    } catch {
      auditTrailPath = null
    }
  }

  const updatePatch: Record<string, unknown> = {
    status: webhook.status,
    provider_payload: payload as Record<string, unknown>,
  }

  if (webhook.status === 'sent') {
    updatePatch.sent_at = nowIso
  }
  if (webhook.status === 'viewed') {
    updatePatch.viewed_at = nowIso
  }
  if (webhook.status === 'signed') {
    updatePatch.signed_at = nowIso
    updatePatch.provider_signed_at = nowIso
  }
  if (webhook.status === 'refused') {
    updatePatch.refused_at = nowIso
  }
  if (webhook.status === 'voided') {
    updatePatch.voided_at = nowIso
  }
  if (signedPath) {
    updatePatch.pdf_signed_path = signedPath
  }
  if (auditTrailPath) {
    updatePatch.audit_trail_path = auditTrailPath
  }

  await admin.from('document_instances').update(updatePatch).eq('id', instance.id)

  if (webhook.status === 'signed' && instance.legacy_document_id) {
    const legacyPatch: Record<string, unknown> = {
      status: 'validated',
    }
    if (signedPath) {
      legacyPatch.file_path = signedPath
    }

    await admin.from('documents').update(legacyPatch).eq('id', instance.legacy_document_id)
  }

  return NextResponse.json({
    ok: true,
    data: {
      document_instance_id: instance.id,
      provider_document_id: webhook.providerDocumentId,
      status: webhook.status,
      signed_file_stored: Boolean(signedPath),
    },
  })
}
