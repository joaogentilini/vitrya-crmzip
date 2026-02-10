/* eslint-disable @next/next/no-img-element */
'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { ReactNode, useState, useCallback, useEffect, useMemo } from 'react'
import { Button } from '@/components/ui/Button'

interface NavItem {
  href: string
  label: string
  icon: ReactNode
  children?: NavItem[]
}

interface AppShellProps {
  children: ReactNode
  themeCss?: ReactNode
  userEmail?: string | null
  userRole?: string | null // 'admin' | 'gestor' | 'corretor'...
  onSignOut?: () => void
  pageTitle?: string
  showNewLeadButton?: boolean
  onNewLead?: () => void
}

/** =========================
 *  THEME EDITOR (local)
 *  ========================= */
type ThemeVarSpec = {
  label: string
  cssVar: string // ex: '--sidebar-bg'
  kind: 'bg' | 'text' | 'border' | 'button' | 'other'
  /** quando true, deixa o alpha controlável (rgba). */
  allowAlpha?: boolean
  /** dica curta que aparece embaixo */
  hint?: string
}

const THEME_STORAGE_KEY = 'vitrya_theme_overrides_v1'

const THEME_DEFAULTS: Record<string, string> = {
  '--background': '#f7f7f8',
  '--foreground': '#171A21',

  '--card': 'rgba(255,255,255,0.88)',
  '--border': 'rgba(23,26,33,0.10)',
  '--accent': 'rgba(23,26,33,0.06)',
  '--ring': 'rgba(23,190,187,0.55)',

  '--secondary': 'rgba(23,26,33,0.10)',
  '--secondary-foreground': '#171A21',
  '--muted-foreground': 'rgba(23,26,33,0.65)',

  // Sidebar
  '--sidebar-bg': 'rgba(10,12,16,0.70)',
  '--sidebar-muted': 'rgba(255,255,255,0.80)',
  '--sidebar-hover': 'rgba(255,255,255,0.10)',
  '--sidebar-active': 'rgba(255,104,31,0.85)',

  // Topbar (CRM)
  '--topbar-bg': 'rgba(255,255,255,0.82)',
}

const THEME_SPECS: ThemeVarSpec[] = [
  { label: 'Fundo geral do CRM', cssVar: '--background', kind: 'bg' },
  { label: 'Texto padrão', cssVar: '--foreground', kind: 'text' },
  { label: 'Cards (fundo)', cssVar: '--card', kind: 'bg', allowAlpha: true },
  { label: 'Bordas (geral)', cssVar: '--border', kind: 'border', allowAlpha: true },
  { label: 'Hover/Accent (geral)', cssVar: '--accent', kind: 'bg', allowAlpha: true },
  { label: 'Ring/Focus', cssVar: '--ring', kind: 'other', allowAlpha: true },
  { label: 'Texto “muted”', cssVar: '--muted-foreground', kind: 'text', allowAlpha: true },

  { label: 'Sidebar: Fundo', cssVar: '--sidebar-bg', kind: 'bg', allowAlpha: true, hint: 'Painel lateral (menu).' },
  { label: 'Sidebar: Texto (labels)', cssVar: '--sidebar-muted', kind: 'text', allowAlpha: true, hint: 'Se sumir texto, ajuste aqui.' },
  { label: 'Sidebar: Hover', cssVar: '--sidebar-hover', kind: 'bg', allowAlpha: true },
  { label: 'Sidebar: Ativo', cssVar: '--sidebar-active', kind: 'button', allowAlpha: true, hint: 'Item selecionado (ativo).' },

  { label: 'Topbar do CRM (fundo)', cssVar: '--topbar-bg', kind: 'bg', allowAlpha: true },
]

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n))
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const v = hex.replace('#', '').trim()
  if (v.length === 3) {
    const r = parseInt(v[0] + v[0], 16)
    const g = parseInt(v[1] + v[1], 16)
    const b = parseInt(v[2] + v[2], 16)
    return { r, g, b }
  }
  if (v.length === 6) {
    const r = parseInt(v.slice(0, 2), 16)
    const g = parseInt(v.slice(2, 4), 16)
    const b = parseInt(v.slice(4, 6), 16)
    return { r, g, b }
  }
  return null
}

