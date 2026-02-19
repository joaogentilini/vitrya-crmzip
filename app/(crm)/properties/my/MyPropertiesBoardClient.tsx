/* eslint-disable @next/next/no-img-element */
"use client";

import Link from "next/link";
import type { PropertyWithCover } from "@/lib/properties";

function fmtMoney(v: number | null | undefined) {
  if (v == null) return null;
  return `R$ ${Number(v).toLocaleString("pt-BR")}`;
}

function purposeLabel(p: string) {
  if (p === "sale") return "Venda";
  if (p === "rent") return "Locação";
  return p;
}

export default function MyPropertiesBoardClient({
  properties,
}: {
  properties: PropertyWithCover[];
}) {
  const siteBase = (process.env.NEXT_PUBLIC_SITE_URL || "").replace(/\/$/, "");

  return (
    <div style={{ padding: 24 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 24,
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <h1 style={{ margin: 0 }}>Meus Imóveis</h1>

        <Link
          href="/properties/new"
          style={{
            padding: "8px 16px",
            backgroundColor: "#294487",
            color: "white",
            borderRadius: 8,
            textDecoration: "none",
            fontWeight: 700,
          }}
        >
          Novo Imóvel
        </Link>
      </div>

      {/* ✅ Cards estilo vitrine (grid, thumb grande) */}
      {properties?.length ? (
        <section
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
            gap: 16,
            alignItems: "stretch",
          }}
        >
          {properties.map((p) => {
            const location =
              [p.neighborhood, p.city].filter(Boolean).join(" • ") ||
              p.address ||
              "Localização não informada";

            const price =
              p.purpose === "rent" ? fmtMoney(p.rent_price) : fmtMoney(p.price);

            return (
              <Link
                key={p.id}
                href={`/properties/${p.id}`}
                style={{
                  display: "block",
                  textDecoration: "none",
                  color: "inherit",
                  borderRadius: 16,
                  border: "1px solid rgba(17,24,39,.10)",
                  background: "rgba(255,255,255,.90)",
                  overflow: "hidden",
                  boxShadow: "0 10px 28px rgba(17,24,39,.06)",
                }}
              >
                {/* Thumb grande */}
                <div
                  style={{
                    height: 180,
                    background: "rgba(17,24,39,.04)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    overflow: "hidden",
                  }}
                >
                  {p.cover_url ? (
                    <img
                      src={p.cover_url}
                      alt={p.title ? `Capa: ${p.title}` : "Capa do imóvel"}
                      style={{ width: "100%", height: "100%", objectFit: "cover" }}
                      loading="lazy"
                    />
                  ) : (
                    <span style={{ fontSize: 12, opacity: 0.6 }}>Sem foto</span>
                  )}
                </div>

                <div style={{ padding: 14 }}>
                  <div style={{ fontWeight: 900, fontSize: 16, lineHeight: 1.2 }}>
                    {p.title ?? "Imóvel"}
                  </div>

                  {p.property_category_name ? (
                    <div style={{ marginTop: 6, fontSize: 13, opacity: 0.85, fontWeight: 800 }}>
                      {p.property_category_name}
                    </div>
                  ) : null}

                  <div style={{ marginTop: 6, fontSize: 13, opacity: 0.75 }}>
                    {location}
                  </div>

                  <div style={{ marginTop: 12, display: "flex", gap: 10, flexWrap: "wrap" }}>
                    <span
                      style={{
                        fontSize: 12,
                        padding: "6px 10px",
                        borderRadius: 999,
                        border: "1px solid rgba(17,24,39,.10)",
                        background: "rgba(255,255,255,.92)",
                        fontWeight: 900,
                      }}
                    >
                      {purposeLabel(p.purpose)}
                    </span>

                    <span
                      style={{
                        fontSize: 12,
                        padding: "6px 10px",
                        borderRadius: 999,
                        border: "1px solid rgba(23,190,187,.25)",
                        background: "rgba(23,190,187,.10)",
                        fontWeight: 900,
                      }}
                    >
                      {p.status}
                    </span>

                    {/* ✅ “Ver no site” sem onClick: evita erro e funciona igual */}
                    <a
                      href={`${siteBase}/imóveis/${p.id}`}
                      target="_blank"
                      rel="noreferrer"
                      style={{
                        fontSize: 12,
                        padding: "6px 10px",
                        borderRadius: 999,
                        border: "1px solid rgba(23,190,187,.35)",
                        background: "rgba(23,190,187,.12)",
                        fontWeight: 900,
                        textDecoration: "none",
                        color: "inherit",
                      }}
                      onClick={(e) => e.stopPropagation()}
                      title="Abrir imóvel no site"
                    >
                      Ver no site
                    </a>
                  </div>

                  <div style={{ marginTop: 10, display: "flex", justifyContent: "space-between" }}>
                    {price ? <div style={{ fontWeight: 950 }}>{price}</div> : <div />}
                    <div style={{ fontSize: 12, opacity: 0.7 }}>
                      {p.purpose === "rent" ? "Aluguel" : "Venda"}
                    </div>
                  </div>
                </div>
              </Link>
            );
          })}
        </section>
      ) : (
        <div style={{ textAlign: "center", padding: 48, color: "#6b7280" }}>
          <p>Você ainda não tem imóveis cadastrados.</p>
          <Link href="/properties/new" style={{ color: "#294487", textDecoration: "underline" }}>
            Criar primeiro imóvel
          </Link>
        </div>
      )}

      {/* ✅ Placeholder do Kanban (você disse que vai entrar aqui depois) */}
      <div style={{ marginTop: 24 }}>
        <div
          style={{
            padding: 16,
            border: "1px dashed rgba(17,24,39,.25)",
            borderRadius: 16,
            background: "rgba(255,255,255,.65)",
          }}
        >
          <div style={{ fontWeight: 900 }}>Campanhas (Kanban)</div>
          <div style={{ marginTop: 6, opacity: 0.7 }}>
            Aqui entra o Kanban por imóvel (pós-publicação 30 dias, etc).
          </div>
        </div>
      </div>
    </div>
  );
}
