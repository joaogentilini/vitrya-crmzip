import Link from 'next/link'

import { Badge } from '@/components/ui/Badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'
export const revalidate = 0

type PageProps = {
  params: Promise<{ token: string }>
}

type VerifyDocumentRow = {
  id: string
  template_code: string | null
  document_number: string | null
  status: string | null
  property_id: string | null
  created_at: string
  signed_at: string | null
  pdf_signed_path: string | null
  audit_trail_path: string | null
}

function formatDateTime(value: string | null): string {
  if (!value) return '-'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return '-'
  return parsed.toLocaleString('pt-BR')
}

function statusVariant(status: string): 'success' | 'warning' | 'destructive' | 'secondary' | 'info' | 'outline' {
  if (status === 'signed') return 'success'
  if (status === 'viewed' || status === 'sent') return 'info'
  if (status === 'refused' || status === 'voided' || status === 'error') return 'destructive'
  if (status === 'draft') return 'warning'
  return 'secondary'
}

function statusLabel(status: string): string {
  if (status === 'draft') return 'Rascunho'
  if (status === 'sent') return 'Enviado'
  if (status === 'viewed') return 'Visualizado'
  if (status === 'signed') return 'Assinado'
  if (status === 'refused') return 'Recusado'
  if (status === 'voided') return 'Cancelado'
  if (status === 'error') return 'Erro'
  return status || 'Desconhecido'
}

export default async function VerifyDocumentPage({ params }: PageProps) {
  const { token: rawToken } = await params
  const token = String(rawToken || '').trim()

  if (!token) {
    return (
      <main className="mx-auto w-full max-w-3xl px-4 py-8">
        <Card>
          <CardHeader>
            <CardTitle>Verificação de Documento</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-[var(--muted-foreground)]">Token de verificação inválido.</CardContent>
        </Card>
      </main>
    )
  }

  const admin = createAdminClient()
  const { data: instance, error } = await admin
    .from('document_instances')
    .select(
      'id, template_code, document_number, status, property_id, created_at, signed_at, pdf_signed_path, audit_trail_path'
    )
    .eq('verify_token', token)
    .maybeSingle()

  if (error || !instance) {
    return (
      <main className="mx-auto w-full max-w-3xl px-4 py-8">
        <Card>
          <CardHeader>
            <CardTitle>Verificação de Documento</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Badge variant="destructive">Não encontrado</Badge>
            <p className="text-sm text-[var(--muted-foreground)]">
              Não foi possível localizar um documento para este token.
            </p>
          </CardContent>
        </Card>
      </main>
    )
  }

  const doc = instance as VerifyDocumentRow
  const normalizedStatus = String(doc.status || '').toLowerCase()
  let propertyTitle: string | null = null

  if (doc.property_id) {
    const { data: propertyData } = await admin
      .from('properties')
      .select('title')
      .eq('id', doc.property_id)
      .maybeSingle()
    propertyTitle = (propertyData as { title?: string | null } | null)?.title || null
  }

  const signedDownloadHref = `/api/docs/${doc.id}/download?kind=signed&verify_token=${encodeURIComponent(token)}&redirect=1`
  const auditDownloadHref = `/api/docs/${doc.id}/download?kind=audit&verify_token=${encodeURIComponent(token)}&redirect=1`

  return (
    <main className="mx-auto w-full max-w-3xl space-y-6 px-4 py-8">
      <header className="space-y-2">
        <h1 className="text-3xl font-bold text-[var(--foreground)]">Verificação de Documento</h1>
        <p className="text-sm text-[var(--muted-foreground)]">
          Consulte a autenticidade e o status do documento digital.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-2">
            <span>{doc.document_number || 'Documento sem número'}</span>
            <Badge variant={statusVariant(normalizedStatus)}>{statusLabel(normalizedStatus)}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-3">
              <p className="text-xs text-[var(--muted-foreground)]">Template</p>
              <p className="text-sm font-medium text-[var(--foreground)]">{doc.template_code || '-'}</p>
            </div>
            <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-3">
              <p className="text-xs text-[var(--muted-foreground)]">Imóvel</p>
              <p className="text-sm font-medium text-[var(--foreground)]">{propertyTitle || '-'}</p>
            </div>
            <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-3">
              <p className="text-xs text-[var(--muted-foreground)]">Criado em</p>
              <p className="text-sm font-medium text-[var(--foreground)]">{formatDateTime(doc.created_at)}</p>
            </div>
            <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-3">
              <p className="text-xs text-[var(--muted-foreground)]">Assinado em</p>
              <p className="text-sm font-medium text-[var(--foreground)]">{formatDateTime(doc.signed_at)}</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {doc.pdf_signed_path ? (
              <a
                href={signedDownloadHref}
                className="inline-flex items-center justify-center rounded-[var(--radius)] bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-[var(--primary-foreground)] hover:opacity-90"
              >
                Baixar PDF assinado
              </a>
            ) : (
              <span className="inline-flex cursor-not-allowed items-center justify-center rounded-[var(--radius)] bg-[var(--muted)] px-4 py-2 text-sm font-semibold text-[var(--muted-foreground)]">
                PDF assinado indisponível
              </span>
            )}

            {doc.audit_trail_path ? (
              <a
                href={auditDownloadHref}
                className="inline-flex items-center justify-center rounded-[var(--radius)] border border-[var(--border)] bg-[var(--card)] px-4 py-2 text-sm font-semibold text-[var(--foreground)] hover:bg-[var(--accent)]"
              >
                Baixar trilha de auditoria
              </a>
            ) : (
              <span className="inline-flex cursor-not-allowed items-center justify-center rounded-[var(--radius)] border border-[var(--border)] bg-[var(--muted)] px-4 py-2 text-sm font-semibold text-[var(--muted-foreground)]">
                Trilha indisponível
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      <p className="text-xs text-[var(--muted-foreground)]">
        Token: <span className="font-mono">{token}</span>
      </p>

      <Link href="/" className="text-sm font-medium text-[var(--foreground)] hover:underline">
        Voltar
      </Link>
    </main>
  )
}
