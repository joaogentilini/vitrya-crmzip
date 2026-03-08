'use client'

import { useState } from 'react'
import { sendQuickReplyAction } from '../actions'

const DEFAULT_TEMPLATES = [
  {
    id: 'thanks',
    label: 'Obrigado pelo interesse! 😊',
    content: 'Obrigado pelo seu interesse em nossos imóveis! Teremos prazer em ajudá-lo a encontrar a propriedade perfeita.',
  },
  {
    id: 'availability',
    label: 'Agendamento de visita 📅',
    content: 'Temos disponibilidade para agendar uma visita. Qual seria o melhor dia e horário para você?',
  },
  {
    id: 'time',
    label: 'Qual seu melhor horário? ⏰',
    content: 'Qual é o seu melhor horário para uma visita?',
  },
  {
    id: 'more_info',
    label: 'Solicitar mais informações 📋',
    content: 'Gostaria de receber mais informações sobre este imóvel?',
  },
  {
    id: 'next_step',
    label: 'Próximo passo 👣',
    content: 'Vamos dar continuidade ao processo? Estou à sua disposição para esclarecer qualquer dúvida.',
  },
]

interface QuickActionsProps {
  selectedConversationId: string | null
  conversations: any[]
}

export function QuickActions({ selectedConversationId, conversations }: QuickActionsProps) {
  const [sending, setSending] = useState<string | null>(null)

  const handleSendTemplate = async (template: (typeof DEFAULT_TEMPLATES)[0]) => {
    if (!selectedConversationId) return

    setSending(template.id)
    try {
      const result = await sendQuickReplyAction(selectedConversationId, template.content)
      if (!result.success) {
        alert(result.message)
      }
    } finally {
      setSending(null)
    }
  }

  return (
    <div className="p-6">
      <h2 className="mb-6 text-xl font-bold text-[var(--foreground)]">Mensagens Rápidas</h2>

      {!selectedConversationId ? (
        <div className="flex h-96 items-center justify-center text-center text-[var(--muted-foreground)]">
          <div>
            <p className="text-3xl mb-2">💬</p>
            <p className="text-sm">Selecione uma conversa na aba Inbox para usar templates</p>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="rounded-lg border border-[var(--border)] bg-[var(--accent)] p-4">
            <h3 className="font-semibold text-[var(--foreground)] mb-2">Templates Disponíveis</h3>
            <p className="text-sm text-[var(--muted-foreground)]">
              Clique em um template para enviar uma resposta rápida na conversa selecionada.
            </p>
          </div>

          <div className="space-y-2">
            {DEFAULT_TEMPLATES.map((template) => (
              <button
                key={template.id}
                onClick={() => handleSendTemplate(template)}
                disabled={sending === template.id}
                className="w-full rounded border border-[var(--border)] bg-[var(--card)] px-4 py-3 text-left text-sm text-[var(--foreground)] hover:bg-[var(--accent)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <div className="flex items-start justify-between gap-2">
                  <span>{template.label}</span>
                  {sending === template.id && <span className="text-xs">Enviando...</span>}
                </div>
                <p className="text-xs text-[var(--muted-foreground)] mt-1">{template.content}</p>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
