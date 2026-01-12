'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ReactNode, useState } from 'react'

interface NavItem {
  href: string
  label: string
  icon: ReactNode
}

const navItems: NavItem[] = [
  {
    href: '/leads',
    label: 'Leads',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
  },
  {
    href: '/leads/kanban',
    label: 'Kanban',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
      </svg>
    ),
  },
]

interface AppShellProps {
  children: ReactNode
  userEmail?: string | null
  onSignOut?: () => void
}

export function AppShell({ children, userEmail, onSignOut }: AppShellProps) {
  const pathname = usePathname()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <div className="min-h-screen bg-[var(--background)]">
      <header className="sticky top-0 z-40 border-b border-[var(--border)] bg-[var(--card)]">
        <div className="flex h-14 items-center px-4 gap-4">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="lg:hidden p-2 rounded-[var(--radius)] hover:bg-[var(--accent)]"
            aria-label="Toggle menu"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>

          <Link href="/leads" className="flex items-center gap-2 font-semibold text-lg">
            <span className="text-[var(--primary)]">Vitrya</span>
            <span className="text-[var(--muted-foreground)]">CRM</span>
          </Link>

          <div className="flex-1" />

          {userEmail && (
            <div className="flex items-center gap-3">
              <span className="text-sm text-[var(--muted-foreground)] hidden sm:inline">
                {userEmail}
              </span>
              {onSignOut && (
                <button
                  onClick={onSignOut}
                  className="text-sm px-3 py-1.5 rounded-[var(--radius)] hover:bg-[var(--accent)] text-[var(--muted-foreground)]"
                >
                  Sair
                </button>
              )}
            </div>
          )}
        </div>
      </header>

      <div className="flex">
        <aside
          className={`
            fixed inset-y-0 left-0 z-30 w-64 bg-[var(--card)] border-r border-[var(--border)]
            transform transition-transform duration-200 ease-in-out
            lg:translate-x-0 lg:static lg:inset-auto
            ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
            pt-14 lg:pt-0
          `}
        >
          <nav className="p-4 space-y-1">
            {navItems.map((item) => {
              const isActive = pathname === item.href || pathname?.startsWith(item.href + '/')
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setSidebarOpen(false)}
                  className={`
                    flex items-center gap-3 px-3 py-2 rounded-[var(--radius)] text-sm font-medium
                    transition-colors
                    ${isActive
                      ? 'bg-[var(--primary)] text-[var(--primary-foreground)]'
                      : 'text-[var(--muted-foreground)] hover:bg-[var(--accent)] hover:text-[var(--accent-foreground)]'
                    }
                  `}
                >
                  {item.icon}
                  {item.label}
                </Link>
              )
            })}
          </nav>
        </aside>

        {sidebarOpen && (
          <div
            className="fixed inset-0 z-20 bg-black/50 lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        <main className="flex-1 p-6 lg:p-8 min-h-[calc(100vh-3.5rem)]">
          {children}
        </main>
      </div>
    </div>
  )
}
