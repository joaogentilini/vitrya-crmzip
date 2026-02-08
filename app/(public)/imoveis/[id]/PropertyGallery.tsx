/* eslint-disable @next/next/no-img-element */
"use client";

import { useEffect, useMemo, useState } from "react";

type MediaItem = {
  id: string;
  url: string;
  kind?: "image" | "video" | string;
};

function clampIndex(index: number, length: number) {
  if (length <= 0) return 0;
  if (index < 0) return 0;
  if (index >= length) return length - 1;
  return index;
}

export default function PropertyGallery({
  items,
  title,
  heroZoom = 1.0,
}: {
  items: MediaItem[];
  title?: string;
  heroZoom?: number; // ✅ zoom só no hero (não afeta fullscreen)
}) {
  const media = useMemo(() => items ?? [], [items]);
  const [failedIds, setFailedIds] = useState<Set<string>>(new Set());

  const validMedia = useMemo(() => {
    const isValidUrl = (url?: string) =>
      typeof url === "string" &&
      url.trim().length > 0 &&
      (url.startsWith("http") || url.startsWith("/"));

    return media.filter((m) => isValidUrl(m.url) && !failedIds.has(m.id));
  }, [media, failedIds]);

  const hasMedia = validMedia.length > 0;
  const hasMany = validMedia.length > 1;

  const [idx, setIdx] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    setIdx((prev) => clampIndex(prev, validMedia.length));
  }, [validMedia.length]);

  const current = hasMedia ? validMedia[idx] : null;
  const counterLabel = hasMedia ? `${idx + 1} / ${validMedia.length}` : "";

  const goPrev = () => setIdx((prev) => clampIndex(prev - 1, validMedia.length));
  const goNext = () => setIdx((prev) => clampIndex(prev + 1, validMedia.length));

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!isFullscreen) return;
      if (e.key === "Escape") setIsFullscreen(false);
      if (e.key === "ArrowLeft") goPrev();
      if (e.key === "ArrowRight") goNext();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFullscreen, validMedia.length]);

  // ✅ zoom apenas no modo normal
  const heroMediaStyle: React.CSSProperties = {
    width: "100%",
    height: "100%",
    objectFit: "cover",
    display: "block",
    transform: heroZoom && heroZoom !== 1 ? `scale(${heroZoom})` : undefined,
    transformOrigin: "center",
  };

  const onMediaError = (id?: string) => {
    if (!id) return;
    setFailedIds((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  };

  return (
    <div style={{ width: "100%", maxWidth: "100%", minWidth: 0 }}>
      <div
        className="pv-gallery"
        style={{
          position: "relative",
          borderRadius: 18,
          overflow: "hidden",
          background: "rgba(0,0,0,0.06)",
          width: "100%",
          maxWidth: "100%",
          minWidth: 0,
        }}
      >
        {/* MAIN */}
        <button
          type="button"
          onClick={() => {
            if (hasMedia) setIsFullscreen(true);
          }}
          aria-label="Abrir em tela cheia"
          style={{
            padding: 0,
            border: "none",
            background: "transparent",
            width: "100%",
            display: "block",
            cursor: hasMedia ? "pointer" : "default",
          }}
        >
          <div
            style={{
              aspectRatio: "16 / 9",
              width: "100%",
              maxWidth: "100%",
              background: "rgba(0,0,0,0.04)",
              display: "grid",
              placeItems: "center",
              overflow: "hidden",
            }}
          >
            {current?.kind === "video" ? (
              <video
                src={current.url}
                controls
                style={heroMediaStyle}
                onClick={(e) => e.stopPropagation()}
                onError={() => onMediaError(current?.id)}
              />
            ) : current?.url ? (
              <img
                src={current.url}
                alt={title || "Imóvel"}
                onError={() => onMediaError(current?.id)}
                style={heroMediaStyle}
              />
            ) : (
              <div style={{ padding: 24, color: "white" }}>Sem mídia</div>
            )}
          </div>
        </button>

        {/* CONTROLS */}
        {hasMedia && (
          <>
            {hasMany && (
              <>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    goPrev();
                  }}
                  aria-label="Anterior"
                  style={{
                    position: "absolute",
                    left: 12,
                    top: "50%",
                    transform: "translateY(-50%)",
                    width: 44,
                    height: 44,
                    borderRadius: 999,
                    border: "1px solid rgba(255,255,255,0.35)",
                    background: "rgba(0,0,0,0.35)",
                    color: "white",
                    display: "grid",
                    placeItems: "center",
                    cursor: "pointer",
                    userSelect: "none",
                  }}
                >
                  ‹
                </button>

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    goNext();
                  }}
                  aria-label="Próximo"
                  style={{
                    position: "absolute",
                    right: 12,
                    top: "50%",
                    transform: "translateY(-50%)",
                    width: 44,
                    height: 44,
                    borderRadius: 999,
                    border: "1px solid rgba(255,255,255,0.35)",
                    background: "rgba(0,0,0,0.35)",
                    color: "white",
                    display: "grid",
                    placeItems: "center",
                    cursor: "pointer",
                    userSelect: "none",
                  }}
                >
                  ›
                </button>
              </>
            )}

            <div
              style={{
                position: "absolute",
                left: 12,
                bottom: 12,
                padding: "6px 10px",
                borderRadius: 999,
                border: "1px solid rgba(255,255,255,0.25)",
                background: "rgba(0,0,0,0.28)",
                color: "white",
                fontSize: 12,
                lineHeight: 1,
              }}
            >
              {counterLabel}
            </div>

            {hasMany && (
              <div
                style={{
                  position: "absolute",
                  left: "50%",
                  bottom: 12,
                  transform: "translateX(-50%)",
                  display: "flex",
                  gap: 8,
                  padding: "6px 10px",
                  borderRadius: 999,
                  background: "rgba(0,0,0,0.28)",
                  border: "1px solid rgba(255,255,255,0.2)",
                }}
              >
                {validMedia.map((_, i) => {
                  const isActive = i === idx;
                  return (
                    <button
                      key={`dot-${i}`}
                      type="button"
                      aria-label={`Ir para mídia ${i + 1}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        setIdx(i);
                      }}
                      style={{
                        width: isActive ? 10 : 8,
                        height: isActive ? 10 : 8,
                        borderRadius: 999,
                        border: "none",
                        background: "white",
                        opacity: isActive ? 0.95 : 0.45,
                        transform: isActive ? "scale(1.05)" : "scale(1)",
                        cursor: "pointer",
                        padding: 0,
                      }}
                    />
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>

      {/* FULLSCREEN (sem zoom, sempre contain) */}
      {isFullscreen && hasMedia && (
        <div
          className="pv-fullscreen"
          onClick={() => setIsFullscreen(false)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 60,
            background: "rgba(0,0,0,0.82)",
            padding: 16,
            display: "grid",
            gridTemplateRows: "auto 1fr",
            gap: 12,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              color: "white",
            }}
          >
            <div style={{ fontSize: 13, opacity: 0.9 }}>{counterLabel}</div>
            <button
              type="button"
              onClick={() => setIsFullscreen(false)}
              style={{
                borderRadius: 999,
                border: "1px solid rgba(255,255,255,0.25)",
                background: "rgba(255,255,255,0.08)",
                color: "white",
                padding: "8px 12px",
                cursor: "pointer",
              }}
            >
              Fechar
            </button>
          </div>

          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              position: "relative",
              borderRadius: 18,
              overflow: "hidden",
              background: "rgba(255,255,255,0.06)",
              display: "grid",
              placeItems: "center",
            }}
          >
            {current?.kind === "video" ? (
              <video
                src={current.url}
                controls
                style={{ width: "100%", height: "100%", objectFit: "contain" }}
                onError={() => onMediaError(current?.id)}
              />
            ) : (
              <img
                src={current?.url}
                alt={title || "Imóvel"}
                onError={() => onMediaError(current?.id)}
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "contain",
                  display: "block",
                }}
              />
            )}

            {hasMany && (
              <>
                <button
                  type="button"
                  onClick={goPrev}
                  aria-label="Anterior"
                  style={{
                    position: "absolute",
                    left: 12,
                    top: "50%",
                    transform: "translateY(-50%)",
                    width: 48,
                    height: 48,
                    borderRadius: 999,
                    border: "1px solid rgba(255,255,255,0.35)",
                    background: "rgba(0,0,0,0.35)",
                    color: "white",
                    display: "grid",
                    placeItems: "center",
                    cursor: "pointer",
                    userSelect: "none",
                  }}
                >
                  ‹
                </button>

                <button
                  type="button"
                  onClick={goNext}
                  aria-label="Próximo"
                  style={{
                    position: "absolute",
                    right: 12,
                    top: "50%",
                    transform: "translateY(-50%)",
                    width: 48,
                    height: 48,
                    borderRadius: 999,
                    border: "1px solid rgba(255,255,255,0.35)",
                    background: "rgba(0,0,0,0.35)",
                    color: "white",
                    display: "grid",
                    placeItems: "center",
                    cursor: "pointer",
                    userSelect: "none",
                  }}
                >
                  ›
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
