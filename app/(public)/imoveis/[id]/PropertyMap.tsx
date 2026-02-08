"use client";

import { useMemo } from "react";

export default function PropertyMap({
  title,
  latitude,
  longitude,
  address,
}: {
  title: string;
  latitude?: number | string | null;
  longitude?: number | string | null;
  address?: string | null;
}) {
  const lat = latitude !== null && latitude !== undefined ? Number(latitude) : null;
  const lng = longitude !== null && longitude !== undefined ? Number(longitude) : null;

  const query = useMemo(() => {
    const addr = (address || "").trim();
    if (lat && lng && !Number.isNaN(lat) && !Number.isNaN(lng)) return `${lat},${lng}`;
    if (addr) return addr;
    return "";
  }, [address, lat, lng]);

  const googleMapsUrl = query
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`
    : "https://www.google.com/maps";

  const embedUrl = query
    ? `https://www.google.com/maps?q=${encodeURIComponent(query)}&output=embed`
    : null;

  return (
    <div id="mapa" className="pv-card">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <h2 style={{ margin: 0, fontSize: 20 }}>Localização</h2>
        <a className="pv-btn pv-btn-soft" href={googleMapsUrl} target="_blank" rel="noreferrer">
          Abrir no Google Maps
        </a>
      </div>

      <div style={{ marginTop: 12, opacity: 0.85, fontSize: 13 }}>
        {address ? address : "Endereço não informado."}
      </div>

      <div
        style={{
          marginTop: 12,
          borderRadius: 16,
          overflow: "hidden",
          border: "1px solid rgba(23,26,33,.10)",
          background: "rgba(255,255,255,.5)",
        }}
      >
        {embedUrl ? (
          <iframe
            title={`Mapa - ${title}`}
            src={embedUrl}
            width="100%"
            height="360"
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
            style={{ border: 0, display: "block" }}
          />
        ) : (
          <div style={{ padding: 16 }}>
            Informe latitude/longitude ou endereço para exibir o mapa.
          </div>
        )}
      </div>
    </div>
  );
}
