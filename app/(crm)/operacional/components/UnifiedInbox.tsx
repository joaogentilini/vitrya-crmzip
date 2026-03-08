'use client'

import { useState, useMemo, useEffect } from 'react'
import { sendQuickReplyAction } from '../actions'

interface Conversation {
  id: string
  channel: string
  status: string
  subject: string
  lastMessageAt: string
  lastMessagePreview: string
  leadId?: string
  personId?: string
  propertyId?: string
  leadTitle?: string
  personName?: string
  propertyTitle?: string
}

interface Message {
  id: string
  content: string
  direction: 'inbound' | 'outbound'
  senderId: string
  occurredAt: string
  senderName?: string
}

interface UnifiedInboxProps {
  conversations: Conversation[]
  selectedConversationId: string | null
  onSelectConversation: (id: string | null) => void
}

const CHANNEL_LABELS: Record<string, { label: string; icon: string; color: string }> = {
  whatsapp: { label: 'WhatsApp', icon: '💬', color: 'bg-green-100 text-green-800' },
  instagram: { label: 'Instagram', icon: '📷', color: 'bg-pink-100 text-pink-800' },
  facebook: { label: 'Facebook', icon: '👍', color: 'bg-blue-100 text-blue-800' },
  olx: { label: 'OLX', icon: '🏠', color: 'bg-orange-100 text-orange-800' },
  grupoolx: { label: 'Grupo OLX', icon: '🏢', color: 'bg-yellow-100 text-yellow-800' },
  meta: { label: 'Meta', icon: '🔷', color: 'bg-purple-100 text-purple-800' },
  other: { label: 'Outro', icon: '📨', color: 'bg-gray-100 text-gray-800' },
}

