'use client'

import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useMemo, useState } from 'react'
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

type AutomationSettingRow = {
  key?: string | null
  enabled?: boolean | null
  id?: string | null
}

interface AutomationsClientProps {
  settings: any[]
}

export function AutomationsClient({ settings }: AutomationsClientProps) {
  const router = useRouter()
  const { success } = useToast()

  // Fonte de verdade do "catálogo" (UI): nome/descrição não dependem do banco
  const defaultMap: Record<string, { name: string; description: string }> = useMemo(
    () => ({
      lead_created_whatsapp: {
        name: 'WhatsApp inicial (lead criado)',
        description: 'Envia tarefa de WhatsApp logo após criação do lead.',
      },
      no_action_24h: {
        name: 'Follow-up 24h sem ação',
        description: 'Cria tarefa se lead ficar sem ações em 24 horas.',
      },
      stale_3d: {
        name: 'Retomada 3 dias parado',
        description: 'Retoma contato em leads sem movimentação por 3 dias.',
      },
      proposal_stage: {
        name: 'Tarefa em fase de proposta',
        description: 'Gera tarefa quando lead é movimentado para etapa de proposta.',
      },
    }),
    []
  )

  const buildAutomations = useCallback(
    (rowsAny: any[]): Automation[] => {
      const rows = (Array.isArray(rowsAny) ? rowsAny : []) as AutomationSettingRow[]
      const enabledByKey = new Map<string, boolean>()

      for (const r of rows) {
        const k = (r?.key ?? '') as string
        if (k) enabledByKey.set(k, Boolean(r.enabled))
      }

      return Object.keys(defaultMap).map((key) => ({
        id: key,
        name: defaultMap[key].name,
        description: defaultMap[key].description,
        is_active: enabledByKey.get(key) ?? false,
        created_at: new Date().toISOString(),
      }))
    },
    [defaultMap]
  )

  const [automations, setAutomations] = useState<Automation[]>(() => buildAutomations(settings))

  // Se o server mandar settings depois (ou mudar), re-hidrata a lista
  useEffect(() => {
    setAutomations(buildAutomations(settings))
  }, [settings, buildAutomations])

  const handleSignOut = useCallback(async () => {
    await supabase.auth.signOut()
    success('Você saiu da conta.')
    router.push('/')
  }, [router, success])

  const toggleAutomation = async (automationId: string, isActive: boolean) => {
    try {
      const nextEnabled = !isActive

      // Persistência confiável: cria se não existir, atualiza se existir
      const { error } = await supabase
        .from('automation_settings')
        .upsert({ key: automationId, enabled: nextEnabled }, { onConflict: 'key' })

      if (error) throw error

      setAutomations((prev) =>
        prev.map((auto) => (auto.id === automationId ? { ...auto, is_active: nextEnabled } : auto))
      )

      success(`Automação ${nextEnabled ? 'ativada' : 'desativada'} com sucesso!`)
    } catch (err) {
      console.error('Error toggling automation:', err)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Automações</h1>
        {/* Se quiser usar o signout aqui depois:
        <Button variant="secondary" size="sm" onClick={handleSignOut}>Sair</Button>
        */}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Automações Disponíveis</CardTitle>
        </CardHeader>
        <CardContent>
          {automations.length === 0 ? (
            <p className="text-[var(--muted-foreground)]">Nenhuma automação configurada ainda.</p>
          ) : (
            <div className="space-y-4">
              {automations.map((automation) => (
                <div
                  key={automation.id}
                  className="flex items-center justify-between p-4 border border-[var(--border)] rounded-[var(--radius)]"
                >
                  <div className="flex-1">
                    <h3 className="font-medium text-[var(--foreground)]">{automation.name}</h3>
                    {automation.description && (
                      <p className="text-sm text-[var(--muted-foreground)] mt-1">
                        {automation.description}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-3">
                    <Badge variant={automation.is_active ? 'default' : 'secondary'}>
                      {automation.is_active ? 'Ativa' : 'Inativa'}
                    </Badge>

                    <Button
                      onClick={() => toggleAutomation(automation.id, automation.is_active)}
                      variant={automation.is_active ? 'destructive' : 'default'}
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
