import { createClient } from "@/lib/supabaseServer";
import { notFound } from "next/navigation";
import PropertyGallery from "./PropertyGallery";
import { BrokerCard } from "./BrokerCard";
import ListingActionsClient from "./ListingActionsClient";
import SimilarProperties from "./SimilarProperties";
import { headers } from "next/headers";
import { Icon } from "@/components/ui/Icon";
import DescriptionToggleClient from "./DescriptionToggleClient";
import { getSignedImageUrl } from "@/lib/media/getPublicImageUrl";

function formatBRL(value: number | null | undefined) {
  if (value === null || value === undefined) return null;
  try {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  } catch {
    return `R$ ${value}`;
  }
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}

type FeatureCatalogItem = {
  id: string;
  key: string;
  label_pt: string;
  group?: string | null;
  type: "boolean" | "text" | "enum" | "multi_enum" | "number" | string;
  options?: unknown;
  position?: number | null;
};

type FeatureValueRow = {
  feature_id: string;
  value_boolean: boolean | null;
  value_number: number | null;
  value_text: string | null;
  value_json: any | null;
};

function buildAvailableFeatures(
  catalog: FeatureCatalogItem[],
  values: FeatureValueRow[]
) {
  const byId = new Map<string, FeatureCatalogItem>();
  for (const item of catalog) byId.set(String(item.id), item);

  const result: string[] = [];

  for (const row of values) {
    const cat = byId.get(String(row.feature_id));
    if (!cat) continue;

    const label = cat.label_pt || cat.key || "Característica";
    const type = cat.type;

    if (type === "boolean") {
      if (row.value_boolean === true) result.push(label);
      continue;
    }

    if (type === "number") {
      if (
        typeof row.value_number === "number" &&
        !Number.isNaN(row.value_number)
      ) {
        result.push(`${label}: ${row.value_number}`);
      }
      continue;
    }

    if (type === "text" || type === "enum") {
      const v = (row.value_text ?? "").toString().trim();
      if (v) result.push(`${label}: ${v}`);
      continue;
    }

    if (type === "multi_enum") {
      const arr = Array.isArray(row.value_json) ? row.value_json : null;
      if (arr && arr.length > 0) {
        const joined = arr
          .map((x: any) => (typeof x === "string" ? x : JSON.stringify(x)))
          .join(", ");
        result.push(`${label}: ${joined}`);
      }
      continue;
    }

    const txt = (row.value_text ?? "").toString().trim();
    if (txt) result.push(`${label}: ${txt}`);
  }

  return result;
}

