'use client'

declare global {
  interface Window {
    google?: any
    __vitryaGoogleMapsInit?: () => void
  }
}

const GOOGLE_SCRIPT_ID = 'vitrya-google-maps-script'
const GOOGLE_CALLBACK_NAME = '__vitryaGoogleMapsInit'

let googleMapsPromise: Promise<any> | null = null

function isGoogleReady() {
  return Boolean(window.google?.maps?.Map && window.google?.maps?.places)
}

export function loadGoogleMapsBrowser(apiKey: string): Promise<any> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Google Maps disponível apenas no navegador.'))
  }

  if (!apiKey) {
    return Promise.reject(new Error('NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY não configurada.'))
  }

  if (isGoogleReady()) {
    return Promise.resolve(window.google)
  }

  if (googleMapsPromise) return googleMapsPromise

  googleMapsPromise = new Promise((resolve, reject) => {
    const settleFromWindow = () => {
      if (isGoogleReady()) {
        resolve(window.google)
        return true
      }
      return false
    }

    if (settleFromWindow()) return

    const existingScript = document.getElementById(GOOGLE_SCRIPT_ID) as HTMLScriptElement | null
    if (existingScript) {
      const onLoad = () => {
        if (!settleFromWindow()) reject(new Error('Google Maps carregou sem objeto global disponível.'))
      }
      const onError = () => reject(new Error('Falha ao carregar script do Google Maps.'))
      existingScript.addEventListener('load', onLoad, { once: true })
      existingScript.addEventListener('error', onError, { once: true })
      return
    }

    window[GOOGLE_CALLBACK_NAME] = () => {
      settleFromWindow()
      delete window[GOOGLE_CALLBACK_NAME]
    }

    const params = new URLSearchParams({
      key: apiKey,
      libraries: 'places',
      language: 'pt-BR',
      region: 'BR',
      callback: GOOGLE_CALLBACK_NAME,
    })

    const script = document.createElement('script')
    script.id = GOOGLE_SCRIPT_ID
    script.async = true
    script.defer = true
    script.src = `https://maps.googleapis.com/maps/api/js?${params.toString()}`
    script.onerror = () => reject(new Error('Falha ao carregar script do Google Maps.'))

    document.head.appendChild(script)
  })

  return googleMapsPromise
}

