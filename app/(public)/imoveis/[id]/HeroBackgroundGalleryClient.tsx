"use client";

import { useEffect, useMemo, useState } from "react";

type MediaKind = "image" | "video";
type GalleryItem = { id: string; url: string; kind?: string };
type MediaItem = { id: string; url: string; kind: MediaKind };

/* =========================
   SVG ICONS (não somem)
========================= */
function SvgChevronLeft({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M15 18l-6-6 6-6"
        stroke="currentColor"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SvgChevronRight({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M9 6l6 6-6 6"
        stroke="currentColor"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SvgZoom({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15Z"
        stroke="currentColor"
        strokeWidth="2.2"
      />
      <path
        d="M16.5 16.5 21 21"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      <path
        d="M10.5 7v7M7 10.5h7"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function SvgVideo({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4.5 7.5h10A2.5 2.5 0 0 1 17 10v4a2.5 2.5 0 0 1-2.5 2.5h-10A2.5 2.5 0 0 1 2 14v-4A2.5 2.5 0 0 1 4.5 7.5Z"
        stroke="currentColor"
        strokeWidth="2.2"
      />
      <path
        d="M17 10.5 22 8v8l-5-2.5"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SvgClose({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M18 6L6 18M6 6l12 12"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

export default function HeroBackgroundGalleryClient({
  items,
  title,
  leftContent,
  rightContent,
  heroMinHeight = 560,
  videoUrl,
}: {
  items: GalleryItem[];
  title: string;
  leftContent: React.ReactNode;
  rightContent?: React.ReactNode;
  heroMinHeight?: number;
  videoUrl?: string | null;
}) {
  const media: MediaItem[] = useMemo(() => {
    const images = (items ?? [])
      .filter((it) => !!it?.url)
      .map((it) => ({
        id: String(it.id),
        url: String(it.url),
        kind: (((it.kind as MediaKind) || "image") as MediaKind) ?? "image",
      }))
      .filter((it) => it.kind !== "video");

    const v = (videoUrl ?? "").toString().trim();
    const withVideo: MediaItem[] = v ? [...images, { id: "video", url: v, kind: "video" }] : images;

    return withVideo.filter((x) => !!x.url);
  }, [items, videoUrl]);

  const count = media.length;
  const [idx, setIdx] = useState(0);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    if (idx >= count) setIdx(0);
  }, [count, idx]);

  const current = media[idx] ?? null;

  const go = (nextIdx: number) => {
    if (!count) return;
    const n = (nextIdx + count) % count;
    setIdx(n);
  };

  const next = () => go(idx + 1);
  const prev = () => go(idx - 1);

  const hasVideo = Boolean(videoUrl && videoUrl.trim().length > 0);
  const videoIndex = hasVideo ? media.findIndex((m) => m.kind === "video") : -1;

  // teclado no fullscreen
  useEffect(() => {
    if (!isOpen) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsOpen(false);
      if (e.key === "ArrowRight") next();
      if (e.key === "ArrowLeft") prev();
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, idx, count]);

  if (!count) {
    return (
      <div
        style={{
          width: "100%",
          minHeight: heroMinHeight,
          background: "rgba(0,0,0,.25)",
          display: "grid",
          placeItems: "center",
          color: "rgba(255,255,255,.82)",
          fontWeight: 900,
        }}
      >
        Sem mídias
      </div>
    );
  }

  // ✅ fundo do hero é a mídia ativa
  const heroBgStyle =
    current?.kind === "image"
      ? { backgroundImage: `url(${current.url})` }
      : { backgroundImage: "linear-gradient(135deg, rgba(0,0,0,.65), rgba(0,0,0,.22))" };

  const ControlBtn = ({
    ariaLabel,
    title,
    onClick,
    children,
    active,
    disabled,
  }: {
    ariaLabel: string;
    title?: string;
    onClick: () => void;
    children: React.ReactNode;
    active?: boolean;
    disabled?: boolean;
  }) => (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      title={title}
      disabled={disabled}
      style={{
        width: 44,
        height: 44,
        borderRadius: 999,
        border: 0,
        // ✅ sem “barra”, mas com contraste (pra não sumir)
        background: active ? "rgba(255,255,255,.16)" : "rgba(0,0,0,.22)",
        color: "white",
        display: "grid",
        placeItems: "center",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.45 : 1,
        backdropFilter: "blur(6px)",
        WebkitBackdropFilter: "blur(6px)",
        boxShadow: "0 14px 26px rgba(0,0,0,.26)",
      }}
    >
      {children}
    </button>
  );

  return (
    <>
      <div
        className="pv-hero pv-hero-full"
        style={{
          position: "relative",
          minHeight: heroMinHeight,
          overflow: "hidden",
          borderRadius: 0,
        }}
      >
        {/* BACKGROUND clicável */}
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          aria-label="Abrir em tela cheia"
          title="Clique para ampliar"
          style={{
            all: "unset",
            cursor: "zoom-in",
            position: "absolute",
            inset: 0,
            zIndex: 0,
          }}
        >
          <div
            aria-hidden
            style={{
              position: "absolute",
              inset: 0,
              ...heroBgStyle,
              backgroundSize: "cover",
              backgroundPosition: "center",
              backgroundRepeat: "no-repeat",
              transform: "scale(1.01)",
            }}
          />
        </button>

        {/* Indicativo discreto de ampliar */}
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          aria-label="Ampliar"
          title="Ampliar"
          style={{
            position: "absolute",
            right: 18,
            top: 18,
            zIndex: 6,
            width: 44,
            height: 44,
            borderRadius: 999,
            border: 0,
            background: "rgba(0,0,0,.22)",
            color: "rgba(255,255,255,.95)",
            display: "grid",
            placeItems: "center",
            cursor: "pointer",
            backdropFilter: "blur(8px)",
            WebkitBackdropFilter: "blur(8px)",
            boxShadow: "0 14px 30px rgba(0,0,0,.25)",
          }}
        >
          <SvgZoom size={22} />
        </button>

        {/* ✅ Degradê escurecido +30% */}
        <div
          aria-hidden
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 1,
            background:
              "linear-gradient(90deg, rgba(0,0,0,1.00) 0%, rgba(0,0,0,.92) 14%, rgba(0,0,0,.72) 26%, rgba(0,0,0,.36) 36%, rgba(0,0,0,.13) 42%, rgba(0,0,0,0) 48%)",
            pointerEvents: "none",
          }}
        />

        {/* Conteúdo */}
        <div
          className="pv-hero-inner"
          style={{
            position: "relative",
            zIndex: 3,
            minHeight: heroMinHeight,
            display: "grid",
            gridTemplateColumns: rightContent ? "1fr 1fr" : "1fr",
            gap: 18,
            padding: "22px 22px 86px",
            alignItems: "stretch",
          }}
        >
          <div style={{ minWidth: 0 }}>{leftContent}</div>
          {rightContent ? <div style={{ minWidth: 0 }}>{rightContent}</div> : null}
        </div>

        {/* ✅ CONTROLES SOLTOS, CENTRALIZADOS */}
        <div
          style={{
            position: "absolute",
            left: "50%",
            bottom: 18,
            transform: "translateX(-50%)",
            zIndex: 6,
            display: "flex",
            alignItems: "center",
            gap: 10,
            userSelect: "none",
          }}
        >
          <ControlBtn ariaLabel="Anterior" onClick={prev} disabled={count <= 1}>
            <SvgChevronLeft size={26} />
          </ControlBtn>

          {/* dots */}
          {count > 1 ? (
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 2px" }}>
              {media.map((m, i) => {
                const isActive = i === idx;
                return (
                  <button
                    key={m.id ?? String(i)}
                    type="button"
                    onClick={() => setIdx(i)}
                    aria-label={m.kind === "video" ? "Ir para vídeo" : `Ir para mídia ${i + 1}`}
                    title={m.kind === "video" ? "Vídeo" : `Mídia ${i + 1}`}
                    style={{
                      width: isActive ? 26 : 10,
                      height: 10,
                      borderRadius: 999,
                      border: 0,
                      background: isActive ? "rgba(255,255,255,.92)" : "rgba(255,255,255,.50)",
                      cursor: "pointer",
                      transition: "all .18s ease",
                      filter: "drop-shadow(0 10px 18px rgba(0,0,0,.28))",
                    }}
                  />
                );
              })}
            </div>
          ) : null}

          {/* vídeo (quando existir) */}
          {hasVideo && videoIndex >= 0 ? (
            <ControlBtn
              ariaLabel="Vídeo"
              title="Vídeo"
              onClick={() => setIdx(videoIndex)}
              active={idx === videoIndex}
            >
              <SvgVideo size={22} />
            </ControlBtn>
          ) : null}

          {/* lupa */}
          <ControlBtn ariaLabel="Ampliar" title="Ampliar" onClick={() => setIsOpen(true)}>
            <SvgZoom size={24} />
          </ControlBtn>

          <ControlBtn ariaLabel="Próximo" onClick={next} disabled={count <= 1}>
            <SvgChevronRight size={26} />
          </ControlBtn>
        </div>
      </div>

      {/* FULLSCREEN */}
      {isOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Mídia em tela cheia"
          onClick={() => setIsOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 9999,
            background: "rgba(0,0,0,.88)",
            display: "grid",
            placeItems: "center",
            padding: 18,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              position: "relative",
              width: "min(1200px, 100%)",
              height: "min(86vh, 820px)",
              borderRadius: 18,
              overflow: "hidden",
              border: "1px solid rgba(255,255,255,.16)",
              background: "rgba(0,0,0,.28)",
            }}
          >
            {current?.kind === "video" ? (
              <video
                src={current.url}
                controls
                autoPlay
                style={{ width: "100%", height: "100%", objectFit: "contain", background: "black" }}
              />
            ) : (
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  backgroundImage: `url(${current?.url ?? ""})`,
                  backgroundSize: "contain",
                  backgroundPosition: "center",
                  backgroundRepeat: "no-repeat",
                }}
              />
            )}

            <button
              type="button"
              onClick={() => setIsOpen(false)}
              aria-label="Fechar"
              style={{
                position: "absolute",
                top: 12,
                right: 12,
                width: 44,
                height: 44,
                borderRadius: 999,
                border: 0,
                background: "rgba(0,0,0,.42)",
                color: "white",
                display: "grid",
                placeItems: "center",
                cursor: "pointer",
                backdropFilter: "blur(10px)",
                WebkitBackdropFilter: "blur(10px)",
              }}
            >
              <SvgClose size={20} />
            </button>

            {count > 1 ? (
              <>
                <button
                  type="button"
                  onClick={prev}
                  aria-label="Anterior"
                  style={{
                    position: "absolute",
                    left: 12,
                    top: "50%",
                    transform: "translateY(-50%)",
                    width: 52,
                    height: 52,
                    borderRadius: 999,
                    border: "1px solid rgba(255,255,255,.18)",
                    background: "rgba(0,0,0,.42)",
                    color: "white",
                    display: "grid",
                    placeItems: "center",
                    cursor: "pointer",
                  }}
                >
                  <SvgChevronLeft size={26} />
                </button>

                <button
                  type="button"
                  onClick={next}
                  aria-label="Próximo"
                  style={{
                    position: "absolute",
                    right: 12,
                    top: "50%",
                    transform: "translateY(-50%)",
                    width: 52,
                    height: 52,
                    borderRadius: 999,
                    border: "1px solid rgba(255,255,255,.18)",
                    background: "rgba(0,0,0,.42)",
                    color: "white",
                    display: "grid",
                    placeItems: "center",
                    cursor: "pointer",
                  }}
                >
                  <SvgChevronRight size={26} />
                </button>
              </>
            ) : null}

            <div
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                bottom: 0,
                padding: "12px 14px",
                background: "linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,.55) 100%)",
                color: "rgba(255,255,255,.9)",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 12,
                fontWeight: 800,
                fontSize: 12,
              }}
            >
              <span
                style={{
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  opacity: 0.9,
                }}
              >
                {title}
              </span>
              <span style={{ opacity: 0.8 }}>
                {idx + 1}/{count}
              </span>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
