import type { ReactNode } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { unstable_cache } from 'next/cache'

import { createPublicClient } from '@/lib/supabase/publicServer'
import { buildWhatsAppLink, sanitizePhone } from '@/lib/whatsapp'
import { PublicTopbarNav } from './PublicTopbarNav'

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

type PublicLayoutNavigationData = {
  categories: CategoryRow[]
  brokers: BrokerRow[]
  developers: DeveloperRow[]
  incorporations: IncorporationRow[]
}

export const revalidate = 300
const VITRYA_WHATSAPP_NUMBER = '556692533011'

function formatBrazilPhone(raw: string | null) {
  if (!raw) return null
  let digits = raw
  if (digits.startsWith('55') && digits.length >= 12) digits = digits.slice(2)
  if (digits.length === 11) return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`
  if (digits.length === 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`
  return raw
}

const getPublicLayoutNavigation = unstable_cache(
  async (): Promise<PublicLayoutNavigationData> => {
    const supabase = createPublicClient()

    const [categoriesRes, brokersRes, developersRes, incorporationsRes] = await Promise.all([
      supabase.from('property_categories').select('id,name').eq('is_active', true).order('name', { ascending: true }).limit(8),
      supabase.from('v_public_brokers').select('id,public_name,full_name').order('public_name', { ascending: true }).limit(8),
      supabase.from('developers').select('id,name').eq('is_active', true).order('name', { ascending: true }).limit(6),
      supabase.from('incorporations').select('slug,name').eq('is_active', true).order('created_at', { ascending: false }).limit(6),
    ])

    return {
      categories: (categoriesRes.data || []) as CategoryRow[],
      brokers: (brokersRes.data || []) as BrokerRow[],
      developers: (developersRes.data || []) as DeveloperRow[],
      incorporations: (incorporationsRes.data || []) as IncorporationRow[],
    }
  },
  ['public-layout-navigation-v1'],
  { revalidate: 300 }
)

export default async function PublicLayout({ children }: { children: ReactNode }) {
  const envPhone = sanitizePhone(process.env.NEXT_PUBLIC_WHATSAPP_NUMBER)
  const whatsappPhone = sanitizePhone(VITRYA_WHATSAPP_NUMBER) || envPhone
  const whatsappLink = buildWhatsAppLink(whatsappPhone, 'Olá! Quero falar com o Comercial Vitrya.')
  const formattedPhone = formatBrazilPhone(whatsappPhone)

  const { categories, brokers, developers, incorporations } = await getPublicLayoutNavigation()

  return (
    <div className="pv-shell">
      <header className="pv-header">
        <div className="pv-header-inner">
          <Link className="pv-brand" href="/imoveis" aria-label="Vitrya Imóveis - Início">
            <Image
              src="/brand/logo_oficial.png"
              alt="Vitrya"
              className="pv-mark"
              width={216}
              height={72}
              priority
              sizes="216px"
            />
          </Link>

          <PublicTopbarNav
            categories={categories}
            brokers={brokers}
            developers={developers}
            incorporations={incorporations}
          />

          <div className="pv-actions">
            <Link className="pv-nav-link pv-action-link" href="/cliente">
              Acesso Cliente
            </Link>
            <Link className="pv-nav-link pv-action-link" href="/crm/login">
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
            <span>{formattedPhone ?? 'WhatsApp indisponível'}</span>
            <span className="pv-footer-sep">/</span>
            <div className="pv-footer-links">
              <Link href="/privacidade">Privacidade</Link>
              <Link href="/termos">Termos</Link>
            </div>
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


