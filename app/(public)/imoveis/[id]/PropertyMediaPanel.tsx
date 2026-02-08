"use client";

import { useEffect, useMemo, useState } from "react";
import PropertyGallery from "./PropertyGallery";

type MediaTab = "photo" | "video" | "map";

type Props = {
  images: string[];
  videoUrls?: string[];
  title?: string;
  mapEmbedUrl?: string | null;
  mapLinkUrl?: string | null;
};

export function PropertyMediaPanel({
  images,
  videoUrls = [],
  title = "Imóvel",
  mapEmbedUrl,
  mapLinkUrl,
}: Props) {
  const hasPhotos = images.length > 0;
  const hasVideos = videoUrls.length > 0;
  const hasMap = Boolean(mapEmbedUrl || mapLinkUrl);

  const fallbackTab: MediaTab = hasPhotos
    ? "photo"
    : hasVideos
    ? "video"
    : "map";

  const [tab, setTab] = useState<MediaTab>(fallbackTab);

  useEffect(() => {
    if (tab === "photo" && !hasPhotos) setTab(fallbackTab);
    if (tab === "video" && !hasVideos) setTab(fallbackTab);
    if (tab === "map" && !hasMap) setTab(fallbackTab);
  }, [tab, hasPhotos, hasVideos, hasMap, fallbackTab]);

  const tabs = useMemo(
    () => [
      { key: "photo" as const, label: "Foto", enabled: hasPhotos },
      { key: "video" as const, label: "Vídeo", enabled: hasVideos },
      { key: "map" as const, label: "Mapa", enabled: hasMap },
    ],
    [hasPhotos, hasVideos, hasMap]
  );
  const galleryItems = useMemo(
    () => images.map((url, idx) => ({ id: `img-${idx}`, url, kind: "image" as const })),
    [images]
  );

  return (
    <div
      className="pv-glass pv-glass-soft"
      style={{ padding: 12, position: "relative" }}
    >
      <div
        style={{
          position: "absolute",
          top: 12,
          left: 12,
          zIndex: 4,
          display: "flex",
          gap: 6,
          padding: 6,
          borderRadius: 999,
          border: "1px solid rgba(255,255,255,.55)",
          background: "rgba(255,255,255,.75)",
          backdropFilter: "blur(8px)",
        }}
      >
        {tabs.map((item) => {
          const isActive = tab === item.key;
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => item.enabled && setTab(item.key)}
              style={{
                padding: "6px 10px",
                borderRadius: 999,
                border: isActive
                  ? "1px solid rgba(23,190,187,.65)"
                  : "1px solid rgba(23,26,33,.12)",
                background: isActive
                  ? "rgba(23,190,187,.12)"
                  : "rgba(255,255,255,.85)",
                fontSize: 12,
                fontWeight: 900,
                cursor: item.enabled ? "pointer" : "not-allowed",
                opacity: item.enabled ? 1 : 0.45,
              }}
            >
              {item.label}
            </button>
          );
        })}
      </div>

      <div style={{ width: "100%" }}>
        {tab === "photo" ? (
          <PropertyGallery items={galleryItems} title={title} />
        ) : null}

        {tab === "video" ? (
          <div
            style={{
              borderRadius: 18,
              overflow: "hidden",
              border: "1px solid rgba(0,0,0,0.10)",
              background: "rgba(255,255,255,.75)",
            }}
          >
            {hasVideos ? (
              <video
                src={videoUrls[0]}
                controls
                style={{ width: "100%", height: 420, objectFit: "cover" }}
              />
            ) : (
              <div
                style={{
                  height: 320,
                  display: "grid",
                  placeItems: "center",
                  fontSize: 13,
                  opacity: 0.7,
                  fontWeight: 800,
                }}
              >
                Vídeo não disponível
              </div>
            )}
          </div>
        ) : null}

        {tab === "map" ? (
          <div
            style={{
              borderRadius: 18,
              overflow: "hidden",
              border: "1px solid rgba(0,0,0,0.10)",
              background: "rgba(255,255,255,.75)",
            }}
          >
            {mapEmbedUrl ? (
              <iframe
                title="Mapa do imóvel"
                src={mapEmbedUrl}
                style={{ width: "100%", height: 320, border: 0 }}
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
              />
            ) : (
              <div
                style={{
                  height: 320,
                  display: "grid",
                  placeItems: "center",
                  fontSize: 13,
                  opacity: 0.7,
                  fontWeight: 800,
                }}
              >
                Endereço insuficiente para exibir mapa
              </div>
            )}
            {mapLinkUrl ? (
              <a
                href={mapLinkUrl}
                target="_blank"
                rel="noreferrer"
                style={{
                  display: "inline-block",
                  margin: "10px 12px 12px",
                  fontWeight: 900,
                  color: "var(--cobalt)",
                  textDecoration: "none",
                  fontSize: 13,
                }}
              >
                Ver no Google Maps →
              </a>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
