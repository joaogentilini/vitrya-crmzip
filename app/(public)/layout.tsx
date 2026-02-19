/* eslint-disable @next/next/no-img-element */
import type { ReactNode } from 'react'
import Link from 'next/link'

import { createPublicClient } from '@/lib/supabase/publicServer'
import { buildWhatsAppLink, sanitizePhone } from '@/lib/whatsapp'

import './public.css'

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

function formatBrazilPhone(raw: string | null) {
  if (!raw) return null
  let digits = raw
  if (digits.startsWith('55') && digits.length >= 12) digits = digits.slice(2)
  if (digits.length === 11) return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`
  if (digits.length === 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`
  return raw
}

function brokerLabel(broker: BrokerRow): string {
  return broker.public_name || broker.full_name || 'Corretor Vitrya'
}

export default async function PublicLayout({ children }: { children: ReactNode }) {
  const envPhone = sanitizePhone(process.env.NEXT_PUBLIC_WHATSAPP_NUMBER)
  const whatsappLink = buildWhatsAppLink(envPhone, 'Ola! Quero falar com o Comercial Vitrya.')
  const formattedPhone = formatBrazilPhone(envPhone)
  const supabase = createPublicClient()

  const [categoriesRes, brokersRes, developersRes, incorporationsRes] = await Promise.all([
    supabase.from('property_categories').select('id,name').eq('is_active', true).order('name', { ascending: true }).limit(8),
    supabase.from('v_public_brokers').select('id,public_name,full_name').order('public_name', { ascending: true }).limit(8),
    supabase.from('developers').select('id,name').eq('is_active', true).order('name', { ascending: true }).limit(6),
    supabase.from('incorporations').select('slug,name').eq('is_active', true).order('created_at', { ascending: false }).limit(6),
  ])

  const categories = (categoriesRes.data || []) as CategoryRow[]
  const brokers = (brokersRes.data || []) as BrokerRow[]
  const developers = (developersRes.data || []) as DeveloperRow[]
  const incorporations = (incorporationsRes.data || []) as IncorporationRow[]

  return (
    <div className="pv-shell">
      <header className="pv-header">
        <div className="pv-header-inner">
          <Link className="pv-brand" href="/imóveis" aria-label="Vitrya Imóveis - Inicio">
            <img src="/brand/logo_oficial.png" alt="Vitrya" className="pv-mark" />
          </Link>

          <nav className="pv-nav" aria-label="Navegacao principal">
            <div className="pv-nav-row">
              <Link className="pv-nav-link" href="/imóveis">
                Inicio
              </Link>

              <div className="pv-nav-dropdown">
                <span className="pv-nav-link pv-nav-trigger">Imóveis</span>
                <div className="pv-nav-panel">
                  <div className="pv-nav-group">
                    <p className="pv-nav-title">Navegar</p>
                    <Link href="/imóveis">Buscar imóveis</Link>
                    <Link href="/imóveis/resultados">Todos os imóveis</Link>
                  </div>
                  {categories.length > 0 ? (
                    <div className="pv-nav-group">
                      <p className="pv-nav-title">Por categoria</p>
                      {categories.map((category) => (
                        <Link key={category.id} href={`/imóveis/resultados?category=${category.id}`}>
                          {category.name || 'Categoria'}
                        </Link>
                      ))}
                    </div>
                  ) : null}
                  <div className="pv-nav-group">
                    <p className="pv-nav-title">Por corretor</p>
                    {brokers.length > 0 ? (
                      brokers.map((broker) => (
                        <Link key={broker.id} href={`/imóveis/resultados?broker=${broker.id}`}>
                          {brokerLabel(broker)}
                        </Link>
                      ))
                    ) : (
                      <span className="pv-nav-empty">Sem corretores publicados</span>
                    )}
                    <Link href="/corretores">Ver todos os corretores</Link>
                  </div>
                </div>
              </div>

              <div className="pv-nav-dropdown">
                <span className="pv-nav-link pv-nav-trigger">Empreendimentos</span>
                <div className="pv-nav-panel">
                  <div className="pv-nav-group">
                    <p className="pv-nav-title">Navegar</p>
                    <Link href="/empreendimentos">Todos os empreendimentos</Link>
                    <Link href="/empreendimentos/construtoras">Construtoras</Link>
                  </div>
                  {developers.length > 0 ? (
                    <div className="pv-nav-group">
                      <p className="pv-nav-title">Por construtora</p>
                      {developers.map((developer) => (
                        <Link key={developer.id} href={`/empreendimentos?developer=${developer.id}`}>
                          {developer.name}
                        </Link>
                      ))}
                    </div>
                  ) : null}
                  {incorporations.length > 0 ? (
                    <div className="pv-nav-group">
                      <p className="pv-nav-title">Empreendimentos em destaque</p>
                      {incorporations.map((incorporation) => (
                        <Link key={incorporation.slug} href={`/empreendimentos/${incorporation.slug}`}>
                          {incorporation.name}
                        </Link>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          </nav>

          <div className="pv-actions">
            <Link className="pv-btn pv-btn-topbar" href="/cliente">
              Acesso Cliente
            </Link>
            <Link className="pv-btn pv-btn-topbar" href="/crm/login">
              Acesso Corretor
            </Link>
          </div>
        </div>
      </header>

      <div className="pv-main">{children}</div>

      <footer className="pv-footer">
        <div className="pv-footer-inner" style={{ alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <strong>Comercial Vitrya</strong>
            <span className="pv-footer-sep">/</span>
            <span>{formattedPhone ?? 'WhatsApp indisponivel'}</span>
          </div>

          {whatsappLink ? (
            <a className="pv-btn pv-btn-secondary" href={whatsappLink} target="_blank" rel="noreferrer" style={{ padding: '10px 14px', fontWeight: 900 }}>
              WhatsApp
            </a>
          ) : null}
        </div>
      </footer>
    </div>
  )
}
