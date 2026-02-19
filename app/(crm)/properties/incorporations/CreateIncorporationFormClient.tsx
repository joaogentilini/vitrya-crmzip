'use client'

import { useRouter } from 'next/navigation'
import { useMemo, useState, useTransition } from 'react'

import { Button } from '@/components/ui/Button'

import { createIncorporationAction } from './actions'

type Feedback =
  | { kind: 'success'; message: string }
  | { kind: 'error'; message: string }
  | null

type DeveloperOption = {
  id: string
  name: string
}

export default function CreateIncorporationFormClient({
  developers,
  defaultDeveloperId,
}: {
  developers: DeveloperOption[]
  defaultDeveloperId?: string
}) {
  const router = useRouter()
  const [feedback, setFeedback] = useState<Feedback>(null)
  const [isPending, startTransition] = useTransition()

  const selectedDefaultDeveloper = useMemo(
    () => developers.find((developer) => developer.id === defaultDeveloperId) || null,
    [defaultDeveloperId, developers]
  )

  return (
    <form
      className="grid gap-3"
      onSubmit={(event) => {
        event.preventDefault()
        const formElement = event.currentTarget
        const formData = new FormData(formElement)

        if (defaultDeveloperId && !formData.get('developerId')) {
          formData.set('developerId', defaultDeveloperId)
        }

        startTransition(async () => {
          setFeedback(null)
          const result = await createIncorporationAction(formData)
          if (!result.success) {
            setFeedback({ kind: 'error', message: result.error })
            return
          }

          setFeedback({ kind: 'success', message: 'Empreendimento criado com sucesso.' })
          router.push(`/properties/incorporations/${result.data.incorporationId}`)
          router.refresh()
        })
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        {defaultDeveloperId ? (
          <>
            <input type="hidden" name="developerId" value={defaultDeveloperId} />
            <div className="grid gap-1 text-xs text-[var(--muted-foreground)] sm:col-span-2">
              <span>Construtora vinculada</span>
              <div className="h-9 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--muted)]/40 px-3 text-sm leading-9 text-[var(--foreground)]">
                {selectedDefaultDeveloper?.name || 'Construtora selecionada'}
              </div>
            </div>
          </>
        ) : (
          <label className="grid gap-1 text-xs text-[var(--muted-foreground)] sm:col-span-2">
            <span>Construtora *</span>
            <select
              name="developerId"
              required
              className="h-9 rounded-[var(--radius)] border border-[var(--border)] bg-white px-3 text-sm text-[var(--foreground)]"
              defaultValue=""
            >
              <option value="" disabled>
                Selecione a construtora
              </option>
              {developers.map((developer) => (
                <option key={developer.id} value={developer.id}>
                  {developer.name}
                </option>
              ))}
            </select>
          </label>
        )}

        <label className="grid gap-1 text-xs text-[var(--muted-foreground)]">
          <span>Nome do empreendimento *</span>
          <input
            name="name"
            required
            className="h-9 rounded-[var(--radius)] border border-[var(--border)] bg-white px-3 text-sm text-[var(--foreground)]"
            placeholder="Ex: Reserva Aurora"
          />
        </label>

        <label className="grid gap-1 text-xs text-[var(--muted-foreground)]">
          <span>Slug (opcional)</span>
          <input
            name="slug"
            className="h-9 rounded-[var(--radius)] border border-[var(--border)] bg-white px-3 text-sm text-[var(--foreground)]"
            placeholder="gerado automaticamente se vazio"
          />
        </label>

        <label className="grid gap-1 text-xs text-[var(--muted-foreground)] sm:col-span-2">
          <span>Headline comercial</span>
          <input
            name="headline"
            className="h-9 rounded-[var(--radius)] border border-[var(--border)] bg-white px-3 text-sm text-[var(--foreground)]"
            placeholder="Texto curto para destaque"
          />
        </label>

        <label className="grid gap-1 text-xs text-[var(--muted-foreground)] sm:col-span-2">
          <span>Descrição</span>
          <textarea
            name="description"
            rows={3}
            className="rounded-[var(--radius)] border border-[var(--border)] bg-white px-3 py-2 text-sm text-[var(--foreground)]"
            placeholder="Resumo do empreendimento"
          />
        </label>

        <label className="grid gap-1 text-xs text-[var(--muted-foreground)]">
          <span>Cidade</span>
          <input
            name="city"
            className="h-9 rounded-[var(--radius)] border border-[var(--border)] bg-white px-3 text-sm text-[var(--foreground)]"
          />
        </label>
        <label className="grid gap-1 text-xs text-[var(--muted-foreground)]">
          <span>Bairro</span>
          <input
            name="neighborhood"
            className="h-9 rounded-[var(--radius)] border border-[var(--border)] bg-white px-3 text-sm text-[var(--foreground)]"
          />
        </label>
        <label className="grid gap-1 text-xs text-[var(--muted-foreground)]">
          <span>Estado</span>
          <input
            name="state"
            maxLength={2}
            className="h-9 rounded-[var(--radius)] border border-[var(--border)] bg-white px-3 text-sm uppercase text-[var(--foreground)]"
            placeholder="UF"
          />
        </label>
        <label className="grid gap-1 text-xs text-[var(--muted-foreground)]">
          <span>CEP</span>
          <input
            name="postalCode"
            className="h-9 rounded-[var(--radius)] border border-[var(--border)] bg-white px-3 text-sm text-[var(--foreground)]"
          />
        </label>
        <label className="grid gap-1 text-xs text-[var(--muted-foreground)] sm:col-span-2">
          <span>Endereco</span>
          <input
            name="address"
            className="h-9 rounded-[var(--radius)] border border-[var(--border)] bg-white px-3 text-sm text-[var(--foreground)]"
          />
        </label>

        <label className="grid gap-1 text-xs text-[var(--muted-foreground)]">
          <span>Status *</span>
          <select
            name="status"
            defaultValue="draft"
            className="h-9 rounded-[var(--radius)] border border-[var(--border)] bg-white px-3 text-sm text-[var(--foreground)]"
          >
            <option value="draft">Rascunho</option>
            <option value="pre_launch">Pre-lancamento</option>
            <option value="launch">Lancamento</option>
            <option value="construction">Em obras</option>
            <option value="delivered">Entregue</option>
            <option value="paused">Pausado</option>
            <option value="archived">Arquivado</option>
          </select>
        </label>
        <div className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--muted)]/30 px-3 py-2 text-xs text-[var(--muted-foreground)]">
          Preço e comissão sao definidos por tipologia/planta e por construtora.
        </div>

        <label className="grid gap-1 text-xs text-[var(--muted-foreground)]">
          <span>Data de lancamento</span>
          <input
            name="launchDate"
            type="date"
            className="h-9 rounded-[var(--radius)] border border-[var(--border)] bg-white px-3 text-sm text-[var(--foreground)]"
          />
        </label>
        <label className="grid gap-1 text-xs text-[var(--muted-foreground)]">
          <span>Data de entrega</span>
          <input
            name="deliveryDate"
            type="date"
            className="h-9 rounded-[var(--radius)] border border-[var(--border)] bg-white px-3 text-sm text-[var(--foreground)]"
          />
        </label>
        <label className="grid gap-1 text-xs text-[var(--muted-foreground)]">
          <span>Numero do RI</span>
          <input
            name="riNumber"
            className="h-9 rounded-[var(--radius)] border border-[var(--border)] bg-white px-3 text-sm text-[var(--foreground)]"
          />
        </label>
        <label className="grid gap-1 text-xs text-[var(--muted-foreground)]">
          <span>Cartorio do RI</span>
          <input
            name="riOffice"
            className="h-9 rounded-[var(--radius)] border border-[var(--border)] bg-white px-3 text-sm text-[var(--foreground)]"
          />
        </label>
      </div>

      <label className="inline-flex items-center gap-2 text-sm text-[var(--foreground)]">
        <input type="checkbox" name="isActive" className="h-4 w-4 rounded border-[var(--border)]" />
        <span>Publicar no portal público</span>
      </label>

      {feedback ? (
        <p
          className={`rounded-[var(--radius)] border px-3 py-2 text-sm ${
            feedback.kind === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
              : 'border-rose-200 bg-rose-50 text-rose-700'
          }`}
        >
          {feedback.message}
        </p>
      ) : null}

      <div className="flex justify-end">
        <Button type="submit" disabled={isPending || developers.length === 0}>
          {isPending ? 'Salvando...' : 'Criar empreendimento'}
        </Button>
      </div>
    </form>
  )
}
