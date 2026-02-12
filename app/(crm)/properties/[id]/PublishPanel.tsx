/* eslint-disable react-hooks/exhaustive-deps */
"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

import {
  publishProperty,
  unpublishProperty,
  checkAuthorizationDocument,
} from "./actions";

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
  const [mediaCount, setMediaCount] = useState<number>(0);
  const [hasAuthorization, setHasAuthorization] = useState<boolean>(false);
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
      // status do imóvel
      const statusPromise = supabase
        .from("properties")
        .select("status")
        .eq("id", propertyId)
        .maybeSingle();

      // count de mídias (head + count)
      const mediaPromise = supabase
        .from("property_media")
        .select("id", { count: "exact", head: true })
        .eq("property_id", propertyId);

      // server action do doc
      const authPromise = checkAuthorizationDocument(propertyId);

      const [statusRes, mediaRes, authOk] = await Promise.all([
        statusPromise,
        mediaPromise,
        authPromise,
      ]);

      // resolve count robusto
      let mediaCountResolved = 0;
      const count = (mediaRes as any)?.count;

      if (typeof count === "number") {
        mediaCountResolved = count;
      } else {
        // fallback: lista ids
        const { data: listData } = await supabase
          .from("property_media")
          .select("id")
          .eq("property_id", propertyId);
        mediaCountResolved = (listData ?? []).length;
      }

      setMediaCount(mediaCountResolved);
      setHasAuthorization(!!authOk);

      // status
      const nextStatus = statusRes?.data?.status;
      if (nextStatus) {
        setStatus(nextStatus);
        onStatusChange(nextStatus);
      }
    } catch (e: any) {
      setError(e?.message ?? "Falha ao carregar dados de publicação.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, [propertyId]);

  const mediaOk = mediaCount > 0;
  const authOk = hasAuthorization;
  const checklistOk = mediaOk && authOk;

  const approveEnabled = !loading && !busy && canApprove && checklistOk;
  const rejectEnabled = !loading && !busy && canApprove;

  async function handleApprovePublish() {
    setBusy(true);
    setError("");

    try {
      if (!canApprove) throw new Error("Apenas admin/gestor pode aprovar.");
      if (!mediaOk) throw new Error("Adicione pelo menos 1 mídia.");
      if (!authOk) throw new Error("Anexe a Autorização do proprietário.");

      await publishProperty(propertyId);
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

      await unpublishProperty(propertyId);
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
          <h2 className="text-base font-semibold text-[var(--foreground)]">
            Publicação
          </h2>
          <p className="mt-1 text-xs text-[var(--muted-foreground)]">
            Regra Vitrya: para publicar, precisa ter pelo menos 1 mídia e o Termo
            de Autorização anexado.
          </p>
        </div>

        <div className="text-xs text-[var(--muted-foreground)]">
          <span>
            Status atual:{" "}
            <span className="font-semibold text-[var(--foreground)]">
              {status}
            </span>
          </span>
        </div>
      </div>

      <div className="mt-4">
        {loading ? (
          <p className="text-sm text-[var(--muted-foreground)]">
            Carregando status...
          </p>
        ) : (
          <div className="grid gap-2">
            <ChecklistRow
              label="Mídias (≥ 1)"
              ok={mediaOk}
              detail={`Encontradas: ${mediaCount}`}
            />
            <ChecklistRow
              label="Autorização do proprietário"
              ok={authOk}
              detail={authOk ? "OK" : "Faltando"}
            />
          </div>
        )}
      </div>

      {error ? (
        <div className="mt-3 rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-sm text-[var(--foreground)]">
          <span className="font-semibold">Erro:</span>{" "}
          <span>{error}</span>
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
            busy
              ? "opacity-60 cursor-not-allowed"
              : "hover:bg-[var(--accent)]",
          ].join(" ")}
        >
          <span>Recarregar</span>
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
        className={[
          "w-2.5 h-2.5 rounded-full",
          ok ? "bg-emerald-600" : "bg-red-600",
        ].join(" ")}
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
