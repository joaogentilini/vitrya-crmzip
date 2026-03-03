/* eslint-disable react-hooks/exhaustive-deps */
"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

import { getPublishChecklistState, publishProperty, unpublishProperty } from "./actions";

type PublishAuthorizationState = {
  hasAuthorization: boolean;
  source: "digital" | "legacy" | null;
  status: string | null;
  documentInstanceId: string | null;
  signedAt: string | null;
  dataChangedAfterSignature: boolean;
  reason: string | null;
};

type PublishChecklistState = {
  canPublish: boolean;
  missing: string[];
  media: {
    ok: boolean;
    count: number;
  };
  location: {
    cityOk: boolean;
    neighborhoodOk: boolean;
    addressOk: boolean;
    coordinatesOk: boolean;
  };
  authorization: PublishAuthorizationState;
};

const DEFAULT_CHECKLIST_STATE: PublishChecklistState = {
  canPublish: false,
  missing: [],
  media: { ok: false, count: 0 },
  location: {
    cityOk: false,
    neighborhoodOk: false,
    addressOk: false,
    coordinatesOk: false,
  },
  authorization: {
    hasAuthorization: false,
    source: null,
    status: null,
    documentInstanceId: null,
    signedAt: null,
    dataChangedAfterSignature: false,
    reason: null,
  },
};

type UserRole = "admin" | "gestor" | "corretor" | string;

