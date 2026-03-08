import { useEffect, useCallback, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { RealtimeChannel } from '@supabase/supabase-js'

export interface RealtimeMessage {
  id: string
  content_text: string
  direction: 'inbound' | 'outbound'
  sender_id: string
  occurred_at: string
  message_type?: string
  status?: string
  payload?: Record<string, any>
}

export interface UseConversationRealtimeOptions {
  enabled?: boolean
  onNewMessage?: (message: RealtimeMessage) => void
  onConversationUpdate?: (metadata: Record<string, any>) => void
}

export function useConversationRealtime(
  conversationId: string,
  options: UseConversationRealtimeOptions = {}
) {
  const { enabled = true, onNewMessage, onConversationUpdate } = options
  const [isConnected, setIsConnected] = useState(false)
  const [channel, setChannel] = useState<RealtimeChannel | null>(null)

  const supabase = createClient()

  useEffect(() => {
    if (!enabled || !conversationId) {
      return
    }

    const messageChannel = supabase
      .channel(`conversation:${conversationId}:messages`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'chat_messages',
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const newMessage = payload.new as RealtimeMessage
          console.log('[Realtime] New message received:', newMessage)
          if (onNewMessage) {
            onNewMessage(newMessage)
          }
        }
      )
      .subscribe((status) => {
        console.log('[Realtime] Message channel status:', status)
        setIsConnected(status === 'SUBSCRIBED')
      })

    setChannel(messageChannel)

    return () => {
      supabase.removeChannel(messageChannel)
      setIsConnected(false)
    }
  }, [conversationId, enabled, onNewMessage, supabase])

  useEffect(() => {
    if (!enabled || !conversationId) {
      return
    }

    const conversationChannel = supabase
      .channel(`conversation:${conversationId}:updates`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'chat_conversations',
          filter: `id=eq.${conversationId}`,
        },
        (payload) => {
          const updatedConversation = payload.new as any
          console.log('[Realtime] Conversation updated:', updatedConversation.metadata)
          if (onConversationUpdate && updatedConversation.metadata) {
            onConversationUpdate(updatedConversation.metadata)
          }
        }
      )
      .subscribe((status) => {
        console.log('[Realtime] Conversation channel status:', status)
      })

    return () => {
      supabase.removeChannel(conversationChannel)
    }
  }, [conversationId, enabled, onConversationUpdate, supabase])

  const disconnect = useCallback(() => {
    if (channel) {
      supabase.removeChannel(channel)
      setIsConnected(false)
    }
  }, [channel, supabase])

  return {
    isConnected,
    disconnect,
  }
}

export function useAutomationRealtime(
  conversationId: string,
  options: { enabled?: boolean; onAutomationTriggered?: () => void } = {}
) {
  const { enabled = true, onAutomationTriggered } = options
  const supabase = createClient()

  useEffect(() => {
    if (!enabled || !conversationId) {
      return
    }

    const automationChannel = supabase
      .channel(`conversation:${conversationId}:automation`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'chat_automation_logs',
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          console.log('[Realtime] Automation triggered:', payload.new)
          if (onAutomationTriggered) {
            onAutomationTriggered()
          }
        }
      )
      .subscribe((status) => {
        console.log('[Realtime] Automation channel status:', status)
      })

    return () => {
      supabase.removeChannel(automationChannel)
    }
  }, [conversationId, enabled, onAutomationTriggered, supabase])
}