export function UnifiedInbox({
  conversations,
  selectedConversationId,
  onSelectConversation,
}: UnifiedInboxProps) {
  const [filterChannel, setFilterChannel] = useState<string>('all')
  const [filterStatus, setFilterStatus] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(false)
  const [replyText, setReplyText] = useState('')
  const [sending, setSending] = useState(false)

  // Filtrar conversas
  const filteredConversations = useMemo(() => {
    return conversations.filter((conv) => {
      const matchChannel = filterChannel === 'all' || conv.channel === filterChannel
      const matchStatus = filterStatus === 'all' || conv.status === filterStatus
      const matchSearch =
        !searchQuery ||
        conv.subject.toLowerCase().includes(searchQuery.toLowerCase()) ||
        conv.personName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        conv.leadTitle?.toLowerCase().includes(searchQuery.toLowerCase())

      return matchChannel && matchStatus && matchSearch
    })
  }, [conversations, filterChannel, filterStatus, searchQuery])

  const selectedConversation = conversations.find((c) => c.id === selectedConversationId)

  // Carregar mensagens quando conversa é selecionada
  useEffect(() => {
    if (!selectedConversationId) {
      setMessages([])
      return
    }

    setLoading(true)
    // Simular carregamento de mensagens (Fase 2: integrar com API real)
    fetch(`/api/conversations/${selectedConversationId}/messages`)
      .then((res) => res.json())
      .then((data) => {
        setMessages(data.messages || [])
      })
      .catch((error) => {
        console.error('Erro ao carregar mensagens:', error)
        // Fallback: mostrar mensagem vazia
        setMessages([])
      })
      .finally(() => setLoading(false))
  }, [selectedConversationId])

  const handleSendReply = async () => {
    if (!replyText.trim() || !selectedConversationId) return

    setSending(true)
    try {
      const result = await sendQuickReplyAction(selectedConversationId, replyText)
      if (result.success) {
        setReplyText('')
        // Recarregar mensagens
        const res = await fetch(`/api/conversations/${selectedConversationId}/messages`)
        const data = await res.json()
        setMessages(data.messages || [])
      }
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="flex h-full overflow-hidden">
      {/* Lista de conversas */}
      <div className="w-96 border-r border-[var(--border)] flex flex-col">
        {/* Filtros */}
        <div className="border-b border-[var(--border)] bg-[var(--accent)] p-3 space-y-2">
          <input
            type="text"
            placeholder="Buscar conversa..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm text-[var(--foreground)] placeholder-[var(--muted-foreground)]"
          />

          <div className="grid grid-cols-2 gap-2">
            <select
              value={filterChannel}
              onChange={(e) => setFilterChannel(e.target.value)}
              className="rounded border border-[var(--border)] bg-[var(--card)] px-2 py-1 text-xs text-[var(--foreground)]"
            >
              <option value="all">Todos canais</option>
              {Object.entries(CHANNEL_LABELS).map(([key, { label }]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>

            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="rounded border border-[var(--border)] bg-[var(--card)] px-2 py-1 text-xs text-[var(--foreground)]"
            >
              <option value="all">Todos status</option>
              <option value="open">Aberta</option>
              <option value="pending">Pendente</option>
              <option value="resolved">Resolvida</option>
              <option value="archived">Arquivada</option>
            </select>
          </div>
        </div>

        {/* Lista conversas */}
        <div className="flex-1 overflow-y-auto">
          {filteredConversations.length === 0 ? (
            <div className="flex h-full items-center justify-center text-center text-[var(--muted-foreground)]">
              <div>
                <p className="text-2xl mb-2">🔍</p>
                <p className="text-sm">Nenhuma conversa encontrada</p>
              </div>
            </div>
          ) : (
            filteredConversations.map((conv) => (
              <button
                key={conv.id}
                onClick={() => onSelectConversation(conv.id)}
                className={`w-full border-b border-[var(--border)] p-3 text-left transition-colors ${
                  selectedConversationId === conv.id
                    ? 'bg-[var(--ring)] text-white'
                    : 'hover:bg-[var(--accent)]'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className="text-2xl">{CHANNEL_LABELS[conv.channel]?.icon || '📨'}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-medium text-sm">
                        {conv.personName || conv.leadTitle || 'Sem nome'}
                      </span>
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ${
                          CHANNEL_LABELS[conv.channel]?.color || CHANNEL_LABELS.other.color
                        }`}
                      >
                        {CHANNEL_LABELS[conv.channel]?.label || 'Outro'}
                      </span>
                    </div>
                    <p className="truncate text-xs text-[var(--muted-foreground)] mt-1">
                      {conv.lastMessagePreview}
                    </p>
                    {conv.propertyTitle && (
                      <p className="truncate text-xs text-[var(--muted-foreground)] mt-1">
                        🏠 {conv.propertyTitle}
                      </p>
                    )}
                    <p className="text-xs text-[var(--muted-foreground)] mt-1">
                      {new Date(conv.lastMessageAt).toLocaleTimeString('pt-BR')}
                    </p>
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Detalhes da conversa */}
      <div className="flex-1 flex flex-col bg-[var(--card)] p-4">
        {selectedConversation ? (
          <>
            {/* Header */}
            <div className="border-b border-[var(--border)] pb-3 mb-3">
              <h2 className="text-lg font-bold text-[var(--foreground)]">
                {selectedConversation.personName || selectedConversation.leadTitle}
              </h2>
              <p className="text-sm text-[var(--muted-foreground)]">
                {selectedConversation.subject}
              </p>
              {selectedConversation.propertyTitle && (
                <p className="text-sm text-[var(--muted-foreground)]">
                  📍 {selectedConversation.propertyTitle}
                </p>
              )}
            </div>

            {/* Mensagens */}
            <div className="flex-1 overflow-y-auto space-y-3 mb-3">
              {loading ? (
                <div className="flex h-full items-center justify-center text-[var(--muted-foreground)]">
                  <div className="text-center">
                    <p className="text-2xl mb-2">⏳</p>
                    <p className="text-sm">Carregando mensagens...</p>
                  </div>
                </div>
              ) : messages.length === 0 ? (
                <div className="flex h-full items-center justify-center text-[var(--muted-foreground)]">
                  <div className="text-center">
                    <p className="text-2xl mb-2">💬</p>
                    <p className="text-sm">Nenhuma mensagem ainda</p>
                  </div>
                </div>
              ) : (
                messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={`flex ${msg.direction === 'outbound' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-xs rounded-lg px-3 py-2 text-sm ${
                        msg.direction === 'outbound'
                          ? 'bg-[var(--ring)] text-white'
                          : 'bg-[var(--accent)] text-[var(--foreground)]'
                      }`}
                    >
                      <p>{msg.content}</p>
                      <p className={`text-xs mt-1 ${msg.direction === 'outbound' ? 'text-white/70' : 'text-[var(--muted-foreground)]'}`}>
                        {new Date(msg.occurredAt).toLocaleTimeString('pt-BR')}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Input resposta */}
            <div className="border-t border-[var(--border)] pt-3 space-y-2">
              <textarea
                placeholder="Digitar resposta..."
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                disabled={sending}
                className="w-full rounded border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm text-[var(--foreground)] placeholder-[var(--muted-foreground)] disabled:opacity-50"
                rows={3}
              />
              <button
                onClick={handleSendReply}
                disabled={sending || !replyText.trim()}
                className="w-full rounded bg-[var(--ring)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {sending ? 'Enviando...' : 'Enviar'}
              </button>
            </div>
          </>
        ) : (
          <div className="flex h-full items-center justify-center text-center text-[var(--muted-foreground)]">
            <div>
              <p className="text-3xl mb-2">👈</p>
              <p className="text-sm">Selecione uma conversa para começar</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
