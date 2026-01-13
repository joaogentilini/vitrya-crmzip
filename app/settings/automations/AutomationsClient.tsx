'use client'

import { useRouter } from 'next/navigation'
import { useCallback, useState, useTransition } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { AppShell } from '@/components/layout/AppShell'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { useToast } from '@/components/ui/Toast'
import { updateAutomationSetting, runAutomations } from './actions'

interface AutomationSetting {
  id: string
  key: string
  enabled: boolean
  created_at: string
  updated_at: string
}

interface AutomationsClientProps {
  userEmail?: string | null
  settings: AutomationSetting[]
}

const automationLabels: Record<string, { title: string; description: string }> = {
  'lead_created_whatsapp': {
    title: 'WhatsApp ao criar Lead',
    description: 'Cria automaticamente uma tarefa de WhatsApp 10 minutos após criar um novo lead.'
  },
  'no_action_24h': {
    title: 'Follow-up 24h sem ação',
    description: 'Cria uma tarefa de ligação para leads sem nenhuma tarefa aberta há mais de 24 horas.'
  },
  'stale_3d': {
    title: 'Lead parado 3 dias',
    description: 'Cria uma tarefa de retomada para leads sem movimentação relevante há 3 dias.'
  },
  'proposal_stage': {
    title: 'Envio de Proposta',
    description: 'Cria uma tarefa de proposta quando o lead é movido para uma etapa "Proposta".'
  }
}

export function AutomationsClient({ userEmail, settings }: AutomationsClientProps) {
  const router = useRouter()
  const { success, error: showError } = useToast()
  const [isPending, startTransition] = useTransition()
  const [localSettings, setLocalSettings] = useState(settings)
  const [runResult, setRunResult] = useState<{ totalTasksCreated: number } | null>(null)

  const handleSignOut = useCallback(async () => {
    await supabase.auth.signOut()
    success('Você saiu da conta.')
    router.push('/')
  }, [router, success])

  const handleToggle = (settingId: string, currentEnabled: boolean) => {
    startTransition(async () => {
      try {
        await updateAutomationSetting(settingId, !currentEnabled)
        setLocalSettings(prev => 
          prev.map(s => s.id === settingId ? { ...s, enabled: !currentEnabled } : s)
        )
        success(`Automação ${!currentEnabled ? 'ativada' : 'desativada'}`)
      } catch (err) {
        showError('Erro ao atualizar automação')
      }
    })
  }

  const handleRunAutomations = () => {
    startTransition(async () => {
      try {
        const result = await runAutomations()
        setRunResult(result.summary)
        success(`Automações executadas! ${result.summary.totalTasksCreated} tarefas criadas.`)
        router.refresh()
      } catch (err) {
        showError('Erro ao executar automações')
      }
    })
  }

  return (
    <AppShell
      userEmail={userEmail}
      onSignOut={handleSignOut}
      pageTitle="Automações"
      showNewLeadButton={false}
    >
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-[var(--foreground)]">Cadência Vitrya</h2>
            <p className="text-sm text-[var(--muted-foreground)]">
              Configure as automações de follow-up para seus leads
            </p>
          </div>
          <Button onClick={handleRunAutomations} loading={isPending}>
            Executar Agora
          </Button>
        </div>

        {runResult && (
          <Card className="border-[var(--success)]">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <svg className="w-6 h-6 text-[var(--success)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div>
                  <p className="font-medium text-[var(--foreground)]">Automações executadas com sucesso!</p>
                  <p className="text-sm text-[var(--muted-foreground)]">
                    {runResult.totalTasksCreated} tarefas criadas automaticamente
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="grid gap-4">
          {localSettings.map((setting) => {
            const label = automationLabels[setting.key] || { title: setting.key, description: '' }
            return (
              <Card key={setting.id}>
                <CardContent className="pt-6">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-medium text-[var(--foreground)]">{label.title}</h3>
                        <Badge variant={setting.enabled ? 'success' : 'secondary'}>
                          {setting.enabled ? 'Ativa' : 'Inativa'}
                        </Badge>
                      </div>
                      <p className="text-sm text-[var(--muted-foreground)]">{label.description}</p>
                    </div>
                    <button
                      onClick={() => handleToggle(setting.id, setting.enabled)}
                      disabled={isPending}
                      className={`
                        relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent
                        transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-[var(--ring)] focus:ring-offset-2
                        ${setting.enabled ? 'bg-[var(--primary)]' : 'bg-[var(--muted)]'}
                        disabled:opacity-50 disabled:cursor-not-allowed
                      `}
                      role="switch"
                      aria-checked={setting.enabled}
                    >
                      <span
                        className={`
                          pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0
                          transition duration-200 ease-in-out
                          ${setting.enabled ? 'translate-x-5' : 'translate-x-0'}
                        `}
                      />
                    </button>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Executar via API</CardTitle>
            <CardDescription>
              Para integrar com cron jobs externos, use o endpoint abaixo
            </CardDescription>
          </CardHeader>
          <CardContent>
            <code className="block p-3 bg-[var(--muted)] rounded-[var(--radius)] text-sm font-mono overflow-x-auto">
              POST /api/automations/run
            </code>
            <p className="text-xs text-[var(--muted-foreground)] mt-2">
              Autenticação: Bearer token (AUTOMATIONS_SECRET) ou sessão de admin
            </p>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  )
}
