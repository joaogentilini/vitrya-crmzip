'use client'

import { useMemo, useState, useTransition, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { Input } from '@/components/ui/Input'
import { Button } from '@/components/ui/Button'
import { Card, CardContent } from '@/components/ui/Card'
import { EmptyState, emptyStateIcons } from '@/components/ui/EmptyState'
import { useToast } from '@/components/ui/Toast'
import { ClientDate } from './ClientDate'
import { 
  type LeadRow, 
  type PipelineRow, 
  type StageRow, 
  getStatusBadge,
  normalizeError,
  getConfirmFinalizeMessage,
  getFinalizeSuccessMessage
} from '@/lib/leads'

type SortOption = 'recent' | 'name' | 'stage'

interface LeadsListProps {
  leads: LeadRow[]
  pipelines: PipelineRow[]
  stages: StageRow[]
}

export function LeadsList({ leads, pipelines, stages }: LeadsListProps) {
  const router = useRouter()
  const { success, error: showError } = useToast()
  const [isPending, startTransition] = useTransition()

  const [search, setSearch] = useState('')
  const [filterPipeline, setFilterPipeline] = useState<string>('')
  const [filterStage, setFilterStage] = useState<string>('')
  const [filterStatus, setFilterStatus] = useState<string>('')
  const [sortBy, setSortBy] = useState<SortOption>('recent')

  const stageOptions = useMemo(() => {
    if (!filterPipeline) return stages
    return stages.filter(s => s.pipeline_id === filterPipeline)
  }, [stages, filterPipeline])

  const stageMap = useMemo(() => {
    const map = new Map<string, StageRow>()
    stages.forEach(s => map.set(s.id, s))
    return map
  }, [stages])

  const pipelineMap = useMemo(() => {
    const map = new Map<string, PipelineRow>()
    pipelines.forEach(p => map.set(p.id, p))
    return map
  }, [pipelines])

  const filteredLeads = useMemo(() => {
    let result = [...leads]

    if (search.trim()) {
      const q = search.toLowerCase().trim()
      result = result.filter(l => l.title.toLowerCase().includes(q))
    }

    if (filterPipeline) {
      result = result.filter(l => l.pipeline_id === filterPipeline)
    }

    if (filterStage) {
      result = result.filter(l => l.stage_id === filterStage)
    }

    if (filterStatus) {
      result = result.filter(l => l.status === filterStatus)
    }

    switch (sortBy) {
      case 'name':
        result.sort((a, b) => a.title.localeCompare(b.title))
        break
      case 'stage':
        result.sort((a, b) => {
          const stageA = stageMap.get(a.stage_id || '')
          const stageB = stageMap.get(b.stage_id || '')
          return (stageA?.position ?? 999) - (stageB?.position ?? 999)
        })
        break
      case 'recent':
      default:
        result.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    }

    return result
  }, [leads, search, filterPipeline, filterStage, filterStatus, sortBy, stageMap])

  const handlePipelineChange = useCallback((value: string) => {
    setFilterPipeline(value)
    setFilterStage('')
  }, [])

  const clearFilters = useCallback(() => {
    setSearch('')
    setFilterPipeline('')
    setFilterStage('')
    setFilterStatus('')
    setSortBy('recent')
  }, [])

  const hasActiveFilters = search || filterPipeline || filterStage || filterStatus || sortBy !== 'recent'

  const handleMoveStage = useCallback(async (leadId: string, fromStageId: string, toStageId: string, pipelineId: string) => {
    if (fromStageId === toStageId) return
    
    startTransition(async () => {
      try {
        const { moveLeadToStageAction } = await import('./kanban/actions')
        await moveLeadToStageAction({ leadId, pipelineId, fromStageId, toStageId })
        success('Lead movido com sucesso!')
        router.refresh()
      } catch (err) {
        showError(normalizeError(err, 'Erro ao mover lead.'))
      }
    })
  }, [router, success, showError])

  const handleFinalize = useCallback(async (leadId: string, status: 'won' | 'lost') => {
    if (!confirm(getConfirmFinalizeMessage(status))) return
    
    startTransition(async () => {
      try {
        const resp = await fetch('/api/leads/finalize', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ leadId, status }),
        })
        if (!resp.ok) throw new Error('Erro ao finalizar lead')
        success(getFinalizeSuccessMessage(status))
        router.refresh()
      } catch (err) {
        showError(normalizeError(err, 'Erro ao finalizar lead.'))
      }
    })
  }, [router, success, showError])

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-col lg:flex-row gap-3">
            <div className="flex-1">
              <Input
                placeholder="Buscar por nome..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full"
              />
            </div>

            <div className="flex flex-wrap gap-2">
              <select
                value={filterPipeline}
                onChange={(e) => handlePipelineChange(e.target.value)}
                className="h-10 rounded-[var(--radius)] border border-[var(--input)] bg-[var(--background)] px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
              >
                <option value="">Todos Pipelines</option>
                {pipelines.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>

              <select
                value={filterStage}
                onChange={(e) => setFilterStage(e.target.value)}
                disabled={!filterPipeline}
                className="h-10 rounded-[var(--radius)] border border-[var(--input)] bg-[var(--background)] px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] disabled:opacity-50"
              >
                <option value="">Todos Estágios</option>
                {stageOptions.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>

              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="h-10 rounded-[var(--radius)] border border-[var(--input)] bg-[var(--background)] px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
              >
                <option value="">Todos Status</option>
                <option value="open">Aberto</option>
                <option value="won">Ganho</option>
                <option value="lost">Perdido</option>
              </select>

              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortOption)}
                className="h-10 rounded-[var(--radius)] border border-[var(--input)] bg-[var(--background)] px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
              >
                <option value="recent">Mais recentes</option>
                <option value="name">Nome (A-Z)</option>
                <option value="stage">Posição do estágio</option>
              </select>

              {hasActiveFilters && (
                <Button variant="ghost" size="sm" onClick={clearFilters}>
                  Limpar
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="text-sm text-[var(--muted-foreground)]">
        {filteredLeads.length} {filteredLeads.length === 1 ? 'resultado' : 'resultados'}
      </div>

      {filteredLeads.length > 0 ? (
        <>
          <div className="hidden md:block">
            <Card>
              <CardContent className="p-0">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-[var(--border)]">
                      <th className="text-left px-4 py-3 text-sm font-medium text-[var(--muted-foreground)]">Lead</th>
                      <th className="text-left px-4 py-3 text-sm font-medium text-[var(--muted-foreground)]">Pipeline / Estágio</th>
                      <th className="text-left px-4 py-3 text-sm font-medium text-[var(--muted-foreground)]">Status</th>
                      <th className="text-left px-4 py-3 text-sm font-medium text-[var(--muted-foreground)]">Data</th>
                      <th className="text-right px-4 py-3 text-sm font-medium text-[var(--muted-foreground)]">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredLeads.map((lead) => {
                      const pipeline = pipelineMap.get(lead.pipeline_id || '')
                      const stage = stageMap.get(lead.stage_id || '')
                      const availableStages = stages.filter(s => s.pipeline_id === lead.pipeline_id)

                      return (
                        <tr key={lead.id} className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--accent)]/50 transition-colors">
                          <td className="px-4 py-3">
                            <Link 
                              href={`/leads/${lead.id}`}
                              className="font-medium text-[var(--foreground)] hover:text-[var(--primary)] hover:underline"
                            >
                              {lead.title}
                            </Link>
                          </td>
                          <td className="px-4 py-3">
                            <span className="text-sm text-[var(--muted-foreground)]">
                              {pipeline?.name || '—'} / {stage?.name || '—'}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            {getStatusBadge(lead.status)}
                          </td>
                          <td className="px-4 py-3 text-sm text-[var(--muted-foreground)]">
                            <ClientDate value={lead.created_at} />
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center justify-end gap-2">
                              <Link href={`/leads/${lead.id}`}>
                                <Button variant="ghost" size="sm">
                                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                                  </svg>
                                </Button>
                              </Link>

                              {lead.status === 'open' && lead.pipeline_id && availableStages.length > 1 && (
                                <select
                                  value={lead.stage_id || ''}
                                  onChange={(e) => handleMoveStage(lead.id, lead.stage_id || '', e.target.value, lead.pipeline_id!)}
                                  disabled={isPending}
                                  className="h-8 rounded-[var(--radius)] border border-[var(--input)] bg-[var(--background)] px-2 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] disabled:opacity-50"
                                >
                                  {availableStages.map(s => (
                                    <option key={s.id} value={s.id}>{s.name}</option>
                                  ))}
                                </select>
                              )}

                              {lead.status === 'open' && (
                                <>
                                  <Button 
                                    variant="ghost" 
                                    size="sm" 
                                    disabled={isPending}
                                    onClick={() => handleFinalize(lead.id, 'won')}
                                    className="text-[var(--success)] hover:text-[var(--success)] hover:bg-[var(--success)]/10"
                                  >
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                    </svg>
                                  </Button>
                                  <Button 
                                    variant="ghost" 
                                    size="sm"
                                    disabled={isPending}
                                    onClick={() => handleFinalize(lead.id, 'lost')}
                                    className="text-[var(--destructive)] hover:text-[var(--destructive)] hover:bg-[var(--destructive)]/10"
                                  >
                                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                  </Button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          </div>

          <div className="md:hidden space-y-3">
            {filteredLeads.map((lead) => {
              const pipeline = pipelineMap.get(lead.pipeline_id || '')
              const stage = stageMap.get(lead.stage_id || '')
              const availableStages = stages.filter(s => s.pipeline_id === lead.pipeline_id)

              return (
                <Card key={lead.id} className="overflow-hidden">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <Link 
                        href={`/leads/${lead.id}`}
                        className="flex-1 min-w-0"
                      >
                        <p className="font-medium text-[var(--foreground)] hover:text-[var(--primary)] truncate">
                          {lead.title}
                        </p>
                        <p className="text-xs text-[var(--muted-foreground)] mt-1">
                          {pipeline?.name} / {stage?.name}
                        </p>
                        <p className="text-xs text-[var(--muted-foreground)] mt-0.5">
                          <ClientDate value={lead.created_at} />
                        </p>
                      </Link>
                      <div className="flex-shrink-0">
                        {getStatusBadge(lead.status)}
                      </div>
                    </div>

                    {lead.status === 'open' && (
                      <div className="flex gap-2 mt-3 pt-3 border-t border-[var(--border)]">
                        {lead.pipeline_id && availableStages.length > 1 && (
                          <select
                            value={lead.stage_id || ''}
                            onChange={(e) => handleMoveStage(lead.id, lead.stage_id || '', e.target.value, lead.pipeline_id!)}
                            disabled={isPending}
                            className="flex-1 h-9 rounded-[var(--radius)] border border-[var(--input)] bg-[var(--background)] px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] disabled:opacity-50"
                          >
                            {availableStages.map(s => (
                              <option key={s.id} value={s.id}>{s.name}</option>
                            ))}
                          </select>
                        )}
                        <Button 
                          size="sm" 
                          disabled={isPending}
                          onClick={() => handleFinalize(lead.id, 'won')}
                          className="bg-[var(--success)] hover:bg-[var(--success)]/90"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                        </Button>
                        <Button 
                          variant="destructive" 
                          size="sm"
                          disabled={isPending}
                          onClick={() => handleFinalize(lead.id, 'lost')}
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </Button>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </>
      ) : (
        <EmptyState
          title={hasActiveFilters ? "Nenhum lead encontrado" : "Sem leads ainda"}
          description={hasActiveFilters ? "Tente ajustar os filtros de busca." : "Crie seu primeiro lead usando o formulário acima."}
          icon={hasActiveFilters ? emptyStateIcons.search : emptyStateIcons.leads}
          action={hasActiveFilters ? (
            <Button variant="outline" onClick={clearFilters}>
              Limpar filtros
            </Button>
          ) : undefined}
        />
      )}
    </div>
  )
}