export default async function PublicPropertyPage({
  params,
}: {
  params: { id: string } | Promise<{ id: string }>;
}) {
  const supabase = await createClient();

  const resolvedParams = await Promise.resolve(params);
  const propertyId = resolvedParams?.id;

  if (!propertyId || !isUuid(propertyId)) return notFound();

  const SELECT_EXT = `
    id,
    status,
    purpose,
    title,
    description,
    city,
    neighborhood,
    price,
    rent_price,
    property_category_id,
    cover_media_url,
    created_at,
    property_category_name,
    broker_id,
    broker_full_name,
    broker_public_name,
    broker_creci,
    broker_phone_e164,
    broker_email,
    broker_avatar_url,
    broker_tagline,
    broker_bio,
    broker_instagram_url,
    broker_facebook_url,
    broker_tiktok_url,
    broker_youtube_url,
    broker_linkedin_url,
    broker_website_url,
    area_m2,
    built_area_m2,
    land_area_m2,
    bedrooms,
    bathrooms,
    parking,
    suites
  `;

  const SELECT_BASE = `
    id,
    status,
    purpose,
    title,
    description,
    city,
    neighborhood,
    price,
    rent_price,
    property_category_id,
    cover_media_url,
    created_at
  `;

  const fetchFromView = async (
    view: "v_public_properties_ext" | "v_public_properties"
  ) => {
    const select = view === "v_public_properties_ext" ? SELECT_EXT : SELECT_BASE;

    return supabase
      .from(view)
      .select(select)
      .eq("id", propertyId)
      .eq("status", "active")
      .maybeSingle();
  };

  let property: any = null;

  const { data: propertyExt, error: extError } = await fetchFromView(
    "v_public_properties_ext"
  );

  if (extError) {
    const msg = String(extError.message ?? "").toLowerCase();
    const shouldFallback =
      msg.includes("relation") ||
      msg.includes("does not exist") ||
      msg.includes("schema cache") ||
      msg.includes("view") ||
      msg.includes("column");

    if (shouldFallback) {
      const { data: propertyBase, error: baseError } = await fetchFromView(
        "v_public_properties"
      );
      if (baseError) console.error(baseError);
      property = propertyBase ?? null;
    } else {
      console.error(extError);
      property = propertyExt ?? null;
    }
  } else {
    property = propertyExt ?? null;
  }

  if (!property) return notFound();

  // ✅ Share URL (antes do WhatsApp text)
  const headerList = await headers();
  const host =
    headerList.get("x-forwarded-host") || headerList.get("host") || "";
  const proto = headerList.get("x-forwarded-proto") || "https";
  const shareUrl = host ? `${proto}://${host}/imoveis/${property.id}` : "";

  // ✅ Media (assinado)
  const { data: mediaRows, error: mediaError } = await supabase
    .from("property_media")
    .select("id, url, kind, position")
    .eq("property_id", propertyId)
    .order("position", { ascending: true });

  if (mediaError) console.error(mediaError);

  const rawMediaItems =
    (mediaRows ?? []).map((m: any) => ({
      id: String(m.id),
      url: m?.url ? String(m.url) : null,
      kind: m.kind,
    })) ?? [];

  const signedMediaItems = (
    await Promise.all(
      rawMediaItems.map(async (item) => {
        try {
          const signedUrl = await getSignedImageUrl(item.url);
          if (!signedUrl) return null;
          return { ...item, url: signedUrl };
        } catch {
          return null;
        }
      })
    )
  ).filter(Boolean) as { id: string; url: string; kind?: string }[];

  const coverSignedUrl = await getSignedImageUrl(property.cover_media_url ?? null);
  const mediaItems = [...signedMediaItems];

  if (coverSignedUrl && !mediaItems.some((m) => m.url === coverSignedUrl)) {
    mediaItems.unshift({ id: "cover", url: coverSignedUrl, kind: "image" });
  }

  const heroBgUrl = coverSignedUrl || mediaItems[0]?.url || null;

  // ✅ Features
  const [catalogRes, valuesRes] = await Promise.all([
    supabase
      .from("property_features")
      .select("id,key,label_pt,group,type,options,position")
      .eq("is_active", true)
      .order("group", { ascending: true })
      .order("position", { ascending: true }),
    supabase
      .from("property_feature_values")
      .select("feature_id,value_boolean,value_number,value_text,value_json")
      .eq("property_id", propertyId),
  ]);

  if (catalogRes.error || valuesRes.error) {
    console.error(
      "Erro ao carregar características:",
      catalogRes.error || valuesRes.error
    );
  }

  const availableFeatures = buildAvailableFeatures(
    (catalogRes.data ?? []) as FeatureCatalogItem[],
    (valuesRes.data ?? []) as FeatureValueRow[]
  );

  // ✅ Broker + WhatsApp
  const brokerName =
    property?.broker_public_name || property?.broker_full_name || "Corretor";

  const initials =
    brokerName
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((p: string) => p[0]?.toUpperCase())
      .join("") || "CR";

  const phoneLabel: string | null = property?.broker_phone_e164 || null;

  const phoneDigits = phoneLabel ? phoneLabel.replace(/\D/g, "") : "";
  const whatsappPhone =
    phoneDigits.length >= 10
      ? phoneDigits.startsWith("55")
        ? phoneDigits
        : `55${phoneDigits}`
      : "";

  const whatsappText = [
    "Olá! Vim pelo portal da Vitrya.",
    property?.title ? `Imóvel: ${property.title}` : null,
    shareUrl ? `Link: ${shareUrl}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const whatsappLink =
    whatsappPhone && whatsappText
      ? `https://wa.me/${whatsappPhone}?text=${encodeURIComponent(whatsappText)}`
      : null;

  const socials = [] as {
    key: string;
    label: string;
    icon: string;
    url: string;
  }[];

  const priceLabel =
    property.purpose === "rent"
      ? formatBRL(property.rent_price)
      : formatBRL(property.price ?? property.sale_value);

  const locationLabel = [property.neighborhood, property.city]
    .filter(Boolean)
    .join(", ");

  const isHouseLike =
    Number(property.land_area_m2 ?? 0) > 0 ||
    Number(property.built_area_m2 ?? 0) > 0;

  const areaMain = isHouseLike
    ? property.built_area_m2 ?? property.area_m2 ?? null
    : property.area_m2 ?? null;

  const areaLand = isHouseLike ? property.land_area_m2 ?? null : null;

  return (
    <>
    <div className="pv-hero pv-hero-full">
  <div className="pv-hero-card">
    {heroBgUrl ? (
      <>
        <div
          aria-hidden
          className="pv-hero-card-bg"
          style={{ backgroundImage: `url(${heroBgUrl})` }}
        />
        <div aria-hidden className="pv-hero-card-overlay" />
      </>
    ) : null}

    <div className="pv-hero-inner" style={{ position: "relative", zIndex: 2 }}>
      <div className="pv-hero-left" style={{ minWidth: 0 }}>
        <div style={{ opacity: 0.9, fontSize: 13 }}>
          Início · {property.city || "—"} · {property.neighborhood || "—"}
        </div>

        <h1 className="pv-title">{property.title || "Imóvel"}</h1>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
          {property.purpose ? (
            <span className="pv-pill">
              {property.purpose === "rent" ? "Aluguel" : "Venda"}
            </span>
          ) : null}

          <span className="pv-pill pv-pill-muted">
            {property.property_category_name || "Categoria"}
          </span>
        </div>

        <div style={{ marginTop: 12, opacity: 0.95 }}>
          <div style={{ fontSize: 14 }}>
            {locationLabel || "Localização não informada"}
          </div>

          {priceLabel ? (
            <div style={{ fontSize: 26, fontWeight: 900, marginTop: 6 }}>
              {priceLabel}
              <span
                style={{
                  fontSize: 13,
                  fontWeight: 700,
                  opacity: 0.7,
                  marginLeft: 8,
                }}
              >
                {property.purpose === "rent" ? "aluguel" : ""}
              </span>
            </div>
          ) : null}
        </div>

        <div className="pv-metrics-row" style={{ marginTop: 18 }}>
          {areaMain ? (
            <div className="pv-metric">
              <span className="pv-metric-ico">
                <Icon name="straighten" size={18} />
              </span>
              <span>
                <strong>{Number(areaMain)}</strong> m²
                <span style={{ opacity: 0.7, marginLeft: 6 }}>
                  {isHouseLike ? "construída" : ""}
                </span>
              </span>
            </div>
          ) : null}

          {areaLand ? (
            <div className="pv-metric">
              <span className="pv-metric-ico">
                <Icon name="foundation" size={18} />
              </span>
              <span>
                <strong>{Number(areaLand)}</strong> m²{" "}
                <span style={{ opacity: 0.7 }}>terreno</span>
              </span>
            </div>
          ) : null}

          {property.bedrooms ? (
            <div className="pv-metric">
              <span className="pv-metric-ico">
                <Icon name="bed" size={18} />
              </span>
              <span>
                <strong>{property.bedrooms}</strong>{" "}
                quarto{property.bedrooms > 1 ? "s" : ""}
              </span>
            </div>
          ) : null}

          {property.suites ? (
            <div className="pv-metric">
              <span className="pv-metric-ico">
                <Icon name="king_bed" size={18} />
              </span>
              <span>
                <strong>{property.suites}</strong>{" "}
                suíte{property.suites > 1 ? "s" : ""}
              </span>
            </div>
          ) : null}

          {property.bathrooms ? (
            <div className="pv-metric">
              <span className="pv-metric-ico">
                <Icon name="bathtub" size={18} />
              </span>
              <span>
                <strong>{property.bathrooms}</strong>{" "}
                banheiro{property.bathrooms > 1 ? "s" : ""}
              </span>
            </div>
          ) : null}

          {property.parking ? (
            <div className="pv-metric">
              <span className="pv-metric-ico">
                <Icon name="directions_car" size={18} />
              </span>
              <span>
                <strong>{property.parking}</strong>{" "}
                vaga{property.parking > 1 ? "s" : ""}
              </span>
            </div>
          ) : null}
        </div>

        <div style={{ marginTop: 18, display: "flex", gap: 14, flexWrap: "wrap" }}>
          <ListingActionsClient propertyId={String(property.id)} shareUrl={shareUrl} />

          <a
            href="#pv-map"
            style={{
              textDecoration: "none",
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "10px 14px",
              borderRadius: 999,
              background: "rgba(255,255,255,.14)",
              border: "1px solid rgba(255,255,255,.20)",
              color: "white",
              fontWeight: 800,
              fontSize: 13,
              backdropFilter: "blur(10px)",
            }}
          >
            <Icon name="location_on" size={18} /> Ver no mapa
          </a>
        </div>
      </div>

      <div className="pv-hero-right">
        <div className="pv-hero-media">
          <PropertyGallery items={mediaItems} title={property.title || "Imóvel"} />
        </div>
      </div>
    </div>
  </div>
</div>


      <div className="pv-content">
        <div
          style={{
            background: "rgba(255,255,255,0.76)",
            border: "1px solid rgba(255,255,255,0.55)",
            borderRadius: 20,
            padding: 20,
            boxShadow: "0 12px 32px rgba(0,0,0,0.08)",
            backdropFilter: "blur(12px)",
            WebkitBackdropFilter: "blur(12px)",
          }}
        >
          <div className="pv-grid-2" style={{ gap: 18 }}>
            <div style={{ minWidth: 0 }}>
              <h3 style={{ margin: "0 0 10px 0", fontSize: 18 }}>Itens disponíveis</h3>

              {availableFeatures.length === 0 ? (
                <p style={{ opacity: 0.7, margin: 0 }}>
                  Informações principais não disponíveis.
                </p>
              ) : (
                <ul
                  className="pv-checklist"
                  style={{
                    columns: 2,
                    columnGap: 26,
                    margin: 0,
                    paddingLeft: 18,
                  }}
                >
                  {availableFeatures.map((label) => (
                    <li key={label} style={{ breakInside: "avoid" }}>
                      {label}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div style={{ minWidth: 0 }}>
              {property?.broker_id ? (
                <BrokerCard
                  href={`/corretores/${property.broker_id}`}
                  name={brokerName}
                  initials={initials}
                  avatarUrl={property?.broker_avatar_url}
                  creci={property?.broker_creci}
                  tagline={property?.broker_tagline}
                  bio={property?.broker_bio}
                  phoneLabel={phoneLabel}
                  email={property?.broker_email}
                  socials={socials}
                  whatsappLink={whatsappLink}
                />
              ) : null}

              <div
                id="pv-map"
                style={{
                  marginTop: 14,
                  borderRadius: 16,
                  border: "1px solid rgba(23,26,33,0.1)",
                  background:
                    "linear-gradient(180deg, rgba(23,26,33,0.04), rgba(23,26,33,0.02))",
                  padding: 12,
                  minHeight: 150,
                  display: "grid",
                  gap: 8,
                  scrollMarginTop: 90,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <Icon name="location_on" size={18} />
                  <strong>Mapa premium em breve</strong>
                </div>
                <div
                  style={{
                    flex: 1,
                    borderRadius: 12,
                    border: "1px dashed rgba(23,26,33,0.2)",
                    background: "rgba(255,255,255,0.7)",
                    minHeight: 110,
                    display: "grid",
                    placeItems: "center",
                    color: "rgba(23,26,33,0.6)",
                    fontSize: 13,
                  }}
                >
                  Área reservada para mapa
                </div>
              </div>
            </div>
          </div>

          <div style={{ marginTop: 18 }}>
            <h2 style={{ margin: 0, fontSize: 20, textAlign: "center" }}>Descrição</h2>
            <div style={{ marginTop: 10, opacity: 0.85 }}>
              <DescriptionToggleClient
                text={property.description || "Descrição não informada."}
              />
            </div>
          </div>
        </div>

        <div style={{ marginTop: 22 }}>
          <SimilarProperties
            propertyId={String(property.id)}
            city={property.city}
            purpose={property.purpose}
            propertyCategoryId={property.property_category_id}
          />
        </div>
      </div>
    </>
  );
}
