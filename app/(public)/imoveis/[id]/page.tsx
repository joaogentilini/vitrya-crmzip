import Link from "next/link";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { getSignedImageUrl } from "@/lib/media/getPublicImageUrl";
import { PropertyGallery } from "./PropertyGallery";
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
    .eq("kind", "image")
    .order("position", { ascending: true });

  if (mediaErr) {
    // não quebra a página; apenas segue com capa
    // (se quiser, logar em server)
  }

  const mediaPaths = ((mediaRows ?? []) as MediaRow[])
    .map((m) => m.url)
    .filter(Boolean);

  // capa primeiro (se existir e não repetir)
  const uniquePaths: string[] = [];
  if (p.cover_media_url) uniquePaths.push(p.cover_media_url);
  for (const path of mediaPaths) {
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

  const locationLine =
    [p.address, p.neighborhood, p.city].filter(Boolean).join(" — ") ||
    "Localização não informada";

  const mapsQuery = [p.address, p.neighborhood, p.city].filter(Boolean).join(", ");
  const mapsUrl = mapsQuery
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapsQuery)}`
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
          <section
            style={{
              display: "grid",
              gridTemplateColumns: "1.05fr 1fr",
              gap: 18,
              alignItems: "start",
            }}
          >
            {/* LEFT */}
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

              {/* ✅ categoria (se existir) */}
              {p.property_category_name ? (
                <div style={{ marginTop: 10, fontSize: 14, opacity: 0.85, fontWeight: 800 }}>
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

              {/* CTAs */}
              <div
                style={{
                  marginTop: 18,
                  display: "flex",
                  gap: 10,
                  flexWrap: "wrap",
                }}
              >
                <button
                  className="pv-btn pv-btn-primary"
                  style={{ padding: "12px 16px" }}
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
                      padding: "12px 16px",
                      textDecoration: "none",
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontWeight: 900,
                    }}
                  >
                    Converse conosco agora
                  </a>
                ) : null}
              </div>
            </div>

            {/* RIGHT */}
            <div style={{ position: "relative" }}>
              {/* ✅ GALERIA / CARROSSEL + FULLSCREEN (com tamanho controlado) */}
<div
  style={{
    width: "100%",
    maxWidth: 760,     // ajuste fino: 680 / 720 / 760
    margin: "0 auto",  // centraliza dentro da coluna da direita
  }}
>
  <div
    style={{
      width: "100%",
      height: 420,        // ajuste fino: 380 / 420 / 460
      borderRadius: 18,
      overflow: "hidden",
    }}
  >
    <PropertyGallery images={galleryImages} title={p.title ?? "Imóvel"} />
  </div>
</div>

              {/* Botões da galeria (mantidos) */}
              <div
                style={{
                  display: "flex",
                  gap: 10,
                  marginTop: 12,
                  flexWrap: "wrap",
                }}
              >
                <span className="pv-chip">Fotos</span>
                <span className="pv-chip">Vídeo</span>
                <span className="pv-chip">Mapa</span>
              </div>

              {/* Card sticky em glass */}
              <aside
                className="pv-glass pv-glass-soft"
                style={{
                  marginTop: 16,
                  position: "sticky",
                  top: 16,
                  padding: 16,
                }}
              >
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
                <div
                  className="pv-glass pv-glass-soft"
                  style={{
                    marginTop: 16,
                    padding: 16,
                    position: "relative",
                    overflow: "hidden",
                  }}
                >
                  <Link
                    href={brokerCardHref}
                    aria-label="Ver perfil do corretor"
                    style={{ position: "absolute", inset: 0, zIndex: 1 }}
                  >
                    <span style={{ position: "absolute", inset: 0 }} />
                  </Link>

                  <div style={{ position: "relative", zIndex: 2, display: "grid", gap: 12 }}>
                    <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                      {p.broker_avatar_url ? (
                        <img
                          src={p.broker_avatar_url}
                          alt={brokerName}
                          style={{
                            width: 64,
                            height: 64,
                            borderRadius: "50%",
                            objectFit: "cover",
                            border: "2px solid rgba(255,255,255,.7)",
                          }}
                        />
                      ) : (
                        <div
                          style={{
                            width: 64,
                            height: 64,
                            borderRadius: "50%",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontWeight: 900,
                            background:
                              "linear-gradient(135deg, rgba(41,68,135,.35), rgba(23,190,187,.25), rgba(255,104,31,.18))",
                            color: "rgba(23,26,33,.9)",
                          }}
                        >
                          {brokerInitials}
                        </div>
                      )}

                      <div>
                        <div style={{ fontWeight: 900, fontSize: 16 }}>{brokerName}</div>
                        {p.broker_creci ? (
                          <div style={{ fontSize: 12, opacity: 0.75 }}>
                            CRECI {p.broker_creci}
                          </div>
                        ) : null}
                      </div>
                    </div>

                    {p.broker_tagline ? (
                      <div style={{ fontWeight: 700, opacity: 0.85 }}>
                        {p.broker_tagline}
                      </div>
                    ) : null}

                    {p.broker_bio ? (
                      <div
                        style={{
                          fontSize: 13,
                          opacity: 0.75,
                          display: "-webkit-box",
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: "vertical",
                          overflow: "hidden",
                        }}
                      >
                        {p.broker_bio}
                      </div>
                    ) : null}

                    <div style={{ display: "grid", gap: 6, fontSize: 13 }}>
                      {brokerPhoneLabel ? (
                        <div>
                          <strong>Telefone:</strong> {brokerPhoneLabel}
                        </div>
                      ) : null}
                      {p.broker_email ? (
                        <div>
                          <strong>Email:</strong> {p.broker_email}
                        </div>
                      ) : null}
                    </div>

                    {socials.length ? (
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        {socials.map((item) => (
                          <a
                            key={item.key}
                            href={item.url ?? undefined}
                            target="_blank"
                            rel="noreferrer"
                            style={{
                              textDecoration: "none",
                              fontSize: 12,
                              padding: "6px 8px",
                              borderRadius: 999,
                              border: "1px solid rgba(23,26,33,.12)",
                              background: "rgba(255,255,255,.75)",
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 6,
                            }}
                          >
                            <span aria-hidden="true">{item.icon}</span>
                            {item.label}
                          </a>
                        ))}
                      </div>
                    ) : null}

                    {whatsappLink ? (
                      <a
                        href={whatsappLink}
                        target="_blank"
                        rel="noreferrer"
                        className="pv-btn pv-btn-primary"
                        style={{ padding: "10px 14px", fontWeight: 900, justifyContent: "center" }}
                      >
                        WhatsApp
                      </a>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </div>
          </section>

          {/* SEÇÕES */}
          <section style={{ marginTop: 26, display: "grid", gap: 18 }}>
            {/* Sobre */}
            <div className="pv-glass pv-glass-soft" style={{ padding: 18 }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 950 }}>
                Sobre este imóvel
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

            {/* Características */}
            <div className="pv-glass pv-glass-soft" style={{ padding: 18 }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 950 }}>
                Características
              </h2>

              <div
                style={{
                  marginTop: 12,
                  display: "flex",
                  gap: 10,
                  flexWrap: "wrap",
                }}
              >
                {p.area_m2 != null ? (
                  <span className="pv-chip">{p.area_m2} m²</span>
                ) : null}
                {p.bedrooms != null ? (
                  <span className="pv-chip">{p.bedrooms} quartos</span>
                ) : null}
                {p.bathrooms != null ? (
                  <span className="pv-chip">{p.bathrooms} banheiros</span>
                ) : null}
                {p.parking != null ? (
                  <span className="pv-chip">{p.parking} vagas</span>
                ) : null}
              </div>
            </div>

            {/* Localização */}
            <div className="pv-glass pv-glass-soft" style={{ padding: 18 }}>
              <h2 style={{ margin: 0, fontSize: 18, fontWeight: 950 }}>
                Localização
              </h2>

              <p style={{ marginTop: 10, opacity: 0.85 }}>{locationLine}</p>

              {mapsUrl ? (
                <a
                  href={mapsUrl}
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    display: "inline-block",
                    marginTop: 8,
                    fontWeight: 900,
                    color: "var(--cobalt)",
                    textDecoration: "none",
                  }}
                >
                  Ver no Google Maps →
                </a>
              ) : (
                <p style={{ marginTop: 8, opacity: 0.7 }}>
                  Endereço insuficiente para abrir no mapa.
                </p>
              )}
            </div>

            {/* Rodapé */}
            <div style={{ opacity: 0.75, fontSize: 12 }}>
              Publicado na vitrine: {new Date(p.created_at).toLocaleString("pt-BR")} •
              ID: {p.id}
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
