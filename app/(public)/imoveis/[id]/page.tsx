import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { createPublicClient } from "@/lib/supabase/publicServer";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSignedImageUrlMap } from "@/lib/media/getPublicImageUrl";
import type { AmenitiesSnapshotData } from "@/lib/maps/types";
import PublicPropertyMapCard from "@/components/maps/PublicPropertyMapCard";

import HeroBackgroundGalleryClient from "./HeroBackgroundGalleryClient";
import { BrokerCard } from "./BrokerCard";
import ListingActionsClient from "./ListingActionsClient";
import SimilarProperties from "./SimilarProperties";
import { Icon } from "@/components/ui/Icon";
import DescriptionToggleClient from "./DescriptionToggleClient";

export const revalidate = 300;

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

function safeText(v: any) {
  const s = (v ?? "").toString().trim();
  return s.length ? s : null;
}

type ViewName = "v_public_properties_ext" | "v_public_properties";

async function fetchPropertyForSeo(
  propertyId: string
): Promise<(Record<string, any> & { id: string }) | null> {
  const supabase = createPublicClient();

  const SELECT_EXT =
    "id,title,description,city,neighborhood,purpose,price,rent_price,property_category_name,cover_media_url,status,created_at";

  const SELECT_BASE =
    "id,title,description,city,neighborhood,purpose,price,rent_price,cover_media_url,status,created_at";

  const tryView = async (view: ViewName) => {
    const select = view === "v_public_properties_ext" ? SELECT_EXT : SELECT_BASE;
    return supabase
      .from(view)
      .select(select)
      .eq("id", propertyId)
      .eq("status", "active")
      .maybeSingle();
  };

  const ext = await tryView("v_public_properties_ext");

  if (!ext.error) return (ext.data as any) ?? null;

  const msg = String(ext.error.message ?? "").toLowerCase();
  const shouldFallback =
    msg.includes("relation") ||
    msg.includes("does not exist") ||
    msg.includes("schema cache") ||
    msg.includes("view") ||
    msg.includes("column");

  if (!shouldFallback) {
    console.error(ext.error);
    return (ext.data as any) ?? null;
  }

  const base = await tryView("v_public_properties");
  if (base.error) console.error(base.error);
  return (base.data as any) ?? null;
}

export async function generateMetadata({
  params,
}: {
  params: { id: string } | Promise<{ id: string }>;
}): Promise<Metadata> {
  const resolvedParams = await Promise.resolve(params);
  const propertyId = resolvedParams?.id;

  const envBase = safeText(process.env.NEXT_PUBLIC_SITE_URL);
  const metadataBase = envBase ? new URL(envBase) : undefined;

  const canonical =
    metadataBase && propertyId
      ? new URL(`/imoveis/${propertyId}`, metadataBase).toString()
      : undefined;

  // Segurança: domínio provisório (sem NEXT_PUBLIC_SITE_URL) => noindex
  const allowIndex = Boolean(envBase);

  if (!propertyId || !isUuid(propertyId)) {
    return {
      title: "Imóvel | Vitrya",
      robots: { index: false, follow: false },
      metadataBase,
      alternates: canonical ? { canonical } : undefined,
    };
  }

  const p = await fetchPropertyForSeo(propertyId);

  if (!p) {
    return {
      title: "Imóvel não encontrado | Vitrya",
      robots: { index: false, follow: false },
      metadataBase,
      alternates: canonical ? { canonical } : undefined,
    };
  }

  const title = safeText(p.title) ?? "Imóvel";
  const city = safeText(p.city);
  const neighborhood = safeText(p.neighborhood);
  const category = safeText(p.property_category_name);
  const purposeLabel =
    p.purpose === "rent"
      ? "Aluguel"
      : p.purpose === "sale"
      ? "Venda"
      : safeText(p.purpose);

  const locationBits = [neighborhood, city].filter(Boolean).join(" • ");
  const headlineBits = [purposeLabel, category, locationBits].filter(Boolean).join(" | ");
  const seoTitle = `${title}${headlineBits ? ` • ${headlineBits}` : ""} | Vitrya`;

  const rawDesc = safeText(p.description);
  const seoDesc =
    rawDesc?.slice(0, 180) ??
    `Veja detalhes deste imóvel${locationBits ? ` em ${locationBits}` : ""}${
      purposeLabel ? ` para ${purposeLabel.toLowerCase()}` : ""
    }. Fotos, características e contato do corretor na Vitrya.`;

  // OG image: como Storage é privado (signed), para SEO clássico é melhor omitir por enquanto
  const ogImage: string | null = null;

  return {
    metadataBase,
    title: seoTitle,
    description: seoDesc,
    alternates: canonical ? { canonical } : undefined,
    robots: allowIndex ? { index: true, follow: true } : { index: false, follow: false },
    openGraph: {
      type: "website",
      url: canonical,
      title: seoTitle,
      description: seoDesc,
      siteName: "Vitrya",
      images: ogImage ? [{ url: ogImage, width: 1200, height: 630 }] : undefined,
    },
    twitter: {
      card: ogImage ? "summary_large_image" : "summary",
      title: seoTitle,
      description: seoDesc,
      images: ogImage ? [ogImage] : undefined,
    },
  };
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

type PublicAmenitiesSnapshotRow = {
  property_id: string;
  radius_m: number;
  data: AmenitiesSnapshotData;
  generated_at: string | null;
};

function parseAmenitiesSnapshot(value: unknown): AmenitiesSnapshotData | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const categories = row.categories;
  if (!Array.isArray(categories)) return null;
  const radiusM = Number(row.radius_m);
  return {
    radius_m: Number.isFinite(radiusM) ? radiusM : 1000,
    categories: categories as AmenitiesSnapshotData["categories"],
  };
}

