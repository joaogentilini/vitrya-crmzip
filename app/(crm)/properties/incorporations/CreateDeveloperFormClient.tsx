'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

import { Button } from '@/components/ui/Button'

import { createDeveloperAction } from './actions'

type Feedback =
  | { kind: 'success'; message: string }
  | { kind: 'error'; message: string }
  | null

export default function CreateDeveloperFormClient() {
  const router = useRouter()
  const [feedback, setFeedback] = useState<Feedback>(null)
  const [isPending, startTransition] = useTransition()

  return (
    <form
      className="grid gap-3"
      onSubmit={(event) => {
        event.preventDefault()
        const formElement = event.currentTarget
        const formData = new FormData(formElement)

        startTransition(async () => {
          setFeedback(null)
          const result = await createDeveloperAction(formData)
          if (!result.success) {
            setFeedback({ kind: 'error', message: result.error })
            return
          }

          setFeedback({ kind: 'success', message: 'Construtora cadastrada com sucesso.' })
          formElement.reset()
          router.refresh()
        })
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1 text-xs text-[var(--muted-foreground)]">
          <span>Nome fantasia *</span>
          <input
            name="name"
            required
            className="h-9 rounded-[var(--radius)] border border-[var(--border)] bg-white px-3 text-sm text-[var(--foreground)]"
            placeholder="Ex: Vitrya Desenvolvimento"
          />
        </label>
        <label className="grid gap-1 text-xs text-[var(--muted-foreground)]">
          <span>Razao social</span>
          <input
            name="legalName"
            className="h-9 rounded-[var(--radius)] border border-[var(--border)] bg-white px-3 text-sm text-[var(--foreground)]"
            placeholder="Ex: Vitrya Empreendimentos LTDA"
          />
        </label>
        <label className="grid gap-1 text-xs text-[var(--muted-foreground)]">
          <span>CNPJ</span>
          <input
            name="cnpj"
            className="h-9 rounded-[var(--radius)] border border-[var(--border)] bg-white px-3 text-sm text-[var(--foreground)]"
            placeholder="Somente numeros ou formatado"
          />
        </label>
        <label className="grid gap-1 text-xs text-[var(--muted-foreground)]">
          <span>Comissão venda da construtora (%) *</span>
          <input
            name="commissionPercent"
            type="number"
            min="0"
            max="100"
            step="0.01"
            defaultValue="5.00"
            required
            className="h-9 rounded-[var(--radius)] border border-[var(--border)] bg-white px-3 text-sm text-[var(--foreground)]"
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
          <span>Website</span>
          <input
            name="websiteUrl"
            className="h-9 rounded-[var(--radius)] border border-[var(--border)] bg-white px-3 text-sm text-[var(--foreground)]"
            placeholder="https://..."
          />
        </label>
        <label className="grid gap-1 text-xs text-[var(--muted-foreground)] sm:col-span-2">
          <span>Descrição</span>
          <textarea
            name="description"
            rows={3}
            className="rounded-[var(--radius)] border border-[var(--border)] bg-white px-3 py-2 text-sm text-[var(--foreground)]"
            placeholder="Resumo da construtora"
          />
        </label>
        <label className="grid gap-1 text-xs text-[var(--muted-foreground)]">
          <span>Logo (imagem)</span>
          <input
            type="file"
            name="logoFile"
            accept="image/png,image/jpeg,image/webp,image/avif"
            className="h-9 rounded-[var(--radius)] border border-[var(--border)] bg-white px-2 text-xs text-[var(--foreground)] file:mr-2 file:rounded file:border-0 file:bg-[var(--muted)] file:px-2 file:py-1"
          />
        </label>
        <label className="grid gap-1 text-xs text-[var(--muted-foreground)]">
          <span>Capa (imagem)</span>
          <input
            type="file"
            name="coverFile"
            accept="image/png,image/jpeg,image/webp,image/avif"
            className="h-9 rounded-[var(--radius)] border border-[var(--border)] bg-white px-2 text-xs text-[var(--foreground)] file:mr-2 file:rounded file:border-0 file:bg-[var(--muted)] file:px-2 file:py-1"
          />
        </label>
      </div>

      <label className="inline-flex items-center gap-2 text-sm text-[var(--foreground)]">
        <input type="checkbox" name="isActive" defaultChecked className="h-4 w-4 rounded border-[var(--border)]" />
        <span>Construtora ativa</span>
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
        <Button type="submit" disabled={isPending}>
          {isPending ? 'Salvando...' : 'Cadastrar construtora (PJ)'}
        </Button>
      </div>
    </form>
  )
}
