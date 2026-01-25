'use client'

import { useRouter } from 'next/navigation'
import { useCallback, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { useToast } from '@/components/ui/Toast'
import Link from 'next/link'
import { completeCampaignTask } from './actions'

interface Profile {
  id: string
  full_name: string | null
}

interface Lead {
  id: string
  title: string
  status: string
  stage_id: string | null
  assigned_to: string | null
  created_at: string
}

interface Task {
  id: string
  lead_id: string
  title: string
  type: string
  due_at: string
  status: string
  assigned_to: string
}

interface CampaignTask {
  id: string
  property_id: string
  title: string
  due_date: string
  done_at: string | null
}

interface Property {
  title: string | null
  city: string | null
  neighborhood: string | null
}


interface DashboardData {
  totalLeads: number
  leadsWithoutAction: Lead[]
  leadsWithoutActionCount: number
  overdueLeads: Lead[]
  overdueLeadsCount: number
  upcomingTasksCount: number
  todayTasks: Task[]
  wonCount: number
  lostCount: number
  leads: Lead[]
  campaignMetrics: {
    tasksTotal: number
    doneTotal: number
    pending: number
    overdue: number
    dueToday: number
    dueWeek: number
    pct: number
  }
  upcomingCampaignTasks: CampaignTask[]
  propertyMap: Record<string, Property>
}

interface DashboardClientProps {
  isAdmin: boolean
  profiles: Profile[]
  selectedBroker?: string
  data: DashboardData
}

const taskTypeLabels: Record<string, string> = {
  call: 'Ligação',
  whatsapp: 'WhatsApp',
  visit: 'Visita',
  proposal: 'Proposta',
  email: 'E-mail',
  other: 'Outro',
}

function ymdToBR(dateStr: string) {
  if (!dateStr) return '—'
  const [year, month, day] = dateStr.split('-')
  return `${day}/${month}/${year}`
}

function formatTime(dateStr: string) {
  const date = new Date(dateStr)
  return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

export function DashboardClient({ isAdmin, profiles, selectedBroker, data }: DashboardClientProps) {
  const router = useRouter()
  const { success, error } = useToast()
  const [completingId, setCompletingId] = useState<string | null>(null)

  const handleSignOut = useCallback(async () => {
    await supabase.auth.signOut()
    success('Você saiu da conta.')
    router.push('/')
  }, [router, success])

  const handleBrokerChange = (brokerId: string) => {
    if (brokerId === 'all') {
      router.push('/dashboard')
    } else {
      router.push(`/dashboard?broker=${brokerId}`)
    }
  }

  const handleComplete = useCallback(async (taskId: string) => {
    if (completingId === taskId) return
    setCompletingId(taskId)
    try {
      await completeCampaignTask(taskId)
      success('Tarefa concluída.')
      router.refresh()
    } catch {
      error('Não foi possível concluir a tarefa.')
    } finally {
      setCompletingId((current) => (current === taskId ? null : current))
    }
  }, [completingId, error, router, success])

  return (
    <div className="space-y-6">
      {isAdmin && profiles.length > 0 && (
        <div className="flex items-center gap-3">
          <label className="text-sm font-medium text-[var(--muted-foreground)]">Filtrar por corretor:</label>
          <select
            value={selectedBroker || 'all'}
            onChange={(e) => handleBrokerChange(e.target.value)}
            className="px-3 py-2 text-sm border border-[var(--border)] rounded-[var(--radius)] bg-[var(--card)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
          >
            <option value="all">Todos</option>
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>{p.full_name || p.id.slice(0, 8)}</option>
            ))}
          </select>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-[var(--muted-foreground)]">Leads Totais</p>
                <p className="text-3xl font-bold text-[var(--foreground)]">{data.totalLeads}</p>
              </div>
              <div className="w-12 h-12 rounded-full bg-[var(--secondary)] flex items-center justify-center">
                <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-[var(--muted-foreground)]">Sem Ação</p>
                <p className="text-3xl font-bold text-[var(--warning)]">{data.leadsWithoutActionCount}</p>
              </div>
              <div className="w-12 h-12 rounded-full bg-[var(--warning)] flex items-center justify-center">
                <svg className="w-6 h-6 text-[var(--warning-foreground)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-[var(--muted-foreground)]">Atrasados</p>
                <p className="text-3xl font-bold text-[var(--destructive)]">{data.overdueLeadsCount}</p>
              </div>
              <div className="w-12 h-12 rounded-full bg-[var(--destructive)] flex items-center justify-center">
                <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-[var(--muted-foreground)]">Próximas 24h</p>
                <p className="text-3xl font-bold text-[var(--info)]">{data.upcomingTasksCount}</p>
              </div>
              <div className="w-12 h-12 rounded-full bg-[var(--info)] flex items-center justify-center">
                <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Campanhas Section */}
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-[var(--foreground)]">Campanhas</h2>
        <Link
          href="/campaigns"
          className="inline-flex items-center gap-2 px-4 py-2 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-[var(--radius)] hover:bg-[var(--primary)]/90 transition-colors text-sm font-medium"
        >
          Ver Todas
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </Link>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4 mb-8">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-[var(--muted-foreground)]">Total</p>
                <p className="text-3xl font-bold text-[var(--foreground)]">{data.campaignMetrics.tasksTotal}</p>
              </div>
              <div className="w-12 h-12 rounded-full bg-[var(--primary)] flex items-center justify-center">
                <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-[var(--muted-foreground)]">Concluídas</p>
                <p className="text-3xl font-bold text-[var(--success)]">{data.campaignMetrics.doneTotal}</p>
              </div>
              <div className="w-12 h-12 rounded-full bg-[var(--success)] flex items-center justify-center">
                <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-[var(--muted-foreground)]">Pendentes</p>
                <p className="text-3xl font-bold text-[var(--warning)]">{data.campaignMetrics.pending}</p>
              </div>
              <div className="w-12 h-12 rounded-full bg-[var(--warning)] flex items-center justify-center">
                <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-[var(--muted-foreground)]">Atrasadas</p>
                <p className="text-3xl font-bold text-[var(--destructive)]">{data.campaignMetrics.overdue}</p>
              </div>
              <div className="w-12 h-12 rounded-full bg-[var(--destructive)] flex items-center justify-center">
                <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-[var(--muted-foreground)]">Hoje</p>
                <p className="text-3xl font-bold text-[var(--info)]">{data.campaignMetrics.dueToday}</p>
              </div>
              <div className="w-12 h-12 rounded-full bg-[var(--info)] flex items-center justify-center">
                <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-[var(--muted-foreground)]">Esta Semana</p>
                <p className="text-3xl font-bold text-[var(--primary)]">{data.campaignMetrics.dueWeek}</p>
              </div>
              <div className="w-12 h-12 rounded-full bg-[var(--primary)] flex items-center justify-center">
                <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-[var(--muted-foreground)]">Execução</p>
                <p className="text-3xl font-bold text-[var(--foreground)]">{data.campaignMetrics.pct}%</p>
              </div>
              <div className="w-12 h-12 rounded-full bg-[var(--accent)] flex items-center justify-center">
                <svg className="w-6 h-6 text-[var(--foreground)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                </svg>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Próximas tarefas de campanha */}
      <div className="mt-4 rounded-3xl border border-black/10 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-extrabold text-black/90">Próximas tarefas</div>
            <div className="mt-1 text-sm text-black/60">Pendências mais próximas por vencimento.</div>
          </div>
          <a
            href="/campaigns"
            className="rounded-xl border border-black/10 bg-white px-3 py-2 text-sm text-black/80 hover:bg-black/5"
          >
            Ver tudo
          </a>
        </div>

        <div className="mt-3 space-y-2">
          {data.upcomingCampaignTasks.length === 0 ? (
            <p className="text-sm text-black/60">Sem tarefas pendentes.</p>
          ) : (
            data.upcomingCampaignTasks.map((task) => {
              const property = data.propertyMap[task.property_id]
              const propertyName = property ? property.title : `Imóvel ${task.property_id.slice(0, 6)}`
              const location = property ? `${property.neighborhood} • ${property.city}` : ''
              return (
                <div key={task.id} className="flex items-center justify-between p-3 rounded-xl border border-black/10 bg-white hover:bg-black/5 transition-colors">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-black truncate">{task.title}</div>
                    <div className="text-xs text-black/60">{ymdToBR(task.due_date)}</div>
                    <div className="text-xs text-black/60 truncate">{propertyName} • {location}</div>
                  </div>
                  <div className="ml-3 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleComplete(task.id)}
                      disabled={completingId === task.id}
                      className="px-3 py-1 text-xs rounded-lg border border-black/10 bg-white text-black/80 hover:bg-black/5 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                      {completingId === task.id ? 'Concluindo...' : 'Concluir'}
                    </button>
                    <a
                      href={`/campaigns/${task.property_id}`}
                      className="px-3 py-1 text-xs bg-black text-white rounded-lg hover:bg-black/80 transition-colors"
                    >
                      Abrir
                    </a>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>

      {(data.wonCount > 0 || data.lostCount > 0) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-[var(--muted-foreground)]">Compraram</p>
                  <p className="text-3xl font-bold text-[var(--success)]">{data.wonCount}</p>
                </div>
                <div className="w-12 h-12 rounded-full bg-[var(--success)] flex items-center justify-center">
                  <svg className="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-[var(--muted-foreground)]">Não Compraram</p>
                  <p className="text-3xl font-bold text-[var(--muted-foreground)]">{data.lostCount}</p>
                </div>
                <div className="w-12 h-12 rounded-full bg-[var(--muted)] flex items-center justify-center">
                  <svg className="w-6 h-6 text-[var(--muted-foreground)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <svg className="w-5 h-5 text-[var(--info)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              Ações de Hoje
            </CardTitle>
          </CardHeader>
          <CardContent>
            {data.todayTasks.length === 0 ? (
              <p className="text-sm text-[var(--muted-foreground)]">Nenhuma ação para hoje</p>
            ) : (
              <div className="space-y-3">
                {data.todayTasks.map((task) => {
                  const lead = data.leads.find(l => l.id === task.lead_id)
                  return (
                    <div key={task.id} className="flex items-center justify-between p-3 rounded-[var(--radius)] bg-[var(--muted)] hover:bg-[var(--accent)] transition-colors">
                      <div className="min-w-0 flex-1">
                        <Link href={`/leads/${task.lead_id}`} className="text-sm font-medium text-[var(--foreground)] hover:text-[var(--primary)] truncate block">
                          {lead?.title || 'Lead'}
                        </Link>
                        <p className="text-xs text-[var(--muted-foreground)]">{task.title}</p>
                      </div>
                      <div className="flex items-center gap-2 ml-2">
                        <Badge variant="outline" className="text-xs">{taskTypeLabels[task.type] || task.type}</Badge>
                        <span className="text-xs text-[var(--muted-foreground)]">{formatTime(task.due_at)}</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <svg className="w-5 h-5 text-[var(--warning)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Leads Sem Ação
            </CardTitle>
          </CardHeader>
          <CardContent>
            {data.leadsWithoutAction.length === 0 ? (
              <p className="text-sm text-[var(--muted-foreground)]">Todos os leads têm ações</p>
            ) : (
              <div className="space-y-2">
                {data.leadsWithoutAction.map((lead) => (
                  <Link
                    key={lead.id}
                    href={`/leads/${lead.id}`}
                    className="flex items-center justify-between p-3 rounded-[var(--radius)] bg-[var(--muted)] hover:bg-[var(--accent)] transition-colors"
                  >
                    <span className="text-sm font-medium text-[var(--foreground)] truncate">{lead.title}</span>
                    <Badge variant="warning" className="text-xs ml-2 shrink-0">Sem ação</Badge>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <svg className="w-5 h-5 text-[var(--destructive)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Leads Atrasados
            </CardTitle>
          </CardHeader>
          <CardContent>
            {data.overdueLeads.length === 0 ? (
              <p className="text-sm text-[var(--muted-foreground)]">Nenhum lead atrasado</p>
            ) : (
              <div className="space-y-2">
                {data.overdueLeads.map((lead) => (
                  <Link
                    key={lead.id}
                    href={`/leads/${lead.id}`}
                    className="flex items-center justify-between p-3 rounded-[var(--radius)] bg-[var(--muted)] hover:bg-[var(--accent)] transition-colors"
                  >
                    <span className="text-sm font-medium text-[var(--foreground)] truncate">{lead.title}</span>
                    <Badge variant="destructive" className="text-xs ml-2 shrink-0">Atrasado</Badge>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
