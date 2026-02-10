/* eslint-disable @next/next/no-img-element */
"use client"

import React, { useCallback, useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabaseClient"

import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card"
import { Button } from "@/components/ui/Button"

import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core"
import {
  arrayMove,
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"

type Channel = "whatsapp" | "reels" | "story" | "feed" | "ads"

interface PropertyCategory {
  id: string
  name: string
  is_active: boolean
  position: number
}

interface CampaignTemplateTask {
  id: string
  template_id: string
  day_offset: number
  title: string
  channel: Channel
  is_required: boolean
  position: number
  whatsapp_text?: string | null
  reel_script?: string | null
  ads_checklist?: string | null

  // ✅ Opção B Premium (recorrência)
  repeat_days?: number[] | null
  repeat_every?: number | null
  repeat_until?: number | null
}

interface TemplateWithTasks {
  id: string
  property_category_id: string | null
  property_type_id?: string | null
  lead_type_id?: string | null
  name: string
  is_active: boolean

  // ✅ duração do template
  campaign_days?: number | null

  campaign_template_tasks?: CampaignTemplateTask[]
}

type RepeatMode = "none" | "days" | "every"

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ")
}

function clampInt(n: number, min: number, max: number) {
  if (Number.isNaN(n)) return min
  return Math.max(min, Math.min(max, n))
}

function parseDaysList(input: string): number[] {
  // aceita: "35,45,55" "35 45 55" "35;45"
  const parts = input
    .split(/[\s,;]+/g)
    .map((s) => s.trim())
    .filter(Boolean)

  const nums = parts
    .map((p) => parseInt(p, 10))
    .filter((n) => Number.isFinite(n))

  // unique + sort
  return Array.from(new Set(nums)).sort((a, b) => a - b)
}

function channelLabel(ch: Channel) {
  switch (ch) {
    case "whatsapp":
      return "WhatsApp"
    case "reels":
      return "Reels"
    case "story":
      return "Story"
    case "feed":
      return "Feed"
    case "ads":
      return "Ads"
  }
}

function channelTone(ch: Channel) {
  // só pra badge (sem depender de theme vars)
  switch (ch) {
    case "whatsapp":
      return "bg-emerald-600 text-white"
    case "reels":
      return "bg-sky-600 text-white"
    case "story":
      return "bg-violet-600 text-white"
    case "feed":
      return "bg-amber-600 text-white"
    case "ads":
      return "bg-zinc-800 text-white"
  }
}

function summarizeRepeat(task: CampaignTemplateTask, campaignDays: number) {
  const days = (task.repeat_days ?? []) as number[]
  const every = task.repeat_every ?? null
  const until = task.repeat_until ?? null

  if (days && days.length > 0) {
    const clipped = days.filter((d) => d >= 0 && d <= campaignDays)
    if (clipped.length === 0) return null
    const preview = clipped.slice(0, 6).join(", ")
    const rest = clipped.length > 6 ? ` +${clipped.length - 6}` : ""
    return `Repetições: ${preview}${rest}`
  }

  if (every && until !== null && until !== undefined) {
    const u = clampInt(until, 0, campaignDays)
    return `Repetições: a cada ${every} dias até o dia ${u}`
  }

  return null
}

function toMonthLabel(monthIndex: number) {
  return new Date(2020, monthIndex, 1).toLocaleDateString("pt-BR", { month: "long" })
}

function addDays(base: Date, days: number) {
  const next = new Date(base)
  next.setDate(next.getDate() + days)
  return next
}

function buildTaskDays(task: CampaignTemplateTask, campaignDays: number) {
  const base = clampInt(task.day_offset ?? 0, 0, campaignDays)
  const days = new Set<number>([base])

  const extraDays = (task.repeat_days ?? []) as number[]
  for (const d of extraDays) {
    if (Number.isFinite(d) && d >= 0 && d <= campaignDays) days.add(d)
  }

  if (task.repeat_every && task.repeat_until !== null && task.repeat_until !== undefined) {
    const every = Math.max(1, Number(task.repeat_every))
    const until = clampInt(Number(task.repeat_until), 0, campaignDays)
    for (let d = base + every; d <= until; d += every) {
      days.add(d)
    }
  }

  return Array.from(days).sort((a, b) => a - b)
}

export function CampaignsClient({
  propertyCategories,
  templates,
}: {
  propertyCategories: PropertyCategory[]
  templates: TemplateWithTasks[]
}) {
  const router = useRouter()

  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(
    propertyCategories?.[0]?.id || null
  )
  const [localTemplates, setLocalTemplates] = useState<TemplateWithTasks[]>(templates || [])
  const [loading, setLoading] = useState(false)
  const [categorySearch, setCategorySearch] = useState("")
  const [categoryStatus, setCategoryStatus] = useState<"all" | "active" | "inactive">("all")

  const [editingTemplateName, setEditingTemplateName] = useState<string>("")
  const [editingTemplateDays, setEditingTemplateDays] = useState<number>(30)

  const [taskModalOpen, setTaskModalOpen] = useState(false)
  const [editingTask, setEditingTask] = useState<CampaignTemplateTask | null>(null)
  const [taskSearch, setTaskSearch] = useState("")
  const [taskChannelFilter, setTaskChannelFilter] = useState<"all" | Channel>("all")
  const [summaryMonth, setSummaryMonth] = useState<number>(() => new Date().getMonth())
  const [summaryYear, setSummaryYear] = useState<number>(() => new Date().getFullYear())

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))

  const selectedCategory = useMemo(() => {
    if (!selectedCategoryId) return null
    return propertyCategories.find((c) => c.id === selectedCategoryId) || null
  }, [propertyCategories, selectedCategoryId])

  // ✅ Seleciona template pelo eixo NOVO (category)
  const selectedTemplate = useMemo(() => {
    if (!selectedCategoryId) return undefined
    return localTemplates.find((t) => t.property_category_id === selectedCategoryId)
  }, [localTemplates, selectedCategoryId])

  const campaignDays = useMemo(() => {
    const n = selectedTemplate?.campaign_days ?? 30
    return clampInt(Number(n), 1, 3650) // até 10 anos se quiser
  }, [selectedTemplate?.campaign_days])

  useEffect(() => {
    if (!selectedTemplate) return
    setEditingTemplateName(selectedTemplate.name || "")
    setEditingTemplateDays(campaignDays)
  }, [selectedTemplate, campaignDays])

  const tasksOrdered = useMemo(() => {
    return (selectedTemplate?.campaign_template_tasks || [])
      .slice()
      .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
  }, [selectedTemplate])

  const filteredTasks = useMemo(() => {
    const term = taskSearch.trim().toLowerCase()
    return tasksOrdered.filter((task) => {
      if (taskChannelFilter !== "all" && task.channel !== taskChannelFilter) return false
      if (term && !task.title.toLowerCase().includes(term)) return false
      return true
    })
  }, [tasksOrdered, taskChannelFilter, taskSearch])

  const dragEnabled = taskSearch.trim().length === 0 && taskChannelFilter === "all"

  const filteredCategories = useMemo(() => {
    const term = categorySearch.trim().toLowerCase()
    return propertyCategories
      .slice()
      .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
      .filter((pc) => {
        if (categoryStatus === "active" && !pc.is_active) return false
        if (categoryStatus === "inactive" && pc.is_active) return false
        if (term && !pc.name.toLowerCase().includes(term)) return false
        return true
      })
  }, [propertyCategories, categorySearch, categoryStatus])

  const summaryItems = useMemo(() => {
    if (!selectedTemplate) return []
    const baseDate = new Date(summaryYear, summaryMonth, 1)
    const items: Array<{
      key: string
      date: Date
      title: string
      channel: Channel
      dayOffset: number
      isRequired: boolean
    }> = []

    for (const task of tasksOrdered) {
      const days = buildTaskDays(task, campaignDays)
      for (const day of days) {
        const date = addDays(baseDate, day)
        if (date.getMonth() !== summaryMonth || date.getFullYear() !== summaryYear) continue
        items.push({
          key: `${task.id}-${day}`,
          date,
          title: task.title,
          channel: task.channel,
          dayOffset: day,
          isRequired: task.is_required,
        })
      }
    }

    return items.sort((a, b) => a.date.getTime() - b.date.getTime())
  }, [selectedTemplate, tasksOrdered, campaignDays, summaryMonth, summaryYear])

  // =========
  // CRUD Template
  // =========
  async function createTemplateForCategory(categoryId: string) {
    setLoading(true)
    try {
      const catName = propertyCategories.find((p) => p.id === categoryId)?.name || ""
      const name = `Campanha ${30} dias - ${catName}`

      // lead_type_id é NOT NULL no seu schema -> pega 1 existente como default
      const { data: leadTypes, error: ltErr } = await supabase
        .from("lead_types")
        .select("id, name")
        .order("name", { ascending: true })
        .limit(1)

      if (ltErr) throw ltErr
      const leadTypeId = leadTypes?.[0]?.id
      if (!leadTypeId) {
        throw new Error("Nenhum lead_type encontrado. Cadastre pelo menos 1 lead_type para criar templates.")
      }

      const { data, error } = await supabase
        .from("campaign_templates")
        .insert({
          property_category_id: categoryId,
          property_type_id: null,
          lead_type_id: leadTypeId,
          name,
          is_active: true,
          campaign_days: 30,
        })
        .select("id, property_category_id, property_type_id, lead_type_id, name, is_active, campaign_days")
        .single()

      if (error) throw error

      setLocalTemplates((prev) => [...prev, { ...(data as any), campaign_template_tasks: [] }])
      router.refresh()
    } finally {
      setLoading(false)
    }
  }

  async function updateTemplate(templateId: string, patch: Partial<TemplateWithTasks>) {
    setLoading(true)
    try {
      const { error } = await supabase.from("campaign_templates").update(patch).eq("id", templateId)
      if (error) throw error

      setLocalTemplates((prev) => prev.map((t) => (t.id === templateId ? { ...t, ...patch } : t)))
      router.refresh()
    } finally {
      setLoading(false)
    }
  }

  // =========
  // CRUD Task
  // =========
  async function createTask(templateId: string, values: Partial<CampaignTemplateTask>) {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from("campaign_template_tasks")
        .insert({ template_id: templateId, ...values })
        .select(
          "id, template_id, day_offset, title, channel, is_required, position, whatsapp_text, reel_script, ads_checklist, repeat_days, repeat_every, repeat_until"
        )
        .single()

      if (error) throw error

      setLocalTemplates((prev) =>
        prev.map((t) =>
          t.id === templateId
            ? { ...t, campaign_template_tasks: [...(t.campaign_template_tasks || []), data as any] }
            : t
        )
      )
      router.refresh()
    } finally {
      setLoading(false)
    }
  }

  async function updateTask(taskId: string, patch: Partial<CampaignTemplateTask>, templateId?: string) {
    setLoading(true)
    try {
      const { error } = await supabase.from("campaign_template_tasks").update(patch).eq("id", taskId)
      if (error) throw error

      if (templateId) {
        setLocalTemplates((prev) =>
          prev.map((t) =>
            t.id === templateId
              ? {
                  ...t,
                  campaign_template_tasks: (t.campaign_template_tasks || []).map((tk) =>
                    tk.id === taskId ? { ...tk, ...patch } : tk
                  ),
                }
              : t
          )
        )
      }
      router.refresh()
    } finally {
      setLoading(false)
    }
  }

  async function deleteTask(taskId: string, templateId?: string) {
    if (!confirm("Confirmar exclusão da tarefa?")) return
    setLoading(true)
    try {
      const { error } = await supabase.from("campaign_template_tasks").delete().eq("id", taskId)
      if (error) throw error

      if (templateId) {
        setLocalTemplates((prev) =>
          prev.map((t) =>
            t.id === templateId
              ? { ...t, campaign_template_tasks: (t.campaign_template_tasks || []).filter((tk) => tk.id !== taskId) }
              : t
          )
        )
      }
      router.refresh()
    } finally {
      setLoading(false)
    }
  }

  // =========
  // Reorder (Drag/Manual) com upsert (rápido)
  // =========
  async function persistPositions(templateId: string, items: CampaignTemplateTask[]) {
    const payload = items.map((t, idx) => ({ id: t.id, position: idx }))
    const { error } = await supabase.from("campaign_template_tasks").upsert(payload, { onConflict: "id" })
    if (error) throw error

    setLocalTemplates((prev) =>
      prev.map((tpl) =>
        tpl.id === templateId
          ? { ...tpl, campaign_template_tasks: items.map((t, idx) => ({ ...t, position: idx })) }
          : tpl
      )
    )
  }

  async function moveTask(templateId: string, taskId: string, direction: "up" | "down") {
    const tpl = localTemplates.find((t) => t.id === templateId)
    if (!tpl) return

    const tasks = [...(tpl.campaign_template_tasks || [])].sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
    const idx = tasks.findIndex((t) => t.id === taskId)
    if (idx === -1) return

    const swapIdx = direction === "up" ? idx - 1 : idx + 1
    if (swapIdx < 0 || swapIdx >= tasks.length) return

    const newOrder = arrayMove(tasks, idx, swapIdx)

    // otimista
    setLocalTemplates((prev) => prev.map((t) => (t.id === templateId ? { ...t, campaign_template_tasks: newOrder } : t)))

    setLoading(true)
    try {
      await persistPositions(templateId, newOrder)
      router.refresh()
    } finally {
      setLoading(false)
    }
  }

  async function handleDragEnd(event: DragEndEvent) {
    if (!dragEnabled) return
    const { active, over } = event
    if (!over || active.id === over.id) return
    if (!selectedTemplate) return

    const oldIndex = tasksOrdered.findIndex((t) => t.id === active.id)
    const newIndex = tasksOrdered.findIndex((t) => t.id === over.id)
    if (oldIndex === -1 || newIndex === -1) return

    const newOrder = arrayMove(tasksOrdered, oldIndex, newIndex)

    // otimista
    setLocalTemplates((prev) =>
      prev.map((t) => (t.id === selectedTemplate.id ? { ...t, campaign_template_tasks: newOrder } : t))
    )

    setLoading(true)
    try {
      await persistPositions(selectedTemplate.id, newOrder)
      router.refresh()
    } finally {
      setLoading(false)
    }
  }

  function openCreateTaskModal() {
    setEditingTask(null)
    setTaskModalOpen(true)
  }

  function openEditTaskModal(task: CampaignTemplateTask) {
    setEditingTask(task)
    setTaskModalOpen(true)
  }

  async function handleTaskModalSave(values: Partial<CampaignTemplateTask>) {
    if (!selectedTemplate) return
    if (editingTask) {
      await updateTask(editingTask.id, values, selectedTemplate.id)
    } else {
      const pos = (selectedTemplate.campaign_template_tasks || []).length
      await createTask(selectedTemplate.id, { ...values, position: pos })
    }
    setTaskModalOpen(false)
    setEditingTask(null)
  }

  return (
    <div className="w-full">
      {/* Header do módulo */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm text-[var(--muted-foreground)]">Configurações</div>
          <h1 className="text-3xl font-extrabold text-[var(--foreground)]">Editor de Campanhas</h1>
          <p className="mt-1 text-sm text-[var(--muted-foreground)]">
            Templates por categoria, tarefas em cards, reordenação por arrastar e repetição real (30/180 dias).
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <Button
            variant="outline"
            onClick={() => router.refresh()}
            disabled={loading}
            className="whitespace-nowrap"
          >
            Recarregar
          </Button>
          <Button
            onClick={() => router.push("/campaigns")}
            className="whitespace-nowrap"
            disabled={loading}
          >
            Pronto
          </Button>
        </div>
      </div>

      {/* Grid principal com altura disponível calculada */}
      <div className="grid min-h-[calc(100vh-220px)] grid-cols-1 gap-4 overflow-hidden lg:grid-cols-[380px_minmax(0,1fr)]">
        {/* Sidebar categorias */}
        <Card className="overflow-hidden">
          <CardHeader className="shrink-0">
            <CardTitle>Categorias de Imóvel</CardTitle>
          </CardHeader>

          <CardContent className="h-[calc(100%-72px)] overflow-auto space-y-3">
            <div className="space-y-3">
              <input
                value={categorySearch}
                onChange={(e) => setCategorySearch(e.target.value)}
                placeholder="Buscar categoria..."
                className="w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/10"
              />
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setCategoryStatus("all")}
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs font-bold",
                    categoryStatus === "all"
                      ? "border-black/20 bg-black text-white"
                      : "border-black/10 bg-white text-black/70 hover:bg-black/5"
                  )}
                >
                  Todas
                </button>
                <button
                  type="button"
                  onClick={() => setCategoryStatus("active")}
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs font-bold",
                    categoryStatus === "active"
                      ? "border-black/20 bg-black text-white"
                      : "border-black/10 bg-white text-black/70 hover:bg-black/5"
                  )}
                >
                  Ativas
                </button>
                <button
                  type="button"
                  onClick={() => setCategoryStatus("inactive")}
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs font-bold",
                    categoryStatus === "inactive"
                      ? "border-black/20 bg-black text-white"
                      : "border-black/10 bg-white text-black/70 hover:bg-black/5"
                  )}
                >
                  Inativas
                </button>
              </div>
            </div>

            {filteredCategories.length === 0 ? (
              <div className="text-sm text-[var(--muted-foreground)]">
                {propertyCategories.length === 0 ? "Nenhuma categoria cadastrada." : "Nenhuma categoria encontrada."}
              </div>
            ) : (
              filteredCategories.map((pc) => {
                const isSelected = pc.id === selectedCategoryId
                return (
                  <button
                    key={pc.id}
                    onClick={() => setSelectedCategoryId(pc.id)}
                    className={cn(
                      "w-full rounded-2xl border p-4 text-left transition",
                      isSelected ? "border-black/10 bg-[var(--accent)]" : "border-black/10 bg-white hover:bg-black/5"
                    )}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-lg font-extrabold text-black/90">{pc.name}</div>
                        <div className="mt-1 text-sm text-black/60">{pc.is_active ? "Ativa" : "Inativa"}</div>
                      </div>

                      <div className="shrink-0">
                        {isSelected ? (
                          <span className="rounded-full bg-emerald-600 px-3 py-1 text-xs font-bold text-white">
                            Selecionada
                          </span>
                        ) : (
                          <span className="text-sm font-semibold text-black/70">Abrir</span>
                        )}
                      </div>
                    </div>
                  </button>
                )
              })
            )}
          </CardContent>
        </Card>

        {/* Conteúdo à direita */}
        <div className="min-w-0 h-full overflow-hidden">
          <div className="h-full overflow-auto pr-1 space-y-4 min-w-0">
            {!selectedCategoryId && (
              <Card>
                <CardContent className="py-10 text-center text-[var(--muted-foreground)]">
                  Selecione uma categoria.
                </CardContent>
              </Card>
            )}

            {selectedCategoryId && (
              <>
                {/* Card Template */}
                <Card className="overflow-hidden">
                  <CardHeader className="flex flex-row items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm text-[var(--muted-foreground)]">Template</div>
                      <div className="mt-1 text-2xl font-extrabold text-[var(--foreground)]">
                        {selectedCategory?.name || "Categoria"}
                      </div>
                    </div>

                    <div className="flex shrink-0 items-center gap-2">
                      {selectedTemplate ? (
                        <>
                          <span
                            className={cn(
                              "rounded-full px-3 py-1 text-xs font-bold",
                              selectedTemplate.is_active ? "bg-emerald-600 text-white" : "bg-zinc-200 text-zinc-800"
                            )}
                          >
                            {selectedTemplate.is_active ? "Ativo" : "Inativo"}
                          </span>
                        </>
                      ) : (
                        <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-bold text-zinc-700">
                          Sem template
                        </span>
                      )}
                    </div>
                  </CardHeader>

                  <CardContent className="space-y-4">
                    {!selectedTemplate && (
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="text-sm text-[var(--muted-foreground)]">
                          Nenhum template existe para esta categoria.
                        </div>
                        <Button
                          onClick={() => createTemplateForCategory(selectedCategoryId)}
                          disabled={loading}
                          className="whitespace-nowrap"
                        >
                          Criar template padrão
                        </Button>
                      </div>
                    )}

                    {selectedTemplate && (
                      <>
                        <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_200px_240px]">
                          <div className="min-w-0">
                            <label className="text-sm font-semibold text-[var(--foreground)]">Nome do template</label>
                            <input
                              value={editingTemplateName}
                              onChange={(e) => setEditingTemplateName(e.target.value)}
                              className="mt-1 w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/10"
                            />
                          </div>

                          <div>
                            <label className="text-sm font-semibold text-[var(--foreground)]">Duração (dias)</label>
                            <input
                              type="number"
                              value={editingTemplateDays}
                              min={1}
                              max={3650}
                              onChange={(e) => setEditingTemplateDays(clampInt(parseInt(e.target.value || "30", 10), 1, 3650))}
                              className="mt-1 w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/10"
                            />
                            <div className="mt-1 text-xs text-[var(--muted-foreground)]">
                              Ex: 30, 90, 180 (você pode ir além).
                            </div>
                          </div>

                          <div className="flex items-end gap-2">
                            <Button
                              variant="outline"
                              onClick={() =>
                                updateTemplate(selectedTemplate.id, { is_active: !selectedTemplate.is_active })
                              }
                              disabled={loading}
                              className="whitespace-nowrap"
                            >
                              {selectedTemplate.is_active ? "Desativar" : "Ativar"}
                            </Button>

                            <Button
                              onClick={() => {
                                const nextName = (editingTemplateName || "").trim()
                                const nextDays = clampInt(Number(editingTemplateDays), 1, 3650)
                                if (!nextName) return
                                updateTemplate(selectedTemplate.id, {
                                  name: nextName,
                                  campaign_days: nextDays,
                                })
                              }}
                              disabled={loading}
                              className="whitespace-nowrap"
                            >
                              Salvar
                            </Button>
                          </div>
                        </div>
                      </>
                    )}
                  </CardContent>
                </Card>

                {/* Card Tarefas */}
                {selectedTemplate && (
                  <Card className="overflow-hidden">
                    <CardHeader className="flex flex-row items-start justify-between gap-3">
                      <div className="min-w-0">
                        <CardTitle>Tarefas do Template</CardTitle>
                        <div className="mt-1 text-sm text-[var(--muted-foreground)]">
                          Arraste para reordenar. Suporta repetição real (dias extras ou a cada X dias).
                        </div>
                      </div>

                      <div className="flex shrink-0 items-center gap-2">
                        <div className="text-sm text-[var(--muted-foreground)]">
                          {tasksOrdered.length} tarefa{tasksOrdered.length === 1 ? "" : "s"}
                        </div>
                        <Button onClick={openCreateTaskModal} disabled={loading} className="whitespace-nowrap">
                          + Adicionar tarefa
                        </Button>
                      </div>
                    </CardHeader>

                    <CardContent className="h-[calc(100%-72px)] overflow-auto space-y-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <input
                          value={taskSearch}
                          onChange={(e) => setTaskSearch(e.target.value)}
                          placeholder="Buscar tarefa..."
                          className="min-w-[180px] flex-1 rounded-xl border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/10"
                        />
                        <select
                          value={taskChannelFilter}
                          onChange={(e) => setTaskChannelFilter(e.target.value as "all" | Channel)}
                          className="rounded-xl border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/10"
                        >
                          <option value="all">Todos os canais</option>
                          <option value="whatsapp">WhatsApp</option>
                          <option value="reels">Reels</option>
                          <option value="story">Story</option>
                          <option value="feed">Feed</option>
                          <option value="ads">Ads</option>
                        </select>
                        <div className="ml-auto text-sm text-[var(--muted-foreground)]">
                          {filteredTasks.length} visíveis
                        </div>
                      </div>

                      {!dragEnabled && (
                        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                          Filtros ativos: reordenação por arrastar fica desativada.
                        </div>
                      )}

                      {filteredTasks.length === 0 ? (
                        <div className="py-10 text-center text-sm text-[var(--muted-foreground)]">
                          {tasksOrdered.length === 0
                            ? "Sem tarefas ainda. Clique em “Adicionar tarefa”."
                            : "Nenhuma tarefa encontrada para os filtros atuais."}
                        </div>
                      ) : (
                        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                          <SortableContext items={filteredTasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
                            <div className="space-y-3">
                              {filteredTasks.map((task) => (
                                <TaskCard
                                  key={task.id}
                                  task={task}
                                  campaignDays={campaignDays}
                                  dragDisabled={!dragEnabled}
                                  loading={loading}
                                  onEdit={() => openEditTaskModal(task)}
                                  onDelete={() => deleteTask(task.id, selectedTemplate.id)}
                                  onUp={() => moveTask(selectedTemplate.id, task.id, "up")}
                                  onDown={() => moveTask(selectedTemplate.id, task.id, "down")}
                                />
                              ))}
                            </div>
                          </SortableContext>
                        </DndContext>
                      )}
                    </CardContent>
                  </Card>
                )}

                {selectedTemplate && (
                  <Card className="overflow-hidden">
                    <CardHeader className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <CardTitle>Resumo do mês</CardTitle>
                        <div className="mt-1 text-sm text-[var(--muted-foreground)]">
                          Prévia das tarefas geradas com repetição. Base: início do mês selecionado.
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button variant="outline" onClick={() => window.print()} className="whitespace-nowrap">
                          Imprimir
                        </Button>
                        <select
                          value={summaryMonth}
                          onChange={(e) => setSummaryMonth(parseInt(e.target.value, 10))}
                          className="rounded-xl border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/10"
                        >
                          {Array.from({ length: 12 }).map((_, idx) => (
                            <option key={idx} value={idx}>
                              {toMonthLabel(idx)}
                            </option>
                          ))}
                        </select>
                        <input
                          type="number"
                          value={summaryYear}
                          min={2000}
                          max={2100}
                          onChange={(e) => setSummaryYear(parseInt(e.target.value || String(new Date().getFullYear()), 10))}
                          className="w-[110px] rounded-xl border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/10"
                        />
                      </div>
                    </CardHeader>

                    <CardContent className="space-y-3">
                      {summaryItems.length === 0 ? (
                        <div className="py-6 text-center text-sm text-[var(--muted-foreground)]">
                          Nenhuma tarefa cai neste mês.
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {summaryItems.map((item) => (
                            <div
                              key={item.key}
                              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-black/10 bg-white px-3 py-2"
                            >
                              <div className="flex min-w-0 items-center gap-3">
                                <input type="checkbox" className="h-4 w-4 rounded border-black/20" />
                                <div className="min-w-0">
                                  <div className="text-sm font-semibold text-black/90">{item.title}</div>
                                  <div className="text-xs text-black/60">
                                    {item.date.toLocaleDateString("pt-BR")} • Dia {item.dayOffset}
                                  </div>
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className={cn("rounded-full px-2 py-1 text-xs font-bold", channelTone(item.channel))}>
                                  {channelLabel(item.channel)}
                                </span>
                                {item.isRequired ? (
                                  <span className="rounded-full bg-emerald-600 px-2 py-1 text-xs font-bold text-white">
                                    Obrigatória
                                  </span>
                                ) : (
                                  <span className="rounded-full bg-zinc-200 px-2 py-1 text-xs font-bold text-zinc-800">
                                    Opcional
                                  </span>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {taskModalOpen && (
        <TaskModal
          campaignDays={campaignDays}
          initial={editingTask}
          onCancel={() => {
            setTaskModalOpen(false)
            setEditingTask(null)
          }}
          onSave={handleTaskModalSave}
        />
      )}
    </div>
  )
}

function TaskCard({
  task,
  campaignDays,
  dragDisabled,
  loading,
  onEdit,
  onDelete,
  onUp,
  onDown,
}: {
  task: CampaignTemplateTask
  campaignDays: number
  dragDisabled: boolean
  loading: boolean
  onEdit: () => void
  onDelete: () => void
  onUp: () => void
  onDown: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
    disabled: dragDisabled,
  })

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  const repeatSummary = summarizeRepeat(task, campaignDays)

  return (
    <div
      ref={setNodeRef as any}
      style={style}
      {...attributes}
      className={cn(
        "rounded-2xl border border-black/10 bg-white p-4 shadow-sm transition",
        isDragging && "opacity-70"
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-black/5 px-3 py-1 text-xs font-extrabold text-black/80">
              Dia {clampInt(task.day_offset ?? 0, 0, campaignDays)}
            </span>

            <span className={cn("rounded-full px-3 py-1 text-xs font-extrabold", channelTone(task.channel))}>
              {channelLabel(task.channel)}
            </span>

            {task.is_required ? (
              <span className="rounded-full bg-emerald-600 px-3 py-1 text-xs font-extrabold text-white">
                Obrigatória
              </span>
            ) : (
              <span className="rounded-full bg-zinc-200 px-3 py-1 text-xs font-extrabold text-zinc-800">
                Opcional
              </span>
            )}
          </div>

          <div className="mt-3 flex items-start gap-3">
            <div className="min-w-0">
              <div className="truncate text-lg font-extrabold text-black/90">{task.title}</div>
              <div className="mt-1 space-y-1 text-sm text-black/60">
                {task.whatsapp_text ? <div>• Texto WhatsApp</div> : null}
                {task.reel_script ? <div>• Roteiro Reels</div> : null}
                {task.ads_checklist ? <div>• Checklist Ads</div> : null}
                {repeatSummary ? <div>• {repeatSummary}</div> : null}
              </div>
            </div>
          </div>
        </div>

        {/* Ações */}
        <div className="flex shrink-0 items-center gap-2">
          {/* Drag handle */}
          <button
            type="button"
            {...listeners}
            title="Arraste para reordenar"
            className="rounded-xl border border-black/10 bg-white px-3 py-2 text-sm text-black/70 hover:bg-black/5"
            disabled={loading || dragDisabled}
          >
            ⋮⋮
          </button>

          <Button variant="outline" onClick={onUp} disabled={loading || dragDisabled} title="Subir">
            ↑
          </Button>
          <Button variant="outline" onClick={onDown} disabled={loading || dragDisabled} title="Descer">
            ↓
          </Button>

          <Button variant="outline" onClick={onEdit} disabled={loading}>
            Editar
          </Button>

          <Button variant="destructive" onClick={onDelete} disabled={loading}>
            Excluir
          </Button>
        </div>
      </div>
    </div>
  )
}

function TaskModal({
  initial,
  onCancel,
  onSave,
  campaignDays,
}: {
  initial: CampaignTemplateTask | null
  onCancel: () => void
  onSave: (values: Partial<CampaignTemplateTask>) => void
  campaignDays: number
}) {
  const [title, setTitle] = useState(initial?.title ?? "")
  const [dayOffset, setDayOffset] = useState<number>(initial?.day_offset ?? 0)
  const [channel, setChannel] = useState<Channel>(initial?.channel ?? "whatsapp")
  const [isRequired, setIsRequired] = useState<boolean>(initial?.is_required ?? true)

  const [whatsappText, setWhatsappText] = useState<string>(initial?.whatsapp_text ?? "")
  const [reelScript, setReelScript] = useState<string>(initial?.reel_script ?? "")
  const [adsChecklist, setAdsChecklist] = useState<string>(initial?.ads_checklist ?? "")

  // ✅ Opção B Premium (recorrência)
  const [repeatMode, setRepeatMode] = useState<RepeatMode>(() => {
    const hasDays = (initial?.repeat_days ?? [])?.length > 0
    const hasEvery = !!initial?.repeat_every && (initial?.repeat_until ?? null) !== null
    if (hasDays) return "days"
    if (hasEvery) return "every"
    return "none"
  })

  const [repeatDaysText, setRepeatDaysText] = useState<string>(() => {
    const arr = (initial?.repeat_days ?? []) as number[]
    return arr?.length ? arr.join(",") : ""
  })

  const [repeatEvery, setRepeatEvery] = useState<number>(initial?.repeat_every ?? 7)
  const [repeatUntil, setRepeatUntil] = useState<number>(initial?.repeat_until ?? campaignDays)

  const safeDay = useMemo(() => clampInt(dayOffset, 0, campaignDays), [dayOffset, campaignDays])
  const safeUntil = useMemo(() => clampInt(repeatUntil, 0, campaignDays), [repeatUntil, campaignDays])

  const parsedRepeatDays = useMemo(() => {
    const arr = parseDaysList(repeatDaysText)
      .filter((d) => d >= 0 && d <= campaignDays)
      .filter((d) => d !== safeDay) // evita duplicar o “dia base”
    return arr
  }, [repeatDaysText, campaignDays, safeDay])

  return (
    <div className="fixed inset-0 z-[60] bg-black/40 flex items-center justify-center p-4">
      <div className="w-full max-w-3xl max-h-[85vh] overflow-auto rounded-2xl bg-white shadow-xl border border-black/10">
        <div className="p-4 border-b border-black/10 flex items-start justify-between gap-3">
          <div>
            <div className="text-sm text-black/60">{initial ? "Editar tarefa" : "Nova tarefa"}</div>
            <div className="text-xl font-extrabold text-black/90">Detalhes e Repetição</div>
          </div>
          <button
            onClick={onCancel}
            className="rounded-xl border border-black/10 bg-white px-3 py-2 text-sm text-black/70 hover:bg-black/5"
          >
            Fechar
          </button>
        </div>

        <div className="p-4 space-y-5">
          {/* Linha 1 */}
          <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_180px]">
            <div>
              <label className="text-sm font-semibold text-black/90">Título</label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="mt-1 w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/10"
                placeholder="Ex: Disparo inicial para base (WhatsApp)"
              />
            </div>

            <div>
              <label className="text-sm font-semibold text-black/90">Dia (0..{campaignDays})</label>
              <input
                type="number"
                value={dayOffset}
                min={0}
                max={campaignDays}
                onChange={(e) => setDayOffset(parseInt(e.target.value || "0", 10))}
                className="mt-1 w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/10"
              />
            </div>
          </div>

          {/* Linha 2 */}
          <div className="grid grid-cols-1 gap-3 md:grid-cols-[240px_180px_1fr]">
            <div>
              <label className="text-sm font-semibold text-black/90">Canal</label>
              <select
                value={channel}
                onChange={(e) => setChannel(e.target.value as Channel)}
                className="mt-1 w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/10"
              >
                <option value="whatsapp">WhatsApp</option>
                <option value="reels">Reels</option>
                <option value="story">Story</option>
                <option value="feed">Feed</option>
                <option value="ads">Ads</option>
              </select>
            </div>

            <div className="flex items-end">
              <label className="flex items-center gap-2 text-sm font-semibold text-black/90">
                <input
                  type="checkbox"
                  checked={isRequired}
                  onChange={(e) => setIsRequired(e.target.checked)}
                />
                Obrigatória
              </label>
            </div>

            <div className="text-sm text-black/60 md:pt-7">
              Dica: use repetição para campanhas longas (90/180 dias) sem duplicar manualmente.
            </div>
          </div>

          {/* Repetição */}
          <div className="rounded-2xl border border-black/10 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-sm font-extrabold text-black/90">Repetição (Opção B Premium)</div>
                <div className="text-sm text-black/60">Escolha um modo: sem repetição, dias específicos ou a cada X dias.</div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setRepeatMode("none")}
                  className={cn(
                    "rounded-xl border px-3 py-2 text-sm font-semibold",
                    repeatMode === "none" ? "border-black/20 bg-black text-white" : "border-black/10 bg-white text-black/70 hover:bg-black/5"
                  )}
                >
                  Sem
                </button>
                <button
                  type="button"
                  onClick={() => setRepeatMode("days")}
                  className={cn(
                    "rounded-xl border px-3 py-2 text-sm font-semibold",
                    repeatMode === "days" ? "border-black/20 bg-black text-white" : "border-black/10 bg-white text-black/70 hover:bg-black/5"
                  )}
                >
                  Dias
                </button>
                <button
                  type="button"
                  onClick={() => setRepeatMode("every")}
                  className={cn(
                    "rounded-xl border px-3 py-2 text-sm font-semibold",
                    repeatMode === "every" ? "border-black/20 bg-black text-white" : "border-black/10 bg-white text-black/70 hover:bg-black/5"
                  )}
                >
                  A cada
                </button>
              </div>
            </div>

            {repeatMode === "none" && (
              <div className="mt-3 text-sm text-black/60">
                Esta tarefa acontece apenas no <b>Dia {safeDay}</b>.
              </div>
            )}

            {repeatMode === "days" && (
              <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-[1fr_280px]">
                <div>
                  <label className="text-sm font-semibold text-black/90">Dias extras (ex: 35,45,55)</label>
                  <input
                    value={repeatDaysText}
                    onChange={(e) => setRepeatDaysText(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/10"
                    placeholder="Ex: 35,45,55,90,120,180"
                  />
                  <div className="mt-2 text-xs text-black/60">
                    Aceita separação por vírgula, espaço ou ponto-e-vírgula. Limite: 0..{campaignDays}. (Dia base: {safeDay})
                  </div>
                </div>

                <div className="rounded-xl border border-black/10 bg-black/5 p-3">
                  <div className="text-xs font-bold text-black/70">Prévia</div>
                  <div className="mt-2 text-sm text-black/80">
                    {parsedRepeatDays.length ? (
                      <>
                        Repetições: <b>{parsedRepeatDays.slice(0, 12).join(", ")}</b>
                        {parsedRepeatDays.length > 12 ? ` +${parsedRepeatDays.length - 12}` : ""}
                      </>
                    ) : (
                      "Nenhum dia extra definido."
                    )}
                  </div>
                </div>
              </div>
            )}

            {repeatMode === "every" && (
              <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
                <div>
                  <label className="text-sm font-semibold text-black/90">Repetir a cada (dias)</label>
                  <input
                    type="number"
                    value={repeatEvery}
                    min={1}
                    max={3650}
                    onChange={(e) => setRepeatEvery(Math.max(1, parseInt(e.target.value || "7", 10)))}
                    className="mt-1 w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/10"
                  />
                </div>

                <div>
                  <label className="text-sm font-semibold text-black/90">Até o dia</label>
                  <input
                    type="number"
                    value={repeatUntil}
                    min={0}
                    max={campaignDays}
                    onChange={(e) => setRepeatUntil(parseInt(e.target.value || String(campaignDays), 10))}
                    className="mt-1 w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/10"
                  />
                  <div className="mt-2 text-xs text-black/60">Limite: 0..{campaignDays}</div>
                </div>

                <div className="rounded-xl border border-black/10 bg-black/5 p-3">
                  <div className="text-xs font-bold text-black/70">Prévia</div>
                  <div className="mt-2 text-sm text-black/80">
                    A cada <b>{Math.max(1, repeatEvery)}</b> até <b>{safeUntil}</b>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Conteúdo por canal */}
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <div className="md:col-span-1">
              <label className="text-sm font-semibold text-black/90">Texto WhatsApp</label>
              <textarea
                value={whatsappText}
                onChange={(e) => setWhatsappText(e.target.value)}
                className="mt-1 w-full min-h-[110px] rounded-xl border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/10"
                placeholder="Mensagem sugerida…"
              />
            </div>

            <div className="md:col-span-1">
              <label className="text-sm font-semibold text-black/90">Roteiro Reels</label>
              <textarea
                value={reelScript}
                onChange={(e) => setReelScript(e.target.value)}
                className="mt-1 w-full min-h-[110px] rounded-xl border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/10"
                placeholder="Gancho, prova, CTA…"
              />
            </div>

            <div className="md:col-span-1">
              <label className="text-sm font-semibold text-black/90">Checklist Ads</label>
              <textarea
                value={adsChecklist}
                onChange={(e) => setAdsChecklist(e.target.value)}
                className="mt-1 w-full min-h-[110px] rounded-xl border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black/10"
                placeholder="- Criativo\n- Público\n- Budget…"
              />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-black/10 flex items-center justify-end gap-2">
          <Button variant="outline" onClick={onCancel}>
            Cancelar
          </Button>

          <Button
            onClick={() => {
              const nextTitle = title.trim()
              if (!nextTitle) return

              const baseDay = clampInt(Number(dayOffset), 0, campaignDays)

              let repeat_days: number[] | null = null
              let repeat_every: number | null = null
              let repeat_until: number | null = null

              if (repeatMode === "days") {
                repeat_days = parsedRepeatDays.length ? parsedRepeatDays : null
              } else if (repeatMode === "every") {
                repeat_every = Math.max(1, Number(repeatEvery))
                repeat_until = clampInt(Number(repeatUntil), 0, campaignDays)
              }

              onSave({
                title: nextTitle,
                day_offset: baseDay,
                channel,
                is_required: isRequired,
                whatsapp_text: whatsappText.trim() ? whatsappText : null,
                reel_script: reelScript.trim() ? reelScript : null,
                ads_checklist: adsChecklist.trim() ? adsChecklist : null,

                // ✅ Opção B Premium
                repeat_days,
                repeat_every,
                repeat_until,
              })
            }}
          >
            Salvar
          </Button>
        </div>
      </div>
    </div>
  )
}
