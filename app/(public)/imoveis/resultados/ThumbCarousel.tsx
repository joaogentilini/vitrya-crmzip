'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

type Props = {
  images: string[]
  alt: string
  className?: string
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n))
}

export function ThumbCarousel({ images, alt, className }: Props) {
  const safeImages = useMemo(() => (images || []).filter(Boolean), [images])
  const [index, setIndex] = useState(0)

  // Se a lista de imagens mudar, garante index válido
  useEffect(() => {
    setIndex((i) => clamp(i, 0, Math.max(0, safeImages.length - 1)))
  }, [safeImages.length])

  const hasMany = safeImages.length > 1

  const go = useCallback(
    (next: number) => {
      if (!safeImages.length) return
      const max = safeImages.length - 1
      setIndex(clamp(next, 0, max))
    },
    [safeImages.length]
  )

  const prev = useCallback(() => go(index - 1), [go, index])
  const next = useCallback(() => go(index + 1), [go, index])

  // Swipe básico (mobile)
  const startX = useRef<number | null>(null)
  const deltaX = useRef<number>(0)

  function onPointerDown(e: React.PointerEvent) {
    startX.current = e.clientX
    deltaX.current = 0
  }

  function onPointerMove(e: React.PointerEvent) {
    if (startX.current == null) return
    deltaX.current = e.clientX - startX.current
  }

  function onPointerUp() {
    if (startX.current == null) return
    const dx = deltaX.current
    startX.current = null
    deltaX.current = 0

    // threshold
    if (Math.abs(dx) < 35) return
    if (dx > 0) prev()
    else next()
  }

  // MUITO importante: evitar que clicar nos botões “dispare” o Link do card
  function stopLink(e: React.MouseEvent | React.PointerEvent) {
    e.preventDefault()
    e.stopPropagation()
  }

  const current = safeImages[index] ?? safeImages[0]

  return (
    <div
      className={className}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        userSelect: 'none',
        touchAction: 'pan-y',
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      {current ? (
        <img
          src={current}
          alt={alt}
          className="pv-thumb-img"
          loading="lazy"
          draggable={false}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
      ) : (
        <span>Sem foto</span>
      )}

      {/* Setas */}
      {hasMany ? (
        <>
          <button
            type="button"
            aria-label="Foto anterior"
            onClick={(e) => {
              stopLink(e)
              prev()
            }}
            onPointerDown={stopLink}
            style={{
              position: 'absolute',
              left: 8,
              top: '50%',
              transform: 'translateY(-50%)',
              width: 34,
              height: 34,
              borderRadius: 999,
              border: '1px solid rgba(255,255,255,.55)',
              background: 'rgba(0,0,0,.35)',
              color: 'white',
              display: 'grid',
              placeItems: 'center',
              cursor: 'pointer',
              backdropFilter: 'blur(6px)',
            }}
          >
            ‹
          </button>

          <button
            type="button"
            aria-label="Próxima foto"
            onClick={(e) => {
              stopLink(e)
              next()
            }}
            onPointerDown={stopLink}
            style={{
              position: 'absolute',
              right: 8,
              top: '50%',
              transform: 'translateY(-50%)',
              width: 34,
              height: 34,
              borderRadius: 999,
              border: '1px solid rgba(255,255,255,.55)',
              background: 'rgba(0,0,0,.35)',
              color: 'white',
              display: 'grid',
              placeItems: 'center',
              cursor: 'pointer',
              backdropFilter: 'blur(6px)',
            }}
          >
            ›
          </button>
        </>
      ) : null}

      {/* Bolinhas */}
      {hasMany ? (
        <div
          onClick={stopLink}
          onPointerDown={stopLink}
          style={{
            position: 'absolute',
            left: 10,
            right: 10,
            bottom: 8,
            display: 'flex',
            justifyContent: 'center',
            gap: 6,
            pointerEvents: 'auto',
          }}
        >
          {safeImages.slice(0, 6).map((_, i) => {
            const active = i === index
            return (
              <button
                key={i}
                type="button"
                aria-label={`Ir para foto ${i + 1}`}
                onClick={(e) => {
                  stopLink(e)
                  go(i)
                }}
                style={{
                  width: active ? 18 : 7,
                  height: 7,
                  borderRadius: 999,
                  border: '1px solid rgba(255,255,255,.55)',
                  background: active ? 'rgba(255,255,255,.95)' : 'rgba(0,0,0,.35)',
                  cursor: 'pointer',
                  padding: 0,
                }}
              />
            )
          })}
        </div>
      ) : null}

      {/* Contador (opcional) */}
      {hasMany ? (
        <div
          onClick={stopLink}
          onPointerDown={stopLink}
          style={{
            position: 'absolute',
            top: 8,
            right: 8,
            padding: '4px 8px',
            borderRadius: 999,
            fontSize: 12,
            fontWeight: 800,
            color: 'white',
            background: 'rgba(0,0,0,.35)',
            border: '1px solid rgba(255,255,255,.35)',
            backdropFilter: 'blur(6px)',
          }}
        >
          {index + 1}/{safeImages.length}
        </div>
      ) : null}
    </div>
  )
}