function buildAvailableFeatures(catalog: FeatureCatalogItem[], values: FeatureValueRow[]) {
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
      if (typeof row.value_number === "number" && !Number.isNaN(row.value_number)) {
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

function Metric({
  icon,
  value,
  unit,
  suffix,
}: {
  icon: string;
  value: string | number;
  unit?: string;
  suffix?: string;
}) {
  return (
    <div className="pv-metric">
      <span className="pv-metric-ico">
        <Icon name={icon} size={18} />
      </span>
      <span>
        <strong>{value}</strong>
        {unit ? <span style={{ marginLeft: 6, fontWeight: 800 }}>{unit}</span> : null}
        {suffix ? (
          <span style={{ opacity: 0.82, marginLeft: 6, fontWeight: 800 }}>{suffix}</span>
        ) : null}
      </span>
    </div>
  );
}

export default async function PublicPropertyPage({
  params,
}: {
  params: { id: string } | Promise<{ id: string }>;
}) {
  const supabase = createPublicClient();

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
    address,
    latitude,
    longitude,
    created_at,
    property_category_name,
    broker_id,
    broker_full_name,
    broker_public_name,
    broker_creci,
    broker_phone_e164,
    broker_email,
    broker_avatar_url,
    broker_avatar_focus_x,
    broker_avatar_focus_y,
    broker_avatar_zoom,
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

  const fetchFromView = async (view: ViewName) => {
    const select = view === "v_public_properties_ext" ? SELECT_EXT : SELECT_BASE;
    return supabase
      .from(view)
      .select(select)
      .eq("id", propertyId)
      .eq("status", "active")
      .maybeSingle();
  };

  let property: any = null;

  const { data: propertyExt, error: extError } = await fetchFromView("v_public_properties_ext");

  if (extError) {
    const msg = String(extError.message ?? "").toLowerCase();
    const shouldFallback =
      msg.includes("relation") ||
      msg.includes("does not exist") ||
      msg.includes("schema cache") ||
      msg.includes("view") ||
      msg.includes("column");

    if (shouldFallback) {
      const { data: propertyBase, error: baseError } = await fetchFromView("v_public_properties");
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

  //  Share URL (runtime)
  const baseUrl = String(process.env.NEXT_PUBLIC_SITE_URL ?? "").trim().replace(/\/$/, "");
  const canonicalUrl = baseUrl ? `${baseUrl}/imoveis/${property.id}` : "";
  const shareUrl = canonicalUrl;

  const admin = createAdminClient();
  const [amenitiesResult, mediaResult, catalogRes, valuesRes] = await Promise.all([
    supabase
      .from("v_public_property_amenities_latest")
      .select("property_id, radius_m, data, generated_at")
      .eq("property_id", propertyId)
      .maybeSingle(),
    admin
      .from("property_media")
      .select("id, url, kind, position")
      .eq("property_id", propertyId)
      .order("position", { ascending: true }),
    supabase
      .from("property_features")
      .select("id,key,label_pt,group,type,options,position")
      .eq("is_active", true)
      .order("position", { ascending: true }),
    supabase
      .from("property_feature_values")
      .select("feature_id,value_boolean,value_number,value_text,value_json")
      .eq("property_id", propertyId),
  ]);

  const amenitiesRes = amenitiesResult.data;
  const amenitiesError = amenitiesResult.error;

  if (amenitiesError) {
    const message = String(amenitiesError.message || "").toLowerCase();
    const isMissing =
      message.includes("does not exist") ||
      message.includes("relation") ||
      message.includes("schema cache") ||
      message.includes("view");
    if (!isMissing) {
      console.error("Erro ao carregar snapshot publico de proximidades:", amenitiesError);
    }
  }

  const amenitiesSnapshotData = parseAmenitiesSnapshot((amenitiesRes as any)?.data ?? null);
  const amenitiesSnapshot = amenitiesSnapshotData
    ? ({
        property_id: String((amenitiesRes as any)?.property_id || propertyId),
        radius_m: Number((amenitiesRes as any)?.radius_m || amenitiesSnapshotData.radius_m || 1000),
        data: amenitiesSnapshotData,
        generated_at: String((amenitiesRes as any)?.generated_at || "") || null,
      } as PublicAmenitiesSnapshotRow)
    : null;

  if (mediaResult.error) {
    console.error("Erro ao carregar midias publicas:", mediaResult.error);
  }

  const rawMediaItems =
    (mediaResult.data ?? []).map((m: any) => ({
      id: String(m.id),
      url: m?.url ? String(m.url) : null,
      kind: m.kind,
    })) ?? [];

  const mediaPaths = rawMediaItems
    .map((item: { url: string | null }) => item.url)
    .filter((item: string | null): item is string => Boolean(item));
  if (property.cover_media_url) mediaPaths.unshift(String(property.cover_media_url));

  const signedUrlMap = await getSignedImageUrlMap(mediaPaths);
  const signedMediaItems = rawMediaItems
    .map((item: { id: string; url: string | null; kind?: string }) => {
      const signedUrl = item.url ? signedUrlMap.get(item.url) || null : null;
      if (!signedUrl) return null;
      return { ...item, url: signedUrl };
    })
    .filter(Boolean) as { id: string; url: string; kind?: string }[];

  const coverPath = property.cover_media_url ? String(property.cover_media_url) : "";
  const coverSignedUrl = coverPath ? signedUrlMap.get(coverPath) || null : null;
  const mediaItems = [...signedMediaItems];

  if (coverSignedUrl && !mediaItems.some((m) => m.url === coverSignedUrl)) {
    mediaItems.unshift({ id: "cover", url: coverSignedUrl, kind: "image" });
  }

  const heroBgUrl = coverSignedUrl || mediaItems[0]?.url || null;

  if (catalogRes.error || valuesRes.error) {
    console.error("Erro ao carregar caracteristicas:", catalogRes.error || valuesRes.error);
  }

  const availableFeatures = buildAvailableFeatures(
    (catalogRes.data ?? []) as FeatureCatalogItem[],
    (valuesRes.data ?? []) as FeatureValueRow[]
  );
  //  Broker + WhatsApp
  const brokerName = property?.broker_public_name || property?.broker_full_name || "Corretor";

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
    canonicalUrl ? `Link: ${canonicalUrl}` : shareUrl ? `Link: ${shareUrl}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const whatsappLink =
    whatsappPhone && whatsappText
      ? `https://wa.me/${whatsappPhone}?text=${encodeURIComponent(whatsappText)}`
      : null;

  const socials = [] as { key: string; label: string; icon: string; url: string }[];

  const priceLabel =
    property.purpose === "rent"
      ? formatBRL(property.rent_price)
      : formatBRL(property.price ?? property.sale_value);

  const locationLabel = [property.neighborhood, property.city].filter(Boolean).join(", ");

  const isHouseLike =
    Number(property.land_area_m2 ?? 0) > 0 || Number(property.built_area_m2 ?? 0) > 0;

  const areaMain = isHouseLike
    ? property.built_area_m2 ?? property.area_m2 ?? null
    : property.area_m2 ?? null;

  const areaLand = isHouseLike ? property.land_area_m2 ?? null : null;

  const priceNumber =
    property.purpose === "rent"
      ? typeof property.rent_price === "number"
        ? property.rent_price
        : null
      : typeof property.price === "number"
      ? property.price
      : null;

  //  JSON-LD
  const jsonLd: any = {
    "@context": "https://schema.org",
    "@type": "RealEstateListing",
    "@id": canonicalUrl || undefined,
    name: property.title || "Imóvel",
    description: property.description || undefined,
    url: canonicalUrl || undefined,
    datePosted: property.created_at || undefined,
    image: coverSignedUrl ? [coverSignedUrl] : undefined,
    offers: priceNumber
      ? {
          "@type": "Offer",
          price: String(priceNumber),
          priceCurrency: "BRL",
          availability: "https://schema.org/InStock",
        }
      : undefined,
    address:
      property.city || property.neighborhood
        ? {
            "@type": "PostalAddress",
            addressLocality: property.city || undefined,
            addressNeighborhood: property.neighborhood || undefined,
            addressCountry: "BR",
          }
        : undefined,
  };

  return (
    <>
      {canonicalUrl ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      ) : null}

      <style>{`
        .pv-actions-legacy a[href="#pv-map"]{ display:none !important; }
      `}</style>

   {/* HERO (foto + degradê + conteúdo por cima) */}
<HeroBackgroundGalleryClient
  items={mediaItems}
  title={property.title || "Imóvel"}
  heroMinHeight={560}
  leftContent={
    <div
      className="pv-hero-left"
      style={{
        minWidth: 0,
        height: "100%",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* =========================
          TOPO (título + pills)
      ========================== */}
      <div className="pv-hero-left-top" style={{ minWidth: 0 }}>
        <div style={{ opacity: 0.9, fontSize: 13 }}>
          Início • {property.city || "—"} • {property.neighborhood || "—"}
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
      </div>

      {/* =========================
          MEIO (local + preço + métricas)
          trava no meio da tela
      ========================== */}
      <div
        className="pv-hero-left-mid"
        style={{
          minWidth: 0,
          marginTop: 14,
          //  nunca passa do meio no desktop
          maxWidth: "min(520px, 50vw)",
        }}
      >
        <div style={{ opacity: 0.95 }}>
          <div style={{ fontSize: 14 }}>
            {locationLabel || "Localização não informada"}
          </div>

          {priceLabel ? (
            <div style={{ fontSize: 30, fontWeight: 900, marginTop: 6, lineHeight: 1.1 }}>
              {priceLabel}
              <span
                style={{
                  fontSize: 13,
                  fontWeight: 800,
                  opacity: 0.82,
                  marginLeft: 8,
                }}
              >
                {property.purpose === "rent" ? "aluguel" : ""}
              </span>
            </div>
          ) : null}
        </div>

        {/* MÉTRICAS (wrap + limite no meio) */}
        <div
          className="pv-metrics-row"
          style={{
            marginTop: 16,
            // trava: não deixa as pills forçarem largura
            maxWidth: "100%",
            display: "flex",
            flexWrap: "wrap",
            gap: 8,
          }}
        >
          {areaMain ? (
            <Metric
              icon="straighten"
              value={Number(areaMain)}
              unit="m²"
              suffix={isHouseLike ? "construída" : ""}
            />
          ) : null}

          {areaLand ? (
            <Metric icon="foundation" value={Number(areaLand)} unit="m²" suffix="terreno" />
          ) : null}

          {property.bedrooms ? (
            <Metric
              icon="bed"
              value={property.bedrooms}
              suffix={`quarto${property.bedrooms > 1 ? "s" : ""}`}
            />
          ) : null}

          {property.suites ? (
            <Metric
              icon="king_bed"
              value={property.suites}
              suffix={`suíte${property.suites > 1 ? "s" : ""}`}
            />
          ) : null}

          {property.bathrooms ? (
            <Metric
              icon="bathtub"
              value={property.bathrooms}
              suffix={`banheiro${property.bathrooms > 1 ? "s" : ""}`}
            />
          ) : null}

          {property.parking ? (
            <Metric
              icon="directions_car"
              value={property.parking}
              suffix={`vaga${property.parking > 1 ? "s" : ""}`}
            />
          ) : null}
        </div>
      </div>

      {/* =========================
          ESPAÇADOR (empurra ações para o rodapé do hero)
      ========================== */}
      <div style={{ flex: 1 }} />

      {/* =========================
          RODAPÉ (ações no fundo)
      ========================== */}
      <div className="pv-hero-left-bottom" style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
        <div className="pv-actions-legacy">
          <ListingActionsClient
            propertyId={String(property.id)}
            shareUrl={canonicalUrl || shareUrl}
          />
        </div>

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
            WebkitBackdropFilter: "blur(10px)",
          }}
        >
          <Icon name="location_on" size={18} /> Ver no mapa
        </a>
      </div>

      {/*  Mobile: permite usar 100% da largura (sem cortar) */}
      <style>{`
        @media (max-width: 980px){
          .pv-hero-left-mid{ max-width: 100% !important; }
        }
      `}</style>
    </div>
  }
/>



      {/* CONTEÚDO */}
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
                <p style={{ opacity: 0.7, margin: 0 }}>Informações principais não disponíveis.</p>
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
                  avatarFocusX={property?.broker_avatar_focus_x}
                  avatarFocusY={property?.broker_avatar_focus_y}
                  avatarZoom={property?.broker_avatar_zoom}
                  creci={property?.broker_creci}
                  tagline={property?.broker_tagline}
                  bio={property?.broker_bio}
                  phoneLabel={phoneLabel}
                  email={property?.broker_email}
                  socials={socials}
                  whatsappLink={whatsappLink}
                />
              ) : null}

              <PublicPropertyMapCard
                title={property.title || "Imóvel"}
                latitude={Number.isFinite(Number(property.latitude)) ? Number(property.latitude) : null}
                longitude={Number.isFinite(Number(property.longitude)) ? Number(property.longitude) : null}
                address={property.address || null}
                amenitiesSnapshot={amenitiesSnapshot?.data ?? null}
                amenitiesGeneratedAt={amenitiesSnapshot?.generated_at ?? null}
              />
            </div>
          </div>

          <div style={{ marginTop: 18 }}>
            <h2 style={{ margin: 0, fontSize: 20, textAlign: "center" }}>Descrição</h2>
            <div style={{ marginTop: 10, opacity: 0.85 }}>
              <DescriptionToggleClient text={property.description || "Descrição não informada."} />
            </div>
          </div>
        </div>

        <div style={{ marginTop: 22 }}>
          <Suspense
            fallback={
              <div
                style={{
                  borderRadius: 20,
                  border: "1px solid rgba(23,26,33,0.1)",
                  padding: 18,
                  fontSize: 13,
                  opacity: 0.72,
                }}
              >
                Carregando imóveis similares...
              </div>
            }
          >
            <SimilarProperties
              propertyId={String(property.id)}
              city={property.city}
              purpose={property.purpose}
              propertyCategoryId={property.property_category_id}
            />
          </Suspense>
        </div>
      </div>
    </>
  );
}

