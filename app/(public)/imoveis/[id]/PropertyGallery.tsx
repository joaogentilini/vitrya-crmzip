/* eslint-disable @next/next/no-img-element */
"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "@/components/ui/Icon";

type GalleryItem = {
  id: string;
  url: string;
  kind?: string; // "image" | "video" (por enquanto tratamos como imagem)
};

export default function PropertyGallery({
  items,
  title,
}: {
  items: GalleryItem[];
  title: string;
}) {
  const safeItems = useMemo(() => {
    return (items ?? []).filter((it) => !!it?.url);
  }, [items]);

  const [idx, setIdx] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  const count = safeItems.length;
  const current = safeItems[idx]?.url;

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (idx >= count) setIdx(0);
  }, [count, idx]);

  const go = (next: number) => {
    if (!count) return;
    const n = (next + count) % count;
    setIdx(n);
  };

  const next = () => go(idx + 1);
  const prev = () => go(idx - 1);

  // trava scroll quando fullscreen está aberto
  useEffect(() => {
    if (!isOpen) return;

    const prevOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.documentElement.style.overflow = prevOverflow;
    };
  }, [isOpen]);

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
          height: "100%",
          minHeight: 440,
          borderRadius: 22,
          border: "1px solid rgba(255,255,255,.20)",
          background: "rgba(255,255,255,.08)",
          display: "grid",
          placeItems: "center",
          color: "rgba(255,255,255,.78)",
          fontWeight: 800,
        }}
      >
        Sem fotos
      </div>
    );
  }

  return (
    <>
      {/* container: ocupa tudo do quadrado vermelho */}
      <div
        style={{
          position: "relative",
          width: "100%",
          height: "100%",
          minHeight: 440,
          borderRadius: 22,
          overflow: "hidden",
          border: "1px solid rgba(255,255,255,.18)",
          background: "rgba(0,0,0,.18)",
          boxShadow: "0 22px 60px rgba(0,0,0,.22)",
        }}
      >
        {/* imagem principal (cover) */}
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          style={{
            all: "unset",
            cursor: "zoom-in",
            position: "absolute",
            inset: 0,
            backgroundImage: `url(${current})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
            backgroundRepeat: "no-repeat",
          }}
          aria-label="Abrir imagem em tela cheia"
          title="Clique para abrir em tela cheia"
        />

        {/* overlay leve só pra legibilidade dos controles */}
        <div
          aria-hidden
          style={{
            position: "absolute",
            inset: 0,
            background:
              "linear-gradient(180deg, rgba(0,0,0,.10) 0%, rgba(0,0,0,0) 40%, rgba(0,0,0,.28) 100%)",
            pointerEvents: "none",
          }}
        />

        {/* contador */}
        <div
          style={{
            position: "absolute",
            left: 14,
            top: 14,
            padding: "8px 10px",
            borderRadius: 999,
            background: "rgba(0,0,0,.35)",
            border: "1px solid rgba(255,255,255,.18)",
            color: "rgba(255,255,255,.92)",
            fontWeight: 900,
            fontSize: 12,
            backdropFilter: "blur(10px)",
            WebkitBackdropFilter: "blur(10px)",
          }}
        >
          {idx + 1}/{count}
        </div>

        {/* setas */}
        {count > 1 ? (
          <>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                prev();
              }}
              aria-label="Foto anterior"
              style={{
                position: "absolute",
                left: 12,
                top: "50%",
                transform: "translateY(-50%)",
                width: 42,
                height: 42,
                borderRadius: 999,
                border: "1px solid rgba(255,255,255,.18)",
                background: "rgba(0,0,0,.32)",
                color: "white",
                display: "grid",
                placeItems: "center",
                cursor: "pointer",
                backdropFilter: "blur(10px)",
                WebkitBackdropFilter: "blur(10px)",
             
              }}
            >
              <Icon name="chevron_left" size={20} />
            </button>

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                next();
              }}
              aria-label="Próxima foto"
              style={{
                position: "absolute",
                right: 12,
                top: "50%",
                transform: "translateY(-50%)",
                width: 42,
                height: 42,
                borderRadius: 999,
                border: "1px solid rgba(255,255,255,.18)",
                background: "rgba(0,0,0,.32)",
                color: "white",
                display: "grid",
                placeItems: "center",
                cursor: "pointer",
                backdropFilter: "blur(10px)",
                WebkitBackdropFilter: "blur(10px)",
              }}
            >
              <Icon name="chevron_right" size={20} />
            </button>
          </>
        ) : null}

        {/* DOTS embaixo */}
        {count > 1 ? (
          <div
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              bottom: 14,
              display: "flex",
              justifyContent: "center",
              gap: 8,
              padding: "0 14px",
            }}
          >
            {safeItems.map((_, i) => {
              const active = i === idx;
              return (
                <button
                  key={safeItems[i].id ?? String(i)}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    go(i);
                  }}
                  aria-label={`Ir para foto ${i + 1}`}
                  style={{
                    width: active ? 26 : 10,
                    height: 10,
                    borderRadius: 999,
                    border: "1px solid rgba(255,255,255,.28)",
                    background: active
                      ? "rgba(255,255,255,.92)"
                      : "rgba(255,255,255,.38)",
                    cursor: "pointer",
                    transition: "all .18s ease",
                  }}
                />
              );
            })}
          </div>
        ) : null}
      </div>

      {/* FULLSCREEN REAL via Portal (no document.body) */}
      {mounted && isOpen
        ? createPortal(
            <div
              role="dialog"
              aria-modal="true"
              aria-label="Galeria em tela cheia"
              onMouseDown={(e) => {
                // clique fora fecha
                if (e.target === e.currentTarget) setIsOpen(false);
              }}
              style={{
                position: "fixed",
                inset: 0,
                zIndex: 2147483647, // topo absoluto
                background: "rgba(0,0,0,.88)",
                display: "grid",
                placeItems: "center",
                padding: 18,
              }}
            >
              <div
                style={{
                  position: "relative",
                  width: "min(1400px, 100%)",
                  height: "min(90vh, 900px)",
                  borderRadius: 18,
                  overflow: "hidden",
                  border: "1px solid rgba(255,255,255,.16)",
                  background: "rgba(0,0,0,.28)",
                }}
              >
                {/* imagem em contain (pra não cortar no fullscreen) */}
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    backgroundImage: `url(${current})`,
                    backgroundSize: "contain",
                    backgroundPosition: "center",
                    backgroundRepeat: "no-repeat",
                  }}
                />

                {/* fechar */}
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
                    border: "1px solid rgba(255,255,255,.18)",
                    background: "rgba(0,0,0,.42)",
                    color: "white",
                    display: "grid",
                    placeItems: "center",
                    cursor: "pointer",
                    backdropFilter: "blur(10px)",
                    WebkitBackdropFilter: "blur(10px)",
                  }}
                >
                  <Icon name="close" size={20} />
                </button>

                {/* setas fullscreen */}
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
                      <Icon name="chevron_left" size={26} />
                    </button>
                    <button
                      type="button"
                      onClick={next}
                      aria-label="Próxima"
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
                      <Icon name="chevron_right" size={26} />
                    </button>
                  </>
                ) : null}

                {/* legenda inferior */}
                <div
                  style={{
                    position: "absolute",
                    left: 0,
                    right: 0,
                    bottom: 0,
                    padding: "12px 14px",
                    background:
                      "linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,.60) 100%)",
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
            </div>,
            document.body
          )
        : null}
    </>
  );
}
