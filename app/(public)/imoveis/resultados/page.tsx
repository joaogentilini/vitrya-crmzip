import Link from "next/link";
import { createPublicClient } from "@/lib/supabase/publicServer";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSignedImageUrl } from "@/lib/media/getPublicImageUrl";
import { ThumbCarousel } from "./ThumbCarousel";

export const dynamic = "force-dynamic";

type PublicProperty = {
  id: string;
  status: string;
  purpose: "sale" | "rent" | string;
  title: string | null;
  city: string | null;
  neighborhood: string | null;
  address: string | null;
  price: number | null;
  rent_price: number | null;
  area_m2: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  parking: number | null;
  cover_media_url: string | null; // path do storage
  created_at: string;

  // ✅ vindo da view nova
  property_category_id?: string | null;
  property_category_name?: string | null;
};

type MediaRow = {
  property_id: string;
  url: string; // path do storage
  kind: "image" | "video" | string;
  position: number | null;
};

type PublicPropertyWithImages = PublicProperty & {
  coverUrl: string | null;
  imageUrls: string[];
};

function fmtMoney(v: number | null) {
  if (v == null) return null;
  return `R$ ${Number(v).toLocaleString("pt-BR")}`;
}

function isHttpUrl(v: string) {
  return /^https?:\/\//i.test(v);
}

async function resolveMediaUrl(raw: string | null | undefined) {
  const v = (raw ?? "").toString().trim();
  if (!v) return null;
  if (isHttpUrl(v)) return v;
  try {
    const signed = await getSignedImageUrl(v);
    return signed ?? null;
  } catch {
    return null;
  }
}

