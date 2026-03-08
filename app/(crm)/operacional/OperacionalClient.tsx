'use client'

import { useState } from 'react'
import { KPIDashboard } from './components/KPIDashboard'
import { UnifiedInbox } from './components/UnifiedInbox'
import { LeadsConverter } from './components/LeadsConverter'
import { QuickActions } from './components/QuickActions'
import { IntegrationsPanel } from './components/IntegrationsPanel'
import { AIAgentsPanel } from './components/AIAgentsPanel'

interface OperacionalClientProps {
  user: any // User profile
  data: {
    kpis: {
      newLeads: number
      openConversations: number
      pendingMessages: number
      closedDeals: number
    }
    conversations: Array<{
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
    }>
    portalLeads: Array<{
      id: string
      provider: string
      externalLeadId: string
      createdAt: string
      leadId?: string
      leadTitle?: string
      phoneRaw?: string
    }>
    integrations: Record<string, boolean>
    profiles: Array<{
      id: string
      email: string
      full_name: string
    }>
  }
  isManager: boolean
  filterBrokerId?: string
  profiles: any[]
}

export function OperacionalClient({
  user,
  data,
  isManager,
  filterBrokerId,
  profiles,
}: OperacionalClientProps) {
  const [activeTab, setActiveTab] = useState('inbox')
  const [selectedConversation, setSelectedConversation] = useState<string | null>(null)
  const [selectedBroker, setSelectedBroker] = useState(filterBrokerId || '')

  return (
    <div className="flex h-full flex-col">
      {/* Header com KPI */}
      <div className="border-b border-[var(--border)] bg-[var(--card)] p-4">
        <h1 className="mb-4 text-2xl font-bold text-[var(--foreground)]">Painel Operacional</h1>
        <KPIDashboard stats={data.kpis} />

        {/* Filtro por broker se gestor */}
        {isManager && profiles.length > 0 && (
          <div className="mt-4">
            <label className="block text-sm font-medium text-[var(--foreground)]">
              Filtrar por corretor:
            </label>
            <select
              value={selectedBroker}
              onChange={(e) => {
                setSelectedBroker(e.target.value)
                // TODO: revalidate data for selected broker
              }}
              className="mt-1 w-full rounded border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-[var(--foreground)]"
            >
              <option value="">Todos os corretores</option>
              {profiles.map((profile) => (
                <option key={profile.id} value={profile.id}>
                  {profile.full_name}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar com abas */}
        <div className="w-48 border-r border-[var(--border)] bg-[var(--accent)]">
          <nav className="space-y-1 p-3">
            {[
              { id: 'inbox', label: '📬 Inbox' },
              { id: 'leads', label: '🔄 Converter Leads' },
              { id: 'templates', label: '💬 Mensagens Rápidas' },
              { id: 'agents', label: '🤖 IA & Bots' },
              { id: 'integrations', label: '⚙️ Integrações' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`w-full rounded-md px-3 py-2 text-left text-sm font-medium transition-colors ${
                  activeTab === tab.id
                    ? 'bg-[var(--ring)] text-white'
                    : 'text-[var(--foreground)] hover:bg-[var(--border)]'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        {/* Conteúdo das abas */}
        <div className="flex-1 overflow-y-auto">
          {activeTab === 'inbox' && (
            <UnifiedInbox
              conversations={data.conversations}
              selectedConversationId={selectedConversation}
              onSelectConversation={setSelectedConversation}
            />
          )}

          {activeTab === 'leads' && <LeadsConverter portalLeads={data.portalLeads} />}

          {activeTab === 'templates' && (
            <QuickActions
              selectedConversationId={selectedConversation}
              conversations={data.conversations}
            />
          )}

          {activeTab === 'agents' && <AIAgentsPanel />}

          {activeTab === 'integrations' && <IntegrationsPanel integrations={data.integrations} />}
        </div>
      </div>
    </div>
  )
}
