/* eslint-disable @next/next/no-img-element */
'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import {
  useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { reorderPropertyMedia } from './actions'

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

interface SortableItemProps {
  item: PropertyMedia
  onPreview: (item: PropertyMedia) => void
  onDelete: (item: PropertyMedia) => void
  onSetAsCover: (item: PropertyMedia) => void
}

function SortableItem({ item, onPreview, onDelete, onSetAsCover }: SortableItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`relative p-3 rounded-lg border ${
        item.position === 1 
          ? 'border-[#294487] bg-blue-50 ring-2 ring-[#294487]/20' 
          : 'border-gray-200 bg-gray-50'
      }`}
    >
      {item.position === 1 && (
        <div className="absolute -top-2 -right-2 bg-[#294487] text-white text-xs px-2 py-0.5 rounded-full">
          Capa
        </div>
      )}

      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 w-12 h-12 rounded bg-gray-200 flex items-center justify-center cursor-move" {...attributes} {...listeners}>
          <svg className="w-6 h-6 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h16M4 16h16" />
          </svg>
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-900 truncate">
            {item.url.split('/').pop()}
          </p>
          <p className="text-xs text-gray-500">
            {item.kind === 'video' ? 'Vídeo' : 'Imagem'} • Pos. {item.position}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-1 mt-3 pt-3 border-t border-gray-200">
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPreview(item)}
          className="flex-1"
        >
          Abrir
        </Button>

        {item.position !== 1 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onSetAsCover(item)}
            title={item.kind === 'video' ? 'Vídeos não podem ser capa' : 'Definir como capa'}
            disabled={item.kind === 'video'}
          >
            {item.kind === 'video' ? (
              <span className="text-gray-400">Capa</span>
            ) : (
              '★'
            )}
          </Button>
        )}

        <Button
          variant="destructive"
          size="sm"
          onClick={() => onDelete(item)}
          title="Excluir"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </Button>
      </div>
    </div>
  )
}

