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
import { upsertCatalogItem, deleteCatalogItem, CatalogKind } from '@/lib/catalogs'

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

export function CatalogsClient({ userEmail, leadTypes, leadInterests, leadSources }: CatalogsClientProps) {
  const router = useRouter()
  const { success, error: showError } = useToast()
  const [isPending, startTransition] = useTransition()
  const [activeTab, setActiveTab] = useState<TabKey>('types')
  const [newItemName, setNewItemName] = useState('')

  const [localTypes, setLocalTypes] = useState(leadTypes)
  const [localInterests, setLocalInterests] = useState(leadInterests)
  const [localSources, setLocalSources] = useState(leadSources)

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
      const result = await upsertCatalogItem(activeTab, {
        name: newItemName.trim(),
        position: getItems().length,
      })

      if (result.success && result.item) {
        setItems([...getItems(), result.item])
        setNewItemName('')
        success('Item adicionado!')
        router.refresh()
      } else {
        showError(result.error || 'Erro ao adicionar')
      }
    })
  }

  const handleToggleActive = (item: CatalogItem) => {
    startTransition(async () => {
      const result = await upsertCatalogItem(activeTab, {
        id: item.id,
        name: item.name,
        is_active: !item.is_active,
        position: item.position,
      })

      if (result.success) {
        setItems(getItems().map(i => 
          i.id === item.id ? { ...i, is_active: !item.is_active } : i
        ))
        success(item.is_active ? 'Item desativado' : 'Item ativado')
      } else {
        showError(result.error || 'Erro ao atualizar')
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
      await upsertCatalogItem(activeTab, { id: items[index].id, name: items[index].name, position: index })
      await upsertCatalogItem(activeTab, { id: items[index - 1].id, name: items[index - 1].name, position: index - 1 })
      setItems(items.map((item, i) => ({ ...item, position: i })))
    })
  }

  const handleMoveDown = (index: number) => {
    const items = [...getItems()]
    if (index === items.length - 1) return
    const temp = items[index]
    items[index] = items[index + 1]
    items[index + 1] = temp

    startTransition(async () => {
      await upsertCatalogItem(activeTab, { id: items[index].id, name: items[index].name, position: index })
      await upsertCatalogItem(activeTab, { id: items[index + 1].id, name: items[index + 1].name, position: index + 1 })
      setItems(items.map((item, i) => ({ ...item, position: i })))
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
              <p className="text-sm text-[var(--muted-foreground)] text-center py-8">
                Nenhum item cadastrado
              </p>
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
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  )
}