function parseCssColorToHexAndAlpha(input: string): { hex: string; alpha: number } {
  const s = (input || '').trim()

  // rgba(r,g,b,a)
  const rgba = s.match(/rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)(?:[,\s/]+([\d.]+))?\s*\)/i)
  if (rgba) {
    const r = clamp(Number(rgba[1]), 0, 255)
    const g = clamp(Number(rgba[2]), 0, 255)
    const b = clamp(Number(rgba[3]), 0, 255)
    const a = rgba[4] !== undefined ? clamp(Number(rgba[4]), 0, 1) : 1
    const hex =
      '#' +
      [r, g, b]
        .map((x) => x.toString(16).padStart(2, '0'))
        .join('')
        .toUpperCase()
    return { hex, alpha: a }
  }

  // #RRGGBB or #RGB
  if (s.startsWith('#')) return { hex: s.toUpperCase(), alpha: 1 }

  // fallback
  return { hex: '#FFFFFF', alpha: 1 }
}

function applyCssVar(cssVar: string, value: string) {
  if (typeof document === 'undefined') return
  document.documentElement.style.setProperty(cssVar, value)
}

function getCssVar(cssVar: string) {
  if (typeof document === 'undefined') return ''
  return getComputedStyle(document.documentElement).getPropertyValue(cssVar).trim()
}

function loadThemeOverrides(): Record<string, string> {
  if (typeof window === 'undefined') return {}
  try {
    const raw = window.localStorage.getItem(THEME_STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return {}
    return parsed
  } catch {
    return {}
  }
}

function saveThemeOverrides(overrides: Record<string, string>) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify(overrides))
}

function resetThemeOverrides() {
  if (typeof window === 'undefined') return
  window.localStorage.removeItem(THEME_STORAGE_KEY)
}

