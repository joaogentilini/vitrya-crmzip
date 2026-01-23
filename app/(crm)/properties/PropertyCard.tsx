"use client";

import React from "react";

export default function PropertyCard({ property }: { property: any }) {
  const openSite = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (typeof window !== "undefined") {
      window.open(`/imoveis/${property.id}`, "_blank", "noreferrer");
    }
  };

  return (
    <div
      style={{
        display: "block",
        padding: 16,
        border: "1px solid #e5e7eb",
        borderRadius: 8,
        textDecoration: "none",
        color: "inherit",
        backgroundColor: "white",
        transition: "box-shadow 0.2s",
        cursor: "pointer",
      }}
    >
      <div style={{ display: "flex", gap: 16, alignItems: "start" }}>
        {/* Thumb */}
        <div
          style={{
            width: 92,
            height: 68,
            borderRadius: 6,
            backgroundColor: "#f3f4f6",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
            overflow: "hidden",
            border: "1px solid rgba(0,0,0,0.06)",
          }}
        >
          {property.cover_url ? (
            <img
              src={property.cover_url}
              alt={property.title ? `Capa: ${property.title}` : "Capa do imóvel"}
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
              loading="lazy"
            />
          ) : (
            <span style={{ fontSize: 12, color: "#9ca3af" }}>Sem foto</span>
          )}
        </div>

        {/* Body */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <h3
            style={{
              margin: 0,
              fontSize: 18,
              fontWeight: 700,
              lineHeight: 1.15,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
            title={property.title ?? ""}
          >
            {property.title ?? "Imóvel"}
          </h3>

          <p style={{ margin: "6px 0 0", color: "#6b7280" }}>
            {property.city && property.neighborhood
              ? `${property.neighborhood}, ${property.city}`
              : property.address || "Localização não informada"}
          </p>

          <p style={{ margin: "6px 0 0", color: "#374151" }}>
            {property.purpose === "sale"
              ? "Venda"
              : property.purpose === "rent"
              ? "Aluguel"
              : property.purpose}{" "}
            • Status: {property.status}
          </p>

          <div
            style={{
              display: "flex",
              gap: 14,
              marginTop: 10,
              alignItems: "center",
              flexWrap: "wrap",
            }}
          >
            {property.price != null ? (
              <p style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>
                R$ {Number(property.price).toLocaleString("pt-BR")}
              </p>
            ) : null}

            {property.rent_price != null ? (
              <p style={{ margin: 0, fontSize: 14, color: "#6b7280" }}>
                Aluguel: R$ {Number(property.rent_price).toLocaleString("pt-BR")}
              </p>
            ) : null}

            <button
              onClick={openSite}
              type="button"
              style={{
                marginLeft: "auto",
                padding: "6px 10px",
                backgroundColor: "#17BEBB",
                color: "white",
                border: "none",
                borderRadius: 6,
                fontSize: 12,
                fontWeight: 700,
                cursor: "pointer",
              }}
              aria-label="Abrir imóvel na vitrine"
              title="Abrir imóvel no site"
            >
              Ver no site
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
