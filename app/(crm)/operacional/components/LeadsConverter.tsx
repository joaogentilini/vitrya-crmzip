'use client'

import { useState } from 'react'
import { convertLeadAction } from '../actions'

interface PortalLead {
  id: string
  provider: string
  externalLeadId: string
  createdAt: string
  leadId?: string
  leadTitle?: string
  phoneRaw?: string
}

interface Property {
  id: string
  title: string
}

interface Broker {
  id: string
  full_name: string
  email: string
}

interface LeadsConverterProps {
  portalLeads: PortalLead[]
  properties?: Property[]
  brokers?: Broker[]
}

export function LeadsConverter({ portalLeads, properties = [], brokers = [] }: LeadsConverterProps) {
  const [expandedLeadId, setExpandedLeadId] = useState<string | null>(null)
  const [formData, setFormData] = useState<Record<string, { propertyId: string; brokerId: string }>>({})
  const [converting, setConverting] = useState<string | null>(null)

  const handleConvert = async (leadId: string) => {
    const data = formData[leadId]
    if (!data?.propertyId || !data?.brokerId) {
      alert('Selecione propriedade e corretor')
      return
    }

    setConverting(leadId)
    try {
      const result = await convertLeadAction(leadId, data.propertyId, data.brokerId)
      if (result.success) {
        setExpandedLeadId(null)
        setFormData((prev) => {
          const updated = { ...prev }
          delete updated[leadId]
          return updated
        })
      } else {
        alert(result.message)
      }
    } finally {
      setConverting(null)
    }
  }

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
              {/* Lead Info */}
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
                  onClick={() => setExpandedLeadId(expandedLeadId === lead.id ? null : lead.id)}
                  className="rounded bg-[var(--ring)] px-4 py-2 text-sm font-medium text-white hover:opacity-90"
                >
                  {expandedLeadId === lead.id ? 'Cancelar' : 'Converter'}
                </button>
              </div>

              {/* Conversion Form */}
              {expandedLeadId === lead.id && (
                <div className="mt-4 space-y-3 border-t border-[var(--border)] pt-4">
                  <div>
                    <label className="text-xs font-medium text-[var(--foreground)]">Propriedade</label>
                    <select
                      value={formData[lead.id]?.propertyId || ''}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          [lead.id]: { ...prev[lead.id], propertyId: e.target.value, brokerId: prev[lead.id]?.brokerId || '' },
                        }))
                      }
                      className="mt-1 w-full rounded border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm text-[var(--foreground)]"
                    >
                      <option value="">Selecione uma propriedade...</option>
                      {properties.map((prop) => (
                        <option key={prop.id} value={prop.id}>
                          {prop.title}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-xs font-medium text-[var(--foreground)]">Corretor</label>
                    <select
                      value={formData[lead.id]?.brokerId || ''}
                      onChange={(e) =>
                        setFormData((prev) => ({
                          ...prev,
                          [lead.id]: { ...prev[lead.id], propertyId: prev[lead.id]?.propertyId || '', brokerId: e.target.value },
                        }))
                      }
                      className="mt-1 w-full rounded border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm text-[var(--foreground)]"
                    >
                      <option value="">Selecione um corretor...</option>
                      {brokers.map((broker) => (
                        <option key={broker.id} value={broker.id}>
                          {broker.full_name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <button
                    onClick={() => handleConvert(lead.id)}
                    disabled={converting === lead.id || !formData[lead.id]?.propertyId || !formData[lead.id]?.brokerId}
                    className="w-full rounded bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {converting === lead.id ? 'Convertendo...' : 'Confirmar Conversão'}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
