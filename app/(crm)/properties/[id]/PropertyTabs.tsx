"use client";

import { useMemo, useState } from "react";

import PropertyMediaManager from "./media/PropertyMediaManager";
import PropertyDocumentsManager from "./documents/PropertyDocumentsManager";
import PublishPanel from "./PublishPanel";
import PropertyEditor from "./PropertyEditor";

type TabKey = "overview" | "media" | "documents" | "publish";

interface PropertyCategory {
  id: string;
  name: string;
  is_active: boolean;
  position: number;
}

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
  created_at: string;
}

// ✅ Hidratação-safe: evita mismatch de timezone/locale (server vs client)
function ClientDate({ iso }: { iso: string }) {
  return (
    <span suppressHydrationWarning>
      {new Date(iso).toLocaleDateString("pt-BR")}
    </span>
  );
}

export default function PropertyTabs({
  property,
  propertyCategories = [],
}: {
  property: Property;
  propertyCategories?: PropertyCategory[];
}) {
  const [tab, setTab] = useState<TabKey>("overview");
  const [status, setStatus] = useState<string>(property.status);
  const [isEditing, setIsEditing] = useState(false);
  const [currentProperty, setCurrentProperty] = useState<Property>(property);

  const tabs: { key: TabKey; label: string }[] = useMemo(
    () => [
      { key: "overview", label: "Visão geral" },
      { key: "media", label: "Mídias" },
      { key: "documents", label: "Documentos" },
      { key: "publish", label: "Publicação" },
    ],
    []
  );

  const categoryLabel = useMemo(() => {
    // prioridade: nome vindo do server (join) -> fallback por id na lista
    if (currentProperty.property_category_name) {
      return currentProperty.property_category_name;
    }
    const id = currentProperty.property_category_id;
    if (!id) return "Não informado";
    return propertyCategories.find((c) => c.id === id)?.name ?? "Não informado";
  }, [
    currentProperty.property_category_id,
    currentProperty.property_category_name,
    propertyCategories,
  ]);

  return (
    <div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              padding: "10px 12px",
              borderRadius: 10,
              border: "1px solid rgba(0,0,0,0.12)",
              background: tab === t.key ? "rgba(0,0,0,0.06)" : "white",
              cursor: "pointer",
              fontWeight: tab === t.key ? 600 : 500,
            }}
          >
            {t.label}
          </button>
        ))}

        <div style={{ marginLeft: "auto", opacity: 0.7, fontSize: 12 }}>
          Status: <b>{status}</b>
        </div>
      </div>

      <div style={{ marginTop: 16 }}>
        {tab === "overview" && (
          <>
            {/* Botão de editar */}
            <div style={{ marginBottom: 16 }}>
              <button
                onClick={() => setIsEditing(!isEditing)}
                style={{
                  padding: "8px 16px",
                  backgroundColor: isEditing ? "#dc2626" : "#294487",
                  color: "white",
                  border: "none",
                  borderRadius: 6,
                  cursor: "pointer",
                  fontWeight: 500,
                }}
              >
                {isEditing ? "Cancelar Edição" : "Editar"}
              </button>
            </div>

            {isEditing ? (
              <PropertyEditor
                property={currentProperty}
                propertyCategories={propertyCategories} // ✅ novo
                onSave={(updatedProperty: Property) => {
                  setCurrentProperty(updatedProperty);
                  // se editor alterar status local (opcional), mantém sincronizado
                  if (updatedProperty.status) setStatus(updatedProperty.status);
                  setIsEditing(false);
                }}
                onCancel={() => setIsEditing(false)}
              />
            ) : (
              <div style={{ opacity: 0.85 }}>
                <div style={{ display: "grid", gap: 16 }}>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: 16,
                    }}
                  >
                    <div>
                      <label
                        style={{
                          display: "block",
                          fontWeight: 600,
                          marginBottom: 4,
                        }}
                      >
                        Título
                      </label>
                      <p style={{ margin: 0 }}>{currentProperty.title}</p>
                    </div>
                    <div>
                      <label
                        style={{
                          display: "block",
                          fontWeight: 600,
                          marginBottom: 4,
                        }}
                      >
                        Tipo
                      </label>
                      <p style={{ margin: 0 }}>
                        {currentProperty.purpose === "sale"
                          ? "Venda"
                          : "Aluguel"}
                      </p>
                    </div>
                  </div>

                  {/* ✅ Categoria do imóvel */}
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: 16,
                    }}
                  >
                    <div>
                      <label
                        style={{
                          display: "block",
                          fontWeight: 600,
                          marginBottom: 4,
                        }}
                      >
                        Categoria do imóvel
                      </label>
                      <p style={{ margin: 0 }}>{categoryLabel}</p>
                    </div>
                    <div>
                      <label
                        style={{
                          display: "block",
                          fontWeight: 600,
                          marginBottom: 4,
                        }}
                      >
                        Status
                      </label>
                      <p style={{ margin: 0 }}>{status}</p>
                    </div>
                  </div>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: 16,
                    }}
                  >
                    <div>
                      <label
                        style={{
                          display: "block",
                          fontWeight: 600,
                          marginBottom: 4,
                        }}
                      >
                        Cidade
                      </label>
                      <p style={{ margin: 0 }}>
                        {currentProperty.city || "Não informado"}
                      </p>
                    </div>
                    <div>
                      <label
                        style={{
                          display: "block",
                          fontWeight: 600,
                          marginBottom: 4,
                        }}
                      >
                        Bairro
                      </label>
                      <p style={{ margin: 0 }}>
                        {currentProperty.neighborhood || "Não informado"}
                      </p>
                    </div>
                  </div>

                  <div>
                    <label
                      style={{
                        display: "block",
                        fontWeight: 600,
                        marginBottom: 4,
                      }}
                    >
                      Endereço
                    </label>
                    <p style={{ margin: 0 }}>
                      {currentProperty.address || "Não informado"}
                    </p>
                  </div>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: 16,
                    }}
                  >
                    <div>
                      <label
                        style={{
                          display: "block",
                          fontWeight: 600,
                          marginBottom: 4,
                        }}
                      >
                        Preço de Venda
                      </label>
                      <p style={{ margin: 0 }}>
                        {currentProperty.price != null
                          ? `R$ ${Number(currentProperty.price).toLocaleString(
                              "pt-BR"
                            )}`
                          : "Não informado"}
                      </p>
                    </div>
                    <div>
                      <label
                        style={{
                          display: "block",
                          fontWeight: 600,
                          marginBottom: 4,
                        }}
                      >
                        Preço de Aluguel
                      </label>
                      <p style={{ margin: 0 }}>
                        {currentProperty.rent_price != null
                          ? `R$ ${Number(
                              currentProperty.rent_price
                            ).toLocaleString("pt-BR")}`
                          : "Não informado"}
                      </p>
                    </div>
                  </div>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr 1fr 1fr",
                      gap: 16,
                    }}
                  >
                    <div>
                      <label
                        style={{
                          display: "block",
                          fontWeight: 600,
                          marginBottom: 4,
                        }}
                      >
                        Área (m²)
                      </label>
                      <p style={{ margin: 0 }}>
                        {currentProperty.area_m2 != null
                          ? `${currentProperty.area_m2} m²`
                          : "Não informado"}
                      </p>
                    </div>
                    <div>
                      <label
                        style={{
                          display: "block",
                          fontWeight: 600,
                          marginBottom: 4,
                        }}
                      >
                        Quartos
                      </label>
                      <p style={{ margin: 0 }}>
                        {currentProperty.bedrooms ?? "Não informado"}
                      </p>
                    </div>
                    <div>
                      <label
                        style={{
                          display: "block",
                          fontWeight: 600,
                          marginBottom: 4,
                        }}
                      >
                        Banheiros
                      </label>
                      <p style={{ margin: 0 }}>
                        {currentProperty.bathrooms ?? "Não informado"}
                      </p>
                    </div>
                    <div>
                      <label
                        style={{
                          display: "block",
                          fontWeight: 600,
                          marginBottom: 4,
                        }}
                      >
                        Vagas
                      </label>
                      <p style={{ margin: 0 }}>
                        {currentProperty.parking ?? "Não informado"}
                      </p>
                    </div>
                  </div>

                  <div>
                    <label
                      style={{
                        display: "block",
                        fontWeight: 600,
                        marginBottom: 4,
                      }}
                    >
                      Descrição
                    </label>
                    <p style={{ margin: 0 }}>
                      {currentProperty.description || "Não informado"}
                    </p>
                  </div>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: 16,
                    }}
                  >
                    <div>
                      <label
                        style={{
                          display: "block",
                          fontWeight: 600,
                          marginBottom: 4,
                        }}
                      >
                        Criado em
                      </label>
                      <p style={{ margin: 0 }}>
                        <ClientDate iso={currentProperty.created_at} />
                      </p>
                    </div>
                    <div />
                  </div>
                </div>
              </div>
            )}
          </>
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
          />
        )}
      </div>
    </div>
  );
}
