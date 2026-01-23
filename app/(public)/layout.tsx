import type { ReactNode } from "react";
import "./public.css";

export default function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <div className="pv-shell">
      <header className="pv-header">
        <div className="pv-header-inner">
          {/* Só logo (sem texto) */}
          <a className="pv-brand" href="/imoveis" aria-label="Vitrya Imóveis - Início">
            <img
              src="/brand/logo_oficial.png"
              alt="Vitrya"
              className="pv-mark"
            />
          </a>

          <div className="pv-actions">
            <a className="pv-btn pv-btn-secondary" href="/crm/login">
              Área do corretor
            </a>
          </div>
        </div>
      </header>

      <div className="pv-main">{children}</div>
    </div>
  );
}
