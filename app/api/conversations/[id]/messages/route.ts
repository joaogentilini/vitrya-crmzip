import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireActiveUser } from '@/lib/auth'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireActiveUser()
    const supabase = await createClient()

    const { id: conversationId } = await params

    // Fetch conversation to verify access
    const { data: conversation, error: convError } = await supabase
      .from('chat_conversations')
      .select('id, broker_user_id')
      .eq('id', conversationId)
      .single()

    if (convError || !conversation) {
      return NextResponse.json({ error: 'Conversa não encontrada' }, { status: 404 })
    }

    // RLS will handle access control
    if (conversation.broker_user_id !== user.id && user.role !== 'admin' && user.role !== 'gestor') {
      return NextResponse.json({ error: 'Acesso negado' }, { status: 403 })
    }

    // Fetch last 20 messages
    const { data: messages, error: msgError } = await supabase
      .from('chat_messages')
      .select(`
        id,
        content,
        direction,
        sender_id,
        occurred_at,
        profiles(full_name)
      `)
      .eq('conversation_id', conversationId)
      .order('occurred_at', { ascending: true })
      .limit(20)

    if (msgError) {
      console.error('Error fetching messages:', msgError)
      return NextResponse.json({ error: 'Erro ao carregar mensagens' }, { status: 500 })
    }

    return NextResponse.json({
      messages: messages?.map((msg: any) => ({
        id: msg.id,
        content: msg.content,
        direction: msg.direction,
        senderId: msg.sender_id,
        occurredAt: msg.occurred_at,
        senderName: (msg.profiles as any)?.full_name,
      })) || [],
    })
  } catch (error) {
    console.error('API error:', error)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
