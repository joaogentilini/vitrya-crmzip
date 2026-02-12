"use client";

import { useMemo, useState } from "react";

import PropertyMediaManager from "./media/PropertyMediaManager";
import PropertyDocumentsManager from "./documents/PropertyDocumentsManager";
import PublishPanel from "./PublishPanel";
import PropertyFullEditorClient from "./PropertyFullEditorClient";
import CampaignTab from "./CampaignTab";
import PropertyFeaturesManager from "./features/PropertyFeaturesManager";
import PropertyNegotiationsTab from "./negociacoes/PropertyNegotiationsTab";

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

  // ✅ categoria/classificação
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

export default function PropertyTabs({
  property,
  propertyCategories,
  featuresCatalog,
  featureValues,
  featureAliasesToClear,
  viewerRole,
  viewerIsActive,
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
}) {
  const [tab, setTab] = useState<TabKey>("overview");
  const [status, setStatus] = useState<string>(property.status);
  const [currentProperty, setCurrentProperty] = useState<Property>(property);

  const tabs: { key: TabKey; label: string }[] = useMemo(
    () => [
      { key: "overview", label: "Visão" },
      { key: "features", label: "Características" },
      { key: "media", label: "Mídias" },
      { key: "documents", label: "Documentos" },
      { key: "publish", label: "Publicação" },
      { key: "campaign", label: "Campanha" },
      { key: "negociacoes", label: "Negociações" },
    ],
    []
  );

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

        <div className="ml-auto text-xs text-[var(--muted-foreground)]">
          <span>
            Status:{" "}
            <span className="font-semibold text-[var(--foreground)]">
              {status}
            </span>
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

        {tab === "documents" && (
          <PropertyDocumentsManager propertyId={property.id} />
        )}

        {tab === "publish" && (
          <PublishPanel
            propertyId={property.id}
            initialStatus={status}
            onStatusChange={setStatus}
            viewerRole={viewerRole}
            viewerIsActive={viewerIsActive}
          />
        )}

        {tab === "campaign" && <CampaignTab propertyId={property.id} />}

        {tab === "negociacoes" && (
          <PropertyNegotiationsTab propertyId={property.id} />
        )}
      </div>
    </div>
  );
}
