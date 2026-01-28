"use client";

import { useRouter } from "next/navigation";

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
  phoneLabel?: string | null;
  email?: string | null;
  socials: SocialItem[];
  whatsappLink?: string | null;
};

export function BrokerCard({
  href,
  name,
  initials,
  avatarUrl,
  creci,
  tagline,
  bio,
  phoneLabel,
  email,
  socials,
  whatsappLink,
}: Props) {
  const router = useRouter();

  const handleClick = () => {
    router.push(href);
  };

  return (
    <div
      className="pv-glass pv-glass-soft"
      role="link"
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handleClick();
        }
      }}
      style={{
        padding: 16,
        position: "relative",
        overflow: "hidden",
        cursor: "pointer",
      }}
      aria-label={`Ver perfil do corretor ${name}`}
    >
      <div style={{ display: "grid", gap: 12 }}>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt={name}
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
              {initials}
            </div>
          )}

          <div>
            <div style={{ fontWeight: 900, fontSize: 16 }}>{name}</div>
            {creci ? (
              <div style={{ fontSize: 12, opacity: 0.75 }}>CRECI {creci}</div>
            ) : null}
          </div>
        </div>

        {tagline ? <div style={{ fontWeight: 700, opacity: 0.85 }}>{tagline}</div> : null}

        {bio ? (
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
            {bio}
          </div>
        ) : null}

        <div style={{ display: "grid", gap: 6, fontSize: 13 }}>
          {phoneLabel ? (
            <div>
              <strong>Telefone:</strong> {phoneLabel}
            </div>
          ) : null}
          {email ? (
            <div>
              <strong>Email:</strong> {email}
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
                onClick={(e) => e.stopPropagation()}
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
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              window.open(whatsappLink, "_blank", "noopener,noreferrer");
            }}
            className="pv-btn pv-btn-primary"
            style={{
              padding: "10px 14px",
              fontWeight: 900,
              justifyContent: "center",
            }}
          >
            WhatsApp
          </a>
        ) : null}
      </div>
    </div>
  );
}
