'use client'

import { useEffect, useMemo, useRef, useState } from 'react'

import { loadGoogleMapsBrowser } from '@/components/maps/googleMapsBrowserLoader'
import type { AmenitiesSnapshotData } from '@/lib/maps/types'
import { Icon } from '@/components/ui/Icon'

type PublicPropertyMapCardProps = {
  title: string
  latitude: number | null
  longitude: number | null
  address?: string | null
  amenitiesSnapshot?: AmenitiesSnapshotData | null
  amenitiesGeneratedAt?: string | null
}

function asFinite(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function formatDistance(distanceM: number | null) {
  if (distanceM === null || !Number.isFinite(distanceM)) return 'distância não informada'
  if (distanceM < 1000) return `${distanceM} m`
  return `${(distanceM / 1000).toFixed(1).replace('.', ',')} km`
}

export default function PublicPropertyMapCard({
  title,
  latitude,
  longitude,
  address,
  amenitiesSnapshot,
  amenitiesGeneratedAt,
}: PublicPropertyMapCardProps) {
  const apiKey = String(process.env.NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY || '').trim()
  const rootRef = useRef<HTMLDivElement | null>(null)
  const miniMapRef = useRef<HTMLDivElement | null>(null)
  const modalMapRef = useRef<HTMLDivElement | null>(null)
  const miniMapInstanceRef = useRef<any>(null)
  const miniMarkerRef = useRef<any>(null)
  const modalMapInstanceRef = useRef<any>(null)
  const modalMarkerRef = useRef<any>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [shouldLoadMap, setShouldLoadMap] = useState(false)
  const [mapError, setMapError] = useState<string | null>(null)

  const lat = asFinite(latitude)
  const lng = asFinite(longitude)
  const hasCoordinates = lat !== null && lng !== null

  const destinationQuery = hasCoordinates ? `${lat},${lng}` : String(address || '').trim()
  const routeUrl = destinationQuery
    ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destinationQuery)}`
    : 'https://www.google.com/maps'

  useEffect(() => {
    if (!rootRef.current || shouldLoadMap) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setShouldLoadMap(true)
          observer.disconnect()
        }
      },
      { rootMargin: '160px' }
    )

    observer.observe(rootRef.current)
    return () => observer.disconnect()
  }, [shouldLoadMap])

  useEffect(() => {
    if (!modalOpen) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [modalOpen])

  const categories = useMemo(() => amenitiesSnapshot?.categories ?? [], [amenitiesSnapshot])

  useEffect(() => {
    if (!shouldLoadMap && !modalOpen) return
    if (!hasCoordinates || !apiKey) return

    let active = true
    loadGoogleMapsBrowser(apiKey)
      .then((google) => {
        if (!active) return
        const center = { lat: lat!, lng: lng! }

        if (miniMapRef.current) {
          if (!miniMapInstanceRef.current) {
            miniMapInstanceRef.current = new google.maps.Map(miniMapRef.current, {
              center,
              zoom: 15,
              mapTypeControl: false,
              streetViewControl: false,
              fullscreenControl: false,
              disableDefaultUI: true,
              gestureHandling: 'none',
            })
            miniMarkerRef.current = new google.maps.Marker({
              map: miniMapInstanceRef.current,
              position: center,
            })
          } else {
            miniMapInstanceRef.current.setCenter(center)
            miniMarkerRef.current?.setPosition(center)
          }
        }

        if (modalOpen && modalMapRef.current) {
          if (!modalMapInstanceRef.current) {
            modalMapInstanceRef.current = new google.maps.Map(modalMapRef.current, {
              center,
              zoom: 16,
              mapTypeControl: false,
              streetViewControl: false,
              fullscreenControl: true,
            })
            modalMarkerRef.current = new google.maps.Marker({
              map: modalMapInstanceRef.current,
              position: center,
              title,
            })
          } else {
            modalMapInstanceRef.current.setCenter(center)
            modalMarkerRef.current?.setPosition(center)
          }
        }

        setMapError(null)
      })
      .catch((err) => {
        if (!active) return
        setMapError(err instanceof Error ? err.message : 'Falha ao carregar mapa.')
      })

    return () => {
      active = false
    }
  }, [apiKey, hasCoordinates, lat, lng, modalOpen, shouldLoadMap, title])

  return (
    <>
      <div
        ref={rootRef}
        id="pv-map"
        style={{
          marginTop: 14,
          borderRadius: 16,
          border: '1px solid rgba(23,26,33,0.1)',
          background: 'linear-gradient(180deg, rgba(23,26,33,0.04), rgba(23,26,33,0.02))',
          padding: 12,
          minHeight: 150,
          display: 'grid',
          gap: 8,
          scrollMarginTop: 90,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Icon name="location_on" size={18} />
            <strong>Localização</strong>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              type="button"
              onClick={() => setModalOpen(true)}
              disabled={!hasCoordinates}
              style={{
                border: '1px solid rgba(23,26,33,0.16)',
                background: 'rgba(255,255,255,0.85)',
                borderRadius: 999,
                padding: '6px 10px',
                fontSize: 12,
                fontWeight: 800,
                cursor: hasCoordinates ? 'pointer' : 'not-allowed',
                opacity: hasCoordinates ? 1 : 0.55,
              }}
            >
              Ampliar mapa
            </button>
            <a
              href={routeUrl}
              target="_blank"
              rel="noreferrer"
              style={{
                border: '1px solid rgba(23,26,33,0.16)',
                background: 'rgba(255,255,255,0.85)',
                borderRadius: 999,
                padding: '6px 10px',
                fontSize: 12,
                fontWeight: 800,
                textDecoration: 'none',
                color: 'inherit',
              }}
            >
              Rotas
            </a>
          </div>
        </div>

        <div style={{ opacity: 0.85, fontSize: 13 }}>
          {address && address.trim() ? address : 'Endereço não informado'}
        </div>

        <button
          type="button"
          onClick={() => {
            if (hasCoordinates) setModalOpen(true)
          }}
          style={{
            width: '100%',
            borderRadius: 12,
            border: '1px solid rgba(23,26,33,0.12)',
            background: 'rgba(255,255,255,0.76)',
            minHeight: 180,
            overflow: 'hidden',
            cursor: hasCoordinates ? 'pointer' : 'default',
            textAlign: 'left',
            padding: 0,
          }}
        >
          {hasCoordinates ? (
            <div
              ref={miniMapRef}
              style={{
                width: '100%',
                height: 180,
                background: 'rgba(23,26,33,0.08)',
              }}
            />
          ) : (
            <div
              style={{
                minHeight: 180,
                display: 'grid',
                placeItems: 'center',
                color: 'rgba(23,26,33,0.62)',
                fontSize: 13,
                padding: 16,
              }}
            >
              Localização exata não cadastrada.
            </div>
          )}
        </button>

        {mapError ? <p style={{ margin: 0, fontSize: 12, color: '#B42318' }}>{mapError}</p> : null}

        {categories.length > 0 ? (
          <div style={{ display: 'grid', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <strong style={{ fontSize: 13 }}>Proximidades</strong>
              <span style={{ fontSize: 11, opacity: 0.7 }}>
                {amenitiesGeneratedAt ? `Atualizado em ${new Date(amenitiesGeneratedAt).toLocaleDateString('pt-BR')}` : ''}
              </span>
            </div>
            <div style={{ display: 'grid', gap: 6 }}>
              {categories.map((category) => (
                <div
                  key={category.key}
                  style={{
                    borderRadius: 10,
                    border: '1px solid rgba(23,26,33,0.1)',
                    background: 'rgba(255,255,255,0.68)',
                    padding: '8px 10px',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <strong style={{ fontSize: 12 }}>{category.label}</strong>
                    <span style={{ fontSize: 12, opacity: 0.78 }}>{category.count}</span>
                  </div>
                  {category.top.length > 0 ? (
                    <p style={{ margin: '4px 0 0', fontSize: 12, opacity: 0.82 }}>
                      {category.top
                        .slice(0, 3)
                        .map((item) => `${item.name} (${formatDistance(item.distance_m)})`)
                        .join(' • ')}
                    </p>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      {modalOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => setModalOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 80,
            background: 'rgba(15,23,42,0.62)',
            display: 'grid',
            placeItems: 'center',
            padding: 16,
          }}
        >
          <div
            onClick={(event) => event.stopPropagation()}
            style={{
              width: 'min(980px, 100%)',
              borderRadius: 18,
              border: '1px solid rgba(255,255,255,0.22)',
              background: 'white',
              overflow: 'hidden',
              boxShadow: '0 22px 48px rgba(15,23,42,0.35)',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 10,
                padding: '12px 14px',
                borderBottom: '1px solid rgba(23,26,33,0.1)',
              }}
            >
              <strong style={{ fontSize: 14 }}>Mapa ampliado</strong>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                style={{
                  border: '1px solid rgba(23,26,33,0.2)',
                  borderRadius: 999,
                  padding: '6px 10px',
                  fontSize: 12,
                  fontWeight: 800,
                  background: 'white',
                  cursor: 'pointer',
                }}
              >
                Fechar
              </button>
            </div>
            <div
              ref={modalMapRef}
              style={{
                width: '100%',
                height: 'min(72vh, 560px)',
                background: 'rgba(23,26,33,0.08)',
              }}
            />
          </div>
        </div>
      ) : null}
    </>
  )
}

