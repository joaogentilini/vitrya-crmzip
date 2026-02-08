"use client";

import { useEffect, useMemo, useState } from "react";

function safeParse<T>(value: string | null, fallback: T): T {
  try {
    if (!value) return fallback;
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

const LS_KEY = "vitrya:favorites";

export default function ListingActionsClient({
  propertyId,
  shareUrl,
}: {
  propertyId: string;
  shareUrl?: string;
}) {
  const [favorited, setFavorited] = useState(false);

  const currentUrl = useMemo(() => {
    if (shareUrl && shareUrl.trim()) return shareUrl;
    if (typeof window !== "undefined") return window.location.href;
    return "";
  }, [shareUrl]);

  useEffect(() => {
    const arr = safeParse<string[]>(localStorage.getItem(LS_KEY), []);
    setFavorited(arr.includes(propertyId));
  }, [propertyId]);

  const toggleFavorite = () => {
    const arr = safeParse<string[]>(localStorage.getItem(LS_KEY), []);
    const exists = arr.includes(propertyId);
    const next = exists ? arr.filter((id) => id !== propertyId) : [propertyId, ...arr];
    localStorage.setItem(LS_KEY, JSON.stringify(next));
    setFavorited(!exists);
  };

  const doShare = async () => {
    const url = currentUrl || window.location.href;

    // tenta Web Share API (mobile)
    // fallback: copiar link
    try {
      if (typeof navigator !== "undefined" && "share" in navigator) {
        await (navigator as Navigator & { share: (data: { url: string }) => Promise<void> }).share({ url });
        return;
      }
    } catch {
      // ignore
    }

    try {
      await navigator.clipboard.writeText(url);
      alert("Link copiado!");
    } catch {
      prompt("Copie o link:", url);
    }
  };

  return (
    <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
      {/* Favoritar: aponta para rota futura, mas por enquanto salva no navegador */}
      <a
        href="/cliente/favoritos"
        className="pv-btn pv-btn-soft"
        onClick={(e) => {
          e.preventDefault();
          toggleFavorite();
        }}
        title="Salva este imóvel no seu navegador (por enquanto)."
      >
        {favorited ? "★ Favoritado" : "☆ Favoritar"}
      </a>

      <button type="button" className="pv-btn pv-btn-soft" onClick={doShare}>
        Compartilhar
      </button>

      <a href="#mapa" className="pv-btn pv-btn-soft">
        Ver mapa
      </a>
    </div>
  );
}
