"use client";

import { useEffect, useMemo, useState } from "react";

import AdminDeleteActionButton from "@/components/admin/AdminDeleteActionButton";
import PropertyMediaManager from "./media/PropertyMediaManager";
import PropertyDocumentsManager from "./documents/PropertyDocumentsManager";
import PublishPanel from "./PublishPanel";
import PropertyFullEditorClient from "./PropertyFullEditorClient";
import CampaignTab from "./CampaignTab";
import PropertyFeaturesManager from "./features/PropertyFeaturesManager";
import PropertyNegotiationsTab from "./negociacoes/PropertyNegotiationsTab";
import { deletePropertyAction } from "./actions";

type TabKey =
  | "overview"
  | "features"
  | "media"
  | "documents"
  | "publish"
  | "campaign"
  | "negociacoes";

interface Property {
  id: string;
  status: string;
  purpose: string;

  property_category_id?: string | null;
  property_category_name?: string | null;

  title: string;
  city?: string | null;
  neighborhood?: string | null;
  address?: string | null;
  price?: number | null;
  rent_price?: number | null;
  area_m2?: number | null;
  bedrooms?: number | null;
  bathrooms?: number | null;
  parking?: number | null;
  description?: string | null;

  owner_user_id: string;
  owner_profile?: { id: string; full_name?: string | null; email?: string | null } | null;
  created_by_profile?: { id: string; full_name?: string | null; email?: string | null } | null;
  created_at: string;
}

function getDaysSince(value?: string | null) {
  if (!value) return null
  const start = new Date(value)
  if (Number.isNaN(start.getTime())) return null
  const diff = Date.now() - start.getTime()
  if (diff <= 0) return 0
  return Math.floor(diff / (1000 * 60 * 60 * 24))
}

export default function PropertyTabs({
  property,
  propertyCategories,
  featuresCatalog,
  featureValues,
  featureAliasesToClear,
  viewerRole,
  viewerIsActive,
  canViewLegalData,
  initialTab,
  initialNegotiationId,
  initialProposalId,
}: {
  property: Property;
  propertyCategories: Array<{ id: string; name: string }>;
  featuresCatalog: Array<{
    id: string;
    key: string;
    label_pt: string;
    group?: string | null;
    type: string;
    options?: unknown;
    position?: number | null;
  }>;
  featureValues: Array<{
    feature_id: string;
    value_boolean: boolean | null;
    value_number: number | null;
    value_text: string | null;
    value_json: unknown | null;
  }>;
  featureAliasesToClear: Array<{
    id: string;
    key: string;
    label_pt: string;
    group?: string | null;
    type: string;
    options?: unknown;
    position?: number | null;
  }>;
  viewerRole: string | null;
  viewerIsActive: boolean | null;
  canViewLegalData: boolean;
  initialTab?: TabKey | null;
  initialNegotiationId?: string | null;
  initialProposalId?: string | null;
}) {
  const tabs: { key: TabKey; label: string }[] = useMemo(() => {
    const base: { key: TabKey; label: string }[] = [
      { key: "overview", label: "Visão" },
      { key: "features", label: "Características" },
      { key: "media", label: "Mídias" },
      { key: "publish", label: "Publicação" },
      { key: "campaign", label: "Campanha" },
      { key: "negociacoes", label: "Negociações" },
    ];

    if (canViewLegalData) {
      base.splice(3, 0, { key: "documents", label: "Documentos" });
    }

    return base;
  }, [canViewLegalData]);

  const safeInitialTab = useMemo<TabKey>(() => {
    if (initialTab && tabs.some((item) => item.key === initialTab)) return initialTab;
    return "overview";
  }, [initialTab, tabs]);

  const [tab, setTab] = useState<TabKey>(safeInitialTab);
  const [status, setStatus] = useState<string>(property.status);
  const [currentProperty, setCurrentProperty] = useState<Property>(property);
  const canDeleteProperty = viewerRole === "admin";
  const publicationDays = useMemo(() => getDaysSince(currentProperty.created_at), [currentProperty.created_at])
  const publicationLabel =
    status === "active"
      ? publicationDays === null
        ? "Tempo sem data"
        : `Publicado ha ${publicationDays} dia${publicationDays === 1 ? "" : "s"}`
      : "Não publicado"

  useEffect(() => {
    if (!tabs.some((item) => item.key === tab)) {
      setTab("overview");
    }
  }, [tab, tabs]);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        {tabs.map((t) => {
          const isActive = tab === t.key;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`rounded-[var(--radius)] border px-3 py-2 text-sm font-medium transition-colors ${
                isActive
                  ? "border-[var(--border)] bg-[var(--muted)] text-[var(--foreground)]"
                  : "border-[var(--border)] bg-[var(--card)] text-[var(--muted-foreground)] hover:bg-[var(--accent)]"
              }`}
            >
              {t.label}
            </button>
          );
        })}

        <div className="ml-auto flex flex-wrap items-center gap-2 text-xs">
          {canDeleteProperty ? (
            <AdminDeleteActionButton
              action={deletePropertyAction.bind(null, property.id)}
              confirmMessage="Deseja excluir este imovel? Esta acao remove negociacoes, propostas e nao pode ser desfeita."
              successMessage="Imovel excluido com sucesso."
              fallbackErrorMessage="Nao foi possivel excluir o imovel."
              redirectTo="/properties"
              label="Excluir imovel"
              size="sm"
              className="text-xs"
            />
          ) : null}
          <span className="rounded-full border border-[var(--border)] bg-[var(--card)] px-2 py-0.5 text-[var(--muted-foreground)]">
            Status: <span className="font-semibold text-[var(--foreground)]">{status}</span>
          </span>
          <span
            className={`rounded-full border px-2 py-0.5 font-semibold ${
              status === "active"
                ? "border-[var(--primary)] bg-[var(--primary)]/10 text-[var(--primary)]"
                : "border-[var(--border)] bg-[var(--muted)] text-[var(--muted-foreground)]"
            }`}
          >
            {publicationLabel}
          </span>
        </div>
      </div>

      <div className="mt-4">
        {tab === "overview" && (
          <PropertyFullEditorClient
            property={currentProperty as any}
            propertyCategories={propertyCategories}
            onUpdated={(updatedProperty) => {
              const next = updatedProperty as unknown as Property;
              setCurrentProperty(next);
              if (next.status) setStatus(next.status);
            }}
          />
        )}

        {tab === "features" && (
          <PropertyFeaturesManager
            propertyId={property.id}
            catalog={featuresCatalog}
            initialValues={featureValues}
            aliasesToClear={featureAliasesToClear}
          />
        )}

        {tab === "media" && <PropertyMediaManager propertyId={property.id} />}

        {tab === "documents" && canViewLegalData && <PropertyDocumentsManager propertyId={property.id} />}

        {tab === "publish" && (
          <PublishPanel
            propertyId={property.id}
            initialStatus={status}
            onStatusChange={setStatus}
            viewerRole={viewerRole}
            viewerIsActive={viewerIsActive}
          />
        )}

        {tab === "campaign" && (
          <CampaignTab
            propertyId={property.id}
            propertyStatus={status}
            propertyCreatedAt={String(currentProperty.created_at ?? property.created_at ?? "")}
          />
        )}

        {tab === "negociacoes" && (
          <PropertyNegotiationsTab
            propertyId={property.id}
            initialNegotiationId={initialNegotiationId ?? null}
            initialProposalId={initialProposalId ?? null}
          />
        )}
      </div>
    </div>
  );
}
