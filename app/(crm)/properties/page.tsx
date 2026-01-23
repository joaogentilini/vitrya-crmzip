// app/(crm)/properties/page.tsx
import Link from "next/link";
import PropertyCard from "./PropertyCard";
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
              style={{ textDecoration: "none", color: "inherit" }}
            >
              <PropertyCard property={property} />
            </Link>
          ))}
        </div>
      ) : (
        <div style={{ textAlign: "center", padding: 48, color: "#6b7280" }}>
          <p>Nenhum imóvel cadastrado ainda.</p>
          <Link
            href="/properties/new"
            style={{ color: "#294487", textDecoration: "underline" }}
          >
            Criar primeiro imóvel
          </Link>
        </div>
      )}
    </div>
  );
}
