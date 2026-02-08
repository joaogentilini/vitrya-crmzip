"use client";

import { useState, useTransition, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { useToast } from "@/components/ui/Toast";
import { ClientDate } from "../ClientDate";
import { EditLeadModal } from "./EditLeadModal";
import { LeadTimeline } from "./LeadTimeline";
import { LeadNotes } from "./LeadNotes";
import { ConvertLeadModal } from "./ConvertLeadModal";
import {
  type LeadRow,
  type PipelineRow,
  type StageRow,
  getStatusBadge,
  normalizeError,
  getConfirmFinalizeMessage,
  getFinalizeSuccessMessage,
} from "@/lib/leads";
import type { AuditLogRow, ActorProfile, TaskRow } from "./page";
import { TaskCard, type ProfileRow } from "./TaskCard";

type CatalogItem = {
  id: string;
  name: string;
};

type AssignableUser = {
  id: string;
  full_name: string;
};

interface LeadDetailsClientProps {
  lead: LeadRow;
  pipeline?: PipelineRow;
  stage?: StageRow;
  pipelines: PipelineRow[];
  stages: StageRow[];
  auditLogs: AuditLogRow[];
  actorProfiles: ActorProfile[];
  tasks: TaskRow[];
  allProfiles: ActorProfile[];
  isAdmin: boolean;
  isAdminOrGestor?: boolean;
  leadTypes?: CatalogItem[];
  leadInterests?: CatalogItem[];
  leadSources?: CatalogItem[];
  assignableUsers?: AssignableUser[];
  currentUserId: string;
  responsibleName?: string | null;
}

export function LeadDetailsClient({
  lead,
  pipeline,
  stage,
  pipelines,
  stages,
  auditLogs,
  actorProfiles,
  tasks,
  allProfiles,
  isAdmin,
  isAdminOrGestor = false,
  leadTypes = [],
  leadInterests = [],
  leadSources = [],
  assignableUsers = [],
  currentUserId,
  responsibleName,
}: LeadDetailsClientProps) {
  const leadType = leadTypes.find((t) => t.id === lead.lead_type_id);
  const leadInterest = leadInterests.find(
    (i) => i.id === lead.lead_interest_id,
  );
  const leadSource = leadSources.find((s) => s.id === lead.lead_source_id);
  const router = useRouter();
  const { success, error: showError } = useToast();
  const [isPending, startTransition] = useTransition();
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [convertModalOpen, setConvertModalOpen] = useState(false);
  const [convertedClientId, setConvertedClientId] = useState<string | null>(lead.client_id || null);
  const [convertedPersonId, setConvertedPersonId] = useState<string | null>(lead.person_id || null);
  const clientId = lead.client_id || convertedClientId;

  const handleChangeOwner = useCallback(
    (newAssignedTo: string) => {
      if (newAssignedTo === lead.assigned_to) return;

      startTransition(async () => {
        const { updateLeadOwnerAction } = await import("../actions");
        const result = await updateLeadOwnerAction(lead.id, newAssignedTo);
        
        if (!result.ok) {
          showError(result.message);
          console.error('[LeadDetailsClient] Owner update error:', result.code, result.message);
          return;
        }
        
        success("Responsável atualizado!");
        router.refresh();
      });
    },
    [lead.id, lead.assigned_to, router, success, showError],
  );

  const availableStages = stages.filter(
    (s) => s.pipeline_id === lead.pipeline_id,
  );

  const handleMoveStage = useCallback(
    (toStageId: string) => {
      if (!lead.pipeline_id || toStageId === lead.stage_id) return;

      startTransition(async () => {
        try {
          const { moveLeadToStageAction } = await import("../kanban/actions");
          await moveLeadToStageAction({
            leadId: lead.id,
            pipelineId: lead.pipeline_id!,
            fromStageId: lead.stage_id || "",
            toStageId,
          });
          success("Estágio atualizado!");
          router.refresh();
        } catch (err) {
          showError(normalizeError(err, "Erro ao mover lead."));
        }
      });
    },
    [lead.id, lead.pipeline_id, lead.stage_id, router, success, showError],
  );

  const handleFinalize = useCallback(
    (status: "won" | "lost") => {
      if (!confirm(getConfirmFinalizeMessage(status))) return;

      startTransition(async () => {
        try {
          const resp = await fetch("/api/leads/finalize", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ leadId: lead.id, status }),
          });
          if (!resp.ok) throw new Error("Erro ao finalizar lead");
          success(getFinalizeSuccessMessage(status));
          router.refresh();
        } catch (err) {
          showError(normalizeError(err, "Erro ao finalizar lead."));
        }
      });
    },
    [lead.id, router, success, showError],
  );

  const handleLinkPerson = useCallback(() => {
    if (lead.person_id || convertedPersonId) return;

    startTransition(async () => {
      const { linkLeadToPersonAction } = await import("../actions");
      const result = await linkLeadToPersonAction(lead.id);

      if (!result.ok) {
        showError(result.message);
        return;
      }

      setConvertedPersonId(result.data.personId);
      success("Pessoa vinculada com sucesso!");
      router.refresh();
    });
  }, [lead.id, lead.person_id, convertedPersonId, router, showError, success]);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-sm text-[var(--muted-foreground)]">
        <Link
          href="/leads"
          className="hover:text-[var(--foreground)] transition-colors"
        >
          Leads
        </Link>
        <span>/</span>
        <span className="text-[var(--foreground)]">{lead.title}</span>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
            <div className="space-y-3">
              <div className="flex items-center gap-3 flex-wrap">
                <h1 className="text-2xl font-bold tracking-tight text-[var(--foreground)]">
                  {lead.title}
                </h1>
                {getStatusBadge(lead.status, "lg")}
                {(lead.is_converted || convertedClientId) && (
                  <span className="inline-flex items-center px-3 py-1 text-sm font-medium rounded-full bg-[#294487] text-white">
                    <svg className="w-3.5 h-3.5 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                    Cliente
                  </span>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-4 text-sm text-[var(--muted-foreground)]">
                {pipeline && (
                  <div className="flex items-center gap-1.5">
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
                      />
                    </svg>
                    <span>{pipeline.name}</span>
                  </div>
                )}
                {stage && (
                  <div className="flex items-center gap-1.5">
                    <svg
                      className="w-4 h-4"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
                      />
                    </svg>
                    <span>{stage.name}</span>
                  </div>
                )}
                <div className="flex items-center gap-1.5">
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                    />
                  </svg>
                  <ClientDate value={lead.created_at} />
                </div>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                onClick={() => setEditModalOpen(true)}
                disabled={isPending}
              >
                <svg
                  className="w-4 h-4 mr-1.5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                  />
                </svg>
                Editar
              </Button>

              {!lead.is_converted && !convertedClientId && (
                <Button
                  variant="outline"
                  onClick={() => setConvertModalOpen(true)}
                  disabled={isPending}
                  className="border-[#294487] text-[#294487] hover:bg-[#294487] hover:text-white"
                >
                  <svg
                    className="w-4 h-4 mr-1.5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                    />
                  </svg>
                  Converter em Cliente
                </Button>
              )}

              {lead.status === "open" && (
                <>
                  <Button
                    onClick={() => handleFinalize("won")}
                    disabled={isPending}
                    className="bg-[var(--success)] hover:bg-[var(--success)]/90"
                  >
                    <svg
                      className="w-4 h-4 mr-1.5"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                    Marcar Comprou
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={() => handleFinalize("lost")}
                    disabled={isPending}
                  >
                    <svg
                      className="w-4 h-4 mr-1.5"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M6 18L18 6M6 6l12 12"
                      />
                    </svg>
                    Marcar Não Comprou
                  </Button>
                </>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Pessoa/Cliente</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <p className="text-xs text-[var(--muted-foreground)] mb-1">
                Pessoa
              </p>
              {lead.person_id || convertedPersonId ? (
                <Link
                  href={`/pessoas/${lead.person_id || convertedPersonId}`}
                  className="text-sm font-medium text-[#294487] hover:underline"
                >
                  /pessoas/{lead.person_id || convertedPersonId}
                </Link>
              ) : (
                <Button
                  variant="outline"
                  onClick={handleLinkPerson}
                  disabled={isPending}
                  className="border-[#294487] text-[#294487] hover:bg-[#294487] hover:text-white"
                >
                  Vincular Pessoa
                </Button>
              )}
            </div>
            <div>
              <p className="text-xs text-[var(--muted-foreground)] mb-1">
                Cliente
              </p>
              {clientId ? (
                <Link
                  href={`/clientes/${clientId}`}
                  className="text-sm font-medium text-[#294487] hover:underline"
                >
                  /clientes/{clientId}
                </Link>
              ) : (
                <p className="text-sm font-medium text-[var(--foreground)]">—</p>
              )}
            </div>
            <div>
              <p className="text-xs text-[var(--muted-foreground)] mb-1">
                Status
              </p>
              <p className="text-sm font-medium text-[var(--foreground)]">
                {lead.is_converted || convertedClientId ? "Convertido" : "—"}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Lead Details Card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Ficha do Lead</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <p className="text-xs text-[var(--muted-foreground)] mb-1">
                Nome do Cliente
              </p>
              <p className="text-sm font-medium text-[var(--foreground)]">
                {lead.client_name || lead.title || "—"}
              </p>
            </div>
            <div>
              <p className="text-xs text-[var(--muted-foreground)] mb-1">
                Telefone
              </p>
              <p className="text-sm font-medium text-[var(--foreground)]">
                {lead.phone_raw || "—"}
              </p>
            </div>
            <div>
              <p className="text-xs text-[var(--muted-foreground)] mb-1">
                Email
              </p>
              <p className="text-sm font-medium text-[var(--foreground)]">
                {lead.email || "—"}
              </p>
            </div>
            <div>
              <p className="text-xs text-[var(--muted-foreground)] mb-1">
                Tipo
              </p>
              <p className="text-sm font-medium text-[var(--foreground)]">
                {leadType?.name || "—"}
              </p>
            </div>
            <div>
              <p className="text-xs text-[var(--muted-foreground)] mb-1">
                Interesse
              </p>
              <p className="text-sm font-medium text-[var(--foreground)]">
                {leadInterest?.name || "—"}
              </p>
            </div>
            <div>
              <p className="text-xs text-[var(--muted-foreground)] mb-1">
                Origem
              </p>
              <p className="text-sm font-medium text-[var(--foreground)]">
                {leadSource?.name || "—"}
              </p>
            </div>
            {lead.budget_range && (
              <div>
                <p className="text-xs text-[var(--muted-foreground)] mb-1">
                  Faixa de Orçamento
                </p>
                <p className="text-sm font-medium text-[var(--foreground)]">
                  {lead.budget_range}
                </p>
              </div>
            )}
            <div>
              <p className="text-xs text-[var(--muted-foreground)] mb-1">
                Responsável
              </p>
              {assignableUsers.length > 0 ? (
                <select
                  value={lead.assigned_to || ""}
                  onChange={(e) => handleChangeOwner(e.target.value)}
                  disabled={isPending}
                  className="h-8 w-full max-w-[200px] rounded-[var(--radius)] border border-[var(--input)] bg-[var(--background)] px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] disabled:opacity-50"
                >
                  {isAdminOrGestor && <option value="">Sem responsável</option>}
                  {assignableUsers.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.full_name}
                    </option>
                  ))}
                </select>
              ) : (
                <p className="text-sm font-medium text-[var(--foreground)]">
                  {responsibleName || "Sem responsável"}
                </p>
              )}
            </div>
          </div>
          {lead.notes && (
            <div className="mt-4 pt-4 border-t border-[var(--border)]">
              <p className="text-xs text-[var(--muted-foreground)] mb-1">
                Observações
              </p>
              <p className="text-sm text-[var(--foreground)] whitespace-pre-wrap">
                {lead.notes}
              </p>
            </div>
          )}
          {!lead.client_name && !lead.phone_raw && (
            <div className="mt-4 p-3 bg-[var(--warning)]/10 border border-[var(--warning)] rounded-[var(--radius)] text-sm">
              <p className="text-[var(--warning)]">
                Este é um lead antigo sem dados completos. Clique em "Editar"
                para preencher a ficha.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Mover Estágio</CardTitle>
            </CardHeader>
            <CardContent>
              {lead.status === "open" && availableStages.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {availableStages.map((s) => (
                    <Button
                      key={s.id}
                      variant={s.id === lead.stage_id ? "default" : "outline"}
                      size="sm"
                      disabled={isPending || s.id === lead.stage_id}
                      onClick={() => handleMoveStage(s.id)}
                    >
                      {s.name}
                    </Button>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-[var(--muted-foreground)]">
                  {lead.status !== "open"
                    ? "Este lead já foi finalizado."
                    : "Nenhum estágio disponível."}
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Linha do Tempo</CardTitle>
            </CardHeader>
            <CardContent>
              <LeadTimeline
                createdAt={lead.created_at}
                status={lead.status}
                stages={stages}
                auditLogs={auditLogs}
                actorProfiles={actorProfiles}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Notas</CardTitle>
            </CardHeader>
            <CardContent>
              <LeadNotes
                leadId={lead.id}
                currentUserId={currentUserId}
                isAdminOrGestor={isAdminOrGestor}
              />
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Contato</CardTitle>
            </CardHeader>

            <CardContent>
              {lead.client_name || lead.phone_raw || lead.phone_e164 || lead.email ? (
                <div className="space-y-3">
                  {lead.client_name && (
                    <div>
                      <p className="text-xs text-[var(--muted-foreground)] mb-1">
                        Nome
                      </p>
                      <p className="text-sm font-medium text-[var(--foreground)]">
                        {lead.client_name}
                      </p>
                    </div>
                  )}

                  {(lead.phone_raw || lead.phone_e164) && (
                    <div>
                      <p className="text-xs text-[var(--muted-foreground)] mb-1">
                        Telefone
                      </p>
                      <p className="text-sm font-medium text-[var(--foreground)]">
                        {lead.phone_raw || lead.phone_e164}
                      </p>
                    </div>
                  )}

                  {lead.email && (
                    <div>
                      <p className="text-xs text-[var(--muted-foreground)] mb-1">
                        Email
                      </p>
                      <p className="text-sm font-medium text-[var(--foreground)]">
                        {lead.email}
                      </p>
                    </div>
                  )}
                </div>
              ) : (
                <EmptyState
                  title="Sem informações de contato"
                  description="Adicione telefone, email ou endereço."
                  icon={
                    <svg
                      className="w-10 h-10"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={1.5}
                        d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"
                      />
                    </svg>
                  }
                />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Interesse / Origem</CardTitle>
            </CardHeader>

            <CardContent>
              {leadType?.name || leadInterest?.name || leadSource?.name ? (
                <div className="space-y-3">
                  <div>
                    <p className="text-xs text-[var(--muted-foreground)] mb-1">
                      Tipo
                    </p>
                    <p className="text-sm font-medium text-[var(--foreground)]">
                      {leadType?.name || "—"}
                    </p>
                  </div>

                  <div>
                    <p className="text-xs text-[var(--muted-foreground)] mb-1">
                      Interesse
                    </p>
                    <p className="text-sm font-medium text-[var(--foreground)]">
                      {leadInterest?.name || "—"}
                    </p>
                  </div>

                  <div>
                    <p className="text-xs text-[var(--muted-foreground)] mb-1">
                      Origem
                    </p>
                    <p className="text-sm font-medium text-[var(--foreground)]">
                      {leadSource?.name || "—"}
                    </p>
                  </div>
                </div>
              ) : (
                <EmptyState
                  title="Sem informações de origem"
                  description="De onde veio este lead?"
                  icon={
                    <svg
                      className="w-10 h-10"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={1.5}
                        d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                  }
                />
              )}
            </CardContent>
          </Card>

          <TaskCard
            leadId={lead.id}
            tasks={tasks as unknown as import("./TaskCard").TaskRow[]}
            profiles={allProfiles as ProfileRow[]}
            isAdmin={isAdmin}
          />
        </div>
      </div>

      <EditLeadModal
        open={editModalOpen}
        onClose={() => setEditModalOpen(false)}
        lead={lead}
        pipelines={pipelines}
        stages={stages}
        leadTypes={leadTypes}
        leadInterests={leadInterests}
        leadSources={leadSources}
      />

      {convertModalOpen && (
        <ConvertLeadModal
          leadId={lead.id}
          leadTitle={lead.title}
          onClose={() => setConvertModalOpen(false)}
          onSuccess={(clientId, personId) => {
            setConvertedClientId(clientId);
            setConvertedPersonId(personId);
            setConvertModalOpen(false);
          }}
        />
      )}
    </div>
  );
}
