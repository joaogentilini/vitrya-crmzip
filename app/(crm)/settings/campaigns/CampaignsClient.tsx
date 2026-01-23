"use client"

import { useState, useMemo } from "react"
import { supabase } from "@/lib/supabaseClient"
import { useRouter } from "next/navigation"
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
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
}

interface TemplateWithTasks {
  id: string
  // NOVO: templates por categoria
  property_category_id: string | null
  // LEGADO (fallback): templates por tipo (se ainda existir no seu banco)
  property_type_id?: string | null

  lead_type_id?: string | null
  name: string
  is_active: boolean
  campaign_template_tasks?: CampaignTemplateTask[]
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
    propertyCategories[0]?.id || null
  )
  const [localTemplates, setLocalTemplates] = useState<TemplateWithTasks[]>(
    templates || []
  )
  const [editingTemplateName, setEditingTemplateName] = useState<string | null>(
    null
  )
  const [loading, setLoading] = useState(false)
  const [taskModalOpen, setTaskModalOpen] = useState(false)
  const [editingTask, setEditingTask] = useState<CampaignTemplateTask | null>(
    null
  )

  const sensors = useSensors(useSensor(PointerSensor))

  // Seleciona template pelo NOVO eixo (category). Não usa fallback aqui para não confundir.
  const selectedTemplate = useMemo(() => {
    if (!selectedCategoryId) return undefined
    return localTemplates.find((t) => t.property_category_id === selectedCategoryId)
  }, [localTemplates, selectedCategoryId])

  const tasksOrdered = useMemo(() => {
    return (selectedTemplate?.campaign_template_tasks || [])
      .slice()
      .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
  }, [selectedTemplate])

  async function createTemplateForCategory(categoryId: string) {
    setLoading(true)
    try {
      const catName =
        propertyCategories.find((p) => p.id === categoryId)?.name || ""
      const name = `Campanha 30 dias - ${catName}`

      // IMPORTANTE: lead_type_id é NOT NULL no seu schema.
      // Estratégia: pegar um lead_type_id existente (primeiro ativo) como default,
      // se a UI ainda não tiver seleção de lead type.
      const { data: leadTypes, error: ltErr } = await supabase
        .from("lead_types")
        .select("id, name")
        .order("name", { ascending: true })
        .limit(1)

      if (ltErr) throw ltErr
      const leadTypeId = leadTypes?.[0]?.id
      if (!leadTypeId) {
        throw new Error(
          "Nenhum lead_type encontrado. Cadastre pelo menos 1 lead_type para criar templates."
        )
      }

      const { data, error } = await supabase
        .from("campaign_templates")
        .insert({
          property_category_id: categoryId,
          // mantém legado nulo
          property_type_id: null,
          lead_type_id: leadTypeId,
          name,
          is_active: true,
        })
        .select(
          "id, property_category_id, property_type_id, lead_type_id, name, is_active"
        )
        .single()

      if (error) throw error

      setLocalTemplates((prev) => [
        ...prev,
        { ...(data as any), campaign_template_tasks: [] },
      ])
      setEditingTemplateName(null)
      router.refresh()
    } finally {
      setLoading(false)
    }
  }

  async function updateTemplate(templateId: string, patch: Partial<TemplateWithTasks>) {
    setLoading(true)
    try {
      const { error } = await supabase
        .from("campaign_templates")
        .update(patch)
        .eq("id", templateId)
      if (error) throw error

      setLocalTemplates((prev) =>
        prev.map((t) => (t.id === templateId ? { ...t, ...patch } : t))
      )
      router.refresh()
    } finally {
      setLoading(false)
    }
  }

  async function createTask(templateId: string, values: Partial<CampaignTemplateTask>) {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from("campaign_template_tasks")
        .insert({ template_id: templateId, ...values })
        .select(
          "id, template_id, day_offset, title, channel, is_required, position, whatsapp_text, reel_script, ads_checklist"
        )
        .single()
      if (error) throw error

      setLocalTemplates((prev) =>
        prev.map((t) =>
          t.id === templateId
            ? {
                ...t,
                campaign_template_tasks: [
                  ...(t.campaign_template_tasks || []),
                  data as any,
                ],
              }
            : t
        )
      )
      router.refresh()
    } finally {
      setLoading(false)
    }
  }

  async function updateTask(
    taskId: string,
    patch: Partial<CampaignTemplateTask>,
    templateId?: string
  ) {
    setLoading(true)
    try {
      const { error } = await supabase
        .from("campaign_template_tasks")
        .update(patch)
        .eq("id", taskId)
      if (error) throw error

      if (templateId) {
        setLocalTemplates((prev) =>
          prev.map((t) =>
            t.id === templateId
              ? {
                  ...t,
                  campaign_template_tasks: (t.campaign_template_tasks || []).map(
                    (tk) => (tk.id === taskId ? { ...tk, ...patch } : tk)
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
      const { error } = await supabase
        .from("campaign_template_tasks")
        .delete()
        .eq("id", taskId)
      if (error) throw error

      if (templateId) {
        setLocalTemplates((prev) =>
          prev.map((t) =>
            t.id === templateId
              ? {
                  ...t,
                  campaign_template_tasks: (t.campaign_template_tasks || []).filter(
                    (tk) => tk.id !== taskId
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

  async function moveTask(
    templateId: string,
    taskId: string,
    direction: "up" | "down"
  ) {
    const tpl = localTemplates.find((t) => t.id === templateId)
    if (!tpl) return
    const tasks = [...(tpl.campaign_template_tasks || [])].sort(
      (a, b) => (a.position ?? 0) - (b.position ?? 0)
    )
    const idx = tasks.findIndex((t) => t.id === taskId)
    if (idx === -1) return
    const swapIdx = direction === "up" ? idx - 1 : idx + 1
    if (swapIdx < 0 || swapIdx >= tasks.length) return

    const a = tasks[idx]
    const b = tasks[swapIdx]

    await updateTask(a.id, { position: b.position }, templateId)
    await updateTask(b.id, { position: a.position }, templateId)
    router.refresh()
  }

  async function handleDragEnd(event: any) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    if (!selectedTemplate) return

    const oldIndex = tasksOrdered.findIndex((t) => t.id === active.id)
    const newIndex = tasksOrdered.findIndex((t) => t.id === over.id)
    if (oldIndex === -1 || newIndex === -1) return

    const newOrder = arrayMove(tasksOrdered, oldIndex, newIndex)

    // optimistic update
    setLocalTemplates((prev) =>
      prev.map((t) =>
        t.id === selectedTemplate.id ? { ...t, campaign_template_tasks: newOrder } : t
      )
    )

    try {
      setLoading(true)
      for (let i = 0; i < newOrder.length; i++) {
        const task = newOrder[i]
        const { error } = await supabase
          .from("campaign_template_tasks")
          .update({ position: i })
          .eq("id", task.id)
        if (error) throw error
      }
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
    <div style={{ display: "flex", gap: 16, padding: 16 }}>
      <div style={{ width: 300, borderRight: "1px solid #e5e7eb", paddingRight: 12 }}>
        <h3>Categorias de Imóvel</h3>

        {propertyCategories.length === 0 ? (
          <p style={{ marginTop: 8, opacity: 0.7 }}>
            Nenhuma categoria cadastrada.
          </p>
        ) : (
          <ul style={{ listStyle: "none", padding: 0, marginTop: 8 }}>
            {propertyCategories.map((pc) => (
              <li key={pc.id} style={{ marginBottom: 8 }}>
                <button
                  onClick={() => setSelectedCategoryId(pc.id)}
                  style={{
                    background:
                      pc.id === selectedCategoryId ? "#294487" : "transparent",
                    color: pc.id === selectedCategoryId ? "white" : "inherit",
                    padding: "8px 10px",
                    width: "100%",
                    textAlign: "left",
                    borderRadius: 6,
                    opacity: pc.is_active ? 1 : 0.6,
                  }}
                >
                  {pc.name}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div style={{ flex: 1 }}>
        {!selectedCategoryId && <div>Selecione uma categoria</div>}

        {selectedCategoryId && (
          <div>
            <h2>
              Template para:{" "}
              {propertyCategories.find((p) => p.id === selectedCategoryId)?.name}
            </h2>

            {!selectedTemplate && (
              <div style={{ marginTop: 8 }}>
                <p>Nenhum template existente para esta categoria.</p>
                <button
                  onClick={() => createTemplateForCategory(selectedCategoryId)}
                  disabled={loading}
                >
                  Criar template padrão
                </button>
              </div>
            )}

            {selectedTemplate && (
              <div style={{ marginTop: 12 }}>
                <div
                  style={{
                    display: "flex",
                    gap: 8,
                    alignItems: "center",
                    marginBottom: 12,
                  }}
                >
                  <input
                    type="text"
                    value={editingTemplateName ?? selectedTemplate.name}
                    onChange={(e) => setEditingTemplateName(e.target.value)}
                    style={{ flex: 1, padding: 8 }}
                  />
                  <button
                    onClick={() => {
                      const nextName = (editingTemplateName ?? "").trim()
                      if (nextName) updateTemplate(selectedTemplate.id, { name: nextName })
                    }}
                    disabled={loading}
                  >
                    Salvar
                  </button>
                  <label style={{ marginLeft: 8 }}>
                    <input
                      type="checkbox"
                      checked={!!selectedTemplate.is_active}
                      onChange={(e) =>
                        updateTemplate(selectedTemplate.id, { is_active: e.target.checked })
                      }
                    />{" "}
                    Ativo
                  </label>
                </div>

                <h3>Tarefas do Template</h3>
                <div>
                  <button onClick={openCreateTaskModal} style={{ marginBottom: 8 }}>
                    Adicionar tarefa
                  </button>

                  <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={handleDragEnd}
                  >
                    <SortableContext
                      items={tasksOrdered.map((t) => t.id)}
                      strategy={verticalListSortingStrategy}
                    >
                      <table style={{ width: "100%", borderCollapse: "collapse" }}>
                        <thead>
                          <tr>
                            <th style={{ textAlign: "left" }}>D</th>
                            <th>Canal</th>
                            <th style={{ textAlign: "left" }}>Título</th>
                            <th>Obrig.</th>
                            <th></th>
                          </tr>
                        </thead>
                        <tbody>
                          {tasksOrdered.map((task) => (
                            <SortableRow
                              key={task.id}
                              task={task}
                              onEdit={() => openEditTaskModal(task)}
                              onDelete={() => deleteTask(task.id, selectedTemplate.id)}
                              onManualUp={() => moveTask(selectedTemplate.id, task.id, "up")}
                              onManualDown={() => moveTask(selectedTemplate.id, task.id, "down")}
                            />
                          ))}
                        </tbody>
                      </table>
                    </SortableContext>
                  </DndContext>

                  {taskModalOpen && (
                    <TaskModal
                      initial={editingTask}
                      onCancel={() => {
                        setTaskModalOpen(false)
                        setEditingTask(null)
                      }}
                      onSave={handleTaskModalSave}
                    />
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function SortableRow({
  task,
  onEdit,
  onDelete,
  onManualUp,
  onManualDown,
}: {
  task: CampaignTemplateTask
  onEdit: () => void
  onDelete: () => void
  onManualUp: () => void
  onManualDown: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({
    id: task.id,
  })
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  return (
    <tr ref={setNodeRef as any} style={style} {...attributes}>
      <td style={{ padding: 8 }}>
        <span
          {...listeners}
          style={{
            cursor: "grab",
            padding: "4px 8px",
            border: "1px solid #e5e7eb",
            borderRadius: 4,
            display: "inline-block",
            minWidth: 40,
            textAlign: "center",
          }}
          title="Arraste para reordenar"
        >
          {task.day_offset}
        </span>
      </td>
      <td style={{ textAlign: "center" }}>{task.channel}</td>
      <td style={{ padding: 8 }}>{task.title}</td>
      <td style={{ textAlign: "center" }}>{task.is_required ? "Sim" : "Não"}</td>
      <td style={{ whiteSpace: "nowrap" }}>
        <button onClick={onManualUp} title="Subir">
          ↑
        </button>{" "}
        <button onClick={onManualDown} title="Descer">
          ↓
        </button>{" "}
        <button onClick={onEdit}>Editar</button>{" "}
        <button onClick={onDelete}>Excluir</button>
      </td>
    </tr>
  )
}

function TaskModal({
  initial,
  onCancel,
  onSave,
}: {
  initial: CampaignTemplateTask | null
  onCancel: () => void
  onSave: (values: Partial<CampaignTemplateTask>) => void
}) {
  const [title, setTitle] = useState(initial?.title ?? "")
  const [dayOffset, setDayOffset] = useState<number>(initial?.day_offset ?? 0)
  const [channel, setChannel] = useState<Channel>(initial?.channel ?? "whatsapp")
  const [isRequired, setIsRequired] = useState<boolean>(initial?.is_required ?? true)
  const [whatsappText, setWhatsappText] = useState<string>(initial?.whatsapp_text ?? "")
  const [reelScript, setReelScript] = useState<string>(initial?.reel_script ?? "")
  const [adsChecklist, setAdsChecklist] = useState<string>(initial?.ads_checklist ?? "")

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.4)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 60,
      }}
    >
      <div
        style={{
          background: "white",
          padding: 16,
          borderRadius: 8,
          width: 680,
          maxHeight: "80vh",
          overflow: "auto",
        }}
      >
        <h3>{initial ? "Editar tarefa" : "Nova tarefa"}</h3>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 140px", gap: 8 }}>
          <div>
            <label style={{ display: "block", fontWeight: 600 }}>Título</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              style={{ width: "100%", padding: 8 }}
            />
          </div>

          <div>
            <label style={{ display: "block", fontWeight: 600 }}>Dia (0..30)</label>
            <input
              type="number"
              value={dayOffset}
              onChange={(e) => setDayOffset(parseInt(e.target.value || "0", 10))}
              min={0}
              max={30}
              style={{ width: "100%", padding: 8 }}
            />
          </div>

          <div>
            <label style={{ display: "block", fontWeight: 600 }}>Canal</label>
            <select
              value={channel}
              onChange={(e) => setChannel(e.target.value as Channel)}
              style={{ width: "100%", padding: 8 }}
            >
              <option value="whatsapp">Whatsapp</option>
              <option value="reels">Reels</option>
              <option value="story">Story</option>
              <option value="feed">Feed</option>
              <option value="ads">Ads</option>
            </select>
          </div>

          <div style={{ display: "flex", alignItems: "center" }}>
            <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input
                type="checkbox"
                checked={isRequired}
                onChange={(e) => setIsRequired(e.target.checked)}
              />{" "}
              Obrigatória
            </label>
          </div>
        </div>

        <div style={{ marginTop: 12 }}>
          <label style={{ display: "block", fontWeight: 600 }}>Whatsapp text</label>
          <textarea
            value={whatsappText}
            onChange={(e) => setWhatsappText(e.target.value)}
            style={{ width: "100%", minHeight: 80, padding: 8 }}
          />
        </div>

        <div style={{ marginTop: 12 }}>
          <label style={{ display: "block", fontWeight: 600 }}>Reel script</label>
          <textarea
            value={reelScript}
            onChange={(e) => setReelScript(e.target.value)}
            style={{ width: "100%", minHeight: 80, padding: 8 }}
          />
        </div>

        <div style={{ marginTop: 12 }}>
          <label style={{ display: "block", fontWeight: 600 }}>Ads checklist</label>
          <textarea
            value={adsChecklist}
            onChange={(e) => setAdsChecklist(e.target.value)}
            style={{ width: "100%", minHeight: 80, padding: 8 }}
          />
        </div>

        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 12 }}>
          <button onClick={onCancel}>Cancelar</button>
          <button
            onClick={() =>
              onSave({
                title,
                day_offset: dayOffset,
                channel,
                is_required: isRequired,
                whatsapp_text: whatsappText || null,
                reel_script: reelScript || null,
                ads_checklist: adsChecklist || null,
              })
            }
          >
            Salvar
          </button>
        </div>
      </div>
    </div>
  )
}
