/* eslint-disable @next/next/no-img-element */
"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type CarouselItem = {
  id: string;
  href: string;
  title: string;
  location: string;
  price: string | null;
  purposeLabel: string | null;
  area_m2: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  parking: number | null;
  coverUrl: string | null;
};

export default function SimilarCarouselClient({
  items,
  speedPxPerSec = 35, // ajuste fino (mais alto = mais rápido)
}: {
  items: CarouselItem[];
  speedPxPerSec?: number;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const firstCardRef = useRef<HTMLAnchorElement | null>(null);

  const [step, setStep] = useState(0); // largura do card + gap
  const [paused, setPaused] = useState(false);
  const [offset, setOffset] = useState(0);

  const gap = 16;
  const total = items.length;

  // Duplicamos para criar loop contínuo
  const loopItems = useMemo(() => {
    if (total <= 0) return [];
    return [...items, ...items];
  }, [items, total]);

  // Mede o tamanho do passo (card + gap)
  useEffect(() => {
    const measure = () => {
      const cardEl = firstCardRef.current;
      if (!cardEl) return;

      const cardWidth = cardEl.getBoundingClientRect().width;
      const stepWidth = cardWidth + gap;
      setStep(stepWidth);
    };

    measure();

    // Usa resize observer para ficar bem robusto
    const ro =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(() => measure())
        : null;

    if (ro && containerRef.current) ro.observe(containerRef.current);
    window.addEventListener("resize", measure);

    return () => {
      window.removeEventListener("resize", measure);
      if (ro) ro.disconnect();
    };
  }, []);

  // Loop suave por pixels via rAF (sem reset perceptível)
  useEffect(() => {
    if (paused) return;
    if (total <= 1) return;
    if (step <= 0) return;

    let raf = 0;
    let last = performance.now();

    // A cada "volta completa" (total * step), reiniciamos o offset subtraindo,
    // mas como a lista está duplicada, a imagem continua idêntica => não dá para perceber.
    const loopWidth = step * total;

    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;

      setOffset((prev) => {
        let next = prev + speedPxPerSec * dt;
        if (next >= loopWidth) next = next - loopWidth;
        return next;
      });

      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [paused, speedPxPerSec, step, total]);

  if (items.length === 0) {
    return (
      <div
        style={{
          width: "100%",
          padding: 16,
          borderRadius: 16,
          border: "1px dashed rgba(23,26,33,0.18)",
          background: "rgba(255,255,255,0.6)",
          color: "rgba(23,26,33,0.65)",
          fontSize: 13,
        }}
      >
        Nenhum imóvel similar encontrado.
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      style={{ overflow: "hidden", width: "100%" }}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div
        style={{
          display: "flex",
          gap,
          flexWrap: "nowrap",
          transform: `translateX(-${offset}px)`,
          willChange: "transform",
        }}
      >
        {loopItems.map((p, i) => (
          <a
            key={`${p.id}-${i}`}
            href={p.href}
            className="pv-card"
            ref={i === 0 ? firstCardRef : null}
            style={{
              textDecoration: "none",
              color: "inherit",
              minWidth: 230,
              maxWidth: 260,
              width: 240,
              flex: "0 0 auto",
            }}
          >
            <div className="pv-thumb" style={{ position: "relative" }}>
              {p.coverUrl ? (
                <img src={p.coverUrl} alt={p.title} className="pv-thumb-img" />
              ) : (
                <span>Sem foto</span>
              )}
            </div>

            <div className="pv-cardbody">
              <h3 className="pv-cardtitle">{p.title}</h3>
              <div className="pv-cardmeta">{p.location}</div>

              <div className="pv-pricerow">
                {p.price ? <div className="pv-price">{p.price}</div> : null}
                {p.purposeLabel ? (
                  <div className="pv-muted">{p.purposeLabel}</div>
                ) : null}
              </div>

              <div className="pv-pricerow" style={{ marginTop: 8 }}>
                {p.area_m2 != null ? (
                  <span className="pv-muted">{p.area_m2} m²</span>
                ) : null}
                {p.bedrooms != null ? (
                  <span className="pv-muted">{p.bedrooms} quartos</span>
                ) : null}
                {p.bathrooms != null ? (
                  <span className="pv-muted">{p.bathrooms} banheiros</span>
                ) : null}
                {p.parking != null ? (
                  <span className="pv-muted">{p.parking} vagas</span>
                ) : null}
              </div>
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}
