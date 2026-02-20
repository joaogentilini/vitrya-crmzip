'use client'

import { useEffect, useMemo, useRef, useState } from 'react'

import { loadGoogleMapsBrowser } from '@/components/maps/googleMapsBrowserLoader'
import type { PropertyLocationSource } from '@/lib/maps/types'

type MapPickerValue = {
  lat: number | null
  lng: number | null
  placeId?: string | null
  formattedAddress?: string | null
  source?: PropertyLocationSource | null
}

type MapPickerProps = {
  value: MapPickerValue
  disabled?: boolean
  onChange: (next: MapPickerValue) => void
}

const DEFAULT_CENTER = { lat: -13.058, lng: -55.9047 } // MT/BR central

function toFinite(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function toLatLngLiteral(value: MapPickerValue) {
  const lat = toFinite(value.lat)
  const lng = toFinite(value.lng)
  if (lat === null || lng === null) return null
  return { lat, lng }
}

export default function MapPicker({ value, disabled, onChange }: MapPickerProps) {
  const apiKey = String(process.env.NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY || '').trim()
  const containerRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const mapRef = useRef<any>(null)
  const markerRef = useRef<any>(null)
  const autocompleteRef = useRef<any>(null)
  const dragListenerRef = useRef<any>(null)
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [query, setQuery] = useState(value.formattedAddress || '')

  const currentLatLng = useMemo(() => toLatLngLiteral(value), [value])

  useEffect(() => {
    setQuery(value.formattedAddress || '')
  }, [value.formattedAddress])

  useEffect(() => {
    if (!apiKey || !containerRef.current) return

    let active = true
    setLoading(true)
    setLoadError(null)

    loadGoogleMapsBrowser(apiKey)
      .then((google) => {
        if (!active || !containerRef.current) return

        const initialCenter = currentLatLng || DEFAULT_CENTER
        if (!mapRef.current) {
          mapRef.current = new google.maps.Map(containerRef.current, {
            center: initialCenter,
            zoom: currentLatLng ? 16 : 5,
            mapTypeControl: false,
            fullscreenControl: false,
            streetViewControl: false,
          })
        }

        if (!markerRef.current) {
          markerRef.current = new google.maps.Marker({
            map: mapRef.current,
            position: initialCenter,
            draggable: !disabled,
            title: 'Localização do imóvel',
          })
        } else {
          markerRef.current.setDraggable(!disabled)
          markerRef.current.setPosition(initialCenter)
        }

        mapRef.current.setCenter(initialCenter)

        if (dragListenerRef.current) {
          google.maps.event.removeListener(dragListenerRef.current)
          dragListenerRef.current = null
        }

        dragListenerRef.current = markerRef.current.addListener('dragend', () => {
          if (disabled) return
          const pos = markerRef.current?.getPosition?.()
          const lat = Number(pos?.lat?.())
          const lng = Number(pos?.lng?.())
          if (!Number.isFinite(lat) || !Number.isFinite(lng)) return
          onChange({
            ...value,
            lat,
            lng,
            source: 'manual_pin',
          })
        })

        if (inputRef.current && !autocompleteRef.current) {
          autocompleteRef.current = new google.maps.places.Autocomplete(inputRef.current, {
            fields: ['geometry', 'formatted_address', 'place_id'],
            componentRestrictions: { country: 'br' },
          })

          autocompleteRef.current.addListener('place_changed', () => {
            if (disabled) return
            const place = autocompleteRef.current.getPlace()
            const lat = Number(place?.geometry?.location?.lat?.())
            const lng = Number(place?.geometry?.location?.lng?.())
            if (!Number.isFinite(lat) || !Number.isFinite(lng)) return

            const next = { lat, lng }
            mapRef.current?.setCenter(next)
            mapRef.current?.setZoom(17)
            markerRef.current?.setPosition(next)

            const formattedAddress = String(place?.formatted_address || '').trim() || null
            setQuery(formattedAddress || '')

            onChange({
              ...value,
              lat,
              lng,
              placeId: String(place?.place_id || '').trim() || null,
              formattedAddress,
              source: 'autocomplete',
            })
          })
        }

        setLoading(false)
      })
      .catch((err) => {
        if (!active) return
        setLoadError(err instanceof Error ? err.message : 'Falha ao carregar Google Maps.')
        setLoading(false)
      })

    return () => {
      active = false
    }
  }, [apiKey, currentLatLng, disabled, onChange, value])

  const handleUseMyLocation = () => {
    if (disabled) return
    if (!navigator.geolocation) {
      setLoadError('Seu navegador não suporta geolocalização.')
      return
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = Number(position.coords.latitude)
        const lng = Number(position.coords.longitude)
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
          setLoadError('Não foi possível obter coordenadas válidas do dispositivo.')
          return
        }

        const next = { lat, lng }
        mapRef.current?.setCenter(next)
        mapRef.current?.setZoom(17)
        markerRef.current?.setPosition(next)

        const google = window.google
        if (!google?.maps?.Geocoder) {
          onChange({
            ...value,
            lat,
            lng,
            source: 'device_gps',
          })
          return
        }

        const geocoder = new google.maps.Geocoder()
        geocoder.geocode({ location: next }, (results: any[] | null, status: string) => {
          const first = status === 'OK' && Array.isArray(results) ? results[0] : null
          const formattedAddress = String(first?.formatted_address || '').trim() || null
          if (formattedAddress) setQuery(formattedAddress)
          onChange({
            ...value,
            lat,
            lng,
            formattedAddress,
            source: 'device_gps',
          })
        })
      },
      (error) => {
        const message =
          error.code === error.PERMISSION_DENIED
            ? 'Permissão de localização negada.'
            : 'Não foi possível usar a localização do dispositivo.'
        setLoadError(message)
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      }
    )
  }

  return (
    <div className="space-y-3 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--card)] p-3">
      <div className="flex flex-wrap items-end gap-2">
        <label className="min-w-[240px] flex-1 text-xs text-[var(--muted-foreground)]">
          Buscar endereço (Google Places)
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            disabled={disabled || !apiKey}
            placeholder={apiKey ? 'Digite rua, bairro, cidade...' : 'Configure NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY'}
            className="mt-1 w-full rounded-[var(--radius)] border border-[var(--input)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)]"
          />
        </label>
        <button
          type="button"
          onClick={handleUseMyLocation}
          disabled={disabled || loading || !apiKey}
          className="rounded-[var(--radius)] border border-[var(--border)] px-3 py-2 text-sm text-[var(--foreground)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          Usar minha localização agora
        </button>
      </div>

      <div
        ref={containerRef}
        className="h-[300px] w-full overflow-hidden rounded-[var(--radius)] border border-[var(--border)] bg-[var(--muted)]/40"
      />

      <div className="flex flex-wrap items-center gap-3 text-xs text-[var(--muted-foreground)]">
        <span>Lat: {value.lat ?? '-'}</span>
        <span>Lng: {value.lng ?? '-'}</span>
        <span>Origem: {value.source || '-'}</span>
      </div>

      {!apiKey ? (
        <p className="text-xs text-amber-700">
          Defina <code>NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY</code> para habilitar autocomplete e mapa interativo.
        </p>
      ) : null}
      {loading ? <p className="text-xs text-[var(--muted-foreground)]">Carregando mapa...</p> : null}
      {loadError ? <p className="text-xs text-[var(--destructive)]">{loadError}</p> : null}
    </div>
  )
}

