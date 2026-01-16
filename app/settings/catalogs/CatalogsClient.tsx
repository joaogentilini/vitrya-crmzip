'use client'

import { useRouter } from 'next/navigation'
import { useCallback, useState, useTransition } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { AppShell } from '@/components/layout/AppShell'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Input } from '@/components/ui/Input'
import { useToast } from '@/components/ui/Toast'

interface CatalogItem {
  id: string
  name: string
  is_active: boolean
  position: number
  created_at: string
}

interface CatalogsClientProps {
  userEmail?: string | null
  leadTypes: CatalogItem[]
  leadInterests: CatalogItem[]
  leadSources: CatalogItem[]
}

type TabKey = 'types' | 'interests' | 'sources'

const tabLabels: Record<TabKey, string> = {
  types: 'Tipos',
  interests: 'Interesses',
  sources: 'Origens',
}

const apiEndpoints: Record<TabKey, string> = {
  types: '/api/catalogs/lead-types',
  interests: '/api/catalogs/lead-interests',
  sources: '/api/catalogs/lead-sources',
}

async function apiUpsert(tab: TabKey, item: { id?: string; name: string; is_active?: boolean; position?: number }) {
  const resp = await fetch(apiEndpoints[tab], {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(item),
  })
  const json = await resp.json()
  if (!resp.ok) {
    throw new Error(json.error || 'Erro ao salvar')
  }
  return json.data
}

