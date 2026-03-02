'use client'

import { useTransition } from 'react'

import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'

import { confirmDealReceiptAction, markBrokerCommissionPaidAction } from './actions'

type Props = {
  dealId: string
  canManage: boolean
  snapshotStatus: 'waiting_receipt' | 'payable' | 'paid'
}

export default function DealFinancialActionsClient({ dealId, canManage, snapshotStatus }: Props) {
  const { success, error } = useToast()
  const [isPending, startTransition] = useTransition()

  const canConfirmReceipt = canManage && snapshotStatus === 'waiting_receipt'
  const canMarkPaid = canManage && snapshotStatus === 'payable'

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        variant="outline"
        disabled={!canConfirmReceipt || isPending}
        onClick={() => {
          startTransition(async () => {
            const result = await confirmDealReceiptAction({ dealId })
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
        disabled={!canMarkPaid || isPending}
        onClick={() => {
          startTransition(async () => {
            const result = await markBrokerCommissionPaidAction({ dealId })
            if (!result.ok) {
              error(result.error)
              return
            }
            success(result.message)
          })
        }}
      >
        {isPending && canMarkPaid ? 'Processando...' : 'Marcar comissão paga'}
      </Button>
    </div>
  )
}
