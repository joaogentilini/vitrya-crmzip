'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { useToast } from '@/components/ui/Toast'
import { instantiateCampaignTemplate } from '../instantiateActions'

type TemplateOption = {
  id: string
  name: string
}

export default function ActivateCampaignCard({
  propertyId,
  templates,
}: {
  propertyId: string
  templates: TemplateOption[]
}) {
  const router = useRouter()
  const { success, error } = useToast()
  const [selectedId, setSelectedId] = useState(templates[0]?.id ?? '')
  const [isPending, startTransition] = useTransition()

  const handleActivate = () => {
    if (!selectedId) {
      error('Selecione um template para gerar as tarefas.')
      return
    }

    startTransition(async () => {
      try {
        const result = await instantiateCampaignTemplate(propertyId, selectedId)
        success(`Campanha gerada com ${result.inserted} tarefas.`)
        router.refresh()
      } catch (err) {
        error(err instanceof Error ? err.message : 'Erro ao gerar campanha.')
      }
    })
  }

  const hasTemplates = templates.length > 0

  return (
    <div className="rounded-3xl border border-black/10 bg-white p-5 shadow-sm">
      <div className="flex flex-col gap-2">
        <div className="text-xs uppercase tracking-wide text-black/50">Campanhas</div>
        <h2 className="text-lg font-semibold text-black/90">Ativar Campanha</h2>
        <p className="text-sm text-black/60">
          Gere automaticamente as tarefas do template para este imóvel.
        </p>
      </div>

      <div className="mt-4 flex flex-col gap-3 md:flex-row md:items-end">
        <div className="flex-1">
          <label className="text-xs font-medium text-black/60">Template ativo</label>
          <select
            className="mt-1 w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm text-black/80"
            value={selectedId}
            onChange={(event) => setSelectedId(event.target.value)}
            disabled={!hasTemplates || isPending}
          >
            {hasTemplates ? (
              templates.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.name}
                </option>
              ))
            ) : (
              <option value="">Nenhum template ativo disponível</option>
            )}
          </select>
        </div>

        <button
          type="button"
          onClick={handleActivate}
          disabled={!hasTemplates || !selectedId || isPending}
          className="rounded-xl bg-black px-4 py-2 text-sm font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isPending ? 'Gerando...' : 'Gerar tarefas'}
        </button>
      </div>
    </div>
  )
}
