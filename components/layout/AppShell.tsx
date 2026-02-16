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

type AppNotification = {
  id: string
  kind: 'proposal_pending' | 'proposal_draft' | 'lead_new' | 'lead_followup'
  title: string
  message: string
  href: string
  created_at: string
  priority: 'high' | 'medium' | 'low'
  channels?: Array<'app' | 'whatsapp_planned'>
}

const THEME_STORAGE_KEY = 'vitrya_theme_overrides_v1'
const READ_NOTIFICATIONS_STORAGE_PREFIX = 'vitrya_notifications_read_v1'
const LAYOUT_V2_RAIL_COLLAPSED_STORAGE_KEY = 'vitrya_layout_v2_rail_collapsed_v1'

const THEME_DEFAULTS: Record<string, string> = {
  '--background': '#FAFAFA',
  '--foreground': '#171A21',

  '--card': '#ffffff',
  '--border': '#e2e8f0',
  '--accent': '#f1f5f9',
  '--ring': '#FF681F',

  '--secondary': '#294487',
  '--secondary-foreground': '#ffffff',
  '--muted-foreground': '#64748b',

  // Sidebar
  '--sidebar-bg': '#171A21',
  '--sidebar-muted': 'rgba(255,255,255,0.5)',
  '--sidebar-hover': 'rgba(255,255,255,0.10)',

  // Ativo (CRM padrao)
  '--sidebar-active': '#FF681F',

  // Ativo (ERP cobalt) + "current" (não sobrescreve tema salvo)
  '--sidebar-active-erp': 'rgba(59,130,246,0.85)',
  '--sidebar-active-current': 'rgba(255,104,31,0.85)',

  // Topbar (CRM)
  '--topbar-bg': 'rgba(255,255,255,0.82)',
}

function applyCssVar(cssVar: string, value: string) {
  if (typeof document === 'undefined') return
  document.documentElement.style.setProperty(cssVar, value)
}

function getCssVar(cssVar: string) {
  if (typeof document === 'undefined') return ''
  return getComputedStyle(document.documentElement).getPropertyValue(cssVar).trim()
}

function resetThemeOverrides() {
  if (typeof window === 'undefined') return
  window.localStorage.removeItem(THEME_STORAGE_KEY)
}

