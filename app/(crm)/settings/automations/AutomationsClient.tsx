'use client'

import { useRouter } from 'next/navigation'
import { useCallback, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'

interface Automation {
  id: string
  name: string
  description: string | null
  is_active: boolean
  created_at: string
}

interface AutomationsClientProps {
  settings: any[]
}

export function AutomationsClient({ settings }: AutomationsClientProps) {
  const router = useRouter()
  const { success } = useToast()

  const defaultMap: Record<string, { name: string; description: string }> = {
    lead_created_whatsapp: { name: 'WhatsApp inicial (lead criado)', description: 'Envia tarefa de WhatsApp logo após criação do lead.' },
    no_action_24h: { name: 'Follow-up 24h sem ação', description: 'Cria tarefa se lead ficar sem ações em 24 horas.' },
    stale_3d: { name: 'Retomada 3 dias parado', description: 'Retoma contato em leads sem movimentação por 3 dias.' },
    proposal_stage: { name: 'Tarefa em fase de proposta', description: 'Gera tarefa quando lead é movimentado para etapa de proposta.' },
  }

  const initial = (settings && settings.length > 0)
    ? (settings as Automation[])
    : Object.keys(defaultMap).map((k: string) => ({
        id: k,
        name: defaultMap[k].name,
        description: defaultMap[k].description,
        is_active: false,
        created_at: new Date().toISOString(),
      }))

  const [automations, setAutomations] = useState<Automation[]>(initial)

  const handleSignOut = useCallback(async () => {
    await supabase.auth.signOut()
    success('Você saiu da conta.')
    router.push('/')
  }, [router, success])

  const toggleAutomation = async (automationId: string, isActive: boolean) => {
    try {
      // persistir em automation_settings quando existir, senão apenas atualizar UI
      const { error } = await supabase
        .from('automation_settings')
        .update({ enabled: !isActive })
        .eq('key', automationId)

      if (error) {
        // fallback: tentar atualizar por id
        const { error: e2 } = await supabase
          .from('automation_settings')
          .update({ enabled: !isActive })
          .eq('id', automationId)

        if (e2) throw e2
      }

      setAutomations(prev => prev.map(auto => 
        auto.id === automationId ? { ...auto, is_active: !isActive } : auto
      ))

      success(`Automação ${!isActive ? 'ativada' : 'desativada'} com sucesso!`)
    } catch (err) {
      console.error('Error toggling automation:', err)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Automações</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Automações Disponíveis</CardTitle>
        </CardHeader>
        <CardContent>
          {automations.length === 0 ? (
            <p className="text-[var(--muted-foreground)]">
              Nenhuma automação configurada ainda.
            </p>
          ) : (
            <div className="space-y-4">
              {automations.map((automation) => (
                <div key={automation.id} className="flex items-center justify-between p-4 border border-[var(--border)] rounded-[var(--radius)]">
                  <div className="flex-1">
                    <h3 className="font-medium text-[var(--foreground)]">{automation.name}</h3>
                    {automation.description && (
                      <p className="text-sm text-[var(--muted-foreground)] mt-1">
                        {automation.description}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge variant={automation.is_active ? "default" : "secondary"}>
                      {automation.is_active ? 'Ativa' : 'Inativa'}
                    </Badge>
                    <Button
                      onClick={() => toggleAutomation(automation.id, automation.is_active)}
                      variant={automation.is_active ? "destructive" : "default"}
                      size="sm"
                    >
                      {automation.is_active ? 'Desativar' : 'Ativar'}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