function ThemeEditorPanel({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const [overrides, setOverrides] = useState<Record<string, string>>({})

  // carregar overrides + aplicar
  useEffect(() => {
    const o = loadThemeOverrides()
    setOverrides(o)
    for (const [k, v] of Object.entries(o)) applyCssVar(k, v)
  }, [])

  const updateVar = useCallback(
    (cssVar: string, nextValue: string) => {
      const next = { ...overrides, [cssVar]: nextValue }
      setOverrides(next)
      saveThemeOverrides(next)
      applyCssVar(cssVar, nextValue)
    },
    [overrides]
  )

  const handleReset = useCallback(() => {
    resetThemeOverrides()
    setOverrides({})
    // reaplica defaults seguros
    for (const [k, v] of Object.entries(THEME_DEFAULTS)) applyCssVar(k, v)
  }, [])

  if (!open) return null

  return (
    <>
      <div className="fixed inset-0 z-[60] bg-black/40" onClick={onClose} aria-hidden="true" />
      <div
        className="fixed right-4 top-16 z-[61] w-[360px] max-w-[92vw] rounded-2xl border border-white/15 bg-black/60 text-white shadow-2xl backdrop-blur-xl"
        role="dialog"
        aria-label="Editor de Tema"
      >
        <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
          <div className="flex flex-col">
            <span className="text-sm font-semibold">Editor de Cores (Tema)</span>
            <span className="text-xs text-white/70">Ajuste ao vivo • Salva no navegador</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleReset}
              className="px-3 py-1.5 text-xs font-semibold rounded-full bg-white/10 hover:bg-white/15 border border-white/10"
            >
              Reset
            </button>
            <button
              type="button"
              onClick={onClose}
              className="w-8 h-8 grid place-items-center rounded-full bg-white/10 hover:bg-white/15 border border-white/10"
              aria-label="Fechar"
            >
              ✕
            </button>
          </div>
        </div>

        <div className="max-h-[68vh] overflow-auto p-3 space-y-2">
          {THEME_SPECS.map((spec) => {
            const current = overrides[spec.cssVar] ?? getCssVar(spec.cssVar) ?? THEME_DEFAULTS[spec.cssVar] ?? ''
            const parsed = parseCssColorToHexAndAlpha(current)
            const alphaPct = Math.round(parsed.alpha * 100)

            return (
              <div key={spec.cssVar} className="rounded-xl border border-white/10 bg-white/5 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold">{spec.label}</div>
                    <div className="text-[11px] text-white/70 mt-0.5">
                      <span className="font-mono">{spec.cssVar}</span>
                      {spec.hint ? <span className="text-white/60"> • {spec.hint}</span> : null}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={parsed.hex}
                      onChange={(e) => {
                        const hex = e.target.value
                        const rgb = hexToRgb(hex)
                        if (!rgb) return updateVar(spec.cssVar, hex)
                        if (spec.allowAlpha) {
                          updateVar(spec.cssVar, `rgba(${rgb.r},${rgb.g},${rgb.b},${parsed.alpha})`)
                        } else {
                          updateVar(spec.cssVar, hex)
                        }
                      }}
                      className="w-10 h-10 rounded-lg overflow-hidden bg-transparent border border-white/10"
                      aria-label={`Selecionar cor: ${spec.label}`}
                    />
                  </div>
                </div>

                {spec.allowAlpha ? (
                  <div className="mt-3">
                    <div className="flex items-center justify-between text-xs text-white/70">
                      <span>Translucidez</span>
                      <span className="font-mono">{alphaPct}%</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={alphaPct}
                      onChange={(e) => {
                        const pct = clamp(Number(e.target.value), 0, 100)
                        const a = pct / 100
                        const rgb = hexToRgb(parsed.hex)
                        if (!rgb) return
                        updateVar(spec.cssVar, `rgba(${rgb.r},${rgb.g},${rgb.b},${a})`)
                      }}
                      className="w-full mt-1"
                      aria-label={`Translucidez: ${spec.label}`}
                    />
                  </div>
                ) : null}

                <div className="mt-2 text-[11px] text-white/70">
                  Atual: <span className="font-mono text-white/85">{current || '(vazio)'}</span>
                </div>
              </div>
            )
          })}
        </div>

        <div className="px-4 py-3 border-t border-white/10 text-xs text-white/70">
          Dica: se “sumirem letras” na sidebar, ajuste <span className="font-mono text-white/85">--sidebar-muted</span>.
        </div>
      </div>
    </>
  )
}

