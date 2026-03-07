'use client'

import { useTransition } from 'react'

import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'

import {
  confirmRentCycleReceiptAction,
  generateRentCycleAction,
  markRentCycleOwnerPaidAction,
} from '../actions'

type CycleStatus = 'open' | 'received' | 'owner_paid' | 'cancelled'

type Props = {
  dealId: string
  cycleId: string | null
  cycleStatus: CycleStatus | null
  competenceMonth: string
  canManage: boolean
}

export default function RentCycleActionsClient({
  dealId,
  cycleId,
  cycleStatus,
  competenceMonth,
  canManage,
}: Props) {
  const { success, error } = useToast()
  const [isPending, startTransition] = useTransition()

  const canGenerate = canManage && !cycleId
  const canConfirmReceipt = canManage && Boolean(cycleId) && cycleStatus === 'open'
  const canMarkOwnerPaid = canManage && Boolean(cycleId) && cycleStatus === 'received'

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        variant="outline"
        disabled={!canGenerate || isPending}
        onClick={() => {
          startTransition(async () => {
            const result = await generateRentCycleAction({ dealId, competenceMonth })
            if (!result.ok) {
              error(result.error)
              return
            }
            success(result.message)
          })
        }}
      >
        {isPending && canGenerate ? 'Gerando...' : 'Gerar ciclo'}
      </Button>

      <Button
        variant="outline"
        disabled={!canConfirmReceipt || isPending}
        onClick={() => {
          if (!cycleId) return
          startTransition(async () => {
            const result = await confirmRentCycleReceiptAction({ cycleId })
            if (!result.ok) {
              error(result.error)
              return
            }
            success(result.message)
          })
        }}
      >
        {isPending && canConfirmReceipt ? 'Confirmando...' : 'Confirmar recebimento'}
      </Button>

      <Button
        disabled={!canMarkOwnerPaid || isPending}
        onClick={() => {
          if (!cycleId) return
          startTransition(async () => {
            const result = await markRentCycleOwnerPaidAction({ cycleId })
            if (!result.ok) {
              error(result.error)
              return
            }
            success(result.message)
          })
        }}
      >
        {isPending && canMarkOwnerPaid ? 'Processando...' : 'Marcar repasse pago'}
      </Button>
    </div>
  )
}
