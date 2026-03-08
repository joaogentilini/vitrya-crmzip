import { Suspense } from 'react'
import { requireActiveUser } from '@/lib/auth/server'
import { createClient } from '@/lib/supabase/server'
import { OperacionalClient } from './OperacionalClient'
import { OperacionalSkeleton } from './components/OperacionalSkeleton'

export const metadata = {
  title: 'Painel Operacional | Vitrya CRM',
}

async function getOperacionalData(userId: string, isManager: boolean, filterBrokerId?: string) {
  const supabase = await createClient()

  // Usar filterBrokerId se gestor filtrou um broker específico
  const effectiveUserId = filterBrokerId && isManager ? filterBrokerId : userId

  try {
    const [
      kpiData,
      conversationsData,
      portalLeadsData,
      integrationStatusData,
      profilesData,
    ] = await Promise.all([
      // KPI Data
      supabase
        .from('leads')
        .select('id', { count: 'exact' })
        .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
        .then(({ count: newLeads }) => ({
          newLeads: newLeads || 0,
        }))
        .then(async (kpi) => {
          const { count: openConversations } = await supabase
            .from('chat_conversations')
            .select('id', { count: 'exact' })
            .in('status', ['open', 'pending'])
            .eq('broker_user_id', effectiveUserId)
          const { count: pendingMessages } = await supabase
            .from('chat_messages')
            .select('id', { count: 'exact' })
            .eq('direction', 'inbound')
            .gte('created_at', new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString())
          const { count: closedDeals } = await supabase
            .from('property_proposals')
            .select('id', { count: 'exact' })
            .eq('status', 'approved')
            .gte('updated_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
          return {
            newLeads: kpi.newLeads,
            openConversations: openConversations || 0,
            pendingMessages: pendingMessages || 0,
            closedDeals: closedDeals || 0,
          }
        }),

      // Conversas Unificadas
      supabase
        .from('chat_conversations')
        .select(`
          id,
          channel,
          status,
          subject,
          last_message_at,
          last_message_preview,
          lead_id,
          person_id,
          property_id,
          leads(id, title),
          people(id, full_name),
          properties(id, title)
        `)
        .eq('broker_user_id', effectiveUserId)
        .in('status', ['open', 'pending'])
        .order('last_message_at', { ascending: false })
        .limit(50)
        .then(({ data, error }) => {
          if (error) {
            console.error('Error fetching conversations:', error)
            return []
          }
          return (
            data?.map((conv) => ({
              id: conv.id,
              channel: conv.channel,
              status: conv.status,
              subject: conv.subject,
              lastMessageAt: conv.last_message_at,
              lastMessagePreview: conv.last_message_preview,
              leadId: conv.lead_id,
              personId: conv.person_id,
              propertyId: conv.property_id,
              leadTitle: (conv.leads as any)?.title,
              personName: (conv.people as any)?.full_name,
              propertyTitle: (conv.properties as any)?.title,
            })) || []
          )
        }),

      // Portal Leads Pendentes Conversão
      supabase
        .from('portal_lead_links')
        .select(`
          id,
          provider,
          external_lead_id,
          created_at,
          leads(id, title, phone_raw, created_at)
        `)
        .is('property_id', null)
        .neq('leads.status', 'won')
        .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
        .order('created_at', { ascending: false })
        .limit(20)
        .then(({ data, error }) => {
          if (error) {
            console.error('Error fetching portal leads:', error)
            return []
          }
          return (
            data?.map((link) => ({
              id: link.id,
              provider: link.provider,
              externalLeadId: link.external_lead_id,
              createdAt: link.created_at,
              leadId: (link.leads as any)?.id,
              leadTitle: (link.leads as any)?.title,
              phoneRaw: (link.leads as any)?.phone_raw,
            })) || []
          )
        }),

      // Integration Status
      supabase
        .from('portal_integrations')
        .select('provider, is_enabled')
        .then(({ data, error }) => {
          if (error) return {}
          const status: Record<string, boolean> = {
            evolution: true, // Assume habilitado se está rodando
            olx: false,
            grupoolx: false,
            meta: false,
          }
          data?.forEach((integration) => {
            status[integration.provider] = integration.is_enabled
          })
          return status
        }),

      // Perfis para dropdown (se gestor)
      isManager
        ? supabase
            .from('profiles')
            .select('id, email, full_name')
            .eq('role', 'corretor')
            .then(({ data }) => data || [])
        : Promise.resolve([]),
    ])

    return {
      kpis: kpiData,
      conversations: conversationsData,
      portalLeads: portalLeadsData,
      integrations: integrationStatusData,
      profiles: profilesData,
    }
  } catch (error) {
    console.error('Error fetching operacional data:', error)
    return {
      kpis: { newLeads: 0, openConversations: 0, pendingMessages: 0, closedDeals: 0 },
      conversations: [],
      portalLeads: [],
      integrations: {},
      profiles: [],
    }
  }
}

interface OperacionalPageProps {
  searchParams?: { broker?: string }
}

export default async function OperacionalPage({ searchParams }: OperacionalPageProps) {
  const user = await requireActiveUser()
  const isManager = user.role === 'admin' || user.role === 'gestor'
  const filterBrokerId = searchParams?.broker

  const data = await getOperacionalData(user.id, isManager, filterBrokerId)

  return (
    <Suspense fallback={<OperacionalSkeleton />}>
      <OperacionalClient
        user={user}
        data={data}
        isManager={isManager}
        filterBrokerId={filterBrokerId}
        profiles={data.profiles}
      />
    </Suspense>
  )
}
