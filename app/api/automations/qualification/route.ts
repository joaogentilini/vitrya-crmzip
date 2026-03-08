import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { Anthropic } from '@anthropic-ai/sdk'

interface QualificationSchema {
  questions?: Array<{ id: string; text: string; field: string }>
  scoring?: {
    budget_min?: number
    timeline_max_days?: number
    location_match?: string[]
  }
  threshold_high?: number
}

interface QualificationResult {
  score: 'high' | 'medium' | 'low'
  confidence: number
  parsed_data: Record<string, any>
  reasoning?: string
}

export async function POST(request: NextRequest) {
  try {
    // Verificar token de segurança
    const authHeader = request.headers.get('authorization')
    const expectedToken = process.env.AUTOMATION_SECRET

    if (expectedToken && authHeader !== `Bearer ${expectedToken}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { conversationId, leadId, botId, newMessage, conversationHistory } =
      await request.json()

    if (!conversationId || !leadId || !botId || !newMessage) {
      return NextResponse.json(
        { error: 'Missing required fields: conversationId, leadId, botId, newMessage' },
        { status: 400 }
      )
    }

    const supabase = await createClient()
    const anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    })

    // 1. Buscar bot e seu qualification_schema
    const { data: bot, error: botError } = await supabase
      .from('chat_bots')
      .select('id, system_prompt, qualification_schema')
      .eq('id', botId)
      .single()

    if (botError || !bot) {
      console.error('Error fetching bot:', botError)
      return NextResponse.json({ error: 'Bot not found' }, { status: 404 })
    }

    const qualificationSchema: QualificationSchema = bot.qualification_schema || {}

    // 2. Buscar histórico de conversa (últimas 10 mensagens)
    const { data: messages, error: msgError } = await supabase
      .from('chat_messages')
      .select('content_text, direction, occurred_at')
      .eq('conversation_id', conversationId)
      .order('occurred_at', { ascending: true })
      .limit(10)

    if (msgError) {
      console.error('Error fetching messages:', msgError)
    }

    // 3. Montar conversa para o Claude analisar
    const conversationForAnalysis = messages || []
    conversationForAnalysis.push({
      content_text: newMessage,
      direction: 'inbound',
      occurred_at: new Date().toISOString(),
    })

    const conversationText = conversationForAnalysis
      .map(
        (msg: any) =>
          `[${msg.direction.toUpperCase()}] ${msg.content_text}`
      )
      .join('\n')

    // 4. Criar prompt de qualificação
    const qualificationPrompt = `
You are a real estate lead qualification assistant. Analyze the conversation history and provide a qualification assessment.

Bot System Prompt (for context):
${bot.system_prompt || 'No system prompt configured'}

Qualification Schema:
${JSON.stringify(qualificationSchema, null, 2)}

Conversation History:
${conversationText}

Please analyze this conversation and provide:
1. A qualification score: "high", "medium", or "low"
2. A confidence score between 0 and 1
3. Extracted data fields based on the schema questions (budget, timeline, location, etc)
4. Reasoning for the score

Respond in JSON format:
{
  "score": "high|medium|low",
  "confidence": 0.0-1.0,
  "parsed_data": {
    "budget": "value",
    "timeline": "value",
    "location": "value"
  },
  "reasoning": "explanation"
}
`

    // 5. Chamar Claude API para qualificação
    let qualificationResult: QualificationResult | null = null

    try {
      const message = await anthropic.messages.create({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 500,
        messages: [
          {
            role: 'user',
            content: qualificationPrompt,
          },
        ],
      })

      const responseText =
        message.content[0].type === 'text' ? message.content[0].text : ''

      // Parse resposta JSON
      const jsonMatch = responseText.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        qualificationResult = JSON.parse(jsonMatch[0])
      } else {
        console.warn('Could not extract JSON from Claude response:', responseText)
        qualificationResult = {
          score: 'medium',
          confidence: 0.5,
          parsed_data: {},
          reasoning: 'Could not parse response',
        }
      }
    } catch (error) {
      console.error('Error calling Claude API:', error)
      return NextResponse.json(
        { error: 'Failed to process qualification' },
        { status: 500 }
      )
    }

    // 6. Atualizar lead.metadata com qualificação
    const { data: lead, error: leadFetchError } = await supabase
      .from('leads')
      .select('id, metadata')
      .eq('id', leadId)
      .single()

    if (leadFetchError || !lead) {
      console.error('Error fetching lead:', leadFetchError)
      return NextResponse.json({ error: 'Lead not found' }, { status: 404 })
    }

    const updatedMetadata = {
      ...(lead.metadata || {}),
      qualification_score: qualificationResult.score,
      qualification_confidence: qualificationResult.confidence,
      qualification_data: qualificationResult.parsed_data,
      qualification_reasoning: qualificationResult.reasoning,
      qualified_at: new Date().toISOString(),
      qualified_by_bot_id: botId,
    }

    const { error: updateError } = await supabase
      .from('leads')
      .update({ metadata: updatedMetadata })
      .eq('id', leadId)

    if (updateError) {
      console.error('Error updating lead metadata:', updateError)
      // Não falha a requisição, mas loga o erro
    }

    // 7. Se qualificação alta, notificar gestor
    if (qualificationResult.score === 'high') {
      const { data: conversation, error: convError } = await supabase
        .from('chat_conversations')
        .select('broker_user_id')
        .eq('id', conversationId)
        .single()

      if (!convError && conversation) {
        // Atualizar notification/badge na conversa
        await supabase
          .from('chat_conversations')
          .update({
            metadata: {
              ...(conversation.metadata || {}),
              qualified_high: true,
              qualified_timestamp: new Date().toISOString(),
            },
          })
          .eq('id', conversationId)
      }
    }

    // 8. Log da qualificação
    await supabase.from('chat_automation_logs').insert({
      conversation_id: conversationId,
      rule_id: null,
      bot_id: botId,
      action_taken: 'lead_qualified',
      result_metadata: {
        qualification_score: qualificationResult.score,
        confidence: qualificationResult.confidence,
        parsed_data: qualificationResult.parsed_data,
        timestamp: new Date().toISOString(),
      },
    })

    return NextResponse.json(
      {
        success: true,
        qualification: qualificationResult,
        lead_metadata_updated: true,
      },
      { status: 200 }
    )
  } catch (error) {
    console.error('Qualification automation error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
