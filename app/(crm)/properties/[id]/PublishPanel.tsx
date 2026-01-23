"use client";

import { useEffect, useState } from "react";

import { supabase } from "@/lib/supabaseClient";

import {
  publishProperty,
  unpublishProperty,
  checkAuthorizationDocument,
} from "./actions";

export default function PublishPanel({
  propertyId,
  initialStatus,
  onStatusChange,
}: {
  propertyId: string;
  initialStatus: string;
  onStatusChange: (next: string) => void;
}) {
  const [status, setStatus] = useState(initialStatus);
  const [mediaCount, setMediaCount] = useState<number>(0);
  const [hasAuthorization, setHasAuthorization] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [busy, setBusy] = useState<boolean>(false);
  const [error, setError] = useState<string>("");
  const [canApprove, setCanApprove] = useState<boolean>(false);

  async function refresh() {
    setLoading(true);
    setError("");

    try {
      // user atual
      const { data: userRes } = await supabase.auth.getUser();
      const currentUserId = userRes?.user?.id ?? null;

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

      // role (admin/gestor)
      if (currentUserId) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("role, is_active")
          .eq("id", currentUserId)
          .maybeSingle();

        const isAdmin = profile?.role === "admin" && profile?.is_active;
        const isGestor = profile?.role === "gestor" && profile?.is_active;

        setCanApprove(!!(isAdmin || isGestor));
      } else {
        setCanApprove(false);
      }
    } catch (e: any) {
      setError(e?.message ?? "Falha ao carregar dados de publicação.");
      setCanApprove(false);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    <div
      style={{
        border: "1px solid rgba(0,0,0,0.08)",
        borderRadius: 16,
        padding: 16,
      }}
    >
      <h2 style={{ marginTop: 0 }}>Publicação</h2>

      {loading ? (
        <p>Carregando status...</p>
      ) : (
        <>
          <div style={{ display: "grid", gap: 8 }}>
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

          {error && (
            <div
              style={{
                marginTop: 12,
                padding: 12,
                borderRadius: 12,
                background: "rgba(255,0,0,0.06)",
                border: "1px solid rgba(255,0,0,0.12)",
              }}
            >
              <b>Erro:</b> {error}
            </div>
          )}

          <div style={{ display: "flex", gap: 10, marginTop: 16, flexWrap: "wrap" }}>
            {/* ✅ Aprovar */}
            <button
              onClick={handleApprovePublish}
              disabled={!approveEnabled}
              style={{
                padding: "10px 14px",
                borderRadius: 12,
                border: 0,
                background: approveEnabled
                  ? "rgba(0,160,0,0.92)"
                  : "rgba(0,0,0,0.10)",
                color: approveEnabled ? "white" : "rgba(0,0,0,0.55)",
                cursor: approveEnabled ? "pointer" : "not-allowed",
                fontWeight: 800,
              }}
              title={
                !canApprove
                  ? "Apenas admin/gestor pode aprovar."
                  : !checklistOk
                  ? "Checklist pendente."
                  : ""
              }
            >
              Aprovar e publicar
            </button>

            {/* ✅ Reprovar */}
            <button
              onClick={handleRejectToDraft}
              disabled={!rejectEnabled}
              style={{
                padding: "10px 14px",
                borderRadius: 12,
                border: 0,
                background: rejectEnabled
                  ? "rgba(220,0,0,0.92)"
                  : "rgba(0,0,0,0.10)",
                color: rejectEnabled ? "white" : "rgba(0,0,0,0.55)",
                cursor: rejectEnabled ? "pointer" : "not-allowed",
                fontWeight: 800,
              }}
              title={!canApprove ? "Apenas admin/gestor pode reprovar." : ""}
            >
              Reprovar (voltar rascunho)
            </button>

            {/* Recarregar */}
            <button
              onClick={refresh}
              disabled={busy}
              style={{
                padding: "10px 14px",
                borderRadius: 12,
                border: "1px solid rgba(0,0,0,0.12)",
                background: "transparent",
                cursor: busy ? "not-allowed" : "pointer",
                opacity: busy ? 0.6 : 1,
              }}
            >
              Recarregar
            </button>

            <div style={{ marginLeft: "auto", opacity: 0.75 }}>
              Status atual: <b>{status}</b>
            </div>
          </div>

          <p style={{ marginTop: 12, opacity: 0.75, fontSize: 12 }}>
            Regra Vitrya: para publicar, precisa ter pelo menos 1 mídia e o Termo
            de Autorização anexado.
          </p>
        </>
      )}
    </div>
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
    <div
      style={{
        display: "flex",
        gap: 10,
        alignItems: "center",
        padding: "10px 12px",
        borderRadius: 12,
        background: "rgba(0,0,0,0.03)",
      }}
    >
      <div
        style={{
          width: 10,
          height: 10,
          borderRadius: 999,
          background: ok ? "rgba(0,160,0,0.9)" : "rgba(220,0,0,0.9)",
        }}
      />
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 600 }}>{label}</div>
        {detail && <div style={{ fontSize: 12, opacity: 0.75 }}>{detail}</div>}
      </div>
      <div style={{ fontWeight: 700 }}>{ok ? "OK" : "Pendente"}</div>
    </div>
  );
}