export default function PublishPanel({
  propertyId,
  initialStatus,
  onStatusChange,
  viewerRole,
  viewerIsActive,
}: {
  propertyId: string;
  initialStatus: string;
  onStatusChange: (next: string) => void;
  viewerRole: UserRole | null;
  viewerIsActive: boolean | null;
}) {
  const [status, setStatus] = useState(initialStatus);
  const [checklistState, setChecklistState] = useState<PublishChecklistState>(
    DEFAULT_CHECKLIST_STATE
  );
  const [loading, setLoading] = useState<boolean>(true);
  const [busy, setBusy] = useState<boolean>(false);
  const [error, setError] = useState<string>("");

  const canApprove = useMemo(() => {
    if (!viewerRole || viewerIsActive !== true) return false;
    return viewerRole === "admin" || viewerRole === "gestor";
  }, [viewerRole, viewerIsActive]);

  async function refresh() {
    setLoading(true);
    setError("");

    try {
      const statusPromise = supabase
        .from("properties")
        .select("status")
        .eq("id", propertyId)
        .maybeSingle();
      const checklistPromise = getPublishChecklistState(propertyId);

      const [statusRes, checklistRes] = await Promise.all([statusPromise, checklistPromise]);

      const parsedChecklist: PublishChecklistState = {
        canPublish: Boolean(checklistRes?.canPublish),
        missing: Array.isArray(checklistRes?.missing) ? checklistRes.missing : [],
        media: {
          ok: Boolean(checklistRes?.media?.ok),
          count: typeof checklistRes?.media?.count === "number" ? checklistRes.media.count : 0,
        },
        location: {
          cityOk: Boolean(checklistRes?.location?.cityOk),
          neighborhoodOk: Boolean(checklistRes?.location?.neighborhoodOk),
          addressOk: Boolean(checklistRes?.location?.addressOk),
          coordinatesOk: Boolean(checklistRes?.location?.coordinatesOk),
        },
        authorization: {
          hasAuthorization: Boolean(checklistRes?.authorization?.hasAuthorization),
          source: checklistRes?.authorization?.source ?? null,
          status: checklistRes?.authorization?.status ?? null,
          documentInstanceId: checklistRes?.authorization?.documentInstanceId ?? null,
          signedAt: checklistRes?.authorization?.signedAt ?? null,
          dataChangedAfterSignature: Boolean(
            checklistRes?.authorization?.dataChangedAfterSignature
          ),
          reason: checklistRes?.authorization?.reason ?? null,
        },
      };

      setChecklistState(parsedChecklist);

      const nextStatus = statusRes?.data?.status;
      if (nextStatus) {
        setStatus(nextStatus);
        onStatusChange(nextStatus);
      }
    } catch (e: any) {
      setError(e?.message ?? "Falha ao carregar dados de publicacao.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, [propertyId]);

  const mediaOk = checklistState.media.ok;
  const addressOk =
    checklistState.location.cityOk &&
    checklistState.location.neighborhoodOk &&
    checklistState.location.addressOk;
  const coordinatesOk = checklistState.location.coordinatesOk;
  const authOk = checklistState.authorization.hasAuthorization;
  const checklistOk = checklistState.canPublish;

  const approveEnabled = !loading && !busy && canApprove && checklistOk;
  const rejectEnabled = !loading && !busy && canApprove;

  async function handleApprovePublish() {
    setBusy(true);
    setError("");

    try {
      if (!canApprove) throw new Error("Apenas admin/gestor pode aprovar.");
      if (!mediaOk) throw new Error("Adicione pelo menos 1 midia.");
      if (!addressOk) throw new Error("Preencha cidade, bairro e endereco.");
      if (!coordinatesOk) throw new Error("Defina latitude e longitude validas no mapa.");
      if (!authOk) {
        throw new Error(
          checklistState.authorization.reason ||
            "A autorizacao digital assinada e obrigatoria para publicar."
        );
      }

      const result = await publishProperty(propertyId);
      if (!result.success) {
        throw new Error(result.error || "Nao foi possivel publicar.");
      }

      await refresh();
    } catch (e: any) {
      setError(e?.message ?? "Falha ao aprovar/publicar.");
    } finally {
      setBusy(false);
    }
  }

  async function handleRejectToDraft() {
    setBusy(true);
    setError("");

    try {
      if (!canApprove) throw new Error("Apenas admin/gestor pode reprovar.");
      const result = await unpublishProperty(propertyId);
      if (!result.success) {
        throw new Error(result.error || "Nao foi possivel reprovar.");
      }
      await refresh();
    } catch (e: any) {
      setError(e?.message ?? "Falha ao reprovar (voltar para rascunho).");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-[var(--foreground)]">Publicacao</h2>
          <p className="mt-1 text-xs text-[var(--muted-foreground)]">
            Regra Vitrya: para publicar, precisa ter midia, endereco completo,
            coordenadas no mapa e autorizacao digital assinada.
          </p>
        </div>

        <div className="text-xs text-[var(--muted-foreground)]">
          <span>
            Status atual:{" "}
            <span className="font-semibold text-[var(--foreground)]">{status}</span>
          </span>
        </div>
      </div>

      <div className="mt-4">
        {loading ? (
          <p className="text-sm text-[var(--muted-foreground)]">Carregando status...</p>
        ) : (
          <div className="grid gap-2">
            <ChecklistRow
              label="Midias (>= 1)"
              ok={mediaOk}
              detail={`Encontradas: ${checklistState.media.count}`}
            />
            <ChecklistRow
              label="Endereco completo"
              ok={addressOk}
              detail={
                addressOk
                  ? "Cidade, bairro e endereco preenchidos."
                  : "Preencha cidade, bairro e endereco."
              }
            />
            <ChecklistRow
              label="Coordenadas do mapa"
              ok={coordinatesOk}
              detail={
                coordinatesOk
                  ? "Latitude/longitude validas."
                  : "Defina latitude e longitude no mapa."
              }
            />
            <ChecklistRow
              label="Autorizacao digital"
              ok={authOk}
              detail={
                authOk
                  ? `Assinada${
                      checklistState.authorization.signedAt
                        ? ` em ${new Date(
                            checklistState.authorization.signedAt
                          ).toLocaleDateString("pt-BR")}`
                        : ""
                    }`
                  : checklistState.authorization.reason || "Pendente"
              }
            />
          </div>
        )}
      </div>

      {!loading && checklistState.authorization.dataChangedAfterSignature ? (
        <div className="mt-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-[var(--foreground)]">
          Dados do imovel foram alterados apos a assinatura. Reenvie a autorizacao
          digital antes de publicar.
        </div>
      ) : null}

      {!loading && checklistState.missing.length > 0 ? (
        <div className="mt-3 rounded-xl border border-[var(--border)] bg-[var(--accent)] p-3 text-xs text-[var(--muted-foreground)]">
          <span className="font-semibold text-[var(--foreground)]">Pendencias: </span>
          <span>{checklistState.missing.join(" ")}</span>
        </div>
      ) : null}

      {error ? (
        <div className="mt-3 rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-sm text-[var(--foreground)]">
          <span className="font-semibold">Erro:</span> <span>{error}</span>
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={handleApprovePublish}
          disabled={!approveEnabled}
          className={[
            "px-4 py-2 rounded-xl text-sm font-semibold transition",
            approveEnabled
              ? "bg-emerald-600 text-white hover:bg-emerald-700"
              : "bg-black/10 text-black/50 cursor-not-allowed",
          ].join(" ")}
          title={
            !canApprove
              ? "Apenas admin/gestor pode aprovar."
              : !checklistOk
              ? "Checklist pendente."
              : ""
          }
        >
          <span>Aprovar e publicar</span>
        </button>

        <button
          type="button"
          onClick={handleRejectToDraft}
          disabled={!rejectEnabled}
          className={[
            "px-4 py-2 rounded-xl text-sm font-semibold transition",
            rejectEnabled
              ? "bg-red-600 text-white hover:bg-red-700"
              : "bg-black/10 text-black/50 cursor-not-allowed",
          ].join(" ")}
          title={!canApprove ? "Apenas admin/gestor pode reprovar." : ""}
        >
          <span>Reprovar</span>
        </button>

        <button
          type="button"
          onClick={refresh}
          disabled={busy}
          className={[
            "px-4 py-2 rounded-xl text-sm font-semibold border border-[var(--border)] transition",
            busy ? "opacity-60 cursor-not-allowed" : "hover:bg-[var(--accent)]",
          ].join(" ")}
        >
          <span>Recarregar</span>
        </button>

        <button
          type="button"
          onClick={() => {
            window.location.search = "?tab=documents";
          }}
          className="px-4 py-2 rounded-xl text-sm font-semibold border border-[var(--border)] transition hover:bg-[var(--accent)]"
        >
          <span>Ir para Documentos</span>
        </button>

        {!canApprove ? (
          <div className="ml-auto text-xs text-[var(--muted-foreground)]">
            <span>Apenas admin/gestor pode aprovar/reprovar.</span>
          </div>
        ) : (
          <div className="ml-auto text-xs text-[var(--muted-foreground)]">
            <span>Checklist: </span>
            <span className="font-semibold text-[var(--foreground)]">
              {checklistOk ? "OK" : "Pendente"}
            </span>
          </div>
        )}
      </div>
    </section>
  );
}

function ChecklistRow({
  label,
  ok,
  detail,
}: {
  label: string;
  ok: boolean;
  detail?: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--accent)] px-3 py-2">
      <div
        className={["w-2.5 h-2.5 rounded-full", ok ? "bg-emerald-600" : "bg-red-600"].join(" ")}
        aria-hidden="true"
      />
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold text-[var(--foreground)]">
          <span>{label}</span>
        </div>
        {detail ? (
          <div className="text-xs text-[var(--muted-foreground)]">
            <span>{detail}</span>
          </div>
        ) : null}
      </div>
      <div className="text-xs font-semibold text-[var(--foreground)]">
        <span>{ok ? "OK" : "Pendente"}</span>
      </div>
    </div>
  );
}
