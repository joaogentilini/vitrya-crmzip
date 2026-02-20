/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { headers } from "next/headers";
import { createPublicClient } from "@/lib/supabase/publicServer";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSignedImageUrl } from "@/lib/media/getPublicImageUrl";
import { ThumbCarousel } from "../../imoveis/resultados/ThumbCarousel";
import { buildWhatsAppLink, resolvePhone, sanitizePhone } from "@/lib/whatsapp";

export const dynamic = "force-dynamic";

type PublicBroker = {
  id: string;
  full_name: string | null;
  public_name: string | null;
  role: string | null;
  phone: string | null;
  phone_e164: string | null;
  email: string | null;
  is_active: boolean | null;
  creci: string | null;
  tagline: string | null;
  bio: string | null;
  avatar_url: string | null;
  avatar_focus_x: number | null;
  avatar_focus_y: number | null;
  avatar_zoom: number | null;
  instagram_url: string | null;
  facebook_url: string | null;
  tiktok_url: string | null;
  youtube_url: string | null;
  linkedin_url: string | null;
  website_url: string | null;
};

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
  cover_media_url: string | null;
  created_at: string;
  property_category_id?: string | null;
  property_category_name?: string | null;
};

type MediaRow = {
  property_id: string;
  url: string;
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

function focusPercent(value: number | null | undefined, fallback: number) {
  if (typeof value !== "number" || Number.isNaN(value)) return fallback;
  if (value < 0) return 0;
  if (value > 100) return 100;
  return value;
}

function avatarZoom(value: number | null | undefined) {
  if (typeof value !== "number" || Number.isNaN(value)) return 1;
  if (value < 1) return 1;
  if (value > 3) return 3;
  return value;
}

export default async function PublicBrokerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = createPublicClient();

  const { data: broker, error: brokerError } = await supabase
    .from("v_public_brokers")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (brokerError || !broker) {
    return (
      <main className="pv-main">
        <div className="pv-container">
          <div className="pv-glass">
            <h1 style={{ margin: 0 }}>Corretor não encontrado</h1>
            <p style={{ opacity: 0.75 }}>ID: {id}</p>
            {brokerError ? (
              <pre style={{ marginTop: 12, color: "crimson" }}>
                {JSON.stringify(brokerError, null, 2)}
              </pre>
            ) : null}
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
              Voltar para vitrine
            </Link>
          </div>
        </div>
      </main>
    );
  }

  const b = broker as PublicBroker;
  const brokerName = b.public_name || b.full_name || "Corretor Vitrya";
  const brokerInitials = getInitials(brokerName);
  const brokerPhoneLabel = formatBrazilPhone(b.phone_e164 || b.phone || null);

  const imageFocusX = focusPercent(b.avatar_focus_x, 50);
  const imageFocusY = focusPercent(b.avatar_focus_y, 50);
  const imageScale = avatarZoom(b.avatar_zoom);

  const headerList = await headers();
  const host = headerList.get("x-forwarded-host") ?? headerList.get("host");
  const proto = headerList.get("x-forwarded-proto") ?? "https";
  const pageUrl = host ? `${proto}://${host}/corretores/${b.id}` : null;

  const whatsappTextParts = [
    `Olá! Encontrei seu perfil na Vitrya e gostaria de falar com você.`,
    pageUrl ? `Perfil: ${pageUrl}` : null,
  ].filter(Boolean);
  const whatsappText = whatsappTextParts.join(" ");
  const whatsappPhone = resolvePhone(
    b.phone_e164,
    b.phone,
    process.env.NEXT_PUBLIC_WHATSAPP_NUMBER
  );
  const whatsappLink = buildWhatsAppLink(whatsappPhone, whatsappText);

  const socials = [
    { key: "instagram", label: "Instagram", url: b.instagram_url },
    { key: "facebook", label: "Facebook", url: b.facebook_url },
    { key: "tiktok", label: "TikTok", url: b.tiktok_url },
    { key: "youtube", label: "YouTube", url: b.youtube_url },
    { key: "linkedin", label: "LinkedIn", url: b.linkedin_url },
    { key: "website", label: "Site", url: b.website_url },
  ].filter((item) => Boolean(item.url));

  const { data: properties, error: propertiesError } = await supabase
    .from("v_public_properties_ext")
    .select("*")
    .eq("broker_id", b.id)
    .eq("status", "active")
    .order("created_at", { ascending: false });

  if (propertiesError) {
    return (
      <main className="pv-main">
        <div className="pv-container">
          <div className="pv-glass">
            <h1 style={{ margin: 0 }}>Erro ao carregar imóveis</h1>
            <pre style={{ marginTop: 12, color: "crimson" }}>
              {JSON.stringify(propertiesError, null, 2)}
            </pre>
          </div>
        </div>
      </main>
    );
  }

  const propertyList = (properties ?? []) as PublicProperty[];
  const ids = propertyList.map((p) => p.id);

  let mediaByProperty: Record<string, MediaRow[]> = {};
  if (ids.length > 0) {
    const { data: mediaRows, error: mediaErr } = await supabase
      .from("property_media")
      .select("property_id, url, kind, position")
      .in("property_id", ids)
      .eq("kind", "image")
      .order("position", { ascending: true });

    let effectiveRows = (mediaRows ?? []) as MediaRow[];
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

  const propertiesWithImages: PublicPropertyWithImages[] = await Promise.all(
    propertyList.map(async (p): Promise<PublicPropertyWithImages> => {
      const coverUrl = p.cover_media_url
        ? await getSignedImageUrl(p.cover_media_url)
        : null;

      const mediaRows = mediaByProperty[p.id] || [];
      const mediaPaths = mediaRows.map((m) => m.url).filter(Boolean);

      const uniquePaths: string[] = [];
      if (p.cover_media_url) uniquePaths.push(p.cover_media_url);
      for (const path of mediaPaths) {
        if (!uniquePaths.includes(path)) uniquePaths.push(path);
      }

      const limitedPaths = uniquePaths.slice(0, 6);

      const imageUrls = await Promise.all(
        limitedPaths.map(async (path) => {
          try {
            return await getSignedImageUrl(path);
          } catch {
            return null;
          }
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
    <main className="pv-main">
      <div className="pv-container">
        <div className="pv-glass">
          <div
            style={{
              display: "grid",
              gap: 20,
              gridTemplateColumns: "minmax(0,1fr)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <Link
                href="/imoveis"
                style={{
                  color: "var(--cobalt)",
                  textDecoration: "none",
                  fontWeight: 800,
                }}
              >
                Voltar para vitrine
              </Link>
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  padding: "6px 10px",
                  borderRadius: 999,
                  border: "1px solid rgba(23,26,33,.12)",
                  background: "rgba(255,255,255,.65)",
                }}
              >
                Perfil público
              </span>
            </div>

            <section
              className="broker-public-layout"
              style={{
                display: "grid",
                gap: 20,
                gridTemplateColumns: "minmax(0,1fr)",
              }}
            >
              <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
                <div
                  style={{
                    width: 112,
                    height: 112,
                    borderRadius: "50%",
                    overflow: "hidden",
                    border: "2px solid rgba(255,255,255,.8)",
                    background: "rgba(255,255,255,.6)",
                    flexShrink: 0,
                  }}
                >
                  {b.avatar_url ? (
                    <img
                      src={b.avatar_url}
                      alt={brokerName}
                      style={{
                        width: "100%",
                        height: "100%",
                        objectFit: "cover",
                        objectPosition: `${imageFocusX}% ${imageFocusY}%`,
                        transform: `scale(${imageScale})`,
                        transformOrigin: "center center",
                      }}
                    />
                  ) : (
                    <div
                      style={{
                        width: "100%",
                        height: "100%",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontWeight: 900,
                        fontSize: 24,
                        background:
                          "linear-gradient(135deg, rgba(41,68,135,.35), rgba(23,190,187,.25), rgba(255,104,31,.18))",
                        color: "rgba(23,26,33,.9)",
                      }}
                    >
                      {brokerInitials}
                    </div>
                  )}
                </div>

                <div style={{ display: "grid", gap: 8, minWidth: 0 }}>
                  <h1 style={{ margin: 0, fontSize: 30, lineHeight: 1.05 }}>{brokerName}</h1>
                  {b.tagline ? (
                    <div style={{ fontWeight: 700, opacity: 0.86 }}>{b.tagline}</div>
                  ) : null}
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {b.creci ? (
                      <span
                        style={{
                          fontSize: 12,
                          padding: "5px 10px",
                          borderRadius: 999,
                          border: "1px solid rgba(23,26,33,.12)",
                          background: "rgba(255,255,255,.72)",
                          fontWeight: 800,
                        }}
                      >
                        CRECI {b.creci}
                      </span>
                    ) : null}
                    {brokerPhoneLabel ? (
                      <span
                        style={{
                          fontSize: 12,
                          padding: "5px 10px",
                          borderRadius: 999,
                          border: "1px solid rgba(23,26,33,.12)",
                          background: "rgba(255,255,255,.72)",
                          fontWeight: 800,
                        }}
                      >
                        {brokerPhoneLabel}
                      </span>
                    ) : null}
                  </div>
                </div>
              </div>

              <div
                className="broker-public-detail-grid"
                style={{
                  display: "grid",
                  gap: 14,
                  gridTemplateColumns: "minmax(0,1fr)",
                  alignItems: "start",
                }}
              >
                <div
                  style={{
                    borderRadius: 14,
                    border: "1px solid rgba(23,26,33,.10)",
                    background: "rgba(255,255,255,.72)",
                    padding: 14,
                  }}
                >
                  <h2 style={{ margin: "0 0 8px 0", fontSize: 16 }}>Sobre o corretor</h2>
                  {b.bio ? (
                    <p style={{ margin: 0, lineHeight: 1.65, opacity: 0.88 }}>{b.bio}</p>
                  ) : (
                    <p style={{ margin: 0, lineHeight: 1.65, opacity: 0.7 }}>
                      Este corretor ainda não adicionou uma bio pública.
                    </p>
                  )}
                </div>

                <div
                  style={{
                    borderRadius: 14,
                    border: "1px solid rgba(23,26,33,.10)",
                    background: "rgba(255,255,255,.72)",
                    padding: 14,
                    display: "grid",
                    gap: 10,
                  }}
                >
                  <h3 style={{ margin: 0, fontSize: 15 }}>Contato</h3>
                  {brokerPhoneLabel ? (
                    <div style={{ fontSize: 14 }}>
                      <strong>Telefone:</strong> {brokerPhoneLabel}
                    </div>
                  ) : null}
                  {b.email ? (
                    <div style={{ fontSize: 14 }}>
                      <strong>Email:</strong> {b.email}
                    </div>
                  ) : null}

                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {whatsappLink ? (
                      <a
                        href={whatsappLink}
                        target="_blank"
                        rel="noreferrer"
                        className="pv-btn pv-btn-primary"
                        style={{ padding: "10px 14px" }}
                      >
                        Falar no WhatsApp
                      </a>
                    ) : null}
                    {b.email ? (
                      <a
                        href={`mailto:${b.email}`}
                        className="pv-btn"
                        style={{ padding: "10px 14px" }}
                      >
                        Enviar email
                      </a>
                    ) : null}
                  </div>
                </div>
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
                        padding: "7px 10px",
                        borderRadius: 999,
                        border: "1px solid rgba(23,26,33,.12)",
                        background: "rgba(255,255,255,.75)",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 6,
                        color: "rgba(23,26,33,.88)",
                        fontWeight: 700,
                      }}
                    >
                      {item.label}
                    </a>
                  ))}
                </div>
              ) : null}
            </section>
          </div>
        </div>

        <div className="pv-glass" style={{ marginTop: 20 }}>
          <div style={{ marginBottom: "1.25rem", display: "grid", gap: 4 }}>
            <h2 style={{ marginTop: 0, marginBottom: 0 }}>Imóveis deste corretor</h2>
            <p style={{ margin: 0, opacity: 0.75 }}>
              {propertiesWithImages.length} imóvel(is) ativo(s) na vitrine
            </p>
          </div>

          {propertiesWithImages.length === 0 ? (
            <div style={{ textAlign: "center", padding: "2.5rem 1rem" }}>
              <h3 style={{ marginTop: 0 }}>Nenhum imóvel publicado</h3>
              <p style={{ margin: "0.5rem 0 1rem", opacity: 0.8 }}>
                Volte em breve para novas oportunidades.
              </p>
              <Link href="/imoveis" style={{ color: "var(--cobalt)", fontWeight: 800 }}>
                Voltar para vitrine
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
                  p.purpose === "rent"
                    ? fmtMoney(p.rent_price)
                    : fmtMoney(p.price);

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

                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 4 }}>
                        {p.property_category_name ? (
                          <span
                            style={{
                              fontSize: 11,
                              padding: "2px 8px",
                              borderRadius: 999,
                              background: "rgba(41,68,135,.10)",
                              color: "rgba(41,68,135,.95)",
                              fontWeight: 700,
                            }}
                          >
                            {p.property_category_name}
                          </span>
                        ) : null}
                        <span
                          style={{
                            fontSize: 11,
                            padding: "2px 8px",
                            borderRadius: 999,
                            background: "rgba(255,104,31,.12)",
                            color: "rgba(255,104,31,.98)",
                            fontWeight: 700,
                          }}
                        >
                          {p.purpose === "rent" ? "Aluguel" : "Venda"}
                        </span>
                      </div>

                      <div className="pv-cardmeta" style={{ marginTop: 8 }}>{location}</div>

                      {price ? (
                        <div className="pv-price">{price}</div>
                      ) : (
                        <div className="pv-price">Sob consulta</div>
                      )}
                    </div>
                  </Link>
                );
              })}
            </section>
          )}
        </div>
      </div>
      <style>{`
        @media (min-width: 980px) {
          .broker-public-layout {
            grid-template-columns: minmax(0, 1fr);
          }
          .broker-public-detail-grid {
            grid-template-columns: minmax(0, 1.25fr) minmax(0, 0.95fr) !important;
          }
        }
      `}</style>
    </main>
  );
}
