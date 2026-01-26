'use client'

import { useState } from 'react'
import type { CampaignProperty, CampaignTask } from '../types'
import type { PropertyRow, TaskAggRow } from '../page'

type FilterRange = 'today' | 'week' | '30' | 'all'

function titleOf(p: PropertyRow) {
  return p.title?.trim() || `Imóvel ${p.id.slice(0, 6)}`
}

function subtitleOf(p: PropertyRow) {
  const cat =
    (p.property_categories && !Array.isArray(p.property_categories)
      ? p.property_categories?.name
      : Array.isArray(p.property_categories)
        ? p.property_categories?.[0]?.name
        : null) ?? null

  const parts = [cat, p.neighborhood, p.city].filter(Boolean)
  return parts.join(' • ') || '—'
}

export default function CampaignDetailPage({
  property,
  tasks,
}: {
  property: PropertyRow
  tasks: CampaignTask[]
}) {
  const cover = (property.cover_url || '').trim()
  const [filterRange, setFilterRange] = useState<FilterRange>('all')
  const [modalContent, setModalContent] = useState<{ type: 'roteiro' | 'checklist'; content: string } | null>(null)

  // Filter tasks based on filterRange
  const getFilteredTasks = (allTasks: CampaignTask[]) => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    
    const pendingTasks = allTasks.filter(t => !t.done_at)
    
    if (filterRange === 'all') {
      return pendingTasks
    }
    
    return pendingTasks.filter(task => {
      // Validate due_date exists
      if (!task.due_date) return false
      
      const dueDate = new Date(task.due_date)
      dueDate.setHours(0, 0, 0, 0)
      
      // Check if date is valid
      if (isNaN(dueDate.getTime())) return false
      
      if (filterRange === 'today') {
        return dueDate.getTime() === today.getTime()
      }
      
      if (filterRange === 'week') {
        const weekEnd = new Date(today)
        weekEnd.setDate(weekEnd.getDate() + 7)
        return dueDate >= today && dueDate < weekEnd
      }
      
      if (filterRange === '30') {
        const thirtyEnd = new Date(today)
        thirtyEnd.setDate(thirtyEnd.getDate() + 30)
        return dueDate >= today && dueDate < thirtyEnd
      }
      
      return true
    })
  }

  const filteredPendingTasks = getFilteredTasks(tasks)

  const handleOpenModal = (type: 'roteiro' | 'checklist', task: CampaignTask) => {
    if (type === 'roteiro') {
      const content = task.reel_script || task.whatsapp_text || ''
      setModalContent({ type, content })
    } else if (type === 'checklist') {
      const content = task.ads_checklist || ''
      setModalContent({ type, content })
    }
  }

  const handleCloseModal = () => {
    setModalContent(null)
  }

  return (
    <div className="space-y-6">
      {/* Imóvel Header */}
      <div className="rounded-3xl border border-black/10 bg-white p-5 shadow-sm">
        <div className="flex gap-4">
          <div className="h-20 w-24 shrink-0 overflow-hidden rounded-2xl bg-black/5">
            {cover ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={cover} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="h-full w-full bg-gradient-to-br from-black/10 to-transparent" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-lg font-semibold text-black/90">
              {titleOf(property)}
            </div>
            <div className="mt-1 truncate text-sm text-black/60">
              {subtitleOf(property)}
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <span className="rounded-full border border-black/10 bg-black/5 px-3 py-1 text-xs text-black/70">
                Execução total: {tasks.length}
              </span>
              <span className="rounded-full border border-black/10 bg-black/5 px-3 py-1 text-xs text-black/70">
                Pendentes: {tasks.filter(t => !t.done_at).length}
              </span>
              <span className="rounded-full border border-black/10 bg-black/5 px-3 py-1 text-xs text-black/70">
                Atrasadas: {tasks.filter(t => !t.done_at && new Date(t.due_date) < new Date()).length}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Abas */}
      <div className="flex gap-1 rounded-2xl border border-black/10 bg-white p-1 shadow-sm">
        <button 
          onClick={() => setFilterRange('today')}
          className={`flex-1 rounded-xl px-4 py-2 text-sm font-medium ${
            filterRange === 'today' 
              ? 'bg-black text-white' 
              : 'text-black/60 hover:bg-black/5'
          }`}
        >
          Hoje
        </button>
        <button 
          onClick={() => setFilterRange('week')}
          className={`flex-1 rounded-xl px-4 py-2 text-sm font-medium ${
            filterRange === 'week' 
              ? 'bg-black text-white' 
              : 'text-black/60 hover:bg-black/5'
          }`}
        >
          Semana
        </button>
        <button 
          onClick={() => setFilterRange('30')}
          className={`flex-1 rounded-xl px-4 py-2 text-sm font-medium ${
            filterRange === '30' 
              ? 'bg-black text-white' 
              : 'text-black/60 hover:bg-black/5'
          }`}
        >
          30 dias
        </button>
        <button 
          onClick={() => setFilterRange('all')}
          className={`flex-1 rounded-xl px-4 py-2 text-sm font-medium ${
            filterRange === 'all' 
              ? 'bg-black text-white' 
              : 'text-black/60 hover:bg-black/5'
          }`}
        >
          Total
        </button>
      </div>

      {/* Tasks */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-black/90">Pendentes ({filteredPendingTasks.length})</h2>
        {filteredPendingTasks.map(task => (
          <div key={task.id} className="rounded-2xl border border-black/10 bg-white p-4 shadow-sm">
            <div className="flex items-start justify-between">
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-black/90">{task.title}</div>
                <div className="mt-1 text-xs text-black/60">Venc. {new Date(task.due_date).toLocaleDateString()}</div>
                {task.is_required && (
                  <span className="mt-2 inline-block rounded-full border border-black/10 bg-black/5 px-2 py-1 text-xs text-black/70">
                    Obrigatória
                  </span>
                )}
                {new Date(task.due_date) < new Date() && (
                  <span className="mt-2 ml-2 inline-block rounded-full border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-700">
                    Atrasada
                  </span>
                )}
                {new Date(task.due_date).toDateString() === new Date().toDateString() && (
                  <span className="mt-2 ml-2 inline-block rounded-full border border-blue-200 bg-blue-50 px-2 py-1 text-xs text-blue-700">
                    Hoje
                  </span>
                )}
              </div>
              <div className="ml-4 flex gap-2">
                {(task.whatsapp_text || task.reel_script) && (
                  <button 
                    onClick={() => handleOpenModal('roteiro', task)}
                    className="rounded-xl border border-black/10 bg-white px-3 py-2 text-sm text-black/80 hover:bg-black/5"
                  >
                    Ver roteiro
                  </button>
                )}
                {task.ads_checklist && (
                  <button 
                    onClick={() => handleOpenModal('checklist', task)}
                    className="rounded-xl border border-black/10 bg-white px-3 py-2 text-sm text-black/80 hover:bg-black/5"
                  >
                    Ver checklist
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}

        <h2 className="text-lg font-semibold text-black/90">Concluídas</h2>
        {tasks.filter(t => t.done_at).map(task => (
          <div key={task.id} className="rounded-2xl border border-black/10 bg-black/5 p-4">
            <div className="text-sm font-medium text-black/70 line-through">{task.title}</div>
            <div className="mt-1 text-xs text-black/50">Concluída em {new Date(task.done_at!).toLocaleDateString()}</div>
          </div>
        ))}
      </div>

      {/* Modal */}
      {modalContent && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={handleCloseModal}
        >
          <div 
            className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-3xl border border-black/10 bg-white p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-black/90">
                {modalContent.type === 'roteiro' ? 'Roteiro' : 'Checklist'}
              </h3>
              <button
                onClick={handleCloseModal}
                className="rounded-xl border border-black/10 bg-white px-3 py-2 text-sm text-black/80 hover:bg-black/5"
              >
                Fechar
              </button>
            </div>
            <div className="whitespace-pre-wrap rounded-2xl border border-black/10 bg-black/5 p-4 text-sm text-black/80">
              {modalContent.content || 'Sem conteúdo disponível'}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
