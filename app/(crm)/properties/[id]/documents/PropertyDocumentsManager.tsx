'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'

type DocumentType = 'authorization' | 'management_contract' | 'other'

interface PropertyDocument {
  id: string
  property_id: string
  doc_type: DocumentType
  title: string | null
  path: string
  mime_type: string | null
  size_bytes: number | null
  commission_snapshot?: Record<string, unknown> | null
  created_at: string
}

interface PropertyDocumentsManagerProps {
  propertyId: string
}

const DOC_TYPE_LABELS: Record<DocumentType, string> = {
  authorization: 'Termo de autorizacao',
  management_contract: 'Contrato de gestao',
  other: 'Outro',
}

function sanitizeFilename(filename: string): string {
  return filename
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/_+/g, '_')
    .toLowerCase()
}

function formatBytes(bytes: number | null): string {
  if (!bytes) return '-'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function isMissingCommissionSnapshotColumn(error: { message?: string } | null): boolean {
  const message = String(error?.message ?? '').toLowerCase()
  return message.includes('commission_snapshot') && message.includes('column')
}

function isDocTypeConstraintError(error: { message?: string } | null): boolean {
  const message = String(error?.message ?? '').toLowerCase()
  return message.includes('property_documents_doc_type_check') || message.includes('check constraint')
}

export default function PropertyDocumentsManager({ propertyId }: PropertyDocumentsManagerProps) {
  const [documents, setDocuments] = useState<PropertyDocument[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const [docType, setDocType] = useState<DocumentType>('authorization')
  const [title, setTitle] = useState('')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)

  const loadDocuments = useCallback(async () => {
    setLoading(true)
    setError(null)

    const { data, error: fetchError } = await supabase
      .from('property_documents')
      .select('*')
      .eq('property_id', propertyId)
      .order('created_at', { ascending: false })

    if (fetchError) {
      setError(`Erro ao carregar documentos: ${fetchError.message}`)
    } else {
      setDocuments((data || []) as PropertyDocument[])
    }

    setLoading(false)
  }, [propertyId])

  useEffect(() => {
    void loadDocuments()
  }, [loadDocuments])

  async function handleUpload() {
    if (!selectedFile) {
      setError('Selecione um arquivo para enviar.')
      return
    }

    setUploading(true)
    setError(null)
    setSuccess(null)

    try {
      const uuid = crypto.randomUUID()
      const sanitizedName = sanitizeFilename(selectedFile.name)
      const path = `properties/${propertyId}/${uuid}-${sanitizedName}`
      let commissionSnapshot: Record<string, unknown> | null = null

      if (docType === 'management_contract') {
        const [{ data: propertyData, error: propertyError }, { data: settingsData, error: settingsError }] =
          await Promise.all([
            supabase
              .from('properties')
              .select('id, purpose, price, rent_price, commission_percent')
              .eq('id', propertyId)
              .maybeSingle(),
            supabase
              .from('property_commission_settings')
              .select(
                `
                  sale_commission_percent,
                  sale_broker_split_percent,
                  sale_partner_split_percent,
                  rent_initial_commission_percent,
                  rent_recurring_commission_percent,
                  rent_broker_split_percent,
                  rent_partner_split_percent
                `
              )
              .eq('property_id', propertyId)
              .maybeSingle(),
          ])

        if (propertyError) {
          throw new Error(`Erro ao carregar dados do imovel: ${propertyError.message}`)
        }

        if (settingsError) {
          throw new Error(`Erro ao carregar configuracao de comissao: ${settingsError.message}`)
        }

        const purpose = String(propertyData?.purpose ?? '').toLowerCase()
        const isRent = purpose.includes('rent') || purpose.includes('loca')
        const referenceValue = Number(isRent ? propertyData?.rent_price ?? 0 : propertyData?.price ?? 0)

        commissionSnapshot = {
          modality: isRent ? 'rent_initial' : 'sale',
          reference_value: Number.isFinite(referenceValue) ? referenceValue : null,
          sale_commission_percent: Number(settingsData?.sale_commission_percent ?? propertyData?.commission_percent ?? 5),
          sale_broker_split_percent: Number(settingsData?.sale_broker_split_percent ?? 50),
          sale_partner_split_percent: Number(settingsData?.sale_partner_split_percent ?? 0),
          rent_initial_commission_percent: Number(settingsData?.rent_initial_commission_percent ?? 10),
          rent_recurring_commission_percent: Number(settingsData?.rent_recurring_commission_percent ?? 8),
          rent_broker_split_percent: Number(settingsData?.rent_broker_split_percent ?? 50),
          rent_partner_split_percent: Number(settingsData?.rent_partner_split_percent ?? 0),
          captured_at: new Date().toISOString(),
        }
      }

      const { error: uploadError } = await supabase.storage.from('property-documents').upload(path, selectedFile, {
        upsert: false,
      })

      if (uploadError) {
        throw new Error(`Erro no upload: ${uploadError.message}`)
      }

      const baseInsertPayload = {
        property_id: propertyId,
        doc_type: docType,
        title: title.trim() || null,
        path,
        mime_type: selectedFile.type || null,
        size_bytes: selectedFile.size,
      }

      let { error: insertError } = await supabase.from('property_documents').insert({
        ...baseInsertPayload,
        commission_snapshot: commissionSnapshot,
      })

      if (insertError && isMissingCommissionSnapshotColumn(insertError)) {
        ;({ error: insertError } = await supabase.from('property_documents').insert(baseInsertPayload))
      }

      if (insertError) {
        await supabase.storage.from('property-documents').remove([path])
        if (docType === 'management_contract' && isDocTypeConstraintError(insertError)) {
          throw new Error(
            'Banco sem suporte ao tipo "Contrato de gestao". Rode a migration 202602141030_commission_unification.sql.'
          )
        }
        throw new Error(`Erro ao salvar registro: ${insertError.message}`)
      }

      setSuccess('Documento enviado com sucesso!')
      setTitle('')
      setDocType('authorization')
      setSelectedFile(null)

      const fileInput = document.getElementById('doc-file-input') as HTMLInputElement | null
      if (fileInput) fileInput.value = ''

      await loadDocuments()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro desconhecido no upload')
    } finally {
      setUploading(false)
    }
  }

  async function handlePreview(doc: PropertyDocument) {
    setError(null)

    const { data, error: signError } = await supabase.storage.from('property-documents').createSignedUrl(doc.path, 600)

    if (signError || !data?.signedUrl) {
      setError(`Erro ao gerar URL de preview: ${signError?.message || 'URL nao gerada'}`)
      return
    }

    window.open(data.signedUrl, '_blank')
  }

  async function handleDelete(doc: PropertyDocument) {
    if (!confirm(`Excluir o documento "${doc.title || doc.path.split('/').pop()}"?`)) return

    setError(null)

    const { error: storageError } = await supabase.storage.from('property-documents').remove([doc.path])

    if (storageError) {
      setError(`Erro ao remover do storage: ${storageError.message}`)
      return
    }

    const { error: dbError } = await supabase.from('property_documents').delete().eq('id', doc.id)

    if (dbError) {
      setError(`Erro ao remover do banco: ${dbError.message}`)
      return
    }

    setSuccess('Documento excluido com sucesso!')
    await loadDocuments()
  }

  const hasAuthorization = documents.some((d) => d.doc_type === 'authorization')
  const hasManagementContract = documents.some((d) => d.doc_type === 'management_contract')

  return (
    <div className="space-y-6">
      {error ? <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}

      {success ? (
        <div className="rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-700">{success}</div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
            Enviar documento
          </CardTitle>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Tipo de documento *</label>
              <select
                value={docType}
                onChange={(e) => setDocType(e.target.value as DocumentType)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-[#294487] focus:ring-[#294487]"
                disabled={uploading}
              >
                <option value="authorization">Termo de autorizacao</option>
                <option value="management_contract">Contrato de gestao</option>
                <option value="other">Outro</option>
              </select>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Titulo (opcional)</label>
              <Input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Ex: Contrato de exclusividade"
                disabled={uploading}
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Arquivo *</label>
            <input
              id="doc-file-input"
              type="file"
              accept="application/pdf,image/*"
              onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
              disabled={uploading}
              className="block w-full text-sm text-gray-500 file:mr-4 file:rounded-md file:border-0 file:bg-[#294487] file:px-4 file:py-2 file:text-sm file:font-semibold file:text-white hover:file:bg-[#1e3366] disabled:cursor-not-allowed disabled:opacity-50"
            />
            <p className="mt-1 text-xs text-gray-500">PDF ou imagem (JPG, PNG). Maximo recomendado: 10 MB.</p>
          </div>

          <Button onClick={handleUpload} disabled={uploading || !selectedFile} className="w-full md:w-auto">
            {uploading ? (
              <>
                <svg className="-ml-1 mr-2 h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
                Enviando...
              </>
            ) : (
              'Enviar documento'
            )}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-2">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4"
                />
              </svg>
              Documentos anexados
            </span>

            <div className="flex items-center gap-2">
              <span
                className={`rounded-full px-2 py-1 text-xs ${
                  hasAuthorization ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                }`}
              >
                {hasAuthorization ? 'Autorizacao OK' : 'Falta autorizacao'}
              </span>
              <span
                className={`rounded-full px-2 py-1 text-xs ${
                  hasManagementContract ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'
                }`}
              >
                {hasManagementContract ? 'Contrato gestao OK' : 'Falta contrato gestao'}
              </span>
            </div>
          </CardTitle>
        </CardHeader>

        <CardContent>
          {loading ? (
            <div className="py-8 text-center text-gray-500">Carregando documentos...</div>
          ) : documents.length === 0 ? (
            <div className="py-8 text-center text-gray-500">
              <svg className="mx-auto mb-3 h-12 w-12 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1}
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
              <p>Nenhum documento anexado.</p>
              <p className="mt-1 text-sm">Use o formulario acima para enviar documentos.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {documents.map((doc) => (
                <div
                  key={doc.id}
                  className={`flex items-center gap-4 rounded-lg border p-4 ${
                    doc.doc_type === 'authorization'
                      ? 'border-green-200 bg-green-50'
                      : doc.doc_type === 'management_contract'
                      ? 'border-blue-200 bg-blue-50'
                      : 'border-gray-200 bg-gray-50'
                  }`}
                >
                  <div className="flex-shrink-0">
                    {doc.mime_type?.startsWith('image/') ? (
                      <svg className="h-8 w-8 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                        />
                      </svg>
                    ) : (
                      <svg className="h-8 w-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"
                        />
                      </svg>
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-gray-900">{doc.title || doc.path.split('/').pop()}</p>
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                      <span
                        className={`rounded px-1.5 py-0.5 ${
                          doc.doc_type === 'authorization'
                            ? 'bg-green-100 text-green-700'
                            : doc.doc_type === 'management_contract'
                            ? 'bg-blue-100 text-blue-700'
                            : 'bg-gray-200 text-gray-600'
                        }`}
                      >
                        {DOC_TYPE_LABELS[doc.doc_type]}
                      </span>
                      <span>{formatBytes(doc.size_bytes)}</span>
                      <span>{new Date(doc.created_at).toLocaleDateString('pt-BR')}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => handlePreview(doc)}>
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                        />
                      </svg>
                    </Button>

                    <Button variant="destructive" size="sm" onClick={() => handleDelete(doc)}>
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                        />
                      </svg>
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="mt-4 border-t border-gray-200 pt-4">
            <p className="text-xs text-gray-500">
              Property ID: <code className="rounded bg-gray-100 px-1">{propertyId}</code>
              {' - '}
              {documents.length} documento(s)
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
