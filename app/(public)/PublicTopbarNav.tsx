'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'

type CategoryRow = {
  id: string
  name: string | null
}

type BrokerRow = {
  id: string
  public_name: string | null
  full_name: string | null
}

type DeveloperRow = {
  id: string
  name: string
}

type IncorporationRow = {
  slug: string
  name: string
}

type PublicTopbarNavProps = {
  categories: CategoryRow[]
  brokers: BrokerRow[]
  developers: DeveloperRow[]
  incorporations: IncorporationRow[]
}

function brokerLabel(broker: BrokerRow): string {
  return broker.public_name || broker.full_name || 'Corretor Vitrya'
}

export function PublicTopbarNav({
  categories,
  brokers,
  developers,
  incorporations,
}: PublicTopbarNavProps) {
  const rootRef = useRef<HTMLDivElement | null>(null)
  const [openMenu, setOpenMenu] = useState<'imoveis' | 'empreendimentos' | null>(null)

  useEffect(() => {
    function handleDocumentClick(event: MouseEvent) {
      const target = event.target as Node | null
      if (!target) return
      if (!rootRef.current?.contains(target)) {
        setOpenMenu(null)
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpenMenu(null)
    }

    document.addEventListener('mousedown', handleDocumentClick)
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('mousedown', handleDocumentClick)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [])

  function toggleMenu(menu: 'imoveis' | 'empreendimentos') {
    setOpenMenu((current) => (current === menu ? null : menu))
  }

  function closeMenu() {
    setOpenMenu(null)
  }

  return (
    <nav className="pv-nav" aria-label="Navegação principal" ref={rootRef}>
      <div className="pv-nav-row">
        <Link className="pv-nav-link" href="/imoveis" onClick={closeMenu}>
          Início
        </Link>

        <div className={`pv-nav-dropdown ${openMenu === 'imoveis' ? 'is-open' : ''}`}>
          <button
            type="button"
            className="pv-nav-link pv-nav-trigger-btn"
            onClick={() => toggleMenu('imoveis')}
            aria-expanded={openMenu === 'imoveis'}
            aria-haspopup="true"
            aria-controls="pv-nav-imoveis"
          >
            Imóveis
          </button>
          <div className="pv-nav-panel" id="pv-nav-imoveis">
            <div className="pv-nav-group">
              <p className="pv-nav-title">Navegar</p>
              <Link href="/imoveis" onClick={closeMenu}>
                Buscar imóveis
              </Link>
              <Link href="/imoveis/resultados" onClick={closeMenu}>
                Todos os imóveis
              </Link>
            </div>
            {categories.length > 0 ? (
              <div className="pv-nav-group">
                <p className="pv-nav-title">Por tipo</p>
                {categories.map((category) => (
                  <Link key={category.id} href={`/imoveis/resultados?category=${category.id}`} onClick={closeMenu}>
                    {category.name || 'Categoria'}
                  </Link>
                ))}
              </div>
            ) : null}
            <div className="pv-nav-group">
              <p className="pv-nav-title">Por corretor</p>
              {brokers.length > 0 ? (
                brokers.map((broker) => (
                  <Link key={broker.id} href={`/imoveis/resultados?broker=${broker.id}`} onClick={closeMenu}>
                    {brokerLabel(broker)}
                  </Link>
                ))
              ) : (
                <span className="pv-nav-empty">Sem corretores publicados</span>
              )}
              <Link href="/corretores" onClick={closeMenu}>
                Ver todos os corretores
              </Link>
            </div>
          </div>
        </div>

        <div className={`pv-nav-dropdown ${openMenu === 'empreendimentos' ? 'is-open' : ''}`}>
          <button
            type="button"
            className="pv-nav-link pv-nav-trigger-btn"
            onClick={() => toggleMenu('empreendimentos')}
            aria-expanded={openMenu === 'empreendimentos'}
            aria-haspopup="true"
            aria-controls="pv-nav-empreendimentos"
          >
            Empreendimentos
          </button>
          <div className="pv-nav-panel" id="pv-nav-empreendimentos">
            <div className="pv-nav-group">
              <p className="pv-nav-title">Navegar</p>
              <Link href="/empreendimentos" onClick={closeMenu}>
                Todos os empreendimentos
              </Link>
              <Link href="/empreendimentos/construtoras" onClick={closeMenu}>
                Construtoras
              </Link>
            </div>
            {developers.length > 0 ? (
              <div className="pv-nav-group">
                <p className="pv-nav-title">Por construtora</p>
                {developers.map((developer) => (
                  <Link key={developer.id} href={`/empreendimentos?developer=${developer.id}`} onClick={closeMenu}>
                    {developer.name}
                  </Link>
                ))}
              </div>
            ) : null}
            {incorporations.length > 0 ? (
              <div className="pv-nav-group">
                <p className="pv-nav-title">Em destaque</p>
                {incorporations.map((incorporation) => (
                  <Link key={incorporation.slug} href={`/empreendimentos/${incorporation.slug}`} onClick={closeMenu}>
                    {incorporation.name}
                  </Link>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </nav>
  )
}