export function AppShell({
  children,
  themeCss,
  userEmail,
  userRole,
  onSignOut,
  pageTitle,
  showNewLeadButton = true,
  onNewLead,
}: AppShellProps) {
  const pathname = usePathname()
  const router = useRouter()

  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const [themeOpen, setThemeOpen] = useState(false)

  const isManager = useMemo(() => userRole === 'admin' || userRole === 'gestor', [userRole])

  /** Defaults seguros + aplicar overrides salvos */
  useEffect(() => {
    if (typeof document === 'undefined') return

    // garante defaults (evita vars vazias quebrando cor)
    const style = getComputedStyle(document.documentElement)
    for (const [k, v] of Object.entries(THEME_DEFAULTS)) {
      const cur = style.getPropertyValue(k).trim()
      if (!cur) document.documentElement.style.setProperty(k, v)
    }

    // aplica overrides locais
    const overrides = loadThemeOverrides()
    for (const [k, v] of Object.entries(overrides)) applyCssVar(k, v)
  }, [])

  const navItems: NavItem[] = useMemo(() => {
    const items: NavItem[] = [
      {
        href: '/dashboard',
        label: 'Dashboard',
        icon: (
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
            />
          </svg>
        ),
      },

      {
        href: '/leads',
        label: 'Leads',
        icon: (
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"
            />
          </svg>
        ),
        children: [
          {
            href: '/leads',
            label: 'Lista de Leads',
            icon: (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            ),
          },
          {
            href: '/leads/kanban',
            label: 'Kanban',
            icon: (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2"
                />
              </svg>
            ),
          },
        ],
      },

      {
        href: '/agenda',
        label: 'Agenda',
        icon: (
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
            />
          </svg>
        ),
      },

      {
        href: '/pessoas',
        label: 'Pessoas',
        icon: (
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"
            />
          </svg>
        ),
      },

      {
        href: '/groups',
        label: 'Grupos',
        icon: (
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M17 20H7v-1a5 5 0 0110 0v1zm0-10a4 4 0 10-8 0 4 4 0 008 0zM3 20v-1a4 4 0 016-3.874M21 20v-1a4 4 0 00-6-3.874"
            />
          </svg>
        ),
      },

      {
        href: '/properties',
        label: 'Imóveis',
        icon: (
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
            />
          </svg>
        ),
        children: [
          {
            href: '/properties',
            label: 'Todos os imóveis',
            icon: (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
                />
              </svg>
            ),
          },
          {
            href: '/properties/my',
            label: 'Meus imóveis',
            icon: (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                />
              </svg>
            ),
          },
          {
            href: '/properties/new',
            label: 'Novo imóvel',
            icon: (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
            ),
          },
          {
            href: '/campaigns',
            label: 'Campanhas',
            icon: (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-2v13" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 19V8l6-1v12" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 19h18" />
              </svg>
            ),
          },
        ],
      },

      {
        href: '/settings',
        label: 'Configurações',
        icon: (
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
            />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        ),
        children: [
          {
            href: '/settings/users',
            label: 'Usuários',
            icon: (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"
                />
              </svg>
            ),
          },
          {
            href: '/settings/catalogs',
            label: 'Catálogos',
            icon: (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
                />
              </svg>
            ),
          },
          {
            href: '/settings/automations',
            label: 'Automações',
            icon: (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            ),
          },

          ...(isManager
            ? [
                {
                  href: '/settings/campaigns',
                  label: 'Editor de Campanhas',
                  icon: (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-2v13" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 19V8l6-1v12" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 19h18" />
                    </svg>
                  ),
                },
              ]
            : []),
        ],
      },
    ]

    return items
  }, [isManager])

  const [settingsOpen, setSettingsOpen] = useState(() => pathname?.startsWith('/settings') || false)
  const [leadsOpen, setLeadsOpen] = useState(() => pathname?.startsWith('/leads') || false)
  const [propertiesOpen, setPropertiesOpen] = useState(
    () => pathname?.startsWith('/properties') || pathname?.startsWith('/campaigns') || false
  )

  const closeSidebar = useCallback(() => setSidebarOpen(false), [])
  const closeUserMenu = useCallback(() => setUserMenuOpen(false), [])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeSidebar()
        closeUserMenu()
        setThemeOpen(false)
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [closeSidebar, closeUserMenu])

  const handleNewLead = useCallback(() => {
    if (onNewLead) onNewLead()
    else router.push('/leads#new')
  }, [onNewLead, router])

  const topCenterLabel = useMemo(() => pageTitle || 'CRM', [pageTitle])
  const topCenterClass = 'text-xl font-semibold tracking-wide text-[var(--foreground)]'

  return (
    <>
      {themeCss}
      <div className="min-h-screen flex bg-[var(--background)] overflow-x-hidden">
      <aside
        className={`
          fixed inset-y-0 left-0 z-30 w-64
          bg-[var(--sidebar-bg)]
          transform transition-transform duration-200 ease-in-out
          lg:translate-x-0 lg:static lg:inset-auto
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
          flex flex-col
          border-r border-white/10
          backdrop-blur-xl
        `}
        style={{
          // fallback caso as vars estejam estranhas
          background: 'var(--sidebar-bg, rgba(10,12,16,0.70))',
        }}
        role="navigation"
        aria-label="Menu principal"
      >
        <div className="h-14 flex items-center px-4 border-b border-white/10">
          <Link
            href="/dashboard"
            className="flex items-center gap-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] rounded-[var(--radius)]"
            onClick={closeSidebar}
          >
            <img src="/brand/logo_oficial.png" alt="Vitrya" className="h-10 w-auto object-contain" loading="eager" />
          </Link>
        </div>

        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const isActive = pathname === item.href || pathname?.startsWith(item.href + '/')
            const hasChildren = !!item.children?.length

            const isParentActive =
              pathname?.startsWith(item.href + '/') ||
              pathname === item.href ||
              (item.href === '/settings' && pathname?.startsWith('/settings')) ||
              (item.href === '/properties' && (pathname?.startsWith('/properties') || pathname?.startsWith('/campaigns'))) ||
              (item.href === '/leads' && pathname?.startsWith('/leads'))

            if (hasChildren) {
              const isSettings = item.href === '/settings'
              const isProperties = item.href === '/properties'
              const isLeads = item.href === '/leads'

              const isOpen = isSettings ? settingsOpen : isProperties ? propertiesOpen : isLeads ? leadsOpen : false
              const setOpen = isSettings ? setSettingsOpen : isProperties ? setPropertiesOpen : isLeads ? setLeadsOpen : () => {}

              return (
                <div key={item.href}>
                  <button
                    type="button"
                    onClick={() => setOpen(!isOpen)}
                    className={`
                      w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-[var(--radius)] text-sm font-medium
                      transition-all duration-150
                      focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]
                      ${
                        isParentActive
                          ? 'bg-[var(--sidebar-hover)] text-white'
                          : 'text-[var(--sidebar-muted)] hover:bg-[var(--sidebar-hover)] hover:text-white'
                      }
                    `}
                    style={{
                      color: isParentActive ? 'white' : 'var(--sidebar-muted, rgba(255,255,255,0.80))',
                    }}
                    aria-expanded={isOpen}
                    aria-controls={`submenu-${item.href}`}
                  >
                    <span className="flex items-center gap-3">
                      {item.icon}
                      {item.label}
                    </span>
                    <svg
                      className={`w-4 h-4 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      aria-hidden="true"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>

                  {isOpen && (
                    <div id={`submenu-${item.href}`} className="mt-1 ml-4 space-y-1">
                      {item.children!.map((child) => {
                        const isChildActive = pathname === child.href
                        const isChildParentActive = pathname?.startsWith(child.href + '/')

                        return (
                          <Link
                            key={child.href}
                            href={child.href}
                            onClick={closeSidebar}
                            aria-current={isChildActive ? 'page' : undefined}
                            className={`
                              flex items-center gap-3 px-3 py-2 rounded-[var(--radius)] text-sm font-medium
                              transition-all duration-150
                              focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]
                              ${
                                isChildActive || isChildParentActive
                                  ? 'bg-[var(--sidebar-active)] text-white shadow-sm'
                                  : 'text-[var(--sidebar-muted)] hover:bg-[var(--sidebar-hover)] hover:text-white'
                              }
                            `}
                            style={{
                              color: isChildActive || isChildParentActive ? 'white' : 'var(--sidebar-muted, rgba(255,255,255,0.80))',
                            }}
                          >
                            {child.icon}
                            {child.label}
                          </Link>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            }

            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={closeSidebar}
                aria-current={isActive ? 'page' : undefined}
                className={`
                  flex items-center gap-3 px-3 py-2.5 rounded-[var(--radius)] text-sm font-medium
                  transition-all duration-150
                  focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]
                  ${
                    isActive
                      ? 'bg-[var(--sidebar-active)] text-white shadow-sm'
                      : isParentActive
                        ? 'bg-[var(--sidebar-hover)] text-white'
                        : 'text-[var(--sidebar-muted)] hover:bg-[var(--sidebar-hover)] hover:text-white'
                  }
                `}
                style={{
                  color: isActive || isParentActive ? 'white' : 'var(--sidebar-muted, rgba(255,255,255,0.80))',
                }}
              >
                {item.icon}
                {item.label}
              </Link>
            )
          })}
        </nav>

        <div className="p-3 border-t border-white/10 space-y-2">
          {showNewLeadButton && (
            <Button size="sm" onClick={handleNewLead} className="w-full">
              <svg className="w-4 h-4 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Novo Lead
            </Button>
          )}

          {/* Botão do Theme Editor (só admin/gestor) */}
          {isManager && (
            <button
              type="button"
              onClick={() => setThemeOpen(true)}
              className="w-full px-3 py-2 text-sm font-semibold rounded-xl bg-white/10 hover:bg-white/15 border border-white/10 text-white"
            >
              🎨 Ajustar Cores (Tema)
            </button>
          )}
        </div>
      </aside>

      {sidebarOpen && <div className="fixed inset-0 z-20 bg-black/50 lg:hidden" onClick={closeSidebar} aria-hidden="true" />}

      <div className="flex-1 flex flex-col min-w-0 overflow-x-hidden">
        <header
          className="sticky top-0 z-40 h-14 border-b border-[var(--border)] flex items-center px-4 gap-4 relative"
          style={{
            background: 'var(--topbar-bg, var(--card, rgba(255,255,255,0.88)))',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
          }}
        >
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="lg:hidden p-2 rounded-[var(--radius)] hover:bg-[var(--accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
              aria-label="Abrir menu"
              aria-expanded={sidebarOpen}
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>

            {/* Atalho rápido do tema no topo (opcional) */}
            {isManager && (
              <button
                type="button"
                onClick={() => setThemeOpen(true)}
                className="hidden sm:inline-flex items-center gap-2 px-3 py-1.5 text-sm font-semibold rounded-full border border-[var(--border)] hover:bg-[var(--accent)]"
                aria-label="Abrir editor de tema"
              >
                🎨 Tema
              </button>
            )}
          </div>

          <div className="absolute left-1/2 -translate-x-1/2 pointer-events-none">
            <span className={topCenterClass}>{topCenterLabel}</span>
          </div>

          <div className="flex-1" />

          <Link
            href="/imoveis"
            className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-[var(--foreground)] hover:bg-[var(--accent)] rounded-[var(--radius)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            Vitrine
          </Link>

          {showNewLeadButton && (
            <Button size="sm" onClick={handleNewLead} className="hidden sm:inline-flex">
              <svg className="w-4 h-4 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Novo Lead
            </Button>
          )}

          {userEmail && (
            <div className="relative">
              <button
                type="button"
                onClick={() => setUserMenuOpen(!userMenuOpen)}
                className="flex items-center gap-2 p-1.5 rounded-[var(--radius)] hover:bg-[var(--accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                aria-label="Menu do usuário"
                aria-expanded={userMenuOpen}
              >
                <div className="w-8 h-8 rounded-full bg-[var(--secondary)] text-[var(--secondary-foreground)] flex items-center justify-center text-sm font-medium">
                  {userEmail.charAt(0).toUpperCase()}
                </div>
                <svg className="w-4 h-4 text-[var(--muted-foreground)] hidden sm:block" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {userMenuOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setUserMenuOpen(false)} />
                  <div className="absolute right-0 top-full mt-2 w-56 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] shadow-lg z-50">
                    <div className="p-3 border-b border-[var(--border)]">
                      <p className="text-sm font-medium text-[var(--foreground)] truncate">{userEmail}</p>
                    </div>
                    <div className="p-1">
                      {onSignOut && (
                        <button
                          type="button"
                          onClick={() => {
                            setUserMenuOpen(false)
                            onSignOut()
                          }}
                          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-[var(--foreground)] hover:bg-[var(--accent)] rounded-[var(--radius)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                            />
                          </svg>
                          Sair
                        </button>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </header>

        <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-x-hidden">
          <div className="max-w-[1280px] mx-auto w-full">{children}</div>
        </main>
      </div>

      {/* Theme Editor */}
      {isManager && (
        <ThemeEditorPanel open={themeOpen} onClose={() => setThemeOpen(false)} />
      )}
      </div>
    </>
  )
}
