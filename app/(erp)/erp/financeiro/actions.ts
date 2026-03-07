'use server'

import { revalidatePath } from 'next/cache'

import { requireRole } from '@/lib/auth'
import { confirmDealReceipt, markDealBrokerCommissionPaid } from '@/lib/finance/distributions'
import {
  confirmRentCycleReceipt,
  generateDealRentCycle,
  markRentCycleOwnerPaid,
} from '@/lib/finance/rentCycles'

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

export async function generateRentCycleAction(input: {
  dealId: string
  competenceMonth?: string | null
}): Promise<ActionResult> {
  const profile = await requireRole(['admin', 'gestor'])
  const dealId = String(input.dealId || '').trim()
  if (!dealId) return { ok: false, error: 'Deal invalido.' }

  const result = await generateDealRentCycle({
    dealId,
    competenceMonth: input.competenceMonth || null,
    actorUserId: profile.id,
  })

  if (!result.ok) {
    return { ok: false, error: result.error }
  }

  revalidatePath('/erp/financeiro')
  revalidatePath('/erp/financeiro/locacoes')

  if (result.alreadyExists) {
    return { ok: true, message: 'Ciclo mensal ja existente para esta competencia.' }
  }

  return { ok: true, message: 'Ciclo mensal de locacao gerado com sucesso.' }
}

export async function confirmRentCycleReceiptAction(input: { cycleId: string }): Promise<ActionResult> {
  await requireRole(['admin', 'gestor'])
  const cycleId = String(input.cycleId || '').trim()
  if (!cycleId) return { ok: false, error: 'Ciclo invalido.' }

  const result = await confirmRentCycleReceipt({
    cycleId,
    actorUserId: null,
  })

  if (!result.ok) {
    return { ok: false, error: result.error }
  }

  revalidatePath('/erp/financeiro')
  revalidatePath('/erp/financeiro/locacoes')
  return { ok: true, message: 'Recebimento do aluguel confirmado no ciclo.' }
}

export async function markRentCycleOwnerPaidAction(input: { cycleId: string }): Promise<ActionResult> {
  await requireRole(['admin', 'gestor'])
  const cycleId = String(input.cycleId || '').trim()
  if (!cycleId) return { ok: false, error: 'Ciclo invalido.' }

  const result = await markRentCycleOwnerPaid({
    cycleId,
    actorUserId: null,
  })

  if (!result.ok) {
    return { ok: false, error: result.error }
  }

  revalidatePath('/erp/financeiro')
  revalidatePath('/erp/financeiro/locacoes')
  return { ok: true, message: 'Repasse ao proprietario marcado como pago.' }
}
