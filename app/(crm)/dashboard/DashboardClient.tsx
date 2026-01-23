'use client'

import { useRouter } from 'next/navigation'
import { useCallback } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { useToast } from '@/components/ui/Toast'
import Link from 'next/link'

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

function formatTime(dateStr: string) {
  const date = new Date(dateStr)
  return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

export function DashboardClient({ isAdmin, profiles, selectedBroker, data }: DashboardClientProps) {
  const router = useRouter()
  const { success } = useToast()

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