export default function PropertyMediaManager({ propertyId }: PropertyMediaManagerProps) {
  const [media, setMedia] = useState<PropertyMedia[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [coverUrl, setCoverUrl] = useState<string | null>(null)
  const [loadingCover, setLoadingCover] = useState(false)

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

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

  const loadCoverUrl = useCallback(async (coverItem: PropertyMedia) => {
    setLoadingCover(true)
    const { data, error: signError } = await supabase.storage
      .from('property-media')
      .createSignedUrl(coverItem.url, 600)
    
    if (!signError && data?.signedUrl) {
      setCoverUrl(data.signedUrl)
    } else {
      setCoverUrl(null)
    }
    setLoadingCover(false)
  }, [])

  useEffect(() => {
    loadMedia()
  }, [loadMedia])

  useEffect(() => {
    const cover = media.find(m => m.position === 1) || media[0]
    if (cover) {
      loadCoverUrl(cover)
    } else {
      setCoverUrl(null)
    }
  }, [media, loadCoverUrl])

  const cover = media.find(m => m.position === 1) || media[0] || null

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

    try {
      // Remover do storage
      const { error: storageError } = await supabase.storage
        .from('property-media')
        .remove([item.url])

      if (storageError) {
        throw new Error(`Erro ao remover do storage: ${storageError.message}`)
      }

      // Remover do banco
      const { error: dbError } = await supabase
        .from('property_media')
        .delete()
        .eq('id', item.id)

      if (dbError) {
        throw new Error(`Erro ao remover do banco: ${dbError.message}`)
      }

      // Normalizar posições dos itens restantes
      const remainingMedia = media.filter(m => m.id !== item.id).sort((a, b) => a.position - b.position)
      if (remainingMedia.length > 0) {
        for (let i = 0; i < remainingMedia.length; i++) {
          const newPosition = i + 1
          if (remainingMedia[i].position !== newPosition) {
            const { error: updateError } = await supabase
              .from('property_media')
              .update({ position: newPosition })
              .eq('id', remainingMedia[i].id)

            if (updateError) {
              console.warn(`Erro ao normalizar posição de ${remainingMedia[i].id}:`, updateError)
            }
          }
        }
      }

      await loadMedia()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao excluir mídia')
    }
  }

  async function handleSetAsCover(item: PropertyMedia) {
    if (item.kind === 'video') return // Não permitir vídeo como capa

    setError(null)

    // Primeiro, definir position = 1 para o item selecionado
    const { error: setCoverError } = await supabase
      .from('property_media')
      .update({ position: 1 })
      .eq('id', item.id)

    if (setCoverError) {
      setError(`Erro ao definir como capa: ${setCoverError.message}`)
      return
    }

    // Agora, ajustar as posições dos outros itens
    const otherMedia = media.filter(m => m.id !== item.id).sort((a, b) => a.position - b.position)
    for (let i = 0; i < otherMedia.length; i++) {
      const { error: updateError } = await supabase
        .from('property_media')
        .update({ position: i + 2 }) // Começar de 2
        .eq('id', otherMedia[i].id)

      if (updateError) {
        setError(`Erro ao reordenar após definir capa: ${updateError.message}`)
        await loadMedia()
        return
      }
    }

    await loadMedia()
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event

    if (over && active.id !== over.id) {
      const oldIndex = media.findIndex((item) => item.id === active.id)
      const newIndex = media.findIndex((item) => item.id === over.id)

      if (oldIndex === -1 || newIndex === -1) return

      // Atualizar estado local imediatamente para feedback visual
      const newMedia = arrayMove(media, oldIndex, newIndex)
      setMedia(newMedia)

      try {
        setError(null)
        await reorderPropertyMedia(propertyId, newMedia.map(m => m.id))
      } catch (err: any) {
        // Reverter mudança local em caso de erro
        setMedia(media)
        setError(err.message || 'Erro ao reordenar mídias')
      }
    }
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="p-3 rounded-md bg-red-50 border border-red-200 text-red-700 text-sm">
          {error}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
            </svg>
            Capa do Imóvel
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8 text-gray-500">Carregando...</div>
          ) : !cover ? (
            <div className="text-center py-8 text-gray-500">
              Nenhuma mídia cadastrada. Adicione imagens na seção abaixo.
            </div>
          ) : (
            <div className="space-y-4">
              <div className="relative aspect-video bg-gray-100 rounded-lg overflow-hidden flex items-center justify-center">
                {loadingCover ? (
                  <div className="text-gray-400">Carregando preview...</div>
                ) : coverUrl ? (
                  cover.kind === 'video' ? (
                    <video 
                      src={coverUrl} 
                      className="max-h-full max-w-full object-contain"
                      controls={false}
                    />
                  ) : (
                    <img 
                      src={coverUrl} 
                      alt="Capa do imóvel" 
                      className="max-h-full max-w-full object-contain"
                    />
                  )
                ) : (
                  <div className="text-gray-400 flex flex-col items-center gap-2">
                    <svg className="w-12 h-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    <span>Preview indisponível</span>
                  </div>
                )}
              </div>

              {cover.kind === 'video' && (
                <div className="p-2 rounded bg-amber-50 border border-amber-200 text-amber-700 text-xs">
                  A capa atual é um vídeo. Recomendamos definir uma imagem como capa para melhor exibição na vitrine.
                </div>
              )}

              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {cover.url.split('/').pop()}
                  </p>
                  <p className="text-xs text-gray-500">
                    {cover.kind === 'video' ? 'Vídeo' : 'Imagem'} • Posição {cover.position}
                    {cover.position !== 1 && ' (fallback)'}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handlePreview(cover)}
                >
                  Abrir em nova aba
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            Galeria
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
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
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext items={media.map(m => m.id)} strategy={verticalListSortingStrategy}>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {media.map((item) => (
                    <SortableItem
                      key={item.id}
                      item={item}
                      onPreview={handlePreview}
                      onDelete={handleDelete}
                      onSetAsCover={handleSetAsCover}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}

          <div className="pt-4 border-t border-gray-200">
            <p className="text-xs text-gray-500">
              Property ID: <code className="bg-gray-100 px-1 rounded">{propertyId}</code>
              {' • '}{media.length} mídia(s) cadastrada(s)
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
