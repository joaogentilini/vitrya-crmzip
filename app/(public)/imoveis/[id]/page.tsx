import Link from "next/link";
import { headers } from "next/headers";
import type { ReactNode } from "react";
import { createClient } from "@/lib/supabase/server";
import { getSignedImageUrl } from "@/lib/media/getPublicImageUrl";
import { PropertyMediaPanel } from "./PropertyMediaPanel";
import { BrokerCard } from "./BrokerCard";
import { buildWhatsAppLink, resolvePhone, sanitizePhone } from "@/lib/whatsapp";

export const dynamic = "force-dynamic";

type PublicProperty = {
  id: string;
  status: string;
  purpose: "sale" | "rent" | string;
  title: string | null;
  description: string | null;
  city: string | null;
  neighborhood: string | null;
  address: string | null;
  price: number | null;
  rent_price: number | null;
  area_m2: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  parking: number | null;
  cover_media_url: string | null;
  created_at: string;

  // ✅ vindo da view ext
  property_category_id?: string | null;
  property_category_name?: string | null;

  // ✅ corretor responsável
  broker_id?: string | null;
  broker_full_name?: string | null;
  broker_public_name?: string | null;
  broker_creci?: string | null;
  broker_phone?: string | null;
  broker_phone_e164?: string | null;
  broker_email?: string | null;
  broker_avatar_url?: string | null;
  broker_tagline?: string | null;
  broker_bio?: string | null;
  broker_instagram_url?: string | null;
  broker_facebook_url?: string | null;
  broker_tiktok_url?: string | null;
  broker_youtube_url?: string | null;
  broker_linkedin_url?: string | null;
  broker_website_url?: string | null;
};

type MediaRow = {
  property_id: string;
  url: string; // path do storage
  kind: "image" | "video" | string;
  position: number | null;
};

function fmtMoney(v: number | null) {
  if (v == null) return null;
  return `R$ ${Number(v).toLocaleString("pt-BR")}`;
}

function purposeLabel(purpose: string) {
  if (purpose === "sale") return "Venda";
  if (purpose === "rent") return "Locação";
  return purpose;
}

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return `${first}${last}`.toUpperCase();
}

function formatBrazilPhone(raw: string | null) {
  if (!raw) return null;
  const digits = sanitizePhone(raw);
  if (!digits) return raw;
  let sliced = digits;
  if (sliced.startsWith("55") && sliced.length >= 12) sliced = sliced.slice(2);
  if (sliced.length === 11) {
    return `(${sliced.slice(0, 2)}) ${sliced.slice(2, 7)}-${sliced.slice(7)}`;
  }
  if (sliced.length === 10) {
    return `(${sliced.slice(0, 2)}) ${sliced.slice(2, 6)}-${sliced.slice(6)}`;
  }
  return raw;
}

