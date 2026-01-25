'use client'

import { useMemo, useState } from 'react'
import type { CampaignProperty, CampaignTask } from '../types'
import type { PropertyRow, TaskAggRow } from '../page'

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
  const [range, setRange] = useState<'today' | 'week' | '30' | 'all'>('today')
  const [modal, setModal] = useState<{ title: string; content: string } | null>(null)

  const pendingTasks = useMemo(() => tasks.filter((task) => !task.done_at), [tasks])

  const filteredPending = useMemo(() => {
    if (range === 'all') return pendingTasks

    const start = new Date()
    start.setHours(0, 0, 0, 0)
    const end = new Date(start)

    if (range === 'today') {
      end.setHours(23, 59, 59, 999)
    } else if (range === 'week') {
      end.setDate(end.getDate() + 7)
      end.setHours(23, 59, 59, 999)
    } else {
      end.setDate(end.getDate() + 30)
      end.setHours(23, 59, 59, 999)
    }

    return pendingTasks.filter((task) => {
      const due = new Date(task.due_date)
      return due >= start && due <= end
    })
  }, [pendingTasks, range])

  const openModal = (title: string, content: string | null) => {
    if (!content?.trim()) return
    setModal({ title, content })
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
          type="button"
          onClick={() => setRange('today')}
          className={`flex-1 rounded-xl px-4 py-2 text-sm font-medium ${
            range === 'today' ? 'bg-black text-white' : 'text-black/60 hover:bg-black/5'
          }`}
        >
          Hoje
        </button>
        <button
          type="button"
          onClick={() => setRange('week')}
          className={`flex-1 rounded-xl px-4 py-2 text-sm font-medium ${
            range === 'week' ? 'bg-black text-white' : 'text-black/60 hover:bg-black/5'
          }`}
        >
          Semana
        </button>
        <button
          type="button"
          onClick={() => setRange('30')}
          className={`flex-1 rounded-xl px-4 py-2 text-sm font-medium ${
            range === '30' ? 'bg-black text-white' : 'text-black/60 hover:bg-black/5'
          }`}
        >
          30 dias
        </button>
        <button
          type="button"
          onClick={() => setRange('all')}
          className={`flex-1 rounded-xl px-4 py-2 text-sm font-medium ${
            range === 'all' ? 'bg-black text-white' : 'text-black/60 hover:bg-black/5'
          }`}
        >
          Total
        </button>
      </div>

      {/* Tasks */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-black/90">Pendentes</h2>
        {filteredPending.map(task => (
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
                {task.whatsapp_text && (
                  <button
                    type="button"
                    onClick={() => openModal('Roteiro WhatsApp', task.whatsapp_text)}
                    className="rounded-xl border border-black/10 bg-white px-3 py-2 text-sm text-black/80 hover:bg-black/5"
                  >
                    Ver roteiro
                  </button>
                )}
                {task.reel_script && (
                  <button
                    type="button"
                    onClick={() => openModal('Roteiro Reels', task.reel_script)}
                    className="rounded-xl border border-black/10 bg-white px-3 py-2 text-sm text-black/80 hover:bg-black/5"
                  >
                    Ver roteiro
                  </button>
                )}
                {task.ads_checklist && (
                  <button
                    type="button"
                    onClick={() => openModal('Checklist', task.ads_checklist)}
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

      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-2xl border border-black/10 bg-white p-5 shadow-xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-black/90">{modal.title}</div>
                <div className="mt-2 whitespace-pre-wrap text-sm text-black/70">{modal.content}</div>
              </div>
              <button
                type="button"
                onClick={() => setModal(null)}
                className="rounded-lg border border-black/10 px-3 py-2 text-xs text-black/70 hover:bg-black/5"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
