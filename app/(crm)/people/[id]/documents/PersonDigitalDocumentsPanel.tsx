'use client'

import { useCallback, useEffect, useState } from 'react'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { supabase } from '@/lib/supabaseClient'

type DigitalDocumentInstance = {
  id: string
  template_code: string | null
  status: string | null
  property_id: string | null
  sent_at: string | null
  signed_at: string | null
  created_at: string
  pdf_signed_path: string | null
}

const STATUS_LABELS: Record<string, string> = {
  draft: 'Rascunho',
  sent: 'Enviado',
  viewed: 'Visualizado',
  signed: 'Assinado',
  refused: 'Recusado',
  voided: 'Cancelado',
  error: 'Erro',
}

function badgeClass(status: string): string {
  if (status === 'signed') return 'bg-green-100 text-green-700'
  if (status === 'viewed') return 'bg-blue-100 text-blue-700'
  if (status === 'sent') return 'bg-amber-100 text-amber-700'
  if (status === 'refused' || status === 'error') return 'bg-red-100 text-red-700'
  return 'bg-gray-100 text-gray-700'
}

export default function PersonDigitalDocumentsPanel({ personId }: { personId: string }) {
  const [rows, setRows] = useState<DigitalDocumentInstance[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { data, error: fetchError } = await supabase
        .from('document_instances')
        .select('id,template_code,status,property_id,sent_at,signed_at,created_at,pdf_signed_path')
        .or(`owner_person_id.eq.${personId},primary_person_id.eq.${personId}`)
        .order('created_at', { ascending: false })
        .limit(30)

      if (fetchError) {
        const message = String(fetchError.message || '').toLowerCase()
        const schemaMissing =
          message.includes('document_instances') ||
          message.includes('does not exist') ||
          message.includes('schema cache')
        if (!schemaMissing) {
          setError(fetchError.message)
        }
        setRows([])
        return
      }

      setRows((data || []) as DigitalDocumentInstance[])
    } finally {
      setLoading(false)
    }
  }, [personId])

  useEffect(() => {
    void load()
  }, [load])

  async function openDigitalFile(documentId: string, kind: 'signed' | 'audit') {
    setError(null)
    const response = await fetch(`/api/docs/${documentId}/download?kind=${kind}`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    })

    const json = (await response.json().catch(() => null)) as
      | {
          ok?: boolean
          error?: string
          data?: { url?: string }
        }
      | null

    if (!response.ok || !json?.ok || !json?.data?.url) {
      setError(json?.error || 'Não foi possível abrir o arquivo.')
      return
    }

    window.open(json.data.url, '_blank')
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between gap-3">
          <span>Assinaturas digitais</span>
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            Atualizar
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {error ? (
          <div className="mb-3 rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-700">{error}</div>
        ) : null}

        {loading ? (
          <div className="text-sm text-gray-500">Carregando assinaturas digitais...</div>
        ) : rows.length === 0 ? (
          <div className="text-sm text-gray-500">Nenhuma assinatura digital vinculada.</div>
        ) : (
          <div className="space-y-3">
            {rows.map((row) => {
              const statusKey = String(row.status || '').toLowerCase()
              const statusLabel = STATUS_LABELS[statusKey] || row.status || '—'
              return (
                <div key={row.id} className="rounded-lg border border-gray-200 bg-white p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <div className="text-sm font-semibold text-gray-900">
                        {row.template_code || 'Documento digital'}
                      </div>
                      <div className="text-xs text-gray-500">
                        Criado em {new Date(row.created_at).toLocaleDateString('pt-BR')}
                        {row.signed_at
                          ? ` · Assinado em ${new Date(row.signed_at).toLocaleDateString('pt-BR')}`
                          : row.sent_at
                          ? ` · Enviado em ${new Date(row.sent_at).toLocaleDateString('pt-BR')}`
                          : ''}
                        {row.property_id ? ` · Imóvel: ${row.property_id}` : ''}
                      </div>
                    </div>
                    <span className={`rounded-full px-2 py-1 text-xs font-semibold ${badgeClass(statusKey)}`}>
                      {statusLabel}
                    </span>
                  </div>

                  <div className="mt-2 flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openDigitalFile(row.id, 'signed')}
                      disabled={!row.pdf_signed_path}
                    >
                      PDF assinado
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => openDigitalFile(row.id, 'audit')}>
                      Trilha/auditoria
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