function normalizeAvailableItems(source: Record<string, unknown>) {
  const raw =
    source.available_items ??
    source.items_available ??
    source.amenities ??
    source.features ??
    null;

  if (!raw) return [] as string[];

  if (Array.isArray(raw)) {
    return raw.map((item) => String(item).trim()).filter(Boolean);
  }

  if (typeof raw === "string") {
    return raw
      .split(/[\n,;•]+/g)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  if (typeof raw === "object") {
    return Object.entries(raw as Record<string, unknown>)
      .filter(([, value]) => value === true || value === 1 || value === "true")
      .map(([key]) => key.replace(/_/g, " "));
  }

  return [];
}

export default async function PublicPropertyDetailsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const supabase = await createClient();

  // ✅ troca para view nova com categoria
  const { data, error } = await supabase
    .from("v_public_properties_ext")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    return (
      <main className="pv-main">
        <div className="pv-container">
          <div className="pv-glass">
            <h1 style={{ margin: 0 }}>Erro ao carregar imóvel</h1>
            <p style={{ opacity: 0.75 }}>ID: {id}</p>
            <pre style={{ marginTop: 12, color: "crimson" }}>
              {JSON.stringify(error, null, 2)}
            </pre>
          </div>
        </div>
      </main>
    );
  }

  if (!data) {
    return (
      <main className="pv-main">
        <div className="pv-container">
          <div className="pv-glass">
            <h1 style={{ margin: 0 }}>Imóvel não encontrado</h1>
            <p style={{ opacity: 0.75 }}>ID: {id}</p>
            <Link
              href="/imoveis"
              style={{
                display: "inline-block",
                marginTop: 12,
                fontWeight: 900,
                color: "var(--cobalt)",
                textDecoration: "none",
              }}
            >
              ← Voltar para pesquisa
            </Link>
          </div>
        </div>
      </main>
    );
  }

  const p = data as PublicProperty;

  // ✅ buscar mídias para galeria (imagens)
  const { data: mediaRows, error: mediaErr } = await supabase
    .from("property_media")
    .select("property_id, url, kind, position")
    .eq("property_id", p.id)
    .order("position", { ascending: true });

  if (mediaErr) {
    // não quebra a página; apenas segue com capa
    // (se quiser, logar em server)
  }

  const mediaList = (mediaRows ?? []) as MediaRow[];
  const imagePaths = mediaList
    .filter((m) => m.kind === "image")
    .map((m) => m.url)
    .filter(Boolean);
  const videoPaths = mediaList
    .filter((m) => m.kind === "video")
    .map((m) => m.url)
    .filter(Boolean);

  // capa primeiro (se existir e não repetir)
  const uniquePaths: string[] = [];
  if (p.cover_media_url) uniquePaths.push(p.cover_media_url);
  for (const path of imagePaths) {
    if (!uniquePaths.includes(path)) uniquePaths.push(path);
  }

  // limita para não assinar excessivamente
  const limitedPaths = uniquePaths.slice(0, 12);

  const imageUrls = await Promise.all(
    limitedPaths.map(async (path) => {
      try {
        return await getSignedImageUrl(path);
      } catch {
        return null;
      }
    })
  );

  const galleryImages = imageUrls.filter(Boolean) as string[];

  const uniqueVideoPaths = Array.from(new Set(videoPaths)).slice(0, 2);
  const videoUrls = (
    await Promise.all(
      uniqueVideoPaths.map(async (path) => {
        try {
          return await getSignedImageUrl(path);
        } catch {
          return null;
        }
      })
    )
  ).filter(Boolean) as string[];

  const locationLine =
    [p.address, p.neighborhood, p.city].filter(Boolean).join(" — ") ||
    "Localização não informada";

  const mapsQuery = [p.address, p.neighborhood, p.city].filter(Boolean).join(", ");
  const mapsUrl = mapsQuery
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapsQuery)}`
    : null;
  const mapsEmbedUrl = mapsQuery
    ? `https://maps.google.com/maps?q=${encodeURIComponent(mapsQuery)}&t=&z=15&ie=UTF8&iwloc=&output=embed`
    : null;

  const mainPrice =
    p.purpose === "rent" ? fmtMoney(p.rent_price) : fmtMoney(p.price);

  const subtitle =
    [
      p.area_m2 != null ? `${p.area_m2}m²` : null,
      p.bedrooms != null ? `${p.bedrooms} quartos` : null,
      p.parking != null ? `${p.parking} vagas` : null,
    ]
      .filter(Boolean)
      .join(", ");

  const headerList = await headers();
  const host = headerList.get("x-forwarded-host") ?? headerList.get("host");
  const proto = headerList.get("x-forwarded-proto") ?? "https";
  const pageUrl = host ? `${proto}://${host}/imoveis/${p.id}` : null;

  const whatsappTextParts = [
    `Olá! Tenho interesse no imóvel: ${p.title ?? "Imóvel"} (ID ${p.id}).`,
    pageUrl ? `Link: ${pageUrl}` : null,
  ].filter(Boolean);
  const whatsappText = whatsappTextParts.join(" ");

  const resolvedPhone = resolvePhone(
    p.broker_phone_e164,
    p.broker_phone,
    process.env.NEXT_PUBLIC_WHATSAPP_NUMBER
  );
  const whatsappLink = buildWhatsAppLink(resolvedPhone, whatsappText);

  const brokerName =
    p.broker_public_name || p.broker_full_name || "Corretor Vitrya";
  const brokerInitials = getInitials(brokerName);
  const brokerPhoneLabel = formatBrazilPhone(
    p.broker_phone_e164 || p.broker_phone || null
  );
  const brokerCardHref = p.broker_id ? `/corretores/${p.broker_id}` : null;

  const socials = [
    { key: "instagram", label: "Instagram", icon: "📸", url: p.broker_instagram_url },
    { key: "facebook", label: "Facebook", icon: "📘", url: p.broker_facebook_url },
    { key: "tiktok", label: "TikTok", icon: "🎵", url: p.broker_tiktok_url },
    { key: "youtube", label: "YouTube", icon: "▶️", url: p.broker_youtube_url },
    { key: "linkedin", label: "LinkedIn", icon: "💼", url: p.broker_linkedin_url },
    { key: "website", label: "Site", icon: "🌐", url: p.broker_website_url },
  ].filter((item) => Boolean(item.url));

  const availableItems = normalizeAvailableItems(p as Record<string, unknown>);

  const primaryStats = [
    p.area_m2 != null
      ? {
          key: "area",
          label: "Área",
          value: `${p.area_m2} m²`,
          icon: (
            <svg viewBox="0 0 24 24" width={16} height={16} aria-hidden="true">
              <path
                d="M4 9V4h5M20 15v5h-5M4 15v5h5M20 9V4h-5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          ),
        }
      : null,
    p.bedrooms != null
      ? {
          key: "bedrooms",
          label: "Quartos",
          value: `${p.bedrooms}`,
          icon: (
            <svg viewBox="0 0 24 24" width={16} height={16} aria-hidden="true">
              <path
                d="M4 10h16M5 10V7a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v3M15 10V7a2 2 0 0 1 2-2h2a1 1 0 0 1 1 1v4M4 10v6M20 10v6M3 16h18"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          ),
        }
      : null,
    p.bathrooms != null
      ? {
          key: "bathrooms",
          label: "Banheiros",
          value: `${p.bathrooms}`,
          icon: (
            <svg viewBox="0 0 24 24" width={16} height={16} aria-hidden="true">
              <path
                d="M4 10h16v5a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3v-5Z"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M6 10V7a2 2 0 0 1 2-2h2"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          ),
        }
      : null,
    p.parking != null
      ? {
          key: "parking",
          label: "Vagas",
          value: `${p.parking}`,
          icon: (
            <svg viewBox="0 0 24 24" width={16} height={16} aria-hidden="true">
              <path
                d="M7 4h6a4 4 0 0 1 0 8H7z"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M7 4v16"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          ),
        }
      : null,
  ].filter(Boolean) as Array<{
    key: string;
    label: string;
    value: string;
    icon: ReactNode;
  }>;

  return (
    <main className="pv-main">
      <div className="pv-container">
        <div className="pv-glass">
          {/* Breadcrumb */}
          <div style={{ fontSize: 13, opacity: 0.8, marginBottom: 14 }}>
            <Link
              href="/imoveis"
              style={{
                textDecoration: "none",
                fontWeight: 900,
                color: "var(--cobalt)",
              }}
            >
              Início
            </Link>{" "}
            <span style={{ opacity: 0.4 }}>›</span>{" "}
            <span>{p.city ?? "Cidade"}</span>{" "}
            <span style={{ opacity: 0.4 }}>›</span>{" "}
            <span>{p.neighborhood ?? "Bairro"}</span>
          </div>

          {/* HERO */}
          <section className="pv-detail-grid">
            {/* LEFT */}
            <div style={{ display: "grid", gap: 18 }}>
              <div>
                <h1
                  style={{
                    margin: 0,
                    fontSize: 40,
                    lineHeight: 1.05,
                    fontWeight: 950,
                    letterSpacing: -0.6,
                  }}
                >
                  {p.title ?? "Imóvel"}
                </h1>

                {p.property_category_name ? (
                  <div
                    style={{
                      marginTop: 10,
                      fontSize: 14,
                      opacity: 0.85,
                      fontWeight: 800,
                    }}
                  >
                    {p.property_category_name}
                  </div>
                ) : null}

                <div style={{ marginTop: 10, fontSize: 15, opacity: 0.85 }}>
                  {locationLine}
                </div>

                {subtitle ? (
                  <div style={{ marginTop: 10, fontSize: 14, opacity: 0.9 }}>
                    {subtitle}
                  </div>
                ) : null}

                <div
                  style={{
                    marginTop: 14,
                    display: "flex",
                    gap: 10,
                    flexWrap: "wrap",
                  }}
                >
                  <span
                    style={{
                      fontSize: 12,
                      padding: "6px 10px",
                      borderRadius: 999,
                      border: "1px solid rgba(23,26,33,.12)",
                      background: "rgba(255,255,255,.85)",
                      fontWeight: 800,
                    }}
                  >
                    {purposeLabel(p.purpose)}
                  </span>

                  <span
                    style={{
                      fontSize: 12,
                      padding: "6px 10px",
                      borderRadius: 999,
                      border: "1px solid rgba(23,190,187,.35)",
                      background: "rgba(23,190,187,.10)",
                      fontWeight: 800,
                    }}
                  >
                    Vitrine Vitrya
                  </span>
                </div>
              </div>

              <div className="pv-glass pv-glass-soft" style={{ padding: 18 }}>
                <h2 style={{ margin: 0, fontSize: 18, fontWeight: 950 }}>
                  Características
                </h2>

                {primaryStats.length ? (
                  <div
                    style={{
                      marginTop: 12,
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
                      gap: 10,
                    }}
                  >
                    {primaryStats.map((item) => (
                      <div
                        key={item.key}
                        style={{
                          borderRadius: 14,
                          border: "1px solid rgba(23,26,33,.12)",
                          background: "rgba(255,255,255,.85)",
                          padding: "10px 12px",
                          display: "flex",
                          gap: 10,
                          alignItems: "center",
                        }}
                      >
                        <div style={{ display: "grid", placeItems: "center", opacity: 0.75 }}>
                          {item.icon}
                        </div>
                        <div>
                          <div style={{ fontSize: 11, opacity: 0.7, fontWeight: 800 }}>
                            {item.label}
                          </div>
                          <div style={{ fontWeight: 900 }}>{item.value}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p style={{ marginTop: 10, opacity: 0.7 }}>
                    Informações principais não disponíveis.
                  </p>
                )}

                {availableItems.length ? (
                  <div style={{ marginTop: 16 }}>
                    <div style={{ fontSize: 13, fontWeight: 900 }}>
                      Itens disponíveis
                    </div>
                    <ul
                      style={{
                        margin: "10px 0 0",
                        padding: 0,
                        listStyle: "none",
                        display: "grid",
                        gap: 8,
                        fontSize: 13,
                        opacity: 0.9,
                      }}
                    >
                      {availableItems.map((item) => (
                        <li key={item} style={{ display: "flex", gap: 8 }}>
                          <span aria-hidden="true" style={{ color: "var(--teal)" }}>
                            ✓
                          </span>
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            </div>

            {/* RIGHT */}
            <div style={{ display: "grid", gap: 16 }}>
              <PropertyMediaPanel
                images={galleryImages}
                videoUrls={videoUrls}
                mapEmbedUrl={mapsEmbedUrl}
                mapLinkUrl={mapsUrl}
                title={p.title ?? "Imóvel"}
              />

              <div className="pv-glass pv-glass-soft" style={{ padding: 16 }}>
                <div style={{ fontSize: 13, fontWeight: 900 }}>Entre em contato</div>
                <div style={{ marginTop: 10, display: "grid", gap: 6, fontSize: 13 }}>
                  <div style={{ fontWeight: 800 }}>{brokerName}</div>
                  {brokerPhoneLabel ? <div>{brokerPhoneLabel}</div> : null}
                  {p.broker_email ? <div>{p.broker_email}</div> : null}
                  {!brokerPhoneLabel && !p.broker_email ? (
                    <div style={{ opacity: 0.7 }}>Contato não informado.</div>
                  ) : null}
                </div>
              </div>

              <aside className="pv-glass pv-glass-soft" style={{ padding: 16 }}>
                <div style={{ fontSize: 12, opacity: 0.7 }}>Valor do imóvel</div>

                <div style={{ fontSize: 30, fontWeight: 950, marginTop: 6 }}>
                  {mainPrice ?? "Sob consulta"}
                </div>

                <div style={{ marginTop: 10, display: "grid", gap: 10 }}>
                  <button
                    className="pv-btn pv-btn-primary"
                    style={{ padding: "12px 14px" }}
                  >
                    Agendar visita
                  </button>

                  {whatsappLink ? (
                    <a
                      href={whatsappLink}
                      target="_blank"
                      rel="noreferrer"
                      className="pv-btn pv-btn-secondary"
                      style={{
                        padding: "12px 14px",
                        textDecoration: "none",
                        textAlign: "center",
                        fontWeight: 900,
                      }}
                    >
                      Converse conosco agora
                    </a>
                  ) : null}
                </div>

                <div style={{ marginTop: 14, display: "flex", gap: 10 }}>
                  <button
                    className="pv-chip"
                    style={{ background: "rgba(255,255,255,.85)" }}
                  >
                    Favoritar
                  </button>
                  <button
                    className="pv-chip"
                    style={{ background: "rgba(255,255,255,.85)" }}
                  >
                    Compartilhar
                  </button>
                </div>
              </aside>

              {brokerCardHref ? (
                <BrokerCard
                  href={brokerCardHref}
                  name={brokerName}
                  initials={brokerInitials}
                  avatarUrl={p.broker_avatar_url}
                  creci={p.broker_creci}
                  tagline={p.broker_tagline}
                  bio={p.broker_bio}
                  phoneLabel={brokerPhoneLabel}
                  email={p.broker_email}
                  socials={socials.map((item) => ({
                    ...item,
                    url: item.url as string,
                  }))}
                  whatsappLink={whatsappLink}
                />
              ) : null}

              <div className="pv-glass pv-glass-soft" style={{ padding: 18 }}>
                <h2 style={{ margin: 0, fontSize: 18, fontWeight: 950 }}>
                  Descrição do imóvel
                </h2>

                {p.description ? (
                  <p style={{ marginTop: 10, lineHeight: 1.6, opacity: 0.92 }}>
                    {p.description}
                  </p>
                ) : (
                  <p style={{ marginTop: 10, opacity: 0.7 }}>
                    Descrição ainda não informada.
                  </p>
                )}
              </div>
            </div>
          </section>

          <div style={{ marginTop: 22, opacity: 0.75, fontSize: 12 }}>
            Publicado na vitrine: {new Date(p.created_at).toLocaleString("pt-BR")} •
            ID: {p.id}
          </div>
        </div>
      </div>
    </main>
  );
}
