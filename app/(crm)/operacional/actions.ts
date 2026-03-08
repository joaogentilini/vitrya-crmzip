'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requireActiveUser } from '@/lib/auth'

export async function convertLeadAction(leadId: string, propertyId: string, brokerId: string) {
  const user = await requireActiveUser()
  const supabase = await createClient()

  try {
    // Update lead assignment
    const { error: leadError } = await supabase
      .from('leads')
      .update({ assigned_to: brokerId })
      .eq('id', leadId)

    if (leadError) throw leadError

    // Update portal lead link with property
    const { error: linkError } = await supabase
      .from('portal_lead_links')
      .update({ property_id: propertyId })
      .eq('lead_id', leadId)

    if (linkError) throw linkError

    revalidatePath('/operacional')
    return { success: true, message: 'Lead convertido com sucesso!' }
  } catch (error) {
    console.error('Error converting lead:', error)
    return { success: false, message: 'Erro ao converter lead' }
  }
}

export async function sendQuickReplyAction(conversationId: string, content: string) {
  const user = await requireActiveUser()
  const supabase = await createClient()

  try {
    // Get conversation to determine channel
    const { data: conversation } = await supabase
      .from('chat_conversations')
      .select('channel, person_id, lead_id')
      .eq('id', conversationId)
      .single()

    if (!conversation) {
      return { success: false, message: 'Conversa não encontrada' }
    }

    // Append outbound message
    const { error } = await supabase
      .from('chat_messages')
      .insert({
        conversation_id: conversationId,
        content,
        direction: 'outbound',
        channel: conversation.channel,
        sender_id: user.id,
        status: 'queued',
      })

    if (error) throw error

    revalidatePath('/operacional')
    return { success: true, message: 'Mensagem enviada!' }
  } catch (error) {
    console.error('Error sending message:', error)
    return { success: false, message: 'Erro ao enviar mensagem' }
  }
}

export async function assignLeadAction(leadId: string, brokerId: string) {
  const user = await requireActiveUser()
  const supabase = await createClient()

  try {
    const { error } = await supabase
      .from('leads')
      .update({ assigned_to: brokerId })
      .eq('id', leadId)

    if (error) throw error

    revalidatePath('/operacional')
    return { success: true, message: 'Lead atribuído com sucesso!' }
  } catch (error) {
    console.error('Error assigning lead:', error)
    return { success: false, message: 'Erro ao atribuir lead' }
  }
}
