import { NextRequest, NextResponse } from 'next/server'

import { createClient } from '@/lib/supabaseServer'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'

type RouteContext = {
  params: { id: string } | Promise<{ id: string }>
}

function pickKind(raw: string | null): 'signed' | 'original' | 'audit' {
  const value = String(raw || '').trim().toLowerCase()
  if (value === 'original') return 'original'
  if (value === 'audit') return 'audit'
  return 'signed'
}

function wantsRedirect(request: NextRequest): boolean {
  const value = String(request.nextUrl.searchParams.get('redirect') || '')
    .trim()
    .toLowerCase()
  return value === '1' || value === 'true' || value === 'yes'
}

function pickVerifyToken(request: NextRequest): string | null {
  const value = String(request.nextUrl.searchParams.get('verify_token') || '').trim()
  return value || null
}

export async function GET(request: NextRequest, context: RouteContext) {
  const { id } = await context.params
  const documentId = String(id || '').trim()
  if (!documentId) {
    return NextResponse.json({ ok: false, error: 'ID inválido.' }, { status: 400 })
  }

  const kind = pickKind(request.nextUrl.searchParams.get('kind'))
  const verifyToken = pickVerifyToken(request)
  const redirectToFile = wantsRedirect(request)
  const admin = createAdminClient()

  let storagePath: string | null = null

  if (verifyToken) {
    const { data: instance, error: instanceError } = await admin
      .from('document_instances')
      .select('id, verify_token, pdf_signed_path, pdf_original_path, audit_trail_path, legacy_document_id')
      .eq('id', documentId)
      .maybeSingle()

    if (instanceError || !instance) {
      return NextResponse.json(
        { ok: false, error: instanceError?.message || 'Documento não encontrado.' },
        { status: 404 }
      )
    }

    if (String(instance.verify_token || '') !== verifyToken) {
      return NextResponse.json({ ok: false, error: 'Token de verificação inválido.' }, { status: 403 })
    }

    if (kind === 'signed') storagePath = instance.pdf_signed_path || null
    if (kind === 'original') storagePath = instance.pdf_original_path || null
    if (kind === 'audit') storagePath = instance.audit_trail_path || null

    if (!storagePath && instance.legacy_document_id) {
      const { data: legacyDoc } = await admin
        .from('documents')
        .select('file_path')
        .eq('id', instance.legacy_document_id)
        .maybeSingle()
      storagePath = (legacyDoc as { file_path?: string | null } | null)?.file_path || null
    }
  } else {
    const supabase = await createClient()
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()
    if (userError || !user) {
      return NextResponse.json({ ok: false, error: 'Não autenticado.' }, { status: 401 })
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('id, is_active')
      .eq('id', user.id)
      .maybeSingle()
    if (!profile || profile.is_active !== true) {
      return NextResponse.json({ ok: false, error: 'Usuário inativo.' }, { status: 403 })
    }

    const { data: instance, error: instanceError } = await supabase
      .from('document_instances')
      .select('id, pdf_signed_path, pdf_original_path, audit_trail_path, legacy_document_id')
      .eq('id', documentId)
      .maybeSingle()

    if (instanceError || !instance) {
      return NextResponse.json(
        { ok: false, error: instanceError?.message || 'Documento não encontrado.' },
        { status: 404 }
      )
    }

    if (kind === 'signed') storagePath = instance.pdf_signed_path || null
    if (kind === 'original') storagePath = instance.pdf_original_path || null
    if (kind === 'audit') storagePath = instance.audit_trail_path || null

    if (!storagePath && instance.legacy_document_id) {
      const { data: legacyDoc } = await supabase
        .from('documents')
        .select('file_path')
        .eq('id', instance.legacy_document_id)
        .maybeSingle()
      storagePath = (legacyDoc as { file_path?: string | null } | null)?.file_path || null
    }
  }

  if (!storagePath) {
    return NextResponse.json(
      { ok: false, error: `Arquivo (${kind}) ainda não disponível.` },
      { status: 404 }
    )
  }

  const { data: signedUrlData, error: signedUrlError } = await admin.storage
    .from('documents')
    .createSignedUrl(storagePath, 60 * 15)

  if (signedUrlError || !signedUrlData?.signedUrl) {
    return NextResponse.json(
      { ok: false, error: signedUrlError?.message || 'Não foi possível gerar link de download.' },
      { status: 500 }
    )
  }

  if (redirectToFile) {
    return NextResponse.redirect(signedUrlData.signedUrl)
  }

  return NextResponse.json({
    ok: true,
    data: {
      kind,
      path: storagePath,
      url: signedUrlData.signedUrl,
    },
  })
}
