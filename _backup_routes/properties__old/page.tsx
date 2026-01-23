import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import Link from "next/link";
import { getPropertiesWithCover } from "@/lib/properties";

export default async function PropertiesPage() {
  const properties = await getPropertiesWithCover();

  return (
    <div style={{ padding: 24 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 24,
        }}
      >
        <h1>Imóveis</h1>
        <Link
          href="/properties/new"
          style={{
            padding: "8px 16px",
            backgroundColor: "#294487",
            color: "white",
            borderRadius: 8,
            textDecoration: "none",
            fontWeight: 500,
          }}
        >
          Novo Imóvel
        </Link>
      </div>

      {properties && properties.length > 0 ? (
        <div style={{ display: "grid", gap: 16 }}>
          {properties.map((property) => (
            <Link
              key={property.id}
              href={`/properties/${property.id}`}
              style={{
                display: "block",
                padding: 16,
                border: "1px solid #e5e7eb",
                borderRadius: 8,
                textDecoration: "none",
                color: "inherit",
                backgroundColor: "white",
                transition: "box-shadow 0.2s",
              }}
            >
              <div
                style={{
                  display: "flex",
                  gap: 16,
                  alignItems: "start",
                }}
              >
                {/* Capa do imóvel */}
                <div
                  style={{
                    width: 80,
                    height: 60,
                    borderRadius: 4,
                    backgroundColor: "#f3f4f6",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                    overflow: "hidden",
                  }}
                >
                  {property.cover_url ? (
                    <img
                      src={property.cover_url}
                      alt="Capa do imóvel"
                      style={{
                        width: "100%",
                        height: "100%",
                        objectFit: "cover",
                      }}
                    />
                  ) : (
                    <span style={{ fontSize: 12, color: "#9ca3af" }}>Sem foto</span>
                  )}
                </div>

                {/* Informações do imóvel */}
                <div style={{ flex: 1 }}>
                  <h3 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>
                    {property.title}
                  </h3>

                  <p style={{ margin: "4px 0", color: "#6b7280" }}>
                    {property.city && property.neighborhood
                      ? `${property.neighborhood}, ${property.city}`
                      : property.address}
                  </p>

                  <p style={{ margin: "4px 0", color: "#374151" }}>
                    {property.purpose === "sale" ? "Venda" : "Aluguel"} • Status:{" "}
                    {property.status}
                  </p>

                  <div style={{ display: "flex", gap: 16, marginTop: 8 }}>
                    {property.price != null && (
                      <p style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>
                        R$ {Number(property.price).toLocaleString("pt-BR")}
                      </p>
                    )}

                    {property.rent_price != null && (
                      <p style={{ margin: 0, fontSize: 14, color: "#6b7280" }}>
                        Aluguel: R${" "}
                        {Number(property.rent_price).toLocaleString("pt-BR")}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <div style={{ textAlign: "center", padding: 48, color: "#6b7280" }}>
          <p>Nenhum imóvel cadastrado ainda.</p>
          <Link
            href="/properties/new"
            style={{
              color: "#294487",
              textDecoration: "underline",
            }}
          >
            Criar primeiro imóvel
          </Link>
        </div>
      )}
    </div>
  );
}
