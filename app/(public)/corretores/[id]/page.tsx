/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
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

export default async function PublicBrokerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

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
              ← Voltar para vitrine
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
    { key: "instagram", label: "Instagram", icon: "📸", url: b.instagram_url },
    { key: "facebook", label: "Facebook", icon: "📘", url: b.facebook_url },
    { key: "tiktok", label: "TikTok", icon: "🎵", url: b.tiktok_url },
    { key: "youtube", label: "YouTube", icon: "▶️", url: b.youtube_url },
    { key: "linkedin", label: "LinkedIn", icon: "💼", url: b.linkedin_url },
    { key: "website", label: "Site", icon: "🌐", url: b.website_url },
  ].filter((item) => Boolean(item.url));

  const { data: properties, error: propertiesError } = await supabase
    .from("v_public_properties_ext")
    .select("*")
    .eq("broker_id", b.id)
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

    if (!mediaErr && mediaRows) {
      for (const row of mediaRows as MediaRow[]) {
        if (!mediaByProperty[row.property_id])
          mediaByProperty[row.property_id] = [];
        mediaByProperty[row.property_id].push(row);
      }
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
          <div style={{ display: "grid", gap: 18 }}>
            <Link
              href="/imoveis"
              style={{
                color: "var(--cobalt)",
                textDecoration: "none",
                fontWeight: 800,
              }}
            >
              ← Voltar para vitrine
            </Link>

            <section
              style={{
                display: "grid",
                gridTemplateColumns: "1fr",
                gap: 18,
                alignItems: "center",
              }}
            >
              <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
                {b.avatar_url ? (
                  <img
                    src={b.avatar_url}
                    alt={brokerName}
                    style={{
                      width: 96,
                      height: 96,
                      borderRadius: "50%",
                      objectFit: "cover",
                      border: "2px solid rgba(255,255,255,.7)",
                    }}
                  />
                ) : (
                  <div
                    style={{
                      width: 96,
                      height: 96,
                      borderRadius: "50%",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontWeight: 900,
                      fontSize: 22,
                      background:
                        "linear-gradient(135deg, rgba(41,68,135,.35), rgba(23,190,187,.25), rgba(255,104,31,.18))",
                      color: "rgba(23,26,33,.9)",
                    }}
                  >
                    {brokerInitials}
                  </div>
                )}

                <div style={{ display: "grid", gap: 6 }}>
                  <h1 style={{ margin: 0, fontSize: 28 }}>{brokerName}</h1>
                  {b.creci ? (
                    <div style={{ fontSize: 13, opacity: 0.75 }}>
                      CRECI {b.creci}
                    </div>
                  ) : null}
                  {b.tagline ? (
                    <div style={{ fontWeight: 700, opacity: 0.85 }}>{b.tagline}</div>
                  ) : null}
                </div>
              </div>

              {b.bio ? (
                <p style={{ margin: 0, lineHeight: 1.6, opacity: 0.85 }}>{b.bio}</p>
              ) : null}

              <div style={{ display: "grid", gap: 8, fontSize: 14 }}>
                {brokerPhoneLabel ? (
                  <div>
                    <strong>Telefone:</strong> {brokerPhoneLabel}
                  </div>
                ) : null}
                {b.email ? (
                  <div>
                    <strong>Email:</strong> {b.email}
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
                  style={{ padding: "10px 14px", width: "fit-content" }}
                >
                  WhatsApp
                </a>
              ) : null}
            </section>
          </div>
        </div>

        <div className="pv-glass" style={{ marginTop: 20 }}>
          <div style={{ marginBottom: "1.5rem" }}>
            <h2 style={{ marginTop: 0 }}>Imóveis deste corretor</h2>
            {propertiesWithImages.length > 0 ? (
              <p style={{ margin: 0, opacity: 0.75 }}>
                {propertiesWithImages.length} imóvel(is) na vitrine
              </p>
            ) : null}
          </div>

          {propertiesWithImages.length === 0 ? (
            <div style={{ textAlign: "center", padding: "2.5rem 1rem" }}>
              <h3 style={{ marginTop: 0 }}>Nenhum imóvel publicado</h3>
              <p style={{ margin: "0.5rem 0 1rem", opacity: 0.8 }}>
                Volte em breve para novas oportunidades.
              </p>
              <Link
                href="/imoveis"
                style={{ color: "var(--cobalt)", fontWeight: 800 }}
              >
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
                        <ThumbCarousel
                          images={p.imageUrls}
                          alt={p.title ?? "Imóvel"}
                        />
                      ) : (
                        <span>Sem foto</span>
                      )}
                    </div>

                    <div className="pv-cardbody">
                      <h3 className="pv-cardtitle">{p.title ?? "Imóvel"}</h3>

                      {p.property_category_name ? (
                        <div className="pv-cardmeta" style={{ opacity: 0.85 }}>
                          {p.property_category_name}
                        </div>
                      ) : null}

                      <div className="pv-cardmeta">{location}</div>

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
    </main>
  );
}
