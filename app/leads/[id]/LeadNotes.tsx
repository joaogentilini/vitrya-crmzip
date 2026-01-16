'use client'

import { useState, useTransition, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import { EmptyState } from '@/components/ui/EmptyState'

type Note = {
  id: string
  lead_id: string
  author_id: string
  content: string
  created_at: string
}

type Author = {
  id: string
  full_name: string | null
}

interface LeadNotesProps {
  leadId: string
  currentUserId: string
  isAdminOrGestor: boolean
}

export function LeadNotes({ leadId, currentUserId, isAdminOrGestor }: LeadNotesProps) {
  const router = useRouter()
  const { success, error: showError } = useToast()
  const [isPending, startTransition] = useTransition()
  const [notes, setNotes] = useState<Note[]>([])
  const [authors, setAuthors] = useState<Author[]>([])
  const [newNote, setNewNote] = useState('')
  const [isLoading, setIsLoading] = useState(true)

  const fetchNotes = useCallback(async () => {
    try {
      const resp = await fetch(`/api/leads/${leadId}/notes`)
      if (!resp.ok) throw new Error('Erro ao carregar notas')
      const data = await resp.json()
      setNotes(data.data || [])
      setAuthors(data.authors || [])
    } catch (err) {
      console.error('[LeadNotes] Fetch error:', err)
    } finally {
      setIsLoading(false)
    }
  }, [leadId])

  useEffect(() => {
    fetchNotes()
  }, [fetchNotes])

  const handleAddNote = useCallback(() => {
    if (!newNote.trim()) return

    startTransition(async () => {
      try {
        const resp = await fetch(`/api/leads/${leadId}/notes`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: newNote.trim() })
        })

        if (!resp.ok) {
          const data = await resp.json()
          throw new Error(data.error || 'Erro ao adicionar nota')
        }

        setNewNote('')
        success('Nota adicionada!')
        await fetchNotes()
        router.refresh()
      } catch (err) {
        showError(err instanceof Error ? err.message : 'Erro ao adicionar nota')
      }
    })
  }, [leadId, newNote, router, success, showError, fetchNotes])

  const handleDeleteNote = useCallback((noteId: string) => {
    if (!confirm('Deseja excluir esta nota?')) return

    startTransition(async () => {
      try {
        const resp = await fetch(`/api/lead-notes/${noteId}`, { method: 'DELETE' })
        if (!resp.ok) {
          const data = await resp.json()
          throw new Error(data.error || 'Erro ao excluir nota')
        }
        success('Nota excluída!')
        await fetchNotes()
      } catch (err) {
        showError(err instanceof Error ? err.message : 'Erro ao excluir nota')
      }
    })
  }, [success, showError, fetchNotes])

  const getAuthorName = (authorId: string) => {
    if (authorId === currentUserId) return 'Você'
    const author = authors.find(a => a.id === authorId)
    return author?.full_name || 'Usuário'
  }

  const formatDate = (dateStr: string) => {
    try {
      const date = new Date(dateStr)
      return date.toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      })
    } catch {
      return '—'
    }
  }

  const canDelete = (note: Note) => {
    return note.author_id === currentUserId || isAdminOrGestor
  }

  if (isLoading) {
    return (
      <div className="text-center py-4 text-sm text-[var(--muted-foreground)]">
        Carregando notas...
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <textarea
          value={newNote}
          onChange={(e) => setNewNote(e.target.value)}
          placeholder="Adicionar uma nota..."
          className="flex-1 min-h-[80px] px-3 py-2 text-sm border border-[var(--border)] rounded-[var(--radius)] bg-[var(--background)] text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)] focus:ring-offset-2 resize-none"
          disabled={isPending}
        />
      </div>
      <div className="flex justify-end">
        <Button
          size="sm"
          disabled={isPending || !newNote.trim()}
          onClick={handleAddNote}
        >
          {isPending ? 'Salvando...' : 'Adicionar Nota'}
        </Button>
      </div>

      {notes.length === 0 ? (
        <EmptyState
          title="Sem notas"
          description="As notas do lead aparecerão aqui."
          icon={
            <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          }
        />
      ) : (
        <div className="space-y-3 mt-4">
          {notes.map((note) => (
            <div
              key={note.id}
              className="p-3 bg-[var(--muted)]/30 border border-[var(--border)] rounded-[var(--radius)]"
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="text-xs text-[var(--muted-foreground)]">
                  <span className="font-medium">{getAuthorName(note.author_id)}</span>
                  {' · '}
                  {formatDate(note.created_at)}
                </div>
                {canDelete(note) && (
                  <button
                    onClick={() => handleDeleteNote(note.id)}
                    className="text-xs text-[var(--destructive)] hover:underline"
                    disabled={isPending}
                  >
                    Excluir
                  </button>
                )}
              </div>
              <p className="text-sm text-[var(--foreground)] whitespace-pre-wrap">
                {note.content}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
