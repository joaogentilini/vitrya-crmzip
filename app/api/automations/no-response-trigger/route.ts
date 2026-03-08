import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * AUTOMAÇÃO: Resposta automática para leads sem resposta em 24h
 *
 * Trigger: Cronjob a cada 1 hora
 * Identifica: Conversas abertas sem mensagem inbound há 24h+
 * Ação: Envia template de recuperação automático
 */

export async function POST(request: NextRequest) {
  try {
    // Verificar token de segurança (se configurado)
    const authHeader = request.headers.get('authorization')
    const expectedToken = process.env.AUTOMATION_SECRET

    if (expectedToken && authHeader !== `Bearer ${expectedToken}`) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const supabase = await createClient()

    // 1. Buscar conversas abertas sem resposta há 24h
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

    const { data: conversations, error: convError } = await supabase
      .from('chat_conversations')
      .select('id, lead_id, broker_user_id, channel, metadata')
      .eq('status', 'open')
      .lt('last_inbound_at', twentyFourHoursAgo)
      .limit(100)

    if (convError) {
      console.error('Error fetching conversations:', convError)
      return NextResponse.json(
        { error: 'Failed to fetch conversations' },
        { status: 500 }
      )
    }

    // 2. Processar cada conversa
    let successCount = 0
    let errorCount = 0
    const results = []

    for (const conv of conversations || []) {
      try {
        // Verificar se já foi acionada automação para esta conversa
        const metadata = conv.metadata || {}
        if (metadata.automation_triggered_at) {
          console.log(`Conversation ${conv.id} já foi acionada, pulando...`)
          continue
        }

        // 3. Buscar quick_reply padrão para recovery
        const { data: quickReply, error: qrError } = await supabase
          .from('chat_quick_replies')
          .select('id, body')
          .eq('broker_user_id', conv.broker_user_id)
          .eq('title', 'Auto_Recovery_24h')
          .single()

        if (qrError || !quickReply) {
          console.log(`No recovery template for conversation ${conv.id}`)
          continue
        }

        // 4. Enviar mensagem automática
        const { error: msgError } = await supabase
          .from('chat_messages')
          .insert({
            conversation_id: conv.id,
            content_text: quickReply.body,
            direction: 'outbound',
            message_type: 'text',
            channel: conv.channel,
            status: 'sent',
            payload: {
              automated: true,
              automation_type: 'no_response_24h',
            },
            created_by_profile_id: null, // Sistema enviou
          })

        if (msgError) {
          console.error(`Error sending message for ${conv.id}:`, msgError)
          errorCount++
          continue
        }

        // 5. Atualizar metadata da conversa com timestamp
        const updatedMetadata = {
          ...metadata,
          automation_triggered_at: new Date().toISOString(),
          automation_type: 'no_response_24h',
        }

        const { error: updateError } = await supabase
          .from('chat_conversations')
          .update({ metadata: updatedMetadata })
          .eq('id', conv.id)

        if (updateError) {
          console.error(`Error updating metadata for ${conv.id}:`, updateError)
          errorCount++
          continue
        }

        // 6. Log da ação
        await supabase.from('chat_automation_logs').insert({
          conversation_id: conv.id,
          rule_id: null,
          bot_id: null,
          action_taken: 'sent_recovery_message',
          result_metadata: {
            success: true,
            template_id: quickReply.id,
            triggered_at: new Date().toISOString(),
          },
        })

        successCount++
        results.push({
          conversation_id: conv.id,
          status: 'success',
          message: 'Recovery message sent',
        })
      } catch (error) {
        console.error(`Error processing conversation ${conv.id}:`, error)
        errorCount++
        results.push({
          conversation_id: conv.id,
          status: 'error',
          message: String(error),
        })
      }
    }

    return NextResponse.json(
      {
        success: true,
        summary: {
          total_conversations: conversations?.length || 0,
          success_count: successCount,
          error_count: errorCount,
          results,
        },
      },
      { status: 200 }
    )
  } catch (error) {
    console.error('Automation error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