function formatRelativeTime(iso: string) {
  const ts = Date.parse(iso)
  if (!Number.isFinite(ts)) return 'agora'

  const deltaMs = Date.now() - ts
  const mins = Math.floor(deltaMs / (1000 * 60))
  if (mins < 1) return 'agora'
  if (mins < 60) return `${mins}m atrás`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h atrás`
  const days = Math.floor(hours / 24)
  return `${days}d atrás`
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
  const layoutV2Enabled = process.env.NEXT_PUBLIC_LAYOUT_V2 !== '0'

  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [railCollapsed, setRailCollapsed] = useState(false)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [notificationsLoading, setNotificationsLoading] = useState(false)
  const [notificationsError, setNotificationsError] = useState<string | null>(null)
  const [notifications, setNotifications] = useState<AppNotification[]>([])
  const [readNotificationIds, setReadNotificationIds] = useState<string[]>([])

  const isManager = useMemo(() => userRole === 'admin' || userRole === 'gestor', [userRole])
  const isBroker = useMemo(() => userRole === 'corretor', [userRole])
  const canAccessErp = useMemo(() => isManager || isBroker, [isManager, isBroker])
  const isErpMode = useMemo(() => (pathname ? pathname === '/erp' || pathname.startsWith('/erp/') : false), [pathname])
  const isRailCollapsed = layoutV2Enabled && railCollapsed
  const sidebarDesktopWidthClass = isRailCollapsed ? 'lg:w-20' : layoutV2Enabled ? 'lg:w-72' : 'lg:w-64'
  const sidebarMobileWidthClass = layoutV2Enabled ? 'w-72' : 'w-64'

  /** Defaults seguros e limpeza de overrides antigos do editor de tema */
  useEffect(() => {
    if (typeof document === 'undefined') return

    // força o tema base em toda sessão para evitar restos de customização antiga.
    for (const [k, v] of Object.entries(THEME_DEFAULTS)) {
      document.documentElement.style.setProperty(k, v)
    }

    // editor removido: limpa overrides locais legados para manter o tema padrao.
    resetThemeOverrides()
  }, [])

  // Mantem visual unico entre CRM e ERP: item ativo usa sempre a cor padrao do CRM.
  useEffect(() => {
    if (typeof document === 'undefined') return

    const crmActive = getCssVar('--sidebar-active') || THEME_DEFAULTS['--sidebar-active']
    applyCssVar('--sidebar-active-current', crmActive)
  }, [])

  useEffect(() => {
    if (!layoutV2Enabled || typeof window === 'undefined') return
    const persisted = window.localStorage.getItem(LAYOUT_V2_RAIL_COLLAPSED_STORAGE_KEY)
    setRailCollapsed(persisted === '1')
  }, [layoutV2Enabled])

  const loadNotifications = useCallback(
    async (silent = false) => {
      if (!userEmail) return
      if (!silent) setNotificationsLoading(true)
      setNotificationsError(null)

      try {
        const res = await fetch('/api/notifications?limit=25', {
          method: 'GET',
          cache: 'no-store',
          headers: { Accept: 'application/json' },
        })

        if (!res.ok) {
          const err = await res.json().catch(() => ({}))
          throw new Error(err?.error || 'Falha ao carregar notificações.')
        }

        const json = (await res.json()) as { items?: AppNotification[] }
        setNotifications(Array.isArray(json.items) ? json.items : [])
      } catch (err: any) {
        setNotificationsError(err?.message || 'Erro ao carregar notificações.')
      } finally {
        if (!silent) setNotificationsLoading(false)
      }
    },
    [userEmail]
  )

  useEffect(() => {
    if (!userEmail) {
      setNotifications([])
      return
    }

    void loadNotifications()
    const timer = window.setInterval(() => {
      void loadNotifications(true)
    }, 30000)

    return () => window.clearInterval(timer)
  }, [userEmail, loadNotifications])

  useEffect(() => {
    if (!userEmail || typeof window === 'undefined') {
      setReadNotificationIds([])
      return
    }

    const storageKey = `${READ_NOTIFICATIONS_STORAGE_PREFIX}:${userEmail}`
    try {
      const raw = window.localStorage.getItem(storageKey)
      if (!raw) {
        setReadNotificationIds([])
        return
      }
      const parsed = JSON.parse(raw)
      if (!Array.isArray(parsed)) {
        setReadNotificationIds([])
        return
      }
      setReadNotificationIds(parsed.filter((item) => typeof item === 'string'))
    } catch {
      setReadNotificationIds([])
    }
  }, [userEmail])

  const markNotificationAsRead = useCallback(
    (notificationId: string) => {
      if (!notificationId) return
      setReadNotificationIds((prev) => {
        if (prev.includes(notificationId)) return prev
        const next = [notificationId, ...prev].slice(0, 600)
        if (typeof window !== 'undefined' && userEmail) {
          const storageKey = `${READ_NOTIFICATIONS_STORAGE_PREFIX}:${userEmail}`
          try {
            window.localStorage.setItem(storageKey, JSON.stringify(next))
          } catch {
            // ignore quota errors
          }
        }
        return next
      })
    },
    [userEmail]
  )

  const navItems: NavItem[] = useMemo(() => {
    const items: NavItem[] = [
      {
        href: '/dashboard',
        label: 'Dashboard',
        icon: (
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
            />
          </svg>
        ),
      },

      // Atalhos do corretor (perfil financeiro + negociações dele)
      ...(isBroker
        ? [
            {
              href: '/perfil#financeiro',
              label: 'Meu Financeiro',
              icon: (
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-10v1m0 9v1m8-5a8 8 0 11-16 0 8 8 0 0116 0z" />
                </svg>
              ),
            },
            {
              href: '/leads?scope=mine',
              label: 'Minhas Negociações',
              icon: (
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h6l4 4v12a2 2 0 01-2 2z"
                  />
                </svg>
              ),
            },
          ]
        : []),

      {
        href: '/leads',
        label: 'Leads',
        icon: (
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
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
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            ),
          },
          {
            href: '/leads/kanban',
            label: 'Kanban',
            icon: (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
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
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
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
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
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
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
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
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
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
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
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
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
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
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
            ),
          },
          {
            href: '/campaigns',
            label: 'Campanhas',
            icon: (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-2v13" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 19V8l6-1v12" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 19h18" />
              </svg>
            ),
          },
        ],
      },

      // ERP
      ...(canAccessErp
        ? [
            {
              href: '/erp',
              label: 'ERP',
              icon: (
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M20 7h-9M20 12h-9M20 17h-9M7 7h.01M7 12h.01M7 17h.01"
                  />
                </svg>
              ),
              children: [
                {
                  href: '/erp',
                  label: 'Visão geral',
                  icon: (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2 7-7 7 7 2 2M5 10v10h14V10" />
                    </svg>
                  ),
                },
                {
                  href: '/erp/negociacoes',
                  label: 'Negociações',
                  icon: (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h8M8 12h8M8 17h5M5 4h14a2 2 0 012 2v12a2 2 0 01-2 2H5a2 2 0 01-2-2V6a2 2 0 012-2z" />
                    </svg>
                  ),
                },
                {
                  href: '/erp/contratos',
                  label: 'Contratos/Vendas',
                  icon: (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4M7 4h10a2 2 0 012 2v12a2 2 0 01-2 2H7a2 2 0 01-2-2V6a2 2 0 012-2z" />
                    </svg>
                  ),
                },
                {
                  href: '/erp/financeiro',
                  label: isManager ? 'Financeiro' : 'Financeiro (minha carteira)',
                  icon: (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-9V7m0 10v1m8-6a8 8 0 11-16 0 8 8 0 0116 0z" />
                    </svg>
                  ),
                },
                {
                  href: '/erp/relatorios',
                  label: 'Relatórios',
                  icon: (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-6m3 6V7m3 10v-3m4 6H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v12a2 2 0 01-2 2z" />
                    </svg>
                  ),
                },
              ],
            },
          ]
        : []),

      {
        href: '/settings',
        label: 'Configurações',
        icon: (
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
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
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
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
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
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
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
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
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
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
  }, [canAccessErp, isBroker, isManager])

  const [settingsOpen, setSettingsOpen] = useState(() => pathname?.startsWith('/settings') || false)
  const [leadsOpen, setLeadsOpen] = useState(() => pathname?.startsWith('/leads') || false)
  const [propertiesOpen, setPropertiesOpen] = useState(
    () => pathname?.startsWith('/properties') || pathname?.startsWith('/campaigns') || false
  )
  const [erpOpen, setErpOpen] = useState(() => pathname?.startsWith('/erp') || false)

  const closeSidebar = useCallback(() => setSidebarOpen(false), [])
  const closeUserMenu = useCallback(() => setUserMenuOpen(false), [])
  const closeNotifications = useCallback(() => setNotificationsOpen(false), [])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeSidebar()
        closeUserMenu()
        closeNotifications()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [closeSidebar, closeUserMenu, closeNotifications])

  const handleNewLead = useCallback(() => {
    if (onNewLead) onNewLead()
    else router.push('/leads#new')
  }, [onNewLead, router])

  const handleToggleRail = useCallback(() => {
    if (!layoutV2Enabled) return
    setRailCollapsed((prev) => {
      const next = !prev
      if (typeof window !== 'undefined') {
        try {
          window.localStorage.setItem(LAYOUT_V2_RAIL_COLLAPSED_STORAGE_KEY, next ? '1' : '0')
        } catch {
          // ignore storage errors
        }
      }
      return next
    })
  }, [layoutV2Enabled])

  const topCenterLabel = useMemo(() => {
    if (pageTitle) return pageTitle
    return isErpMode ? 'ERP' : 'CRM'
  }, [pageTitle, isErpMode])
  const topbarLogoBaseHeightPx = 14
  const topbarLogoScale = 6
  const unreadNotifications = useMemo(
    () => notifications.filter((item) => !readNotificationIds.includes(item.id)),
    [notifications, readNotificationIds]
  )
  const notificationCount = unreadNotifications.length
  const hasHighPriorityNotification = unreadNotifications.some((item) => item.priority === 'high')
  const showRailLabels = !isRailCollapsed

  return (
    <>
      {themeCss}
      <div className="min-h-screen flex bg-[var(--background)] overflow-x-hidden">
        <aside
          className={`
          fixed inset-y-0 left-0 z-30 ${sidebarMobileWidthClass} ${sidebarDesktopWidthClass}
          bg-[var(--sidebar-bg)]
          transform transition-[transform,width] duration-200 ease-in-out
          lg:translate-x-0 lg:static lg:inset-auto
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
          flex flex-col
          border-r border-white/10
          backdrop-blur-xl
        `}
          style={{
            background: 'var(--sidebar-bg, rgba(10,12,16,0.70))',
          }}
          role="navigation"
          aria-label="Menu principal"
        >
          <div className="h-14 flex items-center justify-center border-b border-white/10">
            <Link
              href="/dashboard"
              className="inline-flex h-full w-full items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] rounded-[var(--radius)]"
              onClick={closeSidebar}
              title={isRailCollapsed ? 'Dashboard' : undefined}
            >
              <span
                className={`uppercase leading-none text-white ${
                  isRailCollapsed ? 'text-sm font-semibold tracking-[0.16em]' : 'text-2xl font-bold tracking-[0.28em]'
                }`}
              >
                CRM
              </span>
            </Link>
          </div>

          <nav className={`flex-1 space-y-1 overflow-y-auto ${isRailCollapsed ? 'p-2' : 'p-3'}`}>
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
                const isErp = item.href === '/erp'

                const isOpen = isSettings
                  ? settingsOpen
                  : isProperties
                    ? propertiesOpen
                    : isLeads
                      ? leadsOpen
                      : isErp
                        ? erpOpen
                        : false
                const setOpen = isSettings
                  ? setSettingsOpen
                  : isProperties
                    ? setPropertiesOpen
                    : isLeads
                      ? setLeadsOpen
                      : isErp
                        ? setErpOpen
                        : () => {}

                if (isRailCollapsed) {
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={closeSidebar}
                      aria-current={isParentActive ? 'page' : undefined}
                      title={item.label}
                      className={`
                      flex items-center justify-center px-3 py-2.5 rounded-[var(--radius)] text-sm font-medium
                      transition-all duration-150
                      focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]
                      ${
                        isParentActive
                          ? 'bg-[var(--sidebar-active-current)] text-white shadow-sm'
                          : 'text-[var(--sidebar-muted)] hover:bg-[var(--sidebar-hover)] hover:text-white'
                      }
                    `}
                      style={{
                        color: isParentActive ? 'white' : 'var(--sidebar-muted, rgba(255,255,255,0.80))',
                      }}
                    >
                      {item.icon}
                      <span className="sr-only">{item.label}</span>
                    </Link>
                  )
                }

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
                        <span>{item.label}</span>
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
                                  ? 'bg-[var(--sidebar-active-current)] text-white shadow-sm'
                                  : 'text-[var(--sidebar-muted)] hover:bg-[var(--sidebar-hover)] hover:text-white'
                              }
                            `}
                              style={{
                                color:
                                  isChildActive || isChildParentActive
                                    ? 'white'
                                    : 'var(--sidebar-muted, rgba(255,255,255,0.80))',
                              }}
                            >
                              {child.icon}
                              <span>{child.label}</span>
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
                  title={!showRailLabels ? item.label : undefined}
                  className={`
                  flex items-center ${showRailLabels ? 'gap-3' : 'justify-center'} px-3 py-2.5 rounded-[var(--radius)] text-sm font-medium
                  transition-all duration-150
                  focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]
                  ${
                    isActive
                      ? 'bg-[var(--sidebar-active-current)] text-white shadow-sm'
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
                  {showRailLabels ? <span>{item.label}</span> : <span className="sr-only">{item.label}</span>}
                </Link>
              )
            })}
          </nav>

          <div className={`border-t border-white/10 space-y-2 ${showRailLabels ? 'p-3' : 'p-2'}`}>
            {showNewLeadButton && (
              <Button
                size="sm"
                onClick={handleNewLead}
                className={showRailLabels ? 'w-full' : 'w-full justify-center px-0'}
                title={!showRailLabels ? 'Novo Lead' : undefined}
              >
                <svg className={`w-4 h-4 ${showRailLabels ? 'mr-1.5' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                {showRailLabels ? <span>Novo Lead</span> : <span className="sr-only">Novo Lead</span>}
              </Button>
            )}
          </div>
        </aside>

        {sidebarOpen && <div className="fixed inset-0 z-20 bg-black/50 lg:hidden" onClick={closeSidebar} aria-hidden="true" />}

        <div className="flex-1 flex flex-col min-w-0 overflow-x-hidden">
          <header
            className="sticky top-0 z-40 h-16 border-b border-[var(--border)] flex items-center px-4 gap-4 relative"
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
              {layoutV2Enabled && (
                <button
                  type="button"
                  onClick={handleToggleRail}
                  className="hidden lg:inline-flex p-2 rounded-[var(--radius)] hover:bg-[var(--accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                  aria-label={isRailCollapsed ? 'Expandir menu lateral' : 'Recolher menu lateral'}
                  title={isRailCollapsed ? 'Expandir menu lateral' : 'Recolher menu lateral'}
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                    {isRailCollapsed ? (
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    ) : (
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 5l-7 7 7 7" />
                    )}
                  </svg>
                </button>
              )}
            </div>

            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none flex items-center justify-center">
              <img
                src="/brand/logo_oficial.png"
                alt={topCenterLabel}
                className="w-auto object-contain"
                style={{
                  height: topbarLogoBaseHeightPx,
                  transform: `scale(${topbarLogoScale})`,
                  transformOrigin: 'center center',
                }}
                loading="eager"
              />
            </div>

            <div className="flex-1" />

            <Link
              href="/imoveis"
              className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-[var(--foreground)] hover:bg-[var(--accent)] rounded-[var(--radius)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <span>Vitrine</span>
            </Link>

            {userEmail && (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => {
                    setNotificationsOpen((prev) => !prev)
                    setUserMenuOpen(false)
                    if (!notifications.length) void loadNotifications()
                  }}
                  className={`relative flex items-center justify-center h-9 w-9 rounded-[var(--radius)] border ${
                    hasHighPriorityNotification ? 'border-amber-400/70' : 'border-[var(--border)]'
                  } bg-[var(--card)] hover:bg-[var(--accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]`}
                  aria-label="Abrir central de notificações"
                  aria-expanded={notificationsOpen}
                >
                  <svg className="w-5 h-5 text-[var(--foreground)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M15 17h5l-1.4-1.4A2 2 0 0118 14.17V11a6 6 0 10-12 0v3.17c0 .53-.21 1.04-.59 1.41L4 17h5m6 0a3 3 0 11-6 0m6 0H9"
                    />
                  </svg>
                  {notificationCount > 0 ? (
                    <span className="absolute -right-1 -top-1 min-w-[1.1rem] h-[1.1rem] px-1 rounded-full bg-[var(--primary)] text-white text-[10px] font-bold leading-[1.1rem] text-center">
                      {notificationCount > 99 ? '99+' : notificationCount}
                    </span>
                  ) : null}
                </button>

                {notificationsOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={closeNotifications} />
                    <div className="absolute right-0 top-full mt-2 w-[min(92vw,25rem)] rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] shadow-lg z-50 overflow-hidden">
                      <div className="p-3 border-b border-[var(--border)] flex items-center justify-between gap-2">
                        <div>
                          <p className="text-sm font-semibold text-[var(--foreground)]">Central de notificações</p>
                          <p className="text-[11px] text-[var(--muted-foreground)]">App ativo - WhatsApp em preparação</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => void loadNotifications()}
                          className="px-2.5 py-1.5 text-xs rounded-[var(--radius)] border border-[var(--border)] hover:bg-[var(--accent)]"
                        >
                          Atualizar
                        </button>
                      </div>

                      <div className="max-h-[420px] overflow-auto">
                        {notificationsLoading && notifications.length === 0 ? (
                          <div className="p-3 text-sm text-[var(--muted-foreground)]">Carregando notificações...</div>
                        ) : null}

                        {notificationsError ? (
                          <div className="p-3 text-sm text-[var(--destructive)] border-b border-[var(--border)]">{notificationsError}</div>
                        ) : null}

                        {!notificationsLoading && notifications.length === 0 ? (
                          <div className="p-4 text-sm text-[var(--muted-foreground)]">Sem pendências no momento.</div>
                        ) : null}

                        {notifications.map((item) => {
                          const isUnread = !readNotificationIds.includes(item.id)
                          return (
                            <Link
                              key={item.id}
                              href={item.href}
                              onClick={() => {
                                markNotificationAsRead(item.id)
                                closeNotifications()
                              }}
                              className="block p-3 border-b border-[var(--border)] last:border-b-0 hover:bg-[var(--accent)]"
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                  <p className="text-sm font-semibold text-[var(--foreground)]">{item.title}</p>
                                  {isUnread ? (
                                    <span className="mt-1 inline-flex items-center rounded-full bg-[var(--primary)]/10 text-[10px] font-bold uppercase tracking-wide text-[var(--primary)] px-2 py-0.5">
                                      Novo
                                    </span>
                                  ) : null}
                                </div>
                                <span
                                  className={`shrink-0 text-[10px] font-bold uppercase tracking-wide ${
                                    item.priority === 'high'
                                      ? 'text-amber-700'
                                      : item.priority === 'medium'
                                      ? 'text-sky-700'
                                      : 'text-[var(--muted-foreground)]'
                                  }`}
                                >
                                  {item.priority}
                                </span>
                              </div>
                              <p className="mt-1 text-xs text-[var(--muted-foreground)]">{item.message}</p>
                              <p className="mt-1 text-[11px] text-[var(--muted-foreground)]">{formatRelativeTime(item.created_at)}</p>
                            </Link>
                          )
                        })}
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}

            {userEmail && (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => {
                    setUserMenuOpen(!userMenuOpen)
                    setNotificationsOpen(false)
                  }}
                  className="flex items-center gap-2 p-1.5 rounded-[var(--radius)] hover:bg-[var(--accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                  aria-label="Menu do usuário"
                  aria-expanded={userMenuOpen}
                >
                  <div className="w-8 h-8 rounded-full bg-[var(--secondary)] text-[var(--secondary-foreground)] flex items-center justify-center text-sm font-medium">
                    <span>{userEmail.charAt(0).toUpperCase()}</span>
                  </div>
                  <svg
                    className="w-4 h-4 text-[var(--muted-foreground)] hidden sm:block"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    aria-hidden="true"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>

                {userMenuOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setUserMenuOpen(false)} />
                    <div className="absolute right-0 top-full mt-2 w-56 rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] shadow-lg z-50">
                      <div className="p-3 border-b border-[var(--border)]">
                        <p className="text-sm font-medium text-[var(--foreground)] truncate">
                          <span>{userEmail}</span>
                        </p>
                      </div>
                      <div className="p-1">
                        <Link
                          href="/perfil"
                          onClick={() => setUserMenuOpen(false)}
                          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-[var(--foreground)] hover:bg-[var(--accent)] rounded-[var(--radius)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M5.121 17.804A9 9 0 1118.88 17.8M15 11a3 3 0 11-6 0 3 3 0 016 0z"
                            />
                          </svg>
                          <span>Minha conta</span>
                        </Link>
                        <Link
                          href="/profile"
                          onClick={() => setUserMenuOpen(false)}
                          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-[var(--foreground)] hover:bg-[var(--accent)] rounded-[var(--radius)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"
                            />
                          </svg>
                          <span>Perfil publico</span>
                        </Link>
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
                            <span>Sair</span>
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

      </div>
    </>
  )
}

