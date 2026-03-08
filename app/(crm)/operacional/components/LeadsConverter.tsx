interface PortalLead {
  id: string
  provider: string
  externalLeadId: string
  createdAt: string
  leadId?: string
  leadTitle?: string
  phoneRaw?: string
}

interface LeadsConverterProps {
  portalLeads: PortalLead[]
}

export function LeadsConverter({ portalLeads }: LeadsConverterProps) {
  return (
    <div className="p-6">
      <h2 className="mb-6 text-xl font-bold text-[var(--foreground)]">Converter Leads de Portais</h2>

      {portalLeads.length === 0 ? (
        <div className="flex h-96 items-center justify-center text-center text-[var(--muted-foreground)]">
          <div>
            <p className="text-3xl mb-2">✅</p>
            <p className="text-sm">Todos os leads foram convertidos!</p>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {portalLeads.map((lead) => (
            <div key={lead.id} className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center rounded-full bg-blue-100 px-2 py-1 text-xs font-medium text-blue-800">
                      {lead.provider === 'olx' ? '🏠 OLX' : '🏢 Grupo OLX'}
                    </span>
                  </div>
                  <h3 className="mt-2 font-semibold text-[var(--foreground)]">{lead.leadTitle || 'Lead sem título'}</h3>
                  <p className="text-sm text-[var(--muted-foreground)]">{lead.phoneRaw || 'Sem telefone'}</p>
                  <p className="text-xs text-[var(--muted-foreground)] mt-1">
                    Recebido em {new Date(lead.createdAt).toLocaleDateString('pt-BR')}
                  </p>
                </div>

                <button
                  disabled
                  className="rounded bg-gray-300 px-4 py-2 text-sm font-medium text-gray-600 cursor-not-allowed"
                >
                  Converter (Fase 2)
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="mt-6 rounded-lg border border-[var(--border)] bg-[var(--accent)] p-4">
        <h3 className="font-semibold text-[var(--foreground)] mb-2">📝 Funcionalidade em Desenvolvimento</h3>
        <p className="text-sm text-[var(--muted-foreground)]">
          Na Fase 2, você poderá vincular cada lead a uma propriedade, atribuir a um corretor e converter para cliente interno do CRM.
        </p>
      </div>
    </div>
  )
}
