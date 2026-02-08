/* eslint-disable @next/next/no-img-element */
"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/Icon";

type SocialItem = {
  key: string;
  label: string;
  icon: string;
  url: string;
};

type Props = {
  href: string;
  name: string;
  initials: string;
  avatarUrl?: string | null;
  creci?: string | null;
  tagline?: string | null;
  bio?: string | null;
  phoneLabel?: string | null; // vem do server (ex: +5565999999999 ou já formatado)
  email?: string | null;
  socials: SocialItem[];
  whatsappLink?: string | null; // já com text=... montado no page.tsx
};

function onlyDigits(v: string) {
  return v.replace(/\D/g, "");
}

function formatBrazilPhone(raw: string | null | undefined) {
  if (!raw) return null;
  const digits = onlyDigits(raw);
  if (!digits) return raw;

  // remove +55 caso venha
  let d = digits;
  if (d.startsWith("55") && d.length >= 12) d = d.slice(2);

  // (65) 99999-9999
  if (d.length === 11) {
    return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  }
  // (65) 9999-9999
  if (d.length === 10) {
    return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  }

  return raw;
}

export function BrokerCard({
  href,
  name,
  initials,
  avatarUrl,
  creci,
  phoneLabel,
  socials: _socials, // mantido por compat, mas não exibimos nesse layout
  whatsappLink,
}: Props) {
  const router = useRouter();

  const creciLabel = useMemo(() => {
    const cleaned = (creci ?? "").trim();
    return cleaned ? `CRECI ${cleaned}` : "CRECI não informado";
  }, [creci]);

  const phonePretty = useMemo(() => {
    const formatted = formatBrazilPhone(phoneLabel ?? null);
    return formatted ?? "(--) ----- ----";
  }, [phoneLabel]);

  const phoneDigits = useMemo(() => {
    const d = onlyDigits(phoneLabel ?? "");
    if (!d) return "";
    // garante E.164 BR
    if (d.startsWith("55")) return d;
    if (d.length >= 10) return `55${d}`;
    return d;
  }, [phoneLabel]);

  const goProfile = () => {
    if (!href) return;
    router.push(href);
  };

  const openWhatsApp = () => {
    if (!whatsappLink) return;
    window.open(whatsappLink, "_blank", "noopener,noreferrer");
  };

  const callPhone = () => {
    if (!phoneDigits) return;
    window.location.href = `tel:+${phoneDigits}`;
  };

  const handlePhoneClick = () => {
    // preferencial: WhatsApp com texto (vem do page.tsx)
    if (whatsappLink) return openWhatsApp();
    // fallback: ligação
    if (phoneDigits) return callPhone();
    // fallback final: perfil
    return goProfile();
  };

  return (
    <div
      style={{
        borderRadius: 22,
        padding: 14,
        background: "rgba(255,255,255,0.72)",
        border: "1px solid rgba(23,26,33,0.10)",
        boxShadow: "0 14px 34px rgba(0,0,0,0.10)",
        backdropFilter: "blur(14px)",
        WebkitBackdropFilter: "blur(14px)",
      }}
    >
      {/* Título igual referência */}
      <div
        style={{
          fontWeight: 900,
          fontSize: 18,
          color: "rgba(23,26,33,0.84)",
          marginBottom: 10,
        }}
      >
        Resenviôeio {name}
      </div>

      {/* Linha topo: avatar + creci / phone + chevron */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "56px minmax(0, 1fr) 24px",
          gap: 12,
          alignItems: "center",
          padding: "4px 2px 10px 2px",
        }}
      >
        {avatarUrl ? (
          <img
            src={avatarUrl}
            alt={name}
            style={{
              width: 56,
              height: 56,
              borderRadius: "50%",
              objectFit: "cover",
              border: "2px solid rgba(255,255,255,0.85)",
              boxShadow: "0 6px 18px rgba(0,0,0,0.10)",
            }}
          />
        ) : (
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: "50%",
              display: "grid",
              placeItems: "center",
              fontWeight: 900,
              background:
                "linear-gradient(135deg, rgba(41,68,135,.22), rgba(23,190,187,.18), rgba(255,104,31,.16))",
              color: "rgba(23,26,33,0.88)",
              border: "2px solid rgba(255,255,255,0.75)",
              boxShadow: "0 6px 18px rgba(0,0,0,0.10)",
            }}
          >
            {initials}
          </div>
        )}

        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontWeight: 900,
              fontSize: 16,
              lineHeight: 1.1,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              color: "rgba(23,26,33,0.92)",
            }}
          >
            {name}
          </div>

          <div
            style={{
              marginTop: 4,
              display: "flex",
              gap: 10,
              alignItems: "center",
              flexWrap: "wrap",
              fontSize: 13,
              color: "rgba(23,26,33,0.68)",
            }}
          >
            <span>{creciLabel}</span>
            <span style={{ opacity: 0.6 }}>•</span>

            {/* telefone pequeno (clicável também) */}
            <button
              type="button"
              onClick={handlePhoneClick}
              style={{
                background: "transparent",
                border: "none",
                padding: 0,
                margin: 0,
                cursor: whatsappLink || phoneDigits ? "pointer" : "default",
                color: "inherit",
                font: "inherit",
                textDecoration: whatsappLink || phoneDigits ? "underline" : "none",
                textUnderlineOffset: 3,
                opacity: 0.95,
              }}
              title={whatsappLink ? "Abrir WhatsApp" : phoneDigits ? "Ligar" : ""}
            >
              {phonePretty}
            </button>
          </div>
        </div>

        <div style={{ display: "grid", placeItems: "center", opacity: 0.55 }}>
          <Icon name="chevron_right" size={18} />
        </div>
      </div>

      {/* “Campo” grande de telefone (estilo input) */}
      <button
        type="button"
        onClick={handlePhoneClick}
        style={{
          width: "100%",
          textAlign: "left",
          borderRadius: 16,
          padding: "12px 12px",
          background: "rgba(255,255,255,0.70)",
          border: "1px solid rgba(23,26,33,0.14)",
          display: "grid",
          gridTemplateColumns: "1fr 22px",
          alignItems: "center",
          gap: 10,
          cursor: whatsappLink || phoneDigits ? "pointer" : "default",
        }}
        title={whatsappLink ? "Abrir WhatsApp com mensagem" : phoneDigits ? "Ligar" : ""}
      >
        <div
          style={{
            fontWeight: 800,
            fontSize: 18,
            color: "rgba(23,26,33,0.72)",
            letterSpacing: 0.2,
          }}
        >
          {phonePretty}
        </div>
        <div style={{ display: "grid", placeItems: "center", opacity: 0.55 }}>
          <Icon name="chevron_right" size={18} />
        </div>
      </button>

      {/* Botões */}
      <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            goProfile();
          }}
          style={{
            width: "100%",
            padding: "12px 14px",
            borderRadius: 16,
            border: "1px solid rgba(255,104,31,0.34)",
            background:
              "linear-gradient(180deg, rgba(255,104,31,0.92), rgba(255,104,31,0.78))",
            color: "white",
            fontWeight: 900,
            fontSize: 16,
            cursor: "pointer",
            boxShadow: "0 10px 22px rgba(255,104,31,0.18)",
          }}
        >
          Ver perfil
        </button>

        <button
          type="button"
          disabled={!whatsappLink}
          onClick={(e) => {
            e.preventDefault();
            openWhatsApp();
          }}
          style={{
            width: "100%",
            padding: "12px 14px",
            borderRadius: 16,
            border: whatsappLink
              ? "1px solid rgba(37, 211, 102, 0.45)"
              : "1px solid rgba(23,26,33,0.12)",
            background: whatsappLink
              ? "linear-gradient(180deg, #25D366, #1EBE5D)"
              : "rgba(37, 211, 102, 0.16)",
            color: whatsappLink ? "white" : "rgba(23,26,33,0.55)",
            fontWeight: 900,
            fontSize: 16,
            cursor: whatsappLink ? "pointer" : "not-allowed",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 10,
            boxShadow: whatsappLink ? "0 10px 22px rgba(37, 211, 102, 0.28)" : "none",
          }}
        >
          <Icon name="whatsapp" size={22} />
          Falar no WhatsApp
        </button>
      </div>

      {/* socials/tagline/bio/email ficam no Props por compat, mas não renderizam aqui (layout referência) */}
    </div>
  );
}
