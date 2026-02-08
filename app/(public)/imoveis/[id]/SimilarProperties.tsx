import { createClient } from "@/lib/supabaseServer";
import { getSignedImageUrl } from "@/lib/media/getPublicImageUrl";
import SimilarCarouselClient from "./SimilarCarouselClient";

function formatBRL(value: number | null | undefined) {
  if (value === null || value === undefined) return null;
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

type ViewName = "v_public_properties_ext" | "v_public_properties";

export default async function SimilarProperties({
  propertyId,
  city,
  purpose,
  propertyCategoryId,
}: {
  propertyId: string;
  city?: string | null;
  purpose?: string | null;
  propertyCategoryId?: string | null;
}) {
  const supabase = await createClient();

  // ✅ EXT tem métricas, BASE não.
  const SELECT_EXT = `
    id, title, city, neighborhood, purpose, price, rent_price,
    property_category_id, cover_media_url, created_at, status,
    area_m2, bedrooms, bathrooms, parking
  `;

  const SELECT_BASE = `
    id, title, city, neighborhood, purpose, price, rent_price,
    property_category_id, cover_media_url, created_at, status
  `;

  const fetchFromView = async (
    view: ViewName,
    filters: {
      city?: string | null;
      purpose?: string | null;
      propertyCategoryId?: string | null;
    },
    limit = 12
  ) => {
    const select = view === "v_public_properties_ext" ? SELECT_EXT : SELECT_BASE;

    let q = supabase
      .from(view)
      .select(select)
      .neq("id", propertyId)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(limit);

    // ✅ Só aplica filtro se tiver valor (evita eq(null))
    if (filters.city) q = q.eq("city", filters.city);
    if (filters.purpose) q = q.eq("purpose", filters.purpose);
    if (filters.propertyCategoryId)
      q = q.eq("property_category_id", filters.propertyCategoryId);

    const { data, error } = await q;
    return { data: (data ?? []) as any[], error };
  };

  const fetchSmart = async (filters: {
    city?: string | null;
    purpose?: string | null;
    propertyCategoryId?: string | null;
  }) => {
    // tenta ext
    const ext = await fetchFromView("v_public_properties_ext", filters);
    if (!ext.error) return { rows: ext.data, usedView: "ext" as const };

    const msg = String(ext.error.message ?? "").toLowerCase();
    const shouldFallback =
      msg.includes("relation") ||
      msg.includes("does not exist") ||
      msg.includes("schema cache") ||
      msg.includes("view") ||
      msg.includes("column");

    if (!shouldFallback) {
      console.error(ext.error);
      return { rows: ext.data, usedView: "ext" as const };
    }

    // fallback base
    const base = await fetchFromView("v_public_properties", filters);
    if (base.error) console.error(base.error);
    return { rows: base.data, usedView: "base" as const };
  };

  // ✅ Busca em camadas: vai relaxando filtros até ter “o suficiente”
  const minNeeded = 8;
  let rows: any[] = [];
  let labelMode: "strict" | "loose" | "global" = "strict";
  let usedView: "ext" | "base" = "ext";

  const attempts: Array<{
    label: "strict" | "loose" | "global";
    filters: { city?: string | null; purpose?: string | null; propertyCategoryId?: string | null };
  }> = [
    { label: "strict", filters: { city, purpose, propertyCategoryId } }, // mais específico
    { label: "loose", filters: { city, purpose, propertyCategoryId: null } }, // relaxa categoria
    { label: "loose", filters: { city, purpose: null, propertyCategoryId: null } }, // relaxa finalidade
    { label: "global", filters: { city: null, purpose: null, propertyCategoryId: null } }, // global
  ];

  for (const attempt of attempts) {
    const res = await fetchSmart(attempt.filters);
    if (res.rows.length > rows.length) {
      rows = res.rows;
      labelMode = attempt.label;
      usedView = res.usedView;
    }
    if (rows.length >= minNeeded) break;
  }

  const items = await Promise.all(
    rows.map(async (p) => {
      const coverUrl = p.cover_media_url
        ? await getSignedImageUrl(p.cover_media_url)
        : null;

      const location =
        [p.neighborhood, p.city].filter(Boolean).join(" • ") || "Localização";

      const price =
        p.purpose === "rent" ? formatBRL(p.rent_price) : formatBRL(p.price);

      const purposeLabel =
        p.purpose === "sale"
          ? "Venda"
          : p.purpose === "rent"
          ? "Locação"
          : p.purpose ?? null;

      return {
        id: String(p.id),
        href: `/imoveis/${p.id}`,
        title: p.title ?? "Imóvel",
        location,
        price,
        purposeLabel,
        // ✅ só vem na ext (no base fica null)
        area_m2: typeof p.area_m2 === "number" ? p.area_m2 : null,
        bedrooms: typeof p.bedrooms === "number" ? p.bedrooms : null,
        bathrooms: typeof p.bathrooms === "number" ? p.bathrooms : null,
        parking: typeof p.parking === "number" ? p.parking : null,
        coverUrl,
      };
    })
  );

  const whatsappE164 =
    process.env.NEXT_PUBLIC_VITRYA_WHATSAPP_E164 || "5565000000000";
  const whatsappLink = `https://wa.me/${whatsappE164}`;

  const title =
    labelMode === "strict"
      ? "Similares na mesma região"
      : labelMode === "loose"
      ? "Outras opções próximas"
      : "Outras oportunidades";

  return (
    <div
      className="pv-card"
      style={{
        background: "rgba(255,255,255,0.92)",
        border: "1px solid rgba(23, 26, 33, 0)",
        borderRadius: 20,
        padding: 20,
        boxShadow: "0 16px 40px rgba(0, 0, 0, 0)",
      }}
    >
      <h2 style={{ margin: "0 0 12px 0", fontSize: 20 }}>{title}</h2>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "260px minmax(0, 1fr)",
          gap: 16,
          alignItems: "stretch",
        }}
      >
        {/* CTA fixo */}
        <a
          href={whatsappLink}
          target="_blank"
          rel="noreferrer"
          style={{ textDecoration: "none", color: "inherit" }}
        >
          <div className="pv-card" style={{ height: "100%" }}>
            <div
              className="pv-thumb"
              style={{
                position: "relative",
                backgroundImage:
                  "linear-gradient(135deg, rgba(0, 0, 0, 0.2), rgba(179, 179, 179, 0.43), rgba(0, 0, 0, 0.25)), url('/banners/anuncie-vitrya.png')",
                backgroundSize: "cover",
                backgroundPosition: "center",
              }}
            >
            
            </div>
            <div className="pv-cardbody">
              <h3 className="pv-cardtitle">Anuncie seu imóvel na Vitrya</h3>
              <div className="pv-cardmeta" style={{ opacity: 0.8 }}>
                Fale com nosso time pelo.
              </div>
              <div
                style={{
                  marginTop: 10,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: "10px 12px",
                  borderRadius: 999,
                  background: "rgba(82, 252, 30, 0.82)",
                  border: "1px solid rgba(43, 255, 32, 0.88)",
                  color: "var(--mirage)",
                  fontWeight: 800,
                  fontSize: 13,
                  width: "fit-content",
                }}
              >
                WhatsApp
              </div>

              {/* Debug leve opcional (pode remover depois) */}
              <div style={{ marginTop: 10, fontSize: 11, opacity: 0.55 }}>
                Fonte: {usedView === "ext" ? "ext" : "base"} • {items.length} itens
              </div>
            </div>
          </div>
        </a>

        <SimilarCarouselClient items={items} />
      </div>
    </div>
  );
}
