'use client'

import { useState, useTransition, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/Button'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card'
import { EmptyState } from '@/components/ui/EmptyState'
import { Skeleton } from '@/components/ui/Skeleton'
import { useToast } from '@/components/ui/Toast'
import { ClientDate } from '../ClientDate'
import { EditLeadModal } from './EditLeadModal'
import { 
  type LeadRow, 
  type PipelineRow, 
  type StageRow,
  type StageChange,
  getStatusBadge,
  normalizeError,
  getConfirmFinalizeMessage,
  getFinalizeSuccessMessage
} from '@/lib/leads'

interface LeadDetailsClientProps {
  lead: LeadRow
  pipeline?: PipelineRow
  stage?: StageRow
  pipelines: PipelineRow[]
  stages: StageRow[]
}

export function LeadDetailsClient({ 
  lead, 
  pipeline, 
  stage, 
  pipelines, 
  stages 
}: LeadDetailsClientProps) {
  const router = useRouter()
  const { success, error: showError } = useToast()
  const [isPending, startTransition] = useTransition()
  const [editModalOpen, setEditModalOpen] = useState(false)

  const availableStages = stages.filter(s => s.pipeline_id === lead.pipeline_id)

  const handleMoveStage = useCallback((toStageId: string) => {
    if (!lead.pipeline_id || toStageId === lead.stage_id) return

    startTransition(async () => {
      try {
        const { moveLeadToStageAction } = await import('../kanban/actions')
        await moveLeadToStageAction({ 
          leadId: lead.id, 
          pipelineId: lead.pipeline_id!, 
          toStageId 
        })
        success('Estágio atualizado!')
        router.refresh()
      } catch (err) {
        showError(normalizeError(err, 'Erro ao mover lead.'))
      }
    })
  }, [lead.id, lead.pipeline_id, lead.stage_id, router, success, showError])

  const handleFinalize = useCallback((status: 'won' | 'lost') => {
    if (!confirm(getConfirmFinalizeMessage(status))) return

    startTransition(async () => {
      try {
        const resp = await fetch('/api/leads/finalize', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ leadId: lead.id, status }),
        })
        if (!resp.ok) throw new Error('Erro ao finalizar lead')
        success(getFinalizeSuccessMessage(status))
        router.refresh()
      } catch (err) {
        showError(normalizeError(err, 'Erro ao finalizar lead.'))
      }
    })
  }, [lead.id, router, success, showError])

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-sm text-[var(--muted-foreground)]">
        <Link href="/leads" className="hover:text-[var(--foreground)] transition-colors">
          Leads
        </Link>
        <span>/</span>
        <span className="text-[var(--foreground)]">{lead.title}</span>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
            <div className="space-y-3">
              <div className="flex items-center gap-3 flex-wrap">
                <h1 className="text-2xl font-bold tracking-tight text-[var(--foreground)]">
                  {lead.title}
                </h1>
                {getStatusBadge(lead.status, 'lg')}
              </div>

              <div className="flex flex-wrap items-center gap-4 text-sm text-[var(--muted-foreground)]">
                {pipeline && (
                  <div className="flex items-center gap-1.5">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                    </svg>
                    <span>{pipeline.name}</span>
                  </div>
                )}
                {stage && (
                  <div className="flex items-center gap-1.5">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                    </svg>
                    <span>{stage.name}</span>
                  </div>
                )}
                <div className="flex items-center gap-1.5">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  <ClientDate value={lead.created_at} />
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button 
                variant="outline" 
                onClick={() => setEditModalOpen(true)}
                disabled={isPending}
              >
                <svg className="w-4 h-4 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
                Editar
              </Button>

              {lead.status === 'open' && (
                <>
                  <Button 
                    onClick={() => handleFinalize('won')}
                    disabled={isPending}
                    className="bg-[var(--success)] hover:bg-[var(--success)]/90"
                  >
                    <svg className="w-4 h-4 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Marcar Ganho
                  </Button>
                  <Button 
                    variant="destructive"
                    onClick={() => handleFinalize('lost')}
                    disabled={isPending}
                  >
                    <svg className="w-4 h-4 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                    Marcar Perdido
                  </Button>
                </>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Mover Estágio</CardTitle>
            </CardHeader>
            <CardContent>
              {lead.status === 'open' && availableStages.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {availableStages.map((s) => (
                    <Button
                      key={s.id}
                      variant={s.id === lead.stage_id ? 'default' : 'outline'}
                      size="sm"
                      disabled={isPending || s.id === lead.stage_id}
                      onClick={() => handleMoveStage(s.id)}
                    >
                      {s.name}
                    </Button>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-[var(--muted-foreground)]">
                  {lead.status !== 'open' 
                    ? 'Este lead já foi finalizado.' 
                    : 'Nenhum estágio disponível.'}
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Linha do Tempo</CardTitle>
            </CardHeader>
            <CardContent>
              <TimelineSection 
                leadId={lead.id} 
                createdAt={lead.created_at} 
                status={lead.status}
                stages={stages}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Notas</CardTitle>
            </CardHeader>
            <CardContent>
              <EmptyState
                title="Sem notas"
                description="As notas do lead aparecerão aqui."
                icon={
                  <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                }
              />
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Contato</CardTitle>
            </CardHeader>
            <CardContent>
              <EmptyState
                title="Sem informações de contato"
                description="Adicione telefone, email ou endereço."
                icon={
                  <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                  </svg>
                }
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Interesse / Origem</CardTitle>
            </CardHeader>
            <CardContent>
              <EmptyState
                title="Sem informações de origem"
                description="De onde veio este lead?"
                icon={
                  <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                }
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Próxima Ação</CardTitle>
            </CardHeader>
            <CardContent>
              <EmptyState
                title="Sem ação agendada"
                description="Agende um follow-up ou tarefa."
                icon={
                  <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                }
              />
            </CardContent>
          </Card>
        </div>
      </div>

      <EditLeadModal
        open={editModalOpen}
        onClose={() => setEditModalOpen(false)}
        lead={lead}
        pipelines={pipelines}
        stages={stages}
      />
    </div>
  )
}

function TimelineSection({ 
  leadId, 
  createdAt, 
  status,
  stages 
}: { 
  leadId: string
  createdAt: string
  status: string
  stages: StageRow[]
}) {
  const [changes, setChanges] = useState<StageChange[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const stageMap = new Map(stages.map(s => [s.id, s]))

  useEffect(() => {
    async function fetchChanges() {
      try {
        const { supabase } = await import('@/lib/supabaseClient')
        const { data, error: fetchError } = await supabase
          .from('lead_stage_changes')
          .select('id, lead_id, from_stage_id, to_stage_id, created_at')
          .eq('lead_id', leadId)
          .order('created_at', { ascending: true })

        if (fetchError) {
          if (fetchError.code === '42P01') {
            setChanges([])
          } else {
            throw fetchError
          }
        } else {
          setChanges((data || []) as StageChange[])
        }
      } catch (err) {
        console.error('Error fetching stage changes:', err)
        setError('Não foi possível carregar o histórico.')
      } finally {
        setLoading(false)
      }
    }

    fetchChanges()
  }, [leadId])

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="flex gap-4">
          <Skeleton className="w-8 h-8 rounded-full" />
          <div className="space-y-2 flex-1">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-24" />
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <p className="text-sm text-[var(--muted-foreground)]">{error}</p>
    )
  }

  return (
    <div className="relative">
      <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-[var(--border)]" />
      
      <div className="space-y-6">
        <div className="relative flex gap-4">
          <div className="w-8 h-8 rounded-full bg-[var(--primary)] flex items-center justify-center flex-shrink-0 z-10">
            <svg className="w-4 h-4 text-[var(--primary-foreground)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
            </svg>
          </div>
          <div className="pt-1">
            <p className="text-sm font-medium text-[var(--foreground)]">
              Lead criado
            </p>
            <p className="text-xs text-[var(--muted-foreground)] mt-0.5">
              <ClientDate value={createdAt} />
            </p>
          </div>
        </div>

        {changes.map((change) => {
          const fromStage = stageMap.get(change.from_stage_id || '')
          const toStage = stageMap.get(change.to_stage_id || '')

          return (
            <div key={change.id} className="relative flex gap-4">
              <div className="w-8 h-8 rounded-full bg-[var(--accent)] flex items-center justify-center flex-shrink-0 z-10">
                <svg className="w-4 h-4 text-[var(--accent-foreground)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
              </div>
              <div className="pt-1">
                <p className="text-sm font-medium text-[var(--foreground)]">
                  Movido de <span className="text-[var(--muted-foreground)]">{fromStage?.name || '—'}</span> para{' '}
                  <span className="text-[var(--primary)]">{toStage?.name || '—'}</span>
                </p>
                <p className="text-xs text-[var(--muted-foreground)] mt-0.5">
                  <ClientDate value={change.created_at} />
                </p>
              </div>
            </div>
          )
        })}

        {status !== 'open' && (
          <div className="relative flex gap-4">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 z-10 ${
              status === 'won' ? 'bg-[var(--success)]' : 'bg-[var(--destructive)]'
            }`}>
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                {status === 'won' ? (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                )}
              </svg>
            </div>
            <div className="pt-1">
              <p className="text-sm font-medium text-[var(--foreground)]">
                Lead marcado como{' '}
                <span className={status === 'won' ? 'text-[var(--success)]' : 'text-[var(--destructive)]'}>
                  {status === 'won' ? 'Ganho' : 'Perdido'}
                </span>
              </p>
            </div>
          </div>
        )}

        {changes.length === 0 && status === 'open' && (
          <div className="relative flex gap-4">
            <div className="w-8 h-8 rounded-full bg-[var(--muted)] flex items-center justify-center flex-shrink-0 z-10">
              <svg className="w-4 h-4 text-[var(--muted-foreground)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div className="pt-1">
              <p className="text-sm text-[var(--muted-foreground)]">
                Nenhuma alteração de estágio registrada ainda.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