export function CatalogsClient({ userEmail, leadTypes, leadInterests, leadSources }: CatalogsClientProps) {
  const router = useRouter()
  const { success, error: showError } = useToast()
  const [isPending, startTransition] = useTransition()
  const [activeTab, setActiveTab] = useState<TabKey>('types')
  const [newItemName, setNewItemName] = useState('')

  const [localTypes, setLocalTypes] = useState(leadTypes)
  const [localInterests, setLocalInterests] = useState(leadInterests)
  const [localSources, setLocalSources] = useState(leadSources)

  const [editModalOpen, setEditModalOpen] = useState(false)
  const [editingItem, setEditingItem] = useState<CatalogItem | null>(null)
  const [editingName, setEditingName] = useState('')

  const handleSignOut = useCallback(async () => {
    await supabase.auth.signOut()
    success('Você saiu da conta.')
    router.push('/')
  }, [router, success])

  const getItems = (): CatalogItem[] => {
    switch (activeTab) {
      case 'types': return localTypes
      case 'interests': return localInterests
      case 'sources': return localSources
    }
  }

  const setItems = (items: CatalogItem[]) => {
    switch (activeTab) {
      case 'types': setLocalTypes(items); break
      case 'interests': setLocalInterests(items); break
      case 'sources': setLocalSources(items); break
    }
  }

  const handleAddItem = () => {
    if (!newItemName.trim()) {
      showError('Digite um nome para o item')
      return
    }

    startTransition(async () => {
      try {
        const newItem = await apiUpsert(activeTab, {
          name: newItemName.trim(),
          position: getItems().length,
        })
        setItems([...getItems(), newItem])
        setNewItemName('')
        success('Item adicionado!')
        router.refresh()
      } catch (err) {
        showError(err instanceof Error ? err.message : 'Erro ao adicionar')
      }
    })
  }

  const handleToggleActive = (item: CatalogItem) => {
    startTransition(async () => {
      try {
        await apiUpsert(activeTab, {
          id: item.id,
          name: item.name,
          is_active: !item.is_active,
          position: item.position,
        })
        setItems(getItems().map(i => 
          i.id === item.id ? { ...i, is_active: !item.is_active } : i
        ))
        success(item.is_active ? 'Item desativado' : 'Item ativado')
      } catch (err) {
        showError(err instanceof Error ? err.message : 'Erro ao atualizar')
      }
    })
  }

  const handleMoveUp = (index: number) => {
    if (index === 0) return
    const items = [...getItems()]
    const temp = items[index]
    items[index] = items[index - 1]
    items[index - 1] = temp

    startTransition(async () => {
      try {
        await apiUpsert(activeTab, { id: items[index].id, name: items[index].name, position: index })
        await apiUpsert(activeTab, { id: items[index - 1].id, name: items[index - 1].name, position: index - 1 })
        setItems(items.map((item, i) => ({ ...item, position: i })))
      } catch (err) {
        showError(err instanceof Error ? err.message : 'Erro ao reordenar')
      }
    })
  }

  const handleMoveDown = (index: number) => {
    const items = [...getItems()]
    if (index === items.length - 1) return
    const temp = items[index]
    items[index] = items[index + 1]
    items[index + 1] = temp

    startTransition(async () => {
      try {
        await apiUpsert(activeTab, { id: items[index].id, name: items[index].name, position: index })
        await apiUpsert(activeTab, { id: items[index + 1].id, name: items[index + 1].name, position: index + 1 })
        setItems(items.map((item, i) => ({ ...item, position: i })))
      } catch (err) {
        showError(err instanceof Error ? err.message : 'Erro ao reordenar')
      }
    })
  }

  const openEditModal = (item: CatalogItem) => {
    setEditingItem(item)
    setEditingName(item.name)
    setEditModalOpen(true)
  }

  const handleSaveEdit = () => {
    if (!editingItem) return
    if (!editingName.trim()) {
      showError('Nome não pode ser vazio')
      return
    }

    startTransition(async () => {
      try {
        await apiUpsert(activeTab, {
          id: editingItem.id,
          name: editingName.trim(),
          is_active: editingItem.is_active,
          position: editingItem.position,
        })
        setItems(getItems().map(i => 
          i.id === editingItem.id ? { ...i, name: editingName.trim() } : i
        ))
        success('Nome atualizado!')
        setEditModalOpen(false)
        setEditingItem(null)
        setEditingName('')
      } catch (err) {
        showError(err instanceof Error ? err.message : 'Erro ao atualizar')
      }
    })
  }

  const items = getItems()

  return (
    <AppShell
      userEmail={userEmail}
      onSignOut={handleSignOut}
      pageTitle="Catálogos"
      showNewLeadButton={false}
    >
      <div className="space-y-6">
        <div>
          <h2 className="text-lg font-semibold text-[var(--foreground)]">Configurar Catálogos</h2>
          <p className="text-sm text-[var(--muted-foreground)]">
            Gerencie os tipos, interesses e origens disponíveis para os leads
          </p>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 border-b border-[var(--border)]">
          {(Object.keys(tabLabels) as TabKey[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
                activeTab === tab
                  ? 'text-[var(--primary)] border-[var(--primary)]'
                  : 'text-[var(--muted-foreground)] border-transparent hover:text-[var(--foreground)]'
              }`}
            >
              {tabLabels[tab]}
            </button>
          ))}
        </div>

        {/* Add new item */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex gap-3">
              <div className="flex-1">
                <Input
                  placeholder={`Novo ${tabLabels[activeTab].slice(0, -1).toLowerCase()}...`}
                  value={newItemName}
                  onChange={(e) => setNewItemName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddItem()}
                  disabled={isPending}
                />
              </div>
              <Button onClick={handleAddItem} loading={isPending}>
                Adicionar
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Items list */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{tabLabels[activeTab]}</CardTitle>
          </CardHeader>
          <CardContent>
            {items.length === 0 ? (
              <div className="text-center py-12">
                <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-[var(--muted)] flex items-center justify-center">
                  <svg className="w-6 h-6 text-[var(--muted-foreground)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                  </svg>
                </div>
                <h3 className="text-sm font-medium text-[var(--foreground)] mb-1">
                  Nenhum {tabLabels[activeTab].slice(0, -1).toLowerCase()} cadastrado
                </h3>
                <p className="text-sm text-[var(--muted-foreground)] mb-4">
                  Adicione o primeiro item usando o campo acima
                </p>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => document.querySelector<HTMLInputElement>('input[placeholder]')?.focus()}
                >
                  <svg className="w-4 h-4 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  Adicionar {tabLabels[activeTab].slice(0, -1)}
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                {items.map((item, index) => (
                  <div
                    key={item.id}
                    className={`flex items-center justify-between gap-4 p-3 rounded-[var(--radius)] border ${
                      item.is_active 
                        ? 'border-[var(--border)] bg-[var(--background)]' 
                        : 'border-[var(--muted)] bg-[var(--muted)]/30'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex flex-col gap-1">
                        <button
                          onClick={() => handleMoveUp(index)}
                          disabled={index === 0 || isPending}
                          className="text-[var(--muted-foreground)] hover:text-[var(--foreground)] disabled:opacity-30"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                          </svg>
                        </button>
                        <button
                          onClick={() => handleMoveDown(index)}
                          disabled={index === items.length - 1 || isPending}
                          className="text-[var(--muted-foreground)] hover:text-[var(--foreground)] disabled:opacity-30"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        </button>
                      </div>
                      <span className={item.is_active ? 'text-[var(--foreground)]' : 'text-[var(--muted-foreground)]'}>
                        {item.name}
                      </span>
                      <Badge variant={item.is_active ? 'success' : 'secondary'}>
                        {item.is_active ? 'Ativo' : 'Inativo'}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => openEditModal(item)}
                        disabled={isPending}
                        className="p-1.5 rounded-[var(--radius)] text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--accent)] disabled:opacity-50"
                        title="Editar nome"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </button>
                    <button
                      onClick={() => handleToggleActive(item)}
                      disabled={isPending}
                      className={`
                        relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent
                        transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-[var(--ring)] focus:ring-offset-2
                        ${item.is_active ? 'bg-[var(--primary)]' : 'bg-[var(--muted)]'}
                        disabled:opacity-50 disabled:cursor-not-allowed
                      `}
                      role="switch"
                      aria-checked={item.is_active}
                    >
                      <span
                        className={`
                          pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0
                          transition duration-200 ease-in-out
                          ${item.is_active ? 'translate-x-5' : 'translate-x-0'}
                        `}
                      />
                    </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {editModalOpen && editingItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-[var(--card)] rounded-lg shadow-lg w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-[var(--foreground)]">Editar Nome</h3>
              <button
                onClick={() => {
                  setEditModalOpen(false)
                  setEditingItem(null)
                  setEditingName('')
                }}
                className="text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-[var(--foreground)]">Nome</label>
              <Input
                value={editingName}
                onChange={(e) => setEditingName(e.target.value)}
                placeholder="Nome do item"
                disabled={isPending}
                onKeyDown={(e) => e.key === 'Enter' && handleSaveEdit()}
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="outline"
                onClick={() => {
                  setEditModalOpen(false)
                  setEditingItem(null)
                  setEditingName('')
                }}
                disabled={isPending}
              >
                Cancelar
              </Button>
              <Button
                onClick={handleSaveEdit}
                loading={isPending}
                disabled={!editingName.trim()}
              >
                Salvar
              </Button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  )
}
