'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'

interface PropertyDocument {
  id: string
  property_id: string
  doc_type: 'authorization' | 'other'
  title: string | null
  path: string
  mime_type: string | null
  size_bytes: number | null
  created_at: string
}

interface PropertyDocumentsManagerProps {
  propertyId: string
}

const DOC_TYPE_LABELS: Record<string, string> = {
  authorization: 'Termo de Autorização',
  other: 'Outro'
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

export function PropertyDocumentsManager({ propertyId }: PropertyDocumentsManagerProps) {
  const [documents, setDocuments] = useState<PropertyDocument[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const [docType, setDocType] = useState<'authorization' | 'other'>('authorization')
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
      setDocuments(data || [])
    }
    setLoading(false)
  }, [propertyId])

  useEffect(() => {
    loadDocuments()
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

      const { error: uploadError } = await supabase.storage
        .from('property-documents')
        .upload(path, selectedFile, { upsert: false })

      if (uploadError) {
        throw new Error(`Erro no upload: ${uploadError.message}`)
      }

      const { error: insertError } = await supabase
        .from('property_documents')
        .insert({
          property_id: propertyId,
          doc_type: docType,
          title: title.trim() || null,
          path,
          mime_type: selectedFile.type || null,
          size_bytes: selectedFile.size
        })

      if (insertError) {
        await supabase.storage.from('property-documents').remove([path])
        throw new Error(`Erro ao salvar registro: ${insertError.message}`)
      }

      setSuccess('Documento enviado com sucesso!')
      setTitle('')
      setDocType('authorization')
      setSelectedFile(null)
      
      const fileInput = document.getElementById('doc-file-input') as HTMLInputElement
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
    
    const { data, error: signError } = await supabase.storage
      .from('property-documents')
      .createSignedUrl(doc.path, 600)

    if (signError || !data?.signedUrl) {
      setError(`Erro ao gerar URL de preview: ${signError?.message || 'URL não gerada'}`)
      return
    }

    window.open(data.signedUrl, '_blank')
  }

  async function handleDelete(doc: PropertyDocument) {
    if (!confirm(`Excluir o documento "${doc.title || doc.path.split('/').pop()}"?`)) return

    setError(null)

    const { error: storageError } = await supabase.storage
      .from('property-documents')
      .remove([doc.path])

    if (storageError) {
      setError(`Erro ao remover do storage: ${storageError.message}`)
      return
    }

    const { error: dbError } = await supabase
      .from('property_documents')
      .delete()
      .eq('id', doc.id)

    if (dbError) {
      setError(`Erro ao remover do banco: ${dbError.message}`)
      return
    }

    setSuccess('Documento excluído com sucesso!')
    await loadDocuments()
  }

  const hasAuthorization = documents.some(d => d.doc_type === 'authorization')

  return (
    <div className="space-y-6">
      {error && (
        <div className="p-3 rounded-md bg-red-50 border border-red-200 text-red-700 text-sm">
          {error}
        </div>
      )}

      {success && (
        <div className="p-3 rounded-md bg-green-50 border border-green-200 text-green-700 text-sm">
          {success}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Enviar Documento
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Tipo de Documento *
              </label>
              <select
                value={docType}
                onChange={(e) => setDocType(e.target.value as 'authorization' | 'other')}
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-[#294487] focus:border-[#294487]"
                disabled={uploading}
              >
                <option value="authorization">Termo de Autorização</option>
                <option value="other">Outro</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Título (opcional)
              </label>
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
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Arquivo *
            </label>
            <input
              id="doc-file-input"
              type="file"
              accept="application/pdf,image/*"
              onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
              disabled={uploading}
              className="block w-full text-sm text-gray-500
                file:mr-4 file:py-2 file:px-4
                file:rounded-md file:border-0
                file:text-sm file:font-semibold
                file:bg-[#294487] file:text-white
                hover:file:bg-[#1e3366]
                disabled:opacity-50 disabled:cursor-not-allowed"
            />
            <p className="mt-1 text-xs text-gray-500">
              PDF ou imagem (JPG, PNG). Máximo recomendado: 10 MB.
            </p>
          </div>

          <Button
            onClick={handleUpload}
            disabled={uploading || !selectedFile}
            className="w-full md:w-auto"
          >
            {uploading ? (
              <>
                <svg className="animate-spin -ml-1 mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Enviando...
              </>
            ) : (
              'Enviar Documento'
            )}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
              </svg>
              Documentos Anexados
            </span>
            {hasAuthorization ? (
              <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full">
                Autorização OK
              </span>
            ) : (
              <span className="text-xs bg-amber-100 text-amber-700 px-2 py-1 rounded-full">
                Falta Autorização
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8 text-gray-500">Carregando documentos...</div>
          ) : documents.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <svg className="w-12 h-12 mx-auto mb-3 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <p>Nenhum documento anexado.</p>
              <p className="text-sm mt-1">Use o formulário acima para enviar documentos.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {documents.map((doc) => (
                <div
                  key={doc.id}
                  className={`flex items-center gap-4 p-4 rounded-lg border ${
                    doc.doc_type === 'authorization'
                      ? 'border-green-200 bg-green-50'
                      : 'border-gray-200 bg-gray-50'
                  }`}
                >
                  <div className="flex-shrink-0">
                    {doc.mime_type?.startsWith('image/') ? (
                      <svg className="w-8 h-8 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                    ) : (
                      <svg className="w-8 h-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                      </svg>
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {doc.title || doc.path.split('/').pop()}
                    </p>
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                      <span className={`px-1.5 py-0.5 rounded ${
                        doc.doc_type === 'authorization'
                          ? 'bg-green-100 text-green-700'
                          : 'bg-gray-200 text-gray-600'
                      }`}>
                        {DOC_TYPE_LABELS[doc.doc_type]}
                      </span>
                      <span>{formatBytes(doc.size_bytes)}</span>
                      <span>{new Date(doc.created_at).toLocaleDateString('pt-BR')}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handlePreview(doc)}
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                    </Button>

                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => handleDelete(doc)}
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="pt-4 border-t border-gray-200 mt-4">
            <p className="text-xs text-gray-500">
              Property ID: <code className="bg-gray-100 px-1 rounded">{propertyId}</code>
              {' • '}{documents.length} documento(s)
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
