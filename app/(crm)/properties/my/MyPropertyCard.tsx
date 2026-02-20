"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { ThumbCarousel } from "@/app/(public)/imoveis/resultados/ThumbCarousel"; // ajuste o path se seu ThumbCarousel estiver em outro lugar

type Props = {
  property: {
    id: string;
    title?: string | null;
    city?: string | null;
    neighborhood?: string | null;
    address?: string | null;
    purpose?: string | null;
    status?: string | null;
    price?: number | null;
    rent_price?: number | null;
    property_category_name?: string | null;
    imageUrls?: string[];
    cover_url?: string | null;
  };
  agg?: {
    pending_total: number;
    overdue: number;
    due_today: number;
    due_week: number;
  };
};

function money(v: number | null | undefined) {
  if (v == null) return null;
  return `R$ ${Number(v).toLocaleString("pt-BR")}`;
}

export default function MyPropertyCard({ property, agg }: Props) {
  const router = useRouter();
  const siteBase = (process.env.NEXT_PUBLIC_SITE_URL || "").replace(/\/$/, "");

  const location =
    [property.neighborhood, property.city].filter(Boolean).join(" • ") ||
    property.address ||
    "Localização não informada";

  const price =
    property.purpose === "rent" ? money(property.rent_price) : money(property.price);

  return (
    <div
      onClick={() => router.push(`/properties/${property.id}`)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") router.push(`/properties/${property.id}`);
      }}
      style={{
        cursor: "pointer",
        borderRadius: 16,
        overflow: "hidden",
        border: "1px solid rgba(0,0,0,.08)",
        background: "white",
        boxShadow: "0 8px 20px rgba(0,0,0,.06)",
      }}
    >
      {/* Thumb / carrossel */}
      <div style={{ position: "relative", height: 170 }}>
        {property.imageUrls?.length || property.cover_url ? (
          <ThumbCarousel
            images={
              property.imageUrls?.length
                ? property.imageUrls
                : property.cover_url
                  ? [property.cover_url]
                  : []
            }
            alt={property.title ?? "Imóvel"}
          />
        ) : (
          <div
            style={{
              height: "100%",
              display: "grid",
              placeItems: "center",
              background: "#f3f4f6",
              color: "#9ca3af",
              fontSize: 12,
              fontWeight: 700,
            }}
          >
            Sem foto
          </div>
        )}
      </div>

      {/* Conteúdo */}
      <div style={{ padding: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
          <div style={{ minWidth: 0 }}>
            <div
              style={{
                fontSize: 16,
                fontWeight: 900,
                lineHeight: 1.15,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
              title={property.title ?? ""}
            >
              {property.title ?? "Imóvel"}
            </div>

            {property.property_category_name ? (
              <div style={{ marginTop: 6, fontSize: 12, fontWeight: 800, opacity: 0.85 }}>
                {property.property_category_name}
              </div>
            ) : null}

            <div style={{ marginTop: 6, fontSize: 12, opacity: 0.75 }}>
              {location}
            </div>
          </div>

          <a
            href={`${siteBase}/imoveis/${property.id}`}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
            style={{
              fontSize: 12,
              fontWeight: 900,
              padding: "8px 10px",
              borderRadius: 999,
              border: "1px solid rgba(23,190,187,.35)",
              background: "rgba(23,190,187,.10)",
              textDecoration: "none",
              color: "inherit",
              whiteSpace: "nowrap",
              alignSelf: "flex-start",
            }}
            title="Abrir imóvel no site"
          >
            Ver no site
          </a>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 10 }}>
          <div style={{ fontSize: 18, fontWeight: 950 }}>
            {price ?? "Sob consulta"}
          </div>

          <div style={{ fontSize: 12, opacity: 0.7, fontWeight: 800 }}>
            {property.purpose === "sale"
              ? "Venda"
              : property.purpose === "rent"
              ? "Locação"
              : property.purpose}
          </div>
        </div>

        <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
          <span
            style={{
              fontSize: 12,
              padding: "6px 10px",
              borderRadius: 999,
              border: "1px solid rgba(0,0,0,.10)",
              fontWeight: 800,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {property.status ?? "—"}
          </span>
          {agg && agg.pending_total > 0 && (
            <span
              style={{
                fontSize: 12,
                padding: "6px 10px",
                borderRadius: 999,
                border: "1px solid rgba(0,0,0,.10)",
                backgroundColor: "rgba(0,0,0,.05)",
                fontWeight: 800,
              }}
              onClick={(e) => e.stopPropagation()}
            >
              Pend.: {agg.pending_total}
            </span>
          )}
          {agg && agg.overdue > 0 && (
            <span
              style={{
                fontSize: 12,
                padding: "6px 10px",
                borderRadius: 999,
                border: "1px solid rgba(255,0,0,.20)",
                backgroundColor: "rgba(255,0,0,.05)",
                fontWeight: 800,
              }}
              onClick={(e) => e.stopPropagation()}
            >
              Atras.: {agg.overdue}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