export default async function PublicResultsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const supabase = createPublicClient();

  // ✅ agora usamos a view enriquecida
  let query = supabase.from("v_public_properties_ext").select("*");

  // ✅ Filtro por categoria (querystring ?category=<uuid>)
  const category =
    typeof params.category === "string" ? params.category : undefined;
  if (category) query = query.eq("property_category_id", category);

  // Se sua VIEW já filtra status='active', pode remover.
  query = query.eq("status", "active");

  if (params.purpose && typeof params.purpose === "string") {
    query = query.eq("purpose", params.purpose);
  }

  if (params.query && typeof params.query === "string") {
    const searchTerm = `%${params.query}%`;
    query = query.or(
      `city.ilike.${searchTerm},neighborhood.ilike.${searchTerm},address.ilike.${searchTerm}`
    );
  }

  if (params.min && typeof params.min === "string") {
    const minPrice = parseFloat(params.min);
    if (!Number.isNaN(minPrice)) {
      if (params.purpose === "rent") query = query.gte("rent_price", minPrice);
      else query = query.gte("price", minPrice);
    }
  }

  if (params.max && typeof params.max === "string") {
    const maxPrice = parseFloat(params.max);
    if (!Number.isNaN(maxPrice)) {
      if (params.purpose === "rent") query = query.lte("rent_price", maxPrice);
      else query = query.lte("price", maxPrice);
    }
  }

  if (params.bedrooms && typeof params.bedrooms === "string") {
    const minBedrooms = parseInt(params.bedrooms, 10);
    if (!Number.isNaN(minBedrooms)) query = query.gte("bedrooms", minBedrooms);
  }

  const { data, error } = await query.order("created_at", { ascending: false });

  if (error) {
    return (
      <div className="pv-container">
        <div className="pv-glass">
          <h1 style={{ marginTop: 0 }}>Erro</h1>
          <pre style={{ color: "crimson", margin: 0 }}>
            {JSON.stringify(error, null, 2)}
          </pre>
        </div>
      </div>
    );
  }

  const properties = (data ?? []) as PublicProperty[];
  const ids = properties.map((p) => p.id);

  // ✅ Buscar mídias (imagens) para carrossel no card
  let mediaByProperty: Record<string, MediaRow[]> = {};
  if (ids.length > 0) {
    const { data: mediaRows, error: mediaErr } = await supabase
      .from("property_media")
      .select("property_id, url, kind, position")
      .in("property_id", ids)
      .eq("kind", "image")
      .order("position", { ascending: true });

    let effectiveRows = (mediaRows ?? []) as MediaRow[];

    // Fallback seguro: se RLS bloquear a leitura pública, usa service role apenas para imóveis já ativos da vitrine.
    if (effectiveRows.length === 0) {
      const admin = createAdminClient();
      const { data: adminRows, error: adminErr } = await admin
        .from("property_media")
        .select("property_id, url, kind, position")
        .in("property_id", ids)
        .eq("kind", "image")
        .order("position", { ascending: true });

      if (adminErr) {
        if (mediaErr) console.error("Public media query error:", mediaErr);
        console.error("Admin media fallback error:", adminErr);
      } else {
        effectiveRows = (adminRows ?? []) as MediaRow[];
      }
    }

    for (const row of effectiveRows) {
      if (!mediaByProperty[row.property_id]) mediaByProperty[row.property_id] = [];
      mediaByProperty[row.property_id].push(row);
    }
  }

  // ✅ Resolve URLs assinadas: capa + primeiras imagens do property_media
  const propertiesWithImages: PublicPropertyWithImages[] = await Promise.all(
    properties.map(async (p): Promise<PublicPropertyWithImages> => {
      const coverUrl = await resolveMediaUrl(p.cover_media_url);

      const mediaRows = mediaByProperty[p.id] || [];
      const mediaPaths = mediaRows.map((m) => m.url).filter(Boolean);

      // monta lista de paths: capa primeiro (se existir e não estiver repetida)
      const uniquePaths: string[] = [];
      if (p.cover_media_url) uniquePaths.push(p.cover_media_url);
      for (const path of mediaPaths) {
        if (!uniquePaths.includes(path)) uniquePaths.push(path);
      }

      // limita para não assinar 50 imagens por imóvel no card
      const limitedPaths = uniquePaths.slice(0, 6);

      const imageUrls = await Promise.all(
        limitedPaths.map(async (path) => {
          return await resolveMediaUrl(path);
        })
      );

      const cleanUrls = imageUrls.filter(Boolean) as string[];

      return {
        ...p,
        coverUrl,
        imageUrls: cleanUrls.length > 0 ? cleanUrls : coverUrl ? [coverUrl] : [],
      };
    })
  );

  return (
    <div className="pv-container">
      <div className="pv-glass">
        <div style={{ marginBottom: "1.5rem" }}>
          <Link
            href="/imoveis"
            style={{
              color: "var(--cobalt)",
              textDecoration: "none",
              fontWeight: 800,
            }}
          >
            ← Voltar para busca
          </Link>

          <h1 style={{ marginTop: "0.9rem", marginBottom: 0 }}>
            Imóveis{" "}
            {propertiesWithImages.length > 0
              ? `(${propertiesWithImages.length} encontrados)`
              : ""}
          </h1>
        </div>

        {propertiesWithImages.length === 0 ? (
          <div style={{ textAlign: "center", padding: "2.5rem 1rem" }}>
            <h2 style={{ marginTop: 0 }}>Nenhum imóvel encontrado</h2>
            <p style={{ margin: "0.5rem 0 1rem", opacity: 0.8 }}>
              Tente ajustar os filtros de busca.
            </p>
            <Link
              href="/imoveis"
              style={{ color: "var(--cobalt)", fontWeight: 800 }}
            >
              Voltar para busca
            </Link>
          </div>
        ) : (
          <section className="pv-grid">
            {propertiesWithImages.map((p) => {
              const location =
                [p.neighborhood, p.city].filter(Boolean).join(" • ") ||
                p.address ||
                "Localização não informada";

              const price =
                p.purpose === "rent" ? fmtMoney(p.rent_price) : fmtMoney(p.price);

              return (
                <Link key={p.id} href={`/imoveis/${p.id}`} className="pv-card">
                  <div className="pv-thumb" style={{ position: "relative" }}>
                    {p.imageUrls.length ? (
                      <ThumbCarousel images={p.imageUrls} alt={p.title ?? "Imóvel"} />
                    ) : (
                      <span>Sem foto</span>
                    )}
                  </div>

                  <div className="pv-cardbody">
                    <h3 className="pv-cardtitle">{p.title ?? "Imóvel"}</h3>

                    {/* ✅ categoria (se existir) */}
                    {p.property_category_name ? (
                      <div className="pv-cardmeta" style={{ opacity: 0.85 }}>
                        {p.property_category_name}
                      </div>
                    ) : null}

                    <div className="pv-cardmeta">{location}</div>

                    <div className="pv-pricerow">
                      {price ? <div className="pv-price">{price}</div> : null}
                      <div className="pv-muted">
                        {p.purpose === "sale"
                          ? "Venda"
                          : p.purpose === "rent"
                          ? "Locação"
                          : p.purpose}
                      </div>
                    </div>

                    <div className="pv-pricerow" style={{ marginTop: 8 }}>
                      {p.area_m2 != null ? (
                        <span className="pv-muted">{p.area_m2} m²</span>
                      ) : null}
                      {p.bedrooms != null ? (
                        <span className="pv-muted">{p.bedrooms} quartos</span>
                      ) : null}
                      {p.bathrooms != null ? (
                        <span className="pv-muted">{p.bathrooms} banheiros</span>
                      ) : null}
                      {p.parking != null ? (
                        <span className="pv-muted">{p.parking} vagas</span>
                      ) : null}
                    </div>
                  </div>
                </Link>
              );
            })}
          </section>
        )}
      </div>
    </div>
  );
}
