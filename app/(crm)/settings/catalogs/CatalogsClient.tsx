'use client'

import { useRouter } from 'next/navigation'
import { useCallback, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'

interface CatalogItemAny {
  [key: string]: any
}

interface CatalogsClientProps {
  leadTypes: any[]
  leadInterests: any[]
  leadSources: any[]
}

export function CatalogsClient({ leadTypes, leadInterests, leadSources }: CatalogsClientProps) {
  const router = useRouter()
  const { success } = useToast()
  const [activeTab, setActiveTab] = useState<'tipo'|'interesse'|'origem'>('tipo')

  // manter estados separados por origem para não misturar tabelas
  const [typesState, setTypesState] = useState<CatalogItemAny[]>(
    leadTypes.map((t) => ({ ...t, __from: 'lead_types' }))
  )
  const [interestsState, setInterestsState] = useState<CatalogItemAny[]>(
    leadInterests.map((i) => ({ ...i, __from: 'lead_interests' }))
  )
  const [sourcesState, setSourcesState] = useState<CatalogItemAny[]>(
    leadSources.map((s) => ({ ...s, __from: 'lead_sources' }))
  )
  const [editModalOpen, setEditModalOpen] = useState(false)
  const [editingItem, setEditingItem] = useState<CatalogItemAny | null>(null)

  const handleSignOut = useCallback(async () => {
    await supabase.auth.signOut()
    success('Você saiu da conta.')
    router.push('/')
  }, [router, success])

  const toggleCatalog = async (item: CatalogItemAny) => {
    const catalogId = item.id
    const table = item.__from || 'catalogs'
    const isActive = !!item.is_active
    try {
      const { error } = await supabase
        .from(table)
        .update({ is_active: !isActive })
        .eq('id', catalogId)

      if (error) throw error

      // atualizar o estado correto conforme a origem
      if (table === 'lead_types') {
        setTypesState(prev => prev.map(cat => cat.id === catalogId ? { ...cat, is_active: !isActive } : cat))
      } else if (table === 'lead_interests') {
        setInterestsState(prev => prev.map(cat => cat.id === catalogId ? { ...cat, is_active: !isActive } : cat))
      } else if (table === 'lead_sources') {
        setSourcesState(prev => prev.map(cat => cat.id === catalogId ? { ...cat, is_active: !isActive } : cat))
      } else {
        // fallback genérico
      }

      success(`Catálogo ${!isActive ? 'ativado' : 'desativado'} com sucesso!`)
    } catch (err) {
      console.error('Error toggling catalog:', err)
    }
  }

  const openEditModal = (item: CatalogItemAny) => {
    setEditingItem(item)
    setEditModalOpen(true)
  }

  const closeEditModal = () => {
    setEditingItem(null)
    setEditModalOpen(false)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Catálogos</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Itens do Catálogo</CardTitle>
        </CardHeader>
        <CardContent>
          {/* Tabs simples */}
          <div className="flex gap-2 mb-4">
            <button
              onClick={() => setActiveTab('tipo')}
              className={`px-3 py-1 rounded ${activeTab === 'tipo' ? 'bg-[var(--accent)] text-white' : 'bg-[var(--card)]'}`}>
              Tipo
            </button>
            <button
              onClick={() => setActiveTab('interesse')}
              className={`px-3 py-1 rounded ${activeTab === 'interesse' ? 'bg-[var(--accent)] text-white' : 'bg-[var(--card)]'}`}>
              Interesse
            </button>
            <button
              onClick={() => setActiveTab('origem')}
              className={`px-3 py-1 rounded ${activeTab === 'origem' ? 'bg-[var(--accent)] text-white' : 'bg-[var(--card)]'}`}>
              Origem
            </button>
          </div>

          {((activeTab === 'tipo' && typesState.length === 0) || (activeTab === 'interesse' && interestsState.length === 0) || (activeTab === 'origem' && sourcesState.length === 0)) ? (
            <p className="text-[var(--muted-foreground)]">Nenhum item no catálogo ainda.</p>
          ) : (
            <div className="space-y-4">
              {(activeTab === 'tipo' ? typesState : activeTab === 'interesse' ? interestsState : sourcesState).map((item) => (
                <div key={item.id} className="flex items-center justify-between p-4 border border-[var(--border)] rounded-[var(--radius)]">
                  <div className="flex-1">
                    <h3 className="font-medium text-[var(--foreground)]">{item.name}</h3>
                    {item.description && (
                      <p className="text-sm text-[var(--muted-foreground)] mt-1">
                        {item.description}
                      </p>
                    )}
                    {item.category && (
                      <Badge variant="outline" className="mt-2">
                        {item.category}
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge variant={item.is_active ? "default" : "secondary"}>
                      {item.is_active ? 'Ativo' : 'Inativo'}
                    </Badge>
                    <Button
                      onClick={() => openEditModal(item)}
                      variant="outline"
                      size="sm"
                    >
                      Editar
                    </Button>
                    <Button
                      onClick={() => toggleCatalog(item)}
                      variant={item.is_active ? "destructive" : "default"}
                      size="sm"
                    >
                      {item.is_active ? 'Desativar' : 'Ativar'}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {editModalOpen && editingItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-[var(--card)] rounded-lg shadow-lg w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">Editar Item</h3>
              <button
                onClick={closeEditModal}
                className="text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-[var(--foreground)] mb-1">
                  Nome
                </label>
                <input
                  type="text"
                  value={editingItem.name}
                  onChange={(e) => setEditingItem({ ...editingItem, name: e.target.value })}
                  className="w-full px-3 py-2 border border-[var(--border)] rounded-[var(--radius)] bg-[var(--card)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-[var(--foreground)] mb-1">
                  Descrição
                </label>
                <textarea
                  value={editingItem.description || ''}
                  onChange={(e) => setEditingItem({ ...editingItem, description: e.target.value })}
                  className="w-full px-3 py-2 border border-[var(--border)] rounded-[var(--radius)] bg-[var(--card)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
                  rows={3}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-[var(--foreground)] mb-1">
                  Categoria
                </label>
                <input
                  type="text"
                  value={editingItem.category || ''}
                  onChange={(e) => setEditingItem({ ...editingItem, category: e.target.value })}
                  className="w-full px-3 py-2 border border-[var(--border)] rounded-[var(--radius)] bg-[var(--card)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
                />
              </div>
            </div>

            <div className="flex gap-3 pt-4">
              <Button type="button" variant="outline" onClick={closeEditModal} className="flex-1">
                Cancelar
              </Button>
              <Button type="button" className="flex-1">
                Salvar
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
