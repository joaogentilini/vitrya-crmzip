import Link from 'next/link'

interface IntegrationsPanelProps {
  integrations: Record<string, boolean>
}

export function IntegrationsPanel({ integrations }: IntegrationsPanelProps) {
  const integrationsList = [
    {
      id: 'evolution',
      label: 'Evolution (WhatsApp)',
      icon: '💬',
      href: '/settings/whatsapp',
      enabled: true, // Assumir habilitado se rodando
    },
    {
      id: 'olx',
      label: 'OLX',
      icon: '🏠',
      href: '/settings/portals',
      enabled: integrations.olx !== false,
    },
    {
      id: 'grupoolx',
      label: 'Grupo OLX',
      icon: '🏢',
      href: '/settings/portals',
      enabled: integrations.grupoolx !== false,
    },
    {
      id: 'meta',
      label: 'Meta (Facebook/Instagram)',
      icon: '📷',
      href: '/settings/portals',
      enabled: integrations.meta !== false,
    },
  ]

  return (
    <div className="p-6">
      <h2 className="mb-6 text-xl font-bold text-[var(--foreground)]">Status das Integrações</h2>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {integrationsList.map((integration) => (
          <Link key={integration.id} href={integration.href}>
            <div className="flex items-center justify-between rounded-lg border border-[var(--border)] bg-[var(--card)] p-4 hover:bg-[var(--accent)] transition-colors cursor-pointer">
              <div className="flex items-center gap-3">
                <div className="text-3xl">{integration.icon}</div>
                <div>
                  <h3 className="font-semibold text-[var(--foreground)]">{integration.label}</h3>
                  <p className="text-sm text-[var(--muted-foreground)]">
                    {integration.enabled ? '✅ Ativo' : '❌ Inativo'}
                  </p>
                </div>
              </div>
              <div className="text-lg">⚙️</div>
            </div>
          </Link>
        ))}
      </div>

      <div className="mt-6 rounded-lg border border-[var(--border)] bg-[var(--accent)] p-4">
        <h3 className="font-semibold text-[var(--foreground)] mb-2">💡 Dica</h3>
        <p className="text-sm text-[var(--muted-foreground)]">
          Acesse as configurações de cada integração para ativar/desativar canais, atualizar credenciais e gerenciar webhooks.
        </p>
      </div>
    </div>
  )
}
