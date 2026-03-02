'use server'

import { revalidatePath } from 'next/cache'

import { requireRole } from '@/lib/auth'
import { confirmDealReceipt, markDealBrokerCommissionPaid } from '@/lib/finance/distributions'

type ActionResult = { ok: true; message: string } | { ok: false; error: string }

export async function confirmDealReceiptAction(input: { dealId: string }): Promise<ActionResult> {
  const profile = await requireRole(['admin', 'gestor'])
  const dealId = String(input.dealId || '').trim()
  if (!dealId) return { ok: false, error: 'Deal invalido.' }

  const result = await confirmDealReceipt({
    dealId,
    actorUserId: profile.id,
  })

  if (!result.ok) {
    return { ok: false, error: result.error }
  }

  revalidatePath('/erp/financeiro')
  revalidatePath('/perfil/financeiro')
  return { ok: true, message: 'Recebimento confirmado e comissao liberada para pagamento.' }
}

export async function markBrokerCommissionPaidAction(input: { dealId: string }): Promise<ActionResult> {
  const profile = await requireRole(['admin', 'gestor'])
  const dealId = String(input.dealId || '').trim()
  if (!dealId) return { ok: false, error: 'Deal invalido.' }

  const result = await markDealBrokerCommissionPaid({
    dealId,
    actorUserId: profile.id,
  })

  if (!result.ok) {
    return { ok: false, error: result.error }
  }

  revalidatePath('/erp/financeiro')
  revalidatePath('/perfil/financeiro')
  return { ok: true, message: 'Comissao do corretor marcada como paga.' }
}
