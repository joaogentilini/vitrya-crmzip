'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'

interface PropertyMedia {
  id: string
  property_id: string
  url: string
  kind: 'image' | 'video'
  position: number
  created_at: string
}

interface PropertyMediaManagerProps {
  propertyId: string
}

function sanitizeFilename(filename: string): string {
  return filename
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/_+/g, '_')
    .toLowerCase()
}

export function PropertyMediaManager({ propertyId }: PropertyMediaManagerProps) {
  const [media, setMedia] = useState<PropertyMedia[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadMedia = useCallback(async () => {
    setLoading(true)
    setError(null)
    
    const { data, error: fetchError } = await supabase
      .from('property_media')
      .select('*')
      .eq('property_id', propertyId)
      .order('position', { ascending: true })
      .order('created_at', { ascending: true })
    
    if (fetchError) {
      setError(`Erro ao carregar mídias: ${fetchError.message}`)
    } else {
      setMedia(data || [])
    }
    setLoading(false)
  }, [propertyId])

  useEffect(() => {
    loadMedia()
  }, [loadMedia])

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files
    if (!files || files.length === 0) return

    setUploading(true)
    setError(null)

    try {
      const currentMax = media.length > 0 
        ? Math.max(...media.map(m => m.position)) 
        : 0

      for (let i = 0; i < files.length; i++) {
        const file = files[i]
        const uuid = crypto.randomUUID()
        const sanitizedName = sanitizeFilename(file.name)
        const path = `properties/${propertyId}/${uuid}-${sanitizedName}`
        const kind = file.type.startsWith('video/') ? 'video' : 'image'
        const position = currentMax + i + 1

        const { error: uploadError } = await supabase.storage
          .from('property-media')
          .upload(path, file, { upsert: false })

        if (uploadError) {
          throw new Error(`Erro no upload de ${file.name}: ${uploadError.message}`)
        }

        const { error: insertError } = await supabase
          .from('property_media')
          .insert({
            property_id: propertyId,
            url: path,
            kind,
            position
          })

        if (insertError) {
          await supabase.storage.from('property-media').remove([path])
          throw new Error(`Erro ao salvar registro: ${insertError.message}`)
        }
      }

      await loadMedia()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro desconhecido no upload')
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  async function handlePreview(item: PropertyMedia) {
    setError(null)
    
    const { data, error: signError } = await supabase.storage
      .from('property-media')
      .createSignedUrl(item.url, 600)

    if (signError || !data?.signedUrl) {
      setError(`Erro ao gerar URL de preview: ${signError?.message || 'URL não gerada'}`)
      return
    }

    window.open(data.signedUrl, '_blank')
  }

  async function handleDelete(item: PropertyMedia) {
    if (!confirm(`Excluir esta mídia?`)) return

    setError(null)

    const { error: storageError } = await supabase.storage
      .from('property-media')
      .remove([item.url])

    if (storageError) {
      setError(`Erro ao remover do storage: ${storageError.message}`)
      return
    }

    const { error: dbError } = await supabase
      .from('property_media')
      .delete()
      .eq('id', item.id)

    if (dbError) {
      setError(`Erro ao remover do banco: ${dbError.message}`)
      return
    }

    await loadMedia()
  }

  async function handleReorder(index: number, direction: 'up' | 'down') {
    const targetIndex = direction === 'up' ? index - 1 : index + 1
    if (targetIndex < 0 || targetIndex >= media.length) return

    const current = media[index]
    const target = media[targetIndex]

    setError(null)

    const { error: error1 } = await supabase
      .from('property_media')
      .update({ position: target.position })
      .eq('id', current.id)

    if (error1) {
      setError(`Erro ao reordenar: ${error1.message}`)
      return
    }

    const { error: error2 } = await supabase
      .from('property_media')
      .update({ position: current.position })
      .eq('id', target.id)

    if (error2) {
      setError(`Erro ao reordenar: ${error2.message}`)
      return
    }

    await loadMedia()
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          Mídias do Imóvel
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <div className="p-3 rounded-md bg-red-50 border border-red-200 text-red-700 text-sm">
            {error}
          </div>
        )}

        <div className="flex items-center gap-4">
          <label className="flex-1">
            <input
              type="file"
              multiple
              accept="image/*,video/*"
              onChange={handleFileSelect}
              disabled={uploading}
              className="block w-full text-sm text-gray-500
                file:mr-4 file:py-2 file:px-4
                file:rounded-md file:border-0
                file:text-sm file:font-semibold
                file:bg-[#294487] file:text-white
                hover:file:bg-[#1e3366]
                disabled:opacity-50 disabled:cursor-not-allowed"
            />
          </label>
        </div>

        {uploading && (
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            Enviando arquivos...
          </div>
        )}

        {loading ? (
          <div className="text-center py-8 text-gray-500">Carregando mídias...</div>
        ) : media.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            Nenhuma mídia cadastrada. Use o campo acima para adicionar imagens ou vídeos.
          </div>
        ) : (
          <div className="space-y-2">
            {media.map((item, index) => (
              <div
                key={item.id}
                className="flex items-center gap-3 p-3 rounded-md border border-gray-200 bg-gray-50"
              >
                <div className="flex-shrink-0 w-8 h-8 rounded bg-gray-200 flex items-center justify-center">
                  {item.kind === 'video' ? (
                    <svg className="w-4 h-4 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                  ) : (
                    <svg className="w-4 h-4 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {item.url.split('/').pop()}
                  </p>
                  <p className="text-xs text-gray-500">
                    {item.kind === 'video' ? 'Vídeo' : 'Imagem'} • Posição {item.position}
                  </p>
                </div>

                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleReorder(index, 'up')}
                    disabled={index === 0}
                    title="Mover para cima"
                  >
                    ↑
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleReorder(index, 'down')}
                    disabled={index === media.length - 1}
                    title="Mover para baixo"
                  >
                    ↓
                  </Button>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handlePreview(item)}
                    title="Preview"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                  </Button>

                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => handleDelete(item)}
                    title="Excluir"
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

        <div className="pt-4 border-t border-gray-200">
          <p className="text-xs text-gray-500">
            Property ID: <code className="bg-gray-100 px-1 rounded">{propertyId}</code>
          </p>
        </div>
      </CardContent>
    </Card>
  )
}
