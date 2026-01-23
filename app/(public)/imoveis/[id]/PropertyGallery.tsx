// app/(public)/imoveis/[id]/PropertyGallery.tsx
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type Props = {
  images: string[];
  title?: string;
};

export function PropertyGallery({ images, title = "Imóvel" }: Props) {
  const safeImages = useMemo(() => (Array.isArray(images) ? images.filter(Boolean) : []), [images]);

  const [index, setIndex] = useState(0);
  const [isOpen, setIsOpen] = useState(false);

  // mantém index válido quando lista muda
  useEffect(() => {
    if (index >= safeImages.length) setIndex(0);
  }, [safeImages.length, index]);

  const hasImages = safeImages.length > 0;
  const current = hasImages ? safeImages[index] : null;

  const open = useCallback(() => {
    if (!hasImages) return;
    setIsOpen(true);
  }, [hasImages]);

  const close = useCallback(() => setIsOpen(false), []);

  const prev = useCallback(() => {
    if (!hasImages) return;
    setIndex((i) => (i - 1 + safeImages.length) % safeImages.length);
  }, [hasImages, safeImages.length]);

  const next = useCallback(() => {
    if (!hasImages) return;
    setIndex((i) => (i + 1) % safeImages.length);
  }, [hasImages, safeImages.length]);

  // teclado no fullscreen + trava scroll
  useEffect(() => {
    if (!isOpen) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      if (e.key === "ArrowLeft") prev();
      if (e.key === "ArrowRight") next();
    };

    document.addEventListener("keydown", onKeyDown);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = prevOverflow;
    };
  }, [isOpen, close, prev, next]);

  // swipe no fullscreen
  useEffect(() => {
    if (!isOpen) return;

    let startX = 0;
    let startY = 0;

    const onTouchStart = (e: TouchEvent) => {
      const t = e.touches[0];
      if (!t) return;
      startX = t.clientX;
      startY = t.clientY;
    };

    const onTouchEnd = (e: TouchEvent) => {
      const t = e.changedTouches[0];
      if (!t) return;

      const dx = t.clientX - startX;
      const dy = t.clientY - startY;

      // evita swipe quando for mais “vertical” (scroll)
      if (Math.abs(dy) > Math.abs(dx)) return;

      if (dx > 40) prev();
      if (dx < -40) next();
    };

    document.addEventListener("touchstart", onTouchStart, { passive: true });
    document.addEventListener("touchend", onTouchEnd, { passive: true });

    return () => {
      document.removeEventListener("touchstart", onTouchStart);
      document.removeEventListener("touchend", onTouchEnd);
    };
  }, [isOpen, prev, next]);

  return (
    <div>
      {/* CARD / HERO IMAGE */}
      <div
        role={hasImages ? "button" : undefined}
        tabIndex={hasImages ? 0 : -1}
        onClick={open}
        onKeyDown={(e) => {
          if (!hasImages) return;
          if (e.key === "Enter" || e.key === " ") open();
        }}
        style={{
          borderRadius: 18,
          overflow: "hidden",
          border: "1px solid rgba(0,0,0,0.10)",
          background: "rgba(255,255,255,.75)",
          position: "relative",
          cursor: hasImages ? "zoom-in" : "default",
        }}
        aria-label={hasImages ? "Abrir galeria em tela cheia" : "Sem fotos"}
      >
        <div
          style={{
            width: "100%",
            aspectRatio: "16/10",
            background: "rgba(0,0,0,0.04)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {current ? (
            <img
              src={current}
              alt={`${title} — foto ${index + 1}`}
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
              loading="eager"
            />
          ) : (
            <div style={{ fontSize: 13, opacity: 0.7, fontWeight: 800 }}>Sem fotos</div>
          )}
        </div>

        {/* overlay contador */}
        {hasImages ? (
          <div
            style={{
              position: "absolute",
              left: 12,
              bottom: 12,
              padding: "6px 10px",
              borderRadius: 999,
              background: "rgba(0,0,0,.55)",
              color: "white",
              fontSize: 12,
              fontWeight: 900,
              backdropFilter: "blur(8px)",
            }}
          >
            {index + 1} / {safeImages.length}
          </div>
        ) : null}

        {/* setas no card (não fullscreen) */}
        {hasImages && safeImages.length > 1 ? (
          <>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                prev();
              }}
              aria-label="Foto anterior"
              style={navBtnStyle("left")}
            >
              ‹
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                next();
              }}
              aria-label="Próxima foto"
              style={navBtnStyle("right")}
            >
              ›
            </button>
          </>
        ) : null}
      </div>

      {/* THUMBS */}
      {hasImages ? (
        <div
          style={{
            display: "flex",
            gap: 10,
            marginTop: 12,
            overflowX: "auto",
            paddingBottom: 2,
          }}
        >
          {safeImages.slice(0, 12).map((src, i) => (
            <button
              key={`${src}-${i}`}
              type="button"
              onClick={() => setIndex(i)}
              aria-label={`Abrir foto ${i + 1}`}
              style={{
                width: 78,
                height: 54,
                borderRadius: 12,
                overflow: "hidden",
                border: i === index ? "2px solid rgba(23,190,187,.95)" : "1px solid rgba(0,0,0,.10)",
                padding: 0,
                background: "rgba(255,255,255,.6)",
                flex: "0 0 auto",
                cursor: "pointer",
              }}
            >
              <img src={src} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            </button>
          ))}
        </div>
      ) : null}

      {/* FULLSCREEN */}
      {isOpen && hasImages ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Galeria de fotos em tela cheia"
          onClick={close}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 9999,
            background: "rgba(0,0,0,.72)",
            backdropFilter: "blur(8px)",
            display: "grid",
            placeItems: "center",
            padding: 16,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "min(1100px, 96vw)",
              maxHeight: "92vh",
              display: "grid",
              gap: 12,
            }}
          >
            <div
              style={{
                borderRadius: 18,
                overflow: "hidden",
                background: "rgba(0,0,0,.35)",
                border: "1px solid rgba(255,255,255,.12)",
                position: "relative",
              }}
            >
              <div
                style={{
                  width: "100%",
                  height: "min(72vh, 720px)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <img
                  src={current!}
                  alt={`${title} — foto ${index + 1}`}
                  style={{ width: "100%", height: "100%", objectFit: "contain" }}
                  draggable={false}
                />
              </div>

              {/* header actions */}
              <div
                style={{
                  position: "absolute",
                  left: 12,
                  right: 12,
                  top: 12,
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 10,
                }}
              >
                <div
                  style={{
                    padding: "6px 10px",
                    borderRadius: 999,
                    background: "rgba(0,0,0,.55)",
                    color: "white",
                    fontSize: 12,
                    fontWeight: 900,
                  }}
                >
                  {index + 1} / {safeImages.length}
                </div>

                <button
                  type="button"
                  onClick={close}
                  aria-label="Fechar"
                  style={{
                    padding: "8px 10px",
                    borderRadius: 999,
                    background: "rgba(0,0,0,.55)",
                    color: "white",
                    border: "1px solid rgba(255,255,255,.16)",
                    cursor: "pointer",
                    fontWeight: 900,
                  }}
                >
                  Fechar ✕
                </button>
              </div>

              {/* arrows */}
              {safeImages.length > 1 ? (
                <>
                  <button
                    type="button"
                    onClick={prev}
                    aria-label="Foto anterior"
                    style={fsNavBtnStyle("left")}
                  >
                    ‹
                  </button>
                  <button
                    type="button"
                    onClick={next}
                    aria-label="Próxima foto"
                    style={fsNavBtnStyle("right")}
                  >
                    ›
                  </button>
                </>
              ) : null}
            </div>

            {/* thumbs fullscreen */}
            {safeImages.length > 1 ? (
              <div
                style={{
                  display: "flex",
                  gap: 10,
                  overflowX: "auto",
                  paddingBottom: 2,
                }}
              >
                {safeImages.slice(0, 16).map((src, i) => (
                  <button
                    key={`fs-${src}-${i}`}
                    type="button"
                    onClick={() => setIndex(i)}
                    aria-label={`Selecionar foto ${i + 1}`}
                    style={{
                      width: 86,
                      height: 58,
                      borderRadius: 12,
                      overflow: "hidden",
                      border:
                        i === index
                          ? "2px solid rgba(23,190,187,.95)"
                          : "1px solid rgba(255,255,255,.18)",
                      padding: 0,
                      background: "rgba(0,0,0,.25)",
                      flex: "0 0 auto",
                      cursor: "pointer",
                    }}
                  >
                    <img
                      src={src}
                      alt=""
                      style={{ width: "100%", height: "100%", objectFit: "cover" }}
                      draggable={false}
                    />
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function navBtnStyle(side: "left" | "right") {
  return {
    position: "absolute" as const,
    top: "50%",
    transform: "translateY(-50%)",
    [side]: 10,
    width: 38,
    height: 38,
    borderRadius: 999,
    border: "1px solid rgba(255,255,255,.18)",
    background: "rgba(0,0,0,.40)",
    color: "white",
    fontSize: 26,
    lineHeight: "38px",
    fontWeight: 900,
    cursor: "pointer",
    display: "grid",
    placeItems: "center",
    backdropFilter: "blur(8px)",
  };
}

function fsNavBtnStyle(side: "left" | "right") {
  return {
    position: "absolute" as const,
    top: "50%",
    transform: "translateY(-50%)",
    [side]: 14,
    width: 48,
    height: 48,
    borderRadius: 999,
    border: "1px solid rgba(255,255,255,.18)",
    background: "rgba(0,0,0,.55)",
    color: "white",
    fontSize: 34,
    lineHeight: "48px",
    fontWeight: 950,
    cursor: "pointer",
    display: "grid",
    placeItems: "center",
    backdropFilter: "blur(10px)",
  };
}
