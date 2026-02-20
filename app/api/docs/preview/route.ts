import { NextResponse } from 'next/server'

import { createAdminClient } from '@/lib/supabase/admin'
import { getActorProfile, prepareDocumentContext, type GenerateBody } from '../generate/shared'

export const runtime = 'nodejs'

function readSearchParam(url: URL, key: string): string | undefined {
  const value = url.searchParams.get(key)
  if (!value) return undefined
  const trimmed = value.trim()
  return trimmed || undefined
}

export async function GET(request: Request) {
  const actorRes = await getActorProfile()
  if (!actorRes.actor) {
    return NextResponse.json({ ok: false, error: actorRes.error || 'Unauthorized' }, { status: 401 })
  }

  const url = new URL(request.url)
  const body: GenerateBody = {
    template_code: readSearchParam(url, 'template_code'),
    property_id: readSearchParam(url, 'property_id'),
    entity_type: readSearchParam(url, 'entity_type') || 'property',
    entity_id: readSearchParam(url, 'entity_id') || readSearchParam(url, 'property_id'),
    owner_person_id: readSearchParam(url, 'owner_person_id'),
    primary_person_id: readSearchParam(url, 'primary_person_id'),
    negotiation_id: readSearchParam(url, 'negotiation_id'),
    lease_id: readSearchParam(url, 'lease_id'),
  }

  const admin = createAdminClient()
  const prepared = await prepareDocumentContext({
    admin,
    actor: actorRes.actor,
    body,
    validateForCreation: false,
  })

  if (!prepared.ok) {
    return NextResponse.json(
      {
        ok: false,
        error: prepared.error,
        missing_fields: prepared.missing_fields ?? [],
      },
      { status: prepared.status }
    )
  }

  const context = prepared.data
  const previewTemplateFields: Record<string, unknown> = {
    ...context.templateFields,
    document_number: '(será gerado ao enviar)',
    verify_url: '',
  }
  const payload = {
    template_code: context.template.code,
    template_title: context.template.title,
    provider: context.template.provider,
    provider_template_id: context.template.provider_template_id,
    templateFields: previewTemplateFields,
    template_fields: previewTemplateFields,
    signers_suggested: context.signers,
    missing_fields: context.missingFields,
  }

  return NextResponse.json({
    ok: true,
    ...payload,
    data: payload,
  })
}
