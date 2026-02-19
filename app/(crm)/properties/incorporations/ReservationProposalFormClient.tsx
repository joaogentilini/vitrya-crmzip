'use client'

import { useRouter } from 'next/navigation'
import { useRef, useState, useTransition } from 'react'

import { Button } from '@/components/ui/Button'

import { createIncorporationProposalAction } from './actions'

type Feedback =
  | { kind: 'success'; message: string }
  | { kind: 'error'; message: string }
  | null

export default function ReservationProposalFormClient({
  incorporationId,
  unitId,
  reservationId,
  defaultLeadId,
  defaultClientName,
  defaultClientPhone,
  defaultClientEmail,
}: {
  incorporationId: string
  unitId: string
  reservationId: string
  defaultLeadId?: string | null
  defaultClientName?: string | null
  defaultClientPhone?: string | null
  defaultClientEmail?: string | null
}) {
  const router = useRouter()
  const [feedback, setFeedback] = useState<Feedback>(null)
  const [isPending, startTransition] = useTransition()
  const formRef = useRef<HTMLFormElement | null>(null)

  function submit(mode: 'draft' | 'send', formData: FormData) {
    formData.set('submitMode', mode)
    startTransition(async () => {
      setFeedback(null)
      const result = await createIncorporationProposalAction(formData)
      if (!result.success) {
        setFeedback({ kind: 'error', message: result.error })
        return
      }

      const deliverySuffix =
        result.data.status === 'sent'
          ? ` Email: ${result.data.emailDeliveryStatus || 'pending'} | WhatsApp: ${result.data.whatsappDeliveryStatus || 'pending'}`
          : ''
      const messageSuffix = result.data.deliveryMessage ? ` ${result.data.deliveryMessage}` : ''

      setFeedback({
        kind: 'success',
        message:
          result.data.status === 'sent'
            ? `Proposta enviada para incorporadora.${deliverySuffix}${messageSuffix}`
            : 'Proposta salva como rascunho.',
      })
      router.refresh()
    })
  }

  return (
    <form
      ref={formRef}
      className="grid gap-2 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--muted)]/20 p-3"
      onSubmit={(event) => {
        event.preventDefault()
        const formData = new FormData(event.currentTarget)
        submit('draft', formData)
      }}
    >
      <input type="hidden" name="incorporationId" value={incorporationId} />
      <input type="hidden" name="unitId" value={unitId} />
      <input type="hidden" name="reservationId" value={reservationId} />
      <input type="hidden" name="leadId" value={defaultLeadId || ''} />

      <p className="text-xs font-semibold text-[var(--foreground)]">Proposta para incorporadora</p>

      <div className="grid gap-2 sm:grid-cols-2">
        <input
          name="clientName"
          defaultValue={defaultClientName || ''}
          required
          placeholder="Nome do cliente"
          className="h-8 rounded-[var(--radius)] border border-[var(--border)] bg-white px-2 text-xs text-[var(--foreground)]"
        />
        <input
          name="offerValue"
          type="number"
          min="0"
          step="0.01"
          required
          placeholder="Valor da proposta"
          className="h-8 rounded-[var(--radius)] border border-[var(--border)] bg-white px-2 text-xs text-[var(--foreground)]"
        />
        <input
          name="clientPhone"
          defaultValue={defaultClientPhone || ''}
          placeholder="Telefone do cliente"
          className="h-8 rounded-[var(--radius)] border border-[var(--border)] bg-white px-2 text-xs text-[var(--foreground)]"
        />
        <input
          name="clientEmail"
          type="email"
          defaultValue={defaultClientEmail || ''}
          placeholder="Email do cliente"
          className="h-8 rounded-[var(--radius)] border border-[var(--border)] bg-white px-2 text-xs text-[var(--foreground)]"
        />
        <input
          name="downPayment"
          type="number"
          min="0"
          step="0.01"
          placeholder="Entrada"
          className="h-8 rounded-[var(--radius)] border border-[var(--border)] bg-white px-2 text-xs text-[var(--foreground)]"
        />
        <select
          name="financingType"
          className="h-8 rounded-[var(--radius)] border border-[var(--border)] bg-white px-2 text-xs text-[var(--foreground)]"
          defaultValue=""
        >
          <option value="">Tipo de pagamento</option>
          <option value="cash">A vista</option>
          <option value="bank_financing">Financiamento bancario</option>
          <option value="direct_with_developer">Direto com incorporadora</option>
          <option value="mixed">Misto</option>
        </select>
      </div>

      <textarea
        name="paymentTerms"
        rows={2}
        placeholder="Condicoes de pagamento"
        className="rounded-[var(--radius)] border border-[var(--border)] bg-white px-2 py-1 text-xs text-[var(--foreground)]"
      />
      <textarea
        name="proposalText"
        rows={2}
        placeholder="Observacoes da proposta"
        className="rounded-[var(--radius)] border border-[var(--border)] bg-white px-2 py-1 text-xs text-[var(--foreground)]"
      />
      <input
        name="recipientEmail"
        type="email"
        placeholder="Email da incorporadora (destino)"
        className="h-8 rounded-[var(--radius)] border border-[var(--border)] bg-white px-2 text-xs text-[var(--foreground)]"
      />
      <input
        name="recipientWhatsApp"
        placeholder="WhatsApp destino (+55...)"
        className="h-8 rounded-[var(--radius)] border border-[var(--border)] bg-white px-2 text-xs text-[var(--foreground)]"
      />

      {feedback ? (
        <p
          className={`rounded-[var(--radius)] border px-2 py-1 text-xs ${
            feedback.kind === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
              : 'border-rose-200 bg-rose-50 text-rose-700'
          }`}
        >
          {feedback.message}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={isPending} className="h-8 px-2 text-xs">
          {isPending ? 'Salvando...' : 'Salvar rascunho'}
        </Button>
        <Button
          type="button"
          disabled={isPending}
          className="h-8 px-2 text-xs bg-emerald-600 hover:bg-emerald-700"
          onClick={() => {
            const form = formRef.current
            if (!form) return
            if (!form.reportValidity()) return
            const formData = new FormData(form)
            submit('send', formData)
          }}
        >
          {isPending ? 'Enviando...' : 'Enviar para incorporadora'}
        </Button>
      </div>
    </form>
  )
}
