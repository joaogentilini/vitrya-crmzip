import { createClient } from '@/lib/supabaseServer'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

async function getAdminSupabase() {
  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Missing Supabase service role configuration')
  }
  return createAdminClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  })
}

const CLIENT_TYPES = ['buyer', 'seller', 'tenant', 'landlord', 'investor'] as const
type ClientType = typeof CLIENT_TYPES[number]

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ leadId: string }> }
) {
  const { leadId } = await params

  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('id, role, is_active')
      .eq('id', user.id)
      .single()

    if (!profile || profile.is_active === false) {
      return NextResponse.json({ error: 'Usuário inativo' }, { status: 403 })
    }

    const body = await request.json().catch(() => ({}))
    const {
      types = [],
      personType: rawPersonType,
      cpf,
      rg,
      rgIssuingOrg,
      maritalStatus,
      birthDate,
      cnpj,
      legalName,
      tradeName,
      stateRegistration,
      municipalRegistration
    } = body as {
      types?: string[]
      personType?: 'PF' | 'PJ'
      cpf?: string | null
      rg?: string | null
      rgIssuingOrg?: string | null
      maritalStatus?: string | null
      birthDate?: string | null
      cnpj?: string | null
      legalName?: string | null
      tradeName?: string | null
      stateRegistration?: string | null
      municipalRegistration?: string | null
    }

    const personType = rawPersonType === 'PJ' ? 'PJ' : 'PF'
    const hasProfileData =
      !!cpf ||
      !!rg ||
      !!rgIssuingOrg ||
      !!maritalStatus ||
      !!birthDate ||
      !!cnpj ||
      !!legalName ||
      !!tradeName ||
      !!stateRegistration ||
      !!municipalRegistration

    const validTypes = types.filter((t): t is ClientType => 
      CLIENT_TYPES.includes(t as ClientType)
    )

    const adminSupabase = await getAdminSupabase()

    const { data: lead, error: leadError } = await adminSupabase
      .from('leads')
      .select('*')
      .eq('id', leadId)
      .single()

    if (leadError || !lead) {
      return NextResponse.json({ error: 'Lead não encontrado' }, { status: 404 })
    }

    if (lead.is_converted) {
      return NextResponse.json({ 
        error: 'Lead já foi convertido em cliente',
        client_id: lead.client_id
      }, { status: 400 })
    }

    const isAdminOrGestor = profile.role === 'admin' || profile.role === 'gestor'
    const isOwner = lead.owner_user_id === user.id || lead.assigned_to === user.id || lead.created_by === user.id

    if (!isAdminOrGestor && !isOwner) {
      return NextResponse.json({ 
        error: 'Você não tem permissão para converter este lead' 
      }, { status: 403 })
    }

    let personId = lead.person_id

    if (!personId) {
      // Try to find existing person by phone_e164 first, then by email
      let existingPerson = null

      if (lead.phone_e164) {
        const { data: personByPhone } = await adminSupabase
          .from('people')
          .select('id')
          .eq('phone_e164', lead.phone_e164)
          .single()
        existingPerson = personByPhone
      }

      if (!existingPerson && lead.email) {
        const { data: personByEmail } = await adminSupabase
          .from('people')
          .select('id')
          .ilike('email', lead.email)
          .single()
        existingPerson = personByEmail
      }

      if (existingPerson) {
        personId = existingPerson.id
      } else {
        const documentId = personType === 'PJ' ? cnpj : cpf
        const { data: newPerson, error: personError } = await adminSupabase
          .from('people')
          .insert({
            full_name: lead.client_name || lead.title,
            phone_e164: lead.phone_e164 || null,
            email: lead.email || null,
            notes: lead.notes || null,
            document_id: documentId || null
          })
          .select('id')
          .single()

        if (personError) {
          console.error('[POST /api/leads/[id]/convert] Person creation error:', personError)
          return NextResponse.json({ error: 'Erro ao criar pessoa' }, { status: 500 })
        }

        personId = newPerson.id
      }

      await adminSupabase
        .from('leads')
        .update({ person_id: personId })
        .eq('id', leadId)
    }

    if (personId && hasProfileData) {
      if (personType === 'PF') {
        const { error: financingError } = await adminSupabase
          .from('person_financing_profiles')
          .upsert(
            {
              person_id: personId,
              cpf: cpf || null,
              rg: rg || null,
              rg_issuing_org: rgIssuingOrg || null,
              marital_status: maritalStatus || null,
              birth_date: birthDate || null
            },
            { onConflict: 'person_id' }
          )
        if (financingError) {
          console.error('[POST /api/leads/[id]/convert] Financing profile error:', financingError)
          return NextResponse.json({ error: 'Erro ao salvar dados de PF' }, { status: 500 })
        }
      } else {
        const { error: companyError } = await adminSupabase
          .from('person_company_profiles')
          .upsert(
            {
              person_id: personId,
              cnpj: cnpj || null,
              legal_name: legalName || null,
              trade_name: tradeName || null,
              state_registration: stateRegistration || null,
              municipal_registration: municipalRegistration || null
            },
            { onConflict: 'person_id' }
          )
        if (companyError) {
          console.error('[POST /api/leads/[id]/convert] Company profile error:', companyError)
          return NextResponse.json({ error: 'Erro ao salvar dados de PJ' }, { status: 500 })
        }
      }
    }

    const ownerId = lead.assigned_to || lead.owner_user_id || lead.created_by || user.id
    
    // Build client name from available lead fields (required NOT NULL)
    const clientName = lead.client_name || lead.name || lead.title || 'Cliente (Lead)'

    const { data: existingClient } = await adminSupabase
      .from('clients')
      .select('id, types')
      .eq('person_id', personId)
      .single()

    let clientId: string
    let clientData

    if (existingClient) {
      const mergedTypes = [...new Set([
        ...(existingClient.types || []),
        ...validTypes
      ])]

      const { data: updatedClient, error: updateError } = await adminSupabase
        .from('clients')
        .update({
          name: clientName,
          phone: lead.phone_raw || null,
          phone_e164: lead.phone_e164 || null,
          email: lead.email || null,
          owner_user_id: ownerId,
          status: 'active',
          types: mergedTypes.length > 0 ? mergedTypes : null,
          updated_at: new Date().toISOString()
        })
        .eq('id', existingClient.id)
        .select('*')
        .single()

      if (updateError) {
        console.error('[POST /api/leads/[id]/convert] Client update error:', updateError)
        return NextResponse.json({ error: 'Erro ao atualizar cliente' }, { status: 500 })
      }

      clientId = existingClient.id
      clientData = updatedClient
    } else {
      const { data: newClient, error: clientError } = await adminSupabase
        .from('clients')
        .insert({
          name: clientName,
          phone: lead.phone_raw || null,
          phone_e164: lead.phone_e164 || null,
          email: lead.email || null,
          person_id: personId,
          owner_user_id: ownerId,
          created_by: user.id,
          status: 'active',
          types: validTypes.length > 0 ? validTypes : null
        })
        .select('*')
        .single()

      if (clientError) {
        console.error('[POST /api/leads/[id]/convert] Client creation error:', clientError)
        return NextResponse.json({ error: 'Erro ao criar cliente' }, { status: 500 })
      }

      clientId = newClient.id
      clientData = newClient
    }

    const { data: updatedLead, error: leadUpdateError } = await adminSupabase
      .from('leads')
      .update({
        client_id: clientId,
        is_converted: true,
        converted_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', leadId)
      .select('*')
      .single()

    if (leadUpdateError) {
      console.error('[POST /api/leads/[id]/convert] Lead update error:', leadUpdateError)
      return NextResponse.json({ error: 'Erro ao atualizar lead' }, { status: 500 })
    }

    try {
      await adminSupabase.from('lead_audit_logs').insert({
        lead_id: leadId,
        actor_id: user.id,
        action: 'lead_converted',
        details: {
          client_id: clientId,
          person_id: personId,
          types: validTypes
        }
      })
    } catch (auditErr) {
      console.warn('[POST /api/leads/[id]/convert] Audit log failed:', auditErr)
    }

    const { data: person } = await adminSupabase
      .from('people')
      .select('*')
      .eq('id', personId)
      .single()

    return NextResponse.json({
      success: true,
      lead: updatedLead,
      client: clientData,
      person
    })
  } catch (err) {
    console.error('[POST /api/leads/[id]/convert] Error:', err)
    return NextResponse.json({ error: 'Erro interno do servidor' }, { status: 500 })
  }
}
