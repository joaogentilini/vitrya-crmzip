interface QuickActionsProps {
  selectedConversationId: string | null
  conversations: any[]
}

export function QuickActions({ selectedConversationId, conversations }: QuickActionsProps) {
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
              Na Fase 2, você poderá salvar e usar templates de mensagens rápidas.
            </p>
          </div>

          <div className="space-y-2">
            {['Obrigado pelo interesse!', 'Temos disponibilidade para agendar uma visita.', 'Qual é o seu melhor horário?'].map((template) => (
              <button
                key={template}
                disabled
                className="w-full rounded border border-gray-300 bg-gray-100 px-4 py-3 text-left text-sm text-gray-600 cursor-not-allowed"
              >
                📝 {template}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
