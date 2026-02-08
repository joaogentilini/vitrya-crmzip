'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { useToast } from '@/components/ui/Toast'
import type { Document, DocumentLink, DocumentEntityType } from '@/packages/shared/types/documents'

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pendente',
  validated: 'Validado',
  rejected: 'Rejeitado',
  approved: 'Aprovado',
  active: 'Ativo'
}

const ENTITY_LABELS: Record<string, string> = {
  person: 'Pessoa',
  property: 'Imóvel',
  group: 'Grupo',
  lead: 'Lead',
  client: 'Cliente'
}

interface PersonDocumentsClientProps {
  personId: string
}

type DocumentRow = Document & {
  document_type: string
  file_path?: string | null
  links: DocumentLink[]
}
type DocumentEditPayload = Partial<Document> & { document_type?: string | null }

export default function PersonDocumentsClient({ personId }: PersonDocumentsClientProps) {
  const [documents, setDocuments] = useState<DocumentRow[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const { success: showSuccess, error: showError } = useToast()

  const [docType, setDocType] = useState('authorization')
  const [title, setTitle] = useState('')
  const [status, setStatus] = useState('pending')
  const [notes, setNotes] = useState('')
  const [issuedAt, setIssuedAt] = useState('')
  const [expiresAt, setExpiresAt] = useState('')
  const [extraEntityType, setExtraEntityType] = useState<DocumentEntityType | ''>('')
  const [extraEntityId, setExtraEntityId] = useState('')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingPayload, setEditingPayload] = useState<DocumentEditPayload>({})

  const loadDocuments = useCallback(async () => {
    setLoading(true)
    setError(null)

    const { data: linkRows, error: linkError } = await supabase
      .from('document_links')
      .select('*')
      .eq('entity_type', 'person')
      .eq('entity_id', personId)

    if (linkError) {
      setError(`Erro ao carregar vínculos: ${linkError.message}`)
      setLoading(false)
      return
    }

    const linkList = (linkRows ?? []) as DocumentLink[]
    if (linkList.length === 0) {
      setDocuments([])
      setLoading(false)
      return
    }

    const documentIds = linkList.map((link) => link.document_id)

    const { data: docsRows, error: docsError } = await supabase
      .from('documents')
      .select('*')
      .in('id', documentIds)
      .order('created_at', { ascending: false })

    if (docsError) {
      setError(`Erro ao carregar documentos: ${docsError.message}`)
      setLoading(false)
      return
    }

    const { data: allLinks, error: allLinksError } = await supabase
      .from('document_links')
      .select('*')
      .in('document_id', documentIds)

    if (allLinksError) {
      setError(`Erro ao carregar vínculos: ${allLinksError.message}`)
      setLoading(false)
      return
    }

    const linksByDoc = new Map<string, DocumentLink[]>()
    for (const link of (allLinks ?? []) as DocumentLink[]) {
      const current = linksByDoc.get(link.document_id) ?? []
      current.push(link)
      linksByDoc.set(link.document_id, current)
    }

    const rows = ((docsRows ?? []) as Document[]).map((doc) => ({
      ...doc,
      // compat: backend may return doc_type or document_type
      document_type: (doc as any).document_type ?? doc.doc_type ?? '',
      links: linksByDoc.get(doc.id) ?? []
    }))

    setDocuments(rows)
    setLoading(false)
  }, [personId])

  useEffect(() => {
    loadDocuments()
  }, [loadDocuments])

  const timeline = useMemo(() => documents, [documents])

  function resetFileInput() {
    setSelectedFile(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  async function handleOpenFile(doc: DocumentRow, forceDownload = false) {
    if (!doc.file_path) return

    const { data, error: signedError } = await supabase.storage
      .from('documents')
      .createSignedUrl(doc.file_path, 600)

    if (signedError || !data?.signedUrl) {
      const message = signedError?.message || 'Erro ao gerar link do documento.'
      setError(message)
      showError(message)
      return
    }

    const link = document.createElement('a')
    link.href = data.signedUrl
    link.target = '_blank'
    link.rel = 'noreferrer'
    if (forceDownload) {
      link.download = doc.title || doc.document_type || 'documento'
    }
    link.click()
  }

  async function handleCreate() {
    setBusy(true)
    setError(null)
    setSuccess(null)

    try {
      if (!docType.trim()) throw new Error('Informe o tipo do documento.')

      const payload: Record<string, unknown> = {
        document_type: docType.trim(),
        title: title.trim() || null,
        status: status || null,
        notes: notes.trim() || null,
        issued_at: issuedAt || null,
        expires_at: expiresAt || null
      }

      const { data: createdDoc, error: createError } = await supabase
        .from('documents')
        .insert(payload)
        .select('*')
        .single()

      if (createError || !createdDoc) {
        throw new Error(createError?.message || 'Erro ao criar documento.')
      }

      const { error: linkError } = await supabase.from('document_links').insert({
        document_id: createdDoc.id,
        entity_type: 'person',
        entity_id: personId
      })

      if (linkError) {
        throw new Error(`Erro ao vincular documento: ${linkError.message}`)
      }

      if (extraEntityType && extraEntityId.trim()) {
        const { error: extraLinkError } = await supabase
          .from('document_links')
          .insert({
            document_id: createdDoc.id,
            entity_type: extraEntityType,
            entity_id: extraEntityId.trim()
          })

        if (extraLinkError) {
          throw new Error(`Erro ao vincular entidade: ${extraLinkError.message}`)
        }
      }

      if (selectedFile) {
        setUploading(true)
        const fileName = selectedFile.name || 'documento'
        const nameParts = fileName.split('.')
        const rawExt = nameParts.length > 1 ? nameParts.pop() : null
        const ext = rawExt && rawExt.trim() ? rawExt.trim().toLowerCase() : 'bin'
        const filePath = `people/${personId}/${createdDoc.id}.${ext}`

        const { error: uploadError } = await supabase.storage.from('documents').upload(
          filePath,
          selectedFile,
          {
            upsert: true,
            contentType: selectedFile.type || 'application/octet-stream'
          }
        )

        if (uploadError) {
          throw new Error(`Erro ao enviar arquivo: ${uploadError.message}`)
        }

        const { error: updateError } = await supabase
          .from('documents')
          .update({ file_path: filePath })
          .eq('id', createdDoc.id)

        if (updateError) {
          throw new Error(`Erro ao salvar arquivo: ${updateError.message}`)
        }
      }

      setSuccess('Documento criado com sucesso.')
      showSuccess('Documento criado com sucesso.')
      setTitle('')
      setDocType('authorization')
      setStatus('pending')
      setNotes('')
      setIssuedAt('')
      setExpiresAt('')
      setExtraEntityType('')
      setExtraEntityId('')
      resetFileInput()
      await loadDocuments()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao criar documento.'
      setError(message)
      showError(message)
    } finally {
      setUploading(false)
      setBusy(false)
    }
  }

  async function handleStartEdit(doc: DocumentRow) {
    setEditingId(doc.id)
    setEditingPayload({
      title: doc.title,
      document_type: doc.document_type,
      status: doc.status,
      notes: doc.notes ?? null,
      issued_at: doc.issued_at ?? null,
      expires_at: doc.expires_at ?? null
    })
  }

  async function handleSaveEdit() {
    if (!editingId) return

    setBusy(true)
    setError(null)
    setSuccess(null)

    try {
      const { error: updateError } = await supabase
        .from('documents')
        .update(editingPayload)
        .eq('id', editingId)

      if (updateError) {
        throw new Error(updateError.message)
      }

      setSuccess('Documento atualizado.')
      setEditingId(null)
      setEditingPayload({})
      await loadDocuments()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao atualizar documento.'
      setError(message)
      showError(message)
    } finally {
      setBusy(false)
    }
  }

  async function handleDelete(doc: DocumentRow) {
    if (!confirm(`Remover o documento "${doc.title || doc.document_type}"?`)) return

    setBusy(true)
    setError(null)
    setSuccess(null)

    try {
      const { error: linkDeleteError } = await supabase
        .from('document_links')
        .delete()
        .eq('document_id', doc.id)
        .eq('entity_type', 'person')
        .eq('entity_id', personId)

      if (linkDeleteError) {
        throw new Error(linkDeleteError.message)
      }

      const { data: remainingLinks, error: remainingError } = await supabase
        .from('document_links')
        .select('id', { count: 'exact' })
        .eq('document_id', doc.id)

      if (remainingError) {
        throw new Error(remainingError.message)
      }

      const remainingCount = (remainingLinks ?? []).length
      if (remainingCount === 0) {
        const { error: docDeleteError } = await supabase
          .from('documents')
          .delete()
          .eq('id', doc.id)

        if (docDeleteError) {
          throw new Error(docDeleteError.message)
        }
      }

      setSuccess('Documento removido.')
      await loadDocuments()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao remover documento.'
      setError(message)
      showError(message)
    } finally {
      setBusy(false)
    }
  }

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
          <CardTitle>Novo Documento</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Tipo *</label>
              <Input
                value={docType}
                onChange={(e) => setDocType(e.target.value)}
                placeholder="authorization"
                disabled={busy}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Título</label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Ex: Termo de Autorização"
                disabled={busy}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-[#294487] focus:border-[#294487]"
                disabled={busy}
              >
                <option value="pending">Pendente</option>
                <option value="validated">Validado</option>
                <option value="rejected">Rejeitado</option>
                <option value="approved">Aprovado</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Emitido em</label>
              <Input
                type="date"
                value={issuedAt}
                onChange={(e) => setIssuedAt(e.target.value)}
                disabled={busy}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Expira em</label>
              <Input
                type="date"
                value={expiresAt}
                onChange={(e) => setExpiresAt(e.target.value)}
                disabled={busy}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Observações</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full min-h-[80px] px-3 py-2 border border-gray-300 rounded-md focus:ring-[#294487] focus:border-[#294487]"
              disabled={busy}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Arquivo</label>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf,image/*"
              onChange={(e) => setSelectedFile(e.target.files?.[0] ?? null)}
              className="block w-full text-sm text-gray-700 file:mr-4 file:py-2 file:px-3 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-gray-100 file:text-gray-700 hover:file:bg-gray-200"
              disabled={busy}
            />
            {selectedFile && (
              <div className="mt-1 text-xs text-gray-500">Selecionado: {selectedFile.name}</div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Vincular também a</label>
              <select
                value={extraEntityType}
                onChange={(e) => setExtraEntityType(e.target.value as DocumentEntityType | '')}
                className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-[#294487] focus:border-[#294487]"
                disabled={busy}
              >
                <option value="">Sem vínculo extra</option>
                <option value="property">Imóvel</option>
                <option value="group">Grupo</option>
                <option value="lead">Lead</option>
                <option value="client">Cliente</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">ID da entidade</label>
              <Input
                value={extraEntityId}
                onChange={(e) => setExtraEntityId(e.target.value)}
                placeholder="UUID da entidade"
                disabled={busy || !extraEntityType}
              />
            </div>
          </div>

          <Button onClick={handleCreate} disabled={busy}>
            {uploading ? 'Enviando arquivo...' : busy ? 'Salvando...' : 'Salvar documento'}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Timeline de Documentos</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-sm text-gray-500">Carregando documentos...</div>
          ) : timeline.length === 0 ? (
            <div className="text-sm text-gray-500">Nenhum documento registrado.</div>
          ) : (
            <div className="space-y-4">
              {timeline.map((doc) => (
                <div
                  key={doc.id}
                  className="border border-gray-200 rounded-lg p-4 bg-white"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="text-sm font-semibold text-gray-900">
                        {doc.title || doc.document_type}
                      </div>
                      <div className="text-xs text-gray-500 mt-1">
                        {new Date(doc.created_at).toLocaleDateString('pt-BR')} ·{' '}
                        {STATUS_LABELS[String(doc.status || '')] || doc.status || '—'}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {doc.file_path && (
                        <>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleOpenFile(doc, false)}
                          >
                            Abrir
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleOpenFile(doc, true)}
                          >
                            Baixar
                          </Button>
                        </>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleStartEdit(doc)}
                      >
                        Editar
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => handleDelete(doc)}
                      >
                        Remover
                      </Button>
                    </div>
                  </div>

                  <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-2 text-xs text-gray-600">
                    <div>Tipo: {doc.document_type}</div>
                    <div>Emitido: {doc.issued_at ? new Date(doc.issued_at).toLocaleDateString('pt-BR') : '—'}</div>
                    <div>Expira: {doc.expires_at ? new Date(doc.expires_at).toLocaleDateString('pt-BR') : '—'}</div>
                    <div>Vínculos: {doc.links.length}</div>
                  </div>

                  {doc.notes && (
                    <div className="mt-3 text-sm text-gray-700 bg-gray-50 border border-gray-100 rounded-md p-3">
                      {doc.notes}
                    </div>
                  )}

                  {doc.links.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2 text-xs">
                      {doc.links.map((link) => (
                        <span
                          key={link.id}
                          className="px-2 py-1 rounded-full bg-gray-100 text-gray-600"
                        >
                          {ENTITY_LABELS[link.entity_type] || link.entity_type}: {link.entity_id}
                        </span>
                      ))}
                    </div>
                  )}

                  {editingId === doc.id && (
                    <div className="mt-4 border-t border-gray-200 pt-4 space-y-3">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">Título</label>
                          <Input
                            value={String(editingPayload.title ?? '')}
                            onChange={(e) =>
                              setEditingPayload((prev) => ({ ...prev, title: e.target.value }))
                            }
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">Tipo</label>
                          <Input
                            value={String(editingPayload.document_type ?? '')}
                            onChange={(e) =>
                              setEditingPayload((prev) => ({ ...prev, document_type: e.target.value }))
                            }
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">Status</label>
                          <select
                            value={String(editingPayload.status ?? '')}
                            onChange={(e) =>
                              setEditingPayload((prev) => ({ ...prev, status: e.target.value }))
                            }
                            className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-[#294487] focus:border-[#294487]"
                          >
                            <option value="pending">Pendente</option>
                            <option value="validated">Validado</option>
                            <option value="rejected">Rejeitado</option>
                            <option value="approved">Aprovado</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">Emitido em</label>
                          <Input
                            type="date"
                            value={editingPayload.issued_at ? String(editingPayload.issued_at).slice(0, 10) : ''}
                            onChange={(e) =>
                              setEditingPayload((prev) => ({ ...prev, issued_at: e.target.value || null }))
                            }
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">Expira em</label>
                          <Input
                            type="date"
                            value={editingPayload.expires_at ? String(editingPayload.expires_at).slice(0, 10) : ''}
                            onChange={(e) =>
                              setEditingPayload((prev) => ({ ...prev, expires_at: e.target.value || null }))
                            }
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">Observações</label>
                        <textarea
                          value={String(editingPayload.notes ?? '')}
                          onChange={(e) =>
                            setEditingPayload((prev) => ({ ...prev, notes: e.target.value }))
                          }
                          className="w-full min-h-[80px] px-3 py-2 border border-gray-300 rounded-md focus:ring-[#294487] focus:border-[#294487]"
                        />
                      </div>
                      <div className="flex gap-2">
                        <Button onClick={handleSaveEdit} disabled={busy}>
                          Salvar alterações
                        </Button>
                        <Button variant="outline" onClick={() => setEditingId(null)} disabled={busy}>
                          Cancelar
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
