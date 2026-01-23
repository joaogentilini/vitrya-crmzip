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
  userEmail?: string | null
  userRole?: string | null // ✅ novo: 'admin' | 'gestor' | 'corretor'...
  onSignOut?: () => void
  pageTitle?: string
  showNewLeadButton?: boolean
  onNewLead?: () => void
}

export function AppShell({
  children,
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

  const isManager = useMemo(() => userRole === 'admin' || userRole === 'gestor', [userRole])

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

      // ✅ Leads agrupado
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
        href: '/people',
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

      // ✅ Imóveis + Campanhas dentro
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

      // ✅ Configurações com Editor de Campanhas somente admin/gestor
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

          // ✅ Só admin/gestor vê
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

  // ✅ estado dos accordions (abre automaticamente)
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
    <div className="min-h-screen flex bg-[var(--background)] overflow-x-hidden">
      <aside
        className={`
          fixed inset-y-0 left-0 z-30 w-64 bg-[var(--sidebar-bg)]
          transform transition-transform duration-200 ease-in-out
          lg:translate-x-0 lg:static lg:inset-auto
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
          flex flex-col
        `}
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
            const isActive = pathname === item.href
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
              >
                {item.icon}
                {item.label}
              </Link>
            )
          })}
        </nav>

        <div className="p-3 border-t border-white/10">
          {showNewLeadButton && (
            <Button size="sm" onClick={handleNewLead} className="w-full">
              <svg className="w-4 h-4 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Novo Lead
            </Button>
          )}
        </div>
      </aside>

      {sidebarOpen && <div className="fixed inset-0 z-20 bg-black/50 lg:hidden" onClick={closeSidebar} aria-hidden="true" />}

      <div className="flex-1 flex flex-col min-w-0 overflow-x-hidden">
        <header className="sticky top-0 z-40 h-14 border-b border-[var(--border)] bg-[var(--card)] flex items-center px-4 gap-4 relative">
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
    </div>
  )
}
