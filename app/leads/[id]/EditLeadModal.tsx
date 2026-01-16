'use client'

import { useState, useTransition, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { useToast } from '@/components/ui/Toast'
import { 
  type LeadRow, 
  type PipelineRow, 
  type StageRow,
  normalizeError
} from '@/lib/leads'

type CatalogItem = {
  id: string
  name: string
  is_active?: boolean
}

interface EditLeadModalProps {
  open: boolean
  onClose: () => void
  lead: LeadRow
  pipelines: PipelineRow[]
  stages: StageRow[]
  leadTypes?: CatalogItem[]
  leadInterests?: CatalogItem[]
  leadSources?: CatalogItem[]
}

export function EditLeadModal({ 
  open, 
  onClose, 
  lead, 
  pipelines, 
  stages,
  leadTypes = [],
  leadInterests = [],
  leadSources = []
}: EditLeadModalProps) {
  const router = useRouter()
  const { success, error: showError } = useToast()
  const [isPending, startTransition] = useTransition()

  const [title, setTitle] = useState(lead.title)
  const [clientName, setClientName] = useState(lead.client_name || '')
  const [phoneRaw, setPhoneRaw] = useState(lead.phone_raw || '')
  const [email, setEmail] = useState(lead.email || '')
  const [leadTypeId, setLeadTypeId] = useState(lead.lead_type_id || '')
  const [leadInterestId, setLeadInterestId] = useState(lead.lead_interest_id || '')
  const [leadSourceId, setLeadSourceId] = useState(lead.lead_source_id || '')
  const [budgetRange, setBudgetRange] = useState(lead.budget_range || '')
  const [notes, setNotes] = useState(lead.notes || '')
  const [pipelineId, setPipelineId] = useState(lead.pipeline_id || '')
  const [stageId, setStageId] = useState(lead.stage_id || '')
  const [titleError, setTitleError] = useState<string | undefined>()
  const [phoneError, setPhoneError] = useState<string | undefined>()
  const [emailError, setEmailError] = useState<string | undefined>()

  useEffect(() => {
    if (open) {
      setTitle(lead.title)
      setClientName(lead.client_name || '')
      setPhoneRaw(lead.phone_raw || '')
      setEmail(lead.email || '')
      setLeadTypeId(lead.lead_type_id || '')
      setLeadInterestId(lead.lead_interest_id || '')
      setLeadSourceId(lead.lead_source_id || '')
      setBudgetRange(lead.budget_range || '')
      setNotes(lead.notes || '')
      setPipelineId(lead.pipeline_id || '')
      setStageId(lead.stage_id || '')
      setTitleError(undefined)
      setPhoneError(undefined)
      setEmailError(undefined)
    }
  }, [open, lead])

  const stageOptions = useMemo(() => {
    if (!pipelineId) return []
    return stages
      .filter(s => s.pipeline_id === pipelineId)
      .sort((a, b) => a.position - b.position)
  }, [stages, pipelineId])

  useEffect(() => {
    if (pipelineId && stageOptions.length > 0 && !stageOptions.some(s => s.id === stageId)) {
      setStageId(stageOptions[0].id)
    } else if (pipelineId && stageOptions.length === 0) {
      setStageId('')
    }
  }, [pipelineId, stageOptions, stageId])

  const handlePipelineChange = (newPipelineId: string) => {
    setPipelineId(newPipelineId)
  }

  const validateForm = (): boolean => {
    setTitleError(undefined)
    setPhoneError(undefined)

    if (!title.trim()) {
      setTitleError('O título é obrigatório')
      return false
    }
    if (title.trim().length < 3) {
      setTitleError('O título deve ter pelo menos 3 caracteres')
      return false
    }
    return true
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    if (!validateForm()) return

    startTransition(async () => {
      const { updateLeadAction } = await import('../actions')
      const result = await updateLeadAction({
        leadId: lead.id,
        title: title.trim(),
        clientName: clientName.trim() || undefined,
        phoneRaw: phoneRaw.trim() || undefined,
        email: email.trim() || null,
        leadTypeId: leadTypeId || null,
        leadInterestId: leadInterestId || null,
        leadSourceId: leadSourceId || null,
        budgetRange: budgetRange.trim() || null,
        notes: notes.trim() || null,
        pipelineId: pipelineId || null,
        stageId: stageId || null,
      })

      if (!result.ok) {
        if (result.code === 'PHONE_DUPLICATE' || result.code === 'PHONE_INVALID') {
          setPhoneError(result.message)
        } else if (result.code === 'EMAIL_INVALID') {
          setEmailError(result.message)
        } else if (result.code === 'VALIDATION_ERROR') {
          setTitleError(result.message)
        } else {
          showError(result.message)
        }
        console.error('[EditLeadModal] Error:', result.code, result.message)
        return
      }

      success('Lead atualizado com sucesso!')
      router.refresh()
      onClose()
    })
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose()
    }
  }

  if (!open) return null

  const selectClass = "flex h-10 w-full rounded-[var(--radius)] border border-[var(--input)] bg-[var(--background)] px-3 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] disabled:cursor-not-allowed disabled:opacity-50"

  return (
    <>
      <div 
        className="fixed inset-0 z-50 bg-black/50 animate-in"
        onClick={onClose}
        aria-hidden="true"
      />
      <div 
        className="fixed left-1/2 top-1/2 z-50 w-full max-w-lg max-h-[90vh] overflow-y-auto -translate-x-1/2 -translate-y-1/2 bg-[var(--card)] rounded-[var(--radius-lg)] border border-[var(--border)] shadow-lg animate-in"
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-lead-title"
        onKeyDown={handleKeyDown}
      >
        <div className="p-6">
          <h2 id="edit-lead-title" className="text-lg font-semibold text-[var(--foreground)] mb-4">
            Editar Lead
          </h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              label="Título *"
              value={title}
              onChange={(e) => {
                setTitle(e.target.value)
                if (titleError) setTitleError(undefined)
              }}
              error={titleError}
              disabled={isPending}
              autoFocus
            />

            <Input
              label="Nome do Cliente"
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
              disabled={isPending}
              placeholder="Nome completo do cliente"
            />

            <Input
              label="Telefone"
              value={phoneRaw}
              onChange={(e) => {
                setPhoneRaw(e.target.value)
                if (phoneError) setPhoneError(undefined)
              }}
              error={phoneError}
              disabled={isPending}
              placeholder="(11) 99999-9999"
            />

            <Input
              label="Email"
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value)
                if (emailError) setEmailError(undefined)
              }}
              error={emailError}
              disabled={isPending}
              placeholder="email@exemplo.com"
            />

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1.5 text-[var(--foreground)]">
                  Tipo
                </label>
                <select
                  value={leadTypeId}
                  onChange={(e) => setLeadTypeId(e.target.value)}
                  disabled={isPending}
                  className={selectClass}
                >
                  <option value="">Selecione...</option>
                  {leadTypes.filter(t => t.is_active !== false).map(t => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1.5 text-[var(--foreground)]">
                  Interesse
                </label>
                <select
                  value={leadInterestId}
                  onChange={(e) => setLeadInterestId(e.target.value)}
                  disabled={isPending}
                  className={selectClass}
                >
                  <option value="">Selecione...</option>
                  {leadInterests.filter(i => i.is_active !== false).map(i => (
                    <option key={i.id} value={i.id}>{i.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1.5 text-[var(--foreground)]">
                  Origem
                </label>
                <select
                  value={leadSourceId}
                  onChange={(e) => setLeadSourceId(e.target.value)}
                  disabled={isPending}
                  className={selectClass}
                >
                  <option value="">Selecione...</option>
                  {leadSources.filter(s => s.is_active !== false).map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1.5 text-[var(--foreground)]">
                  Faixa de Orçamento
                </label>
                <select
                  value={budgetRange}
                  onChange={(e) => setBudgetRange(e.target.value)}
                  disabled={isPending}
                  className={selectClass}
                >
                  <option value="">Selecione...</option>
                  <option value="Até R$ 50.000">Até R$ 50.000</option>
                  <option value="R$ 50.000 - R$ 100.000">R$ 50.000 - R$ 100.000</option>
                  <option value="R$ 100.000 - R$ 200.000">R$ 100.000 - R$ 200.000</option>
                  <option value="R$ 200.000 - R$ 500.000">R$ 200.000 - R$ 500.000</option>
                  <option value="Acima de R$ 500.000">Acima de R$ 500.000</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1.5 text-[var(--foreground)]">
                  Pipeline
                </label>
                <select
                  value={pipelineId}
                  onChange={(e) => handlePipelineChange(e.target.value)}
                  disabled={isPending}
                  className={selectClass}
                >
                  <option value="">Sem pipeline</option>
                  {pipelines.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1.5 text-[var(--foreground)]">
                  Estágio
                </label>
                <select
                  value={stageId}
                  onChange={(e) => setStageId(e.target.value)}
                  disabled={isPending || !pipelineId || stageOptions.length === 0}
                  className={selectClass}
                >
                  {stageOptions.length === 0 ? (
                    <option value="">
                      {pipelineId ? 'Nenhum estágio' : 'Selecione pipeline'}
                    </option>
                  ) : (
                    stageOptions.map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))
                  )}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1.5 text-[var(--foreground)]">
                Observações
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                disabled={isPending}
                rows={3}
                placeholder="Anotações sobre o lead..."
                className="flex w-full rounded-[var(--radius)] border border-[var(--input)] bg-[var(--background)] px-3 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] disabled:cursor-not-allowed disabled:opacity-50 resize-none"
              />
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <Button 
                type="button" 
                variant="ghost" 
                onClick={onClose}
                disabled={isPending}
              >
                Cancelar
              </Button>
              <Button type="submit" loading={isPending}>
                {isPending ? 'Salvando...' : 'Salvar'}
              </Button>
            </div>
          </form>
        </div>
      </div>
    </>
  )
}
