import Link from 'next/link'

export function AIAgentsPanel() {
  return (
    <div className="p-6">
      <h2 className="mb-6 text-xl font-bold text-[var(--foreground)]">IA & Bots</h2>

      <div className="space-y-4">
        <div className="rounded-lg border-2 border-dashed border-[var(--ring)] bg-blue-50 p-6 text-center">
          <p className="text-3xl mb-2">🤖</p>
          <h3 className="font-semibold text-[var(--foreground)] mb-2">Agentes de IA em Breve</h3>
          <p className="text-sm text-[var(--muted-foreground)] mb-4">
            Automatize respostas de leads, qualificação inteligente e muito mais com agentes de IA.
          </p>
          <p className="text-xs text-[var(--muted-foreground)] mb-4">
            Este espaço será preenchido com agentes inteligentes na próxima etapa do desenvolvimento.
          </p>
        </div>

        <div className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-4">
          <h3 className="font-semibold text-[var(--foreground)] mb-3">Recursos Planejados</h3>
          <ul className="space-y-2 text-sm text-[var(--muted-foreground)]">
            <li>✨ Resposta automática inteligente a mensagens</li>
            <li>✨ Qualificação automática de leads</li>
            <li>✨ Agendamento automático de visitas</li>
            <li>✨ Análise de sentimento em conversas</li>
            <li>✨ Sugestões de próximos passos</li>
          </ul>
        </div>

        <Link href="/settings/automations">
          <button className="w-full rounded bg-[var(--ring)] px-4 py-2 text-sm font-medium text-white hover:opacity-90">
            Acessar Automações
          </button>
        </Link>
      </div>
    </div>
  )
}
