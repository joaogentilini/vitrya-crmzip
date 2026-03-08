'use client'

import { useState, useMemo } from 'react'

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

            {/* Mensagens (placeholder - Fase 2) */}
            <div className="flex-1 flex items-center justify-center text-center text-[var(--muted-foreground)]">
              <div>
                <p className="text-2xl mb-2">💭</p>
                <p className="text-sm">Histórico de mensagens será carregado na Fase 2</p>
              </div>
            </div>

            {/* Input resposta (placeholder - Fase 2) */}
            <div className="border-t border-[var(--border)] pt-3">
              <textarea
                placeholder="Enviar resposta... (ativado na Fase 2)"
                disabled
                className="w-full rounded border border-[var(--border)] bg-[var(--accent)] px-3 py-2 text-sm text-[var(--muted-foreground)] placeholder-[var(--muted-foreground)]"
                rows={3}
              />
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
