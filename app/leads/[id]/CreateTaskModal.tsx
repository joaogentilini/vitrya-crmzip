'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Textarea } from '@/components/ui/Textarea'
import { Select } from '@/components/ui/Select'
import { useToast } from '@/components/ui/Toast'
import { normalizeError } from '@/lib/leads'
import { createTaskAction, type TaskType } from '../tasks/actions'
import type { ProfileRow } from './TaskCard'

interface CreateTaskModalProps {
  open: boolean
  onClose: () => void
  leadId: string
  profiles: ProfileRow[]
  isAdmin: boolean
}

const TASK_TYPES: { value: TaskType; label: string }[] = [
  { value: 'call', label: 'Ligação' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'visit', label: 'Visita' },
  { value: 'proposal', label: 'Proposta' },
  { value: 'email', label: 'Email' },
  { value: 'other', label: 'Outro' },
]

export function CreateTaskModal({ open, onClose, leadId, profiles, isAdmin }: CreateTaskModalProps) {
  const router = useRouter()
  const { success, error: showError } = useToast()
  const [isPending, startTransition] = useTransition()
  
  const [title, setTitle] = useState('')
  const [type, setType] = useState<TaskType>('call')
  const [dueAt, setDueAt] = useState('')
  const [notes, setNotes] = useState('')
  const [assignedTo, setAssignedTo] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})

  function resetForm() {
    setTitle('')
    setType('call')
    setDueAt('')
    setNotes('')
    setAssignedTo('')
    setErrors({})
  }

  function handleClose() {
    resetForm()
    onClose()
  }

  function validate(): boolean {
    const newErrors: Record<string, string> = {}
    if (!title.trim()) newErrors.title = 'Título é obrigatório'
    if (!dueAt) newErrors.dueAt = 'Data/hora é obrigatória'
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!validate()) return

    startTransition(async () => {
      try {
        await createTaskAction({
          leadId,
          title: title.trim(),
          type,
          dueAt: new Date(dueAt).toISOString(),
          notes: notes.trim() || undefined,
          assignedTo: isAdmin && assignedTo ? assignedTo : undefined,
        })
        success('Tarefa criada com sucesso!')
        handleClose()
        router.refresh()
      } catch (err) {
        showError(normalizeError(err, 'Erro ao criar tarefa.'))
      }
    })
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div 
        className="absolute inset-0 bg-black/50" 
        onClick={handleClose}
        aria-hidden="true"
      />
      <div className="relative bg-[var(--card)] rounded-[var(--radius-lg)] shadow-lg w-full max-w-md mx-4 p-6">
        <h2 className="text-lg font-semibold text-[var(--card-foreground)] mb-4">
          Criar Próxima Ação
        </h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="Título"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            error={errors.title}
            placeholder="Ex: Ligar para confirmar visita"
            disabled={isPending}
          />

          <Select
            label="Tipo"
            value={type}
            onChange={(e) => setType(e.target.value as TaskType)}
            disabled={isPending}
            options={TASK_TYPES}
          />

          <div>
            <label className="text-sm font-medium text-[var(--foreground)] mb-1.5 block">
              Data e Hora
            </label>
            <input
              type="datetime-local"
              value={dueAt}
              onChange={(e) => setDueAt(e.target.value)}
              disabled={isPending}
              className={`w-full h-10 rounded-[var(--radius)] border ${errors.dueAt ? 'border-[var(--destructive)]' : 'border-[var(--input)]'} bg-[var(--background)] px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]`}
            />
            {errors.dueAt && (
              <p className="text-xs text-[var(--destructive)] mt-1">{errors.dueAt}</p>
            )}
          </div>

          <Textarea
            label="Notas (opcional)"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Observações adicionais..."
            disabled={isPending}
            rows={3}
          />

          {isAdmin && profiles.length > 0 && (
            <Select
              label="Responsável"
              value={assignedTo}
              onChange={(e) => setAssignedTo(e.target.value)}
              disabled={isPending}
              placeholder="Eu mesmo"
              options={profiles.map(p => ({
                value: p.id,
                label: p.full_name || p.name || p.email || p.id.substring(0, 8)
              }))}
            />
          )}

          <div className="flex gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={isPending}
              className="flex-1"
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              loading={isPending}
              className="flex-1"
            >
              Criar Tarefa
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
