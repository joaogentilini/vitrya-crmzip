'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'

import { requireActiveUser } from '@/lib/auth'
import { appendOutboundMessage } from '@/lib/chat/inbox'
import { createClient } from '@/lib/supabaseServer'

function compactText(value: FormDataEntryValue | null | undefined, limit = 500): string | null {
  if (typeof value !== 'string') return null
  const normalized = value.replace(/\s+/g, ' ').trim()
  if (!normalized) return null
  return normalized.slice(0, limit)
}

function buildRedirectUrl(rawSearch: FormDataEntryValue | null | undefined, error: string | null = null): string {
  const search = typeof rawSearch === 'string' ? rawSearch.trim() : ''
  const params = new URLSearchParams(search)
  if (error) params.set('inbox_error', error)
  else params.delete('inbox_error')
  const query = params.toString()
  return query ? `/inbox?${query}` : '/inbox'
}

export async function sendInboxMessageAction(formData: FormData) {
  const actor = await requireActiveUser()

  const conversationId = compactText(formData.get('conversation_id'), 120)
  const content = compactText(formData.get('content_text'), 4000)
  const search = formData.get('search')

  if (!conversationId || !content) {
    redirect(buildRedirectUrl(search, 'Mensagem vazia ou conversa invalida.'))
  }

  const result = await appendOutboundMessage({
    conversationId,
    actorProfileId: actor.id,
    contentText: content,
    messageType: 'text',
  })

  if (!result.ok) {
    redirect(buildRedirectUrl(search, result.error || 'Falha ao enviar mensagem.'))
  }

  const supabase = await createClient()
  await supabase
    .from('chat_conversations')
    .update({ status: 'open' })
    .eq('id', conversationId)

  revalidatePath('/inbox')
  redirect(buildRedirectUrl(search))
}

export async function setConversationStatusAction(formData: FormData) {
  await requireActiveUser()
  const supabase = await createClient()

  const conversationId = compactText(formData.get('conversation_id'), 120)
  const nextStatus = compactText(formData.get('status'), 30)
  const search = formData.get('search')

  if (!conversationId || !nextStatus) {
    redirect(buildRedirectUrl(search, 'Conversa ou status invalido.'))
  }

  const allowedStatuses = new Set(['open', 'pending', 'resolved', 'archived'])
  if (!allowedStatuses.has(nextStatus)) {
    redirect(buildRedirectUrl(search, 'Status de conversa invalido.'))
  }

  const updateRes = await supabase
    .from('chat_conversations')
    .update({ status: nextStatus })
    .eq('id', conversationId)

  if (updateRes.error) {
    redirect(buildRedirectUrl(search, updateRes.error.message || 'Falha ao atualizar status.'))
  }

  revalidatePath('/inbox')
  redirect(buildRedirectUrl(search))
}
