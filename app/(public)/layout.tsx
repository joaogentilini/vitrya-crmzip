/* eslint-disable @next/next/no-img-element */
import type { ReactNode } from "react";
import Link from "next/link";
import { buildWhatsAppLink, sanitizePhone } from "@/lib/whatsapp";
import "./public.css";

function formatBrazilPhone(raw: string | null) {
  if (!raw) return null;
  let digits = raw;
  if (digits.startsWith("55") && digits.length >= 12) digits = digits.slice(2);
  if (digits.length === 11) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  return raw;
}

export default function PublicLayout({ children }: { children: ReactNode }) {
  const envPhone = sanitizePhone(process.env.NEXT_PUBLIC_WHATSAPP_NUMBER);
  const whatsappLink = buildWhatsAppLink(
    envPhone,
    "Olá! Quero falar com o Comercial Vitrya."
  );
  const formattedPhone = formatBrazilPhone(envPhone);

  return (
    <div className="pv-shell">
      <header className="pv-header">
        <div className="pv-header-inner">
          {/* Logo */}
          <Link className="pv-brand" href="/imoveis" aria-label="Vitrya Imóveis - Início">
            <img
              src="/brand/logo_oficial.png"
              alt="Vitrya"
              className="pv-mark"
            />
          </Link>

          {/* Ações (discretas) */}
          <div className="pv-actions" style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <Link
              className="pv-btn pv-btn-secondary"
              href="/cliente"
              style={{
                padding: "8px 10px",
                fontWeight: 800,
                fontSize: 12,
                borderRadius: 999,
                whiteSpace: "nowrap",
              }}
            >
              Acesso Cliente
            </Link>

            <Link
              className="pv-btn pv-btn-secondary"
              href="/crm/login"
              style={{
                padding: "8px 10px",
                fontWeight: 800,
                fontSize: 12,
                borderRadius: 999,
                whiteSpace: "nowrap",
              }}
            >
              Acesso Corretor
            </Link>
          </div>
        </div>
      </header>

      <div className="pv-main">{children}</div>

      <footer className="pv-footer">
        <div
          className="pv-footer-inner"
          style={{
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
          }}
        >
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <strong>Comercial Vitrya</strong>
            <span className="pv-footer-sep">•</span>
            <span>{formattedPhone ?? "WhatsApp indisponível"}</span>
          </div>

          {whatsappLink ? (
            <a
              className="pv-btn pv-btn-secondary"
              href={whatsappLink}
              target="_blank"
              rel="noreferrer"
              style={{ padding: "10px 14px", fontWeight: 900 }}
            >
              WhatsApp
            </a>
          ) : null}
        </div>
      </footer>
    </div>
  );
}
