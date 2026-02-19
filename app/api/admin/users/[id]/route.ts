import { createClient } from '@/lib/supabaseServer'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

async function getAdminSupabase() {
  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('[getAdminSupabase] Missing SUPABASE_SERVICE_ROLE_KEY or NEXT_PUBLIC_SUPABASE_URL')
    throw new Error('Missing Supabase service role configuration')
  }
  return createAdminClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  })
}

async function validateAdminOrGestor(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id, role, is_active')
    .eq('id', user.id)
    .single()

  if (profileError) {
    console.error('[validateAdminOrGestor] Profile fetch error:', profileError)
    return null
  }

  if (!profile) return null
  if (profile.is_active === false) return null
  if (profile.role !== 'admin' && profile.role !== 'gestor') return null

  return { user, profile }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = await createClient()
    const authResult = await validateAdminOrGestor(supabase)
    
    if (!authResult) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const adminSupabase = await getAdminSupabase()
    const body = await request.json()
    const {
      role,
      is_active,
      full_name,
      phone_e164,
      broker_commission_level,
      broker_commission_percent,
      company_commission_percent,
      partner_commission_percent,
    } = body

    const updates: Record<string, unknown> = {}
    const auditDetails: Record<string, unknown> = {}

    let { data: currentTargetProfile, error: currentTargetProfileError } = await adminSupabase
      .from('profiles')
      .select(
        'id, role, broker_commission_level, broker_commission_percent, company_commission_percent, partner_commission_percent'
      )
      .eq('id', id)
      .maybeSingle()

    const currentTargetColumnsMissing =
      !!currentTargetProfileError &&
      /broker_commission_level|broker_commission_percent|company_commission_percent|partner_commission_percent|column/i.test(
        currentTargetProfileError.message || ''
      )

    if (currentTargetColumnsMissing) {
      const fallback = await adminSupabase.from('profiles').select('id, role').eq('id', id).maybeSingle()
      currentTargetProfile = fallback.data as any
      currentTargetProfileError = fallback.error
    }

    if (currentTargetProfileError) {
      console.error('[PATCH /api/admin/users/[id]] Target profile fetch error:', currentTargetProfileError)
      return NextResponse.json({ error: 'Failed to load target user' }, { status: 500 })
    }

    if (!currentTargetProfile) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    if (
      currentTargetColumnsMissing &&
      (broker_commission_level !== undefined ||
        broker_commission_percent !== undefined ||
        company_commission_percent !== undefined ||
        partner_commission_percent !== undefined)
    ) {
      return NextResponse.json(
        { error: 'Campos de comissão por corretor indisponiveis. Aplique a migration de perfil de comissão.' },
        { status: 422 }
      )
    }

    const parsePercentInput = (value: unknown, label: string): number => {
      if (typeof value === 'number') {
        if (!Number.isFinite(value)) throw new Error(`${label} inválido.`)
        return value
      }

      if (typeof value === 'string') {
        const normalized = value.trim().replace(',', '.')
        if (!normalized) throw new Error(`${label} inválido.`)
        const parsed = Number(normalized)
        if (!Number.isFinite(parsed)) throw new Error(`${label} inválido.`)
        return parsed
      }

      throw new Error(`${label} inválido.`)
    }

    const hasCommissionInputs =
      broker_commission_level !== undefined ||
      broker_commission_percent !== undefined ||
      company_commission_percent !== undefined ||
      partner_commission_percent !== undefined

    const nextRole = typeof role === 'string' ? role : currentTargetProfile.role
    if (hasCommissionInputs && nextRole !== 'corretor') {
      return NextResponse.json(
        { error: 'Comissão de corretor so pode ser configurada para usuários com role corretor.' },
        { status: 422 }
      )
    }

    if (role !== undefined) {
      if (!['admin', 'gestor', 'corretor'].includes(role)) {
        return NextResponse.json({ error: 'Cargo inválido. Valores aceitos: admin, gestor, corretor' }, { status: 422 })
      }
      if (role === 'admin' && authResult.profile.role !== 'admin') {
        return NextResponse.json({ error: 'Apenas administradores podem atribuir cargo de admin' }, { status: 403 })
      }
      updates.role = role
      auditDetails.role_changed = role
    }

    if (is_active !== undefined) {
      if (id === authResult.user.id) {
        return NextResponse.json({ error: 'Você não pode desativar a si mesmo' }, { status: 400 })
      }
      updates.is_active = is_active
      auditDetails.is_active_changed = is_active
    }

    if (full_name !== undefined) {
      updates.full_name = full_name
      auditDetails.full_name_changed = full_name
    }

    if (phone_e164 !== undefined) {
      updates.phone_e164 = phone_e164 || null
      auditDetails.phone_e164_changed = phone_e164
    }

    try {
      if (broker_commission_level !== undefined) {
        updates.broker_commission_level =
          typeof broker_commission_level === 'string' ? broker_commission_level.trim() || null : null
        auditDetails.broker_commission_level_changed = updates.broker_commission_level
      }

      if (broker_commission_percent !== undefined) {
        const parsed = parsePercentInput(broker_commission_percent, 'Percentual corretor')
        updates.broker_commission_percent = parsed
        auditDetails.broker_commission_percent_changed = parsed
      }

      if (company_commission_percent !== undefined) {
        const parsed = parsePercentInput(company_commission_percent, 'Percentual Vitrya')
        updates.company_commission_percent = parsed
        auditDetails.company_commission_percent_changed = parsed
      }

      if (partner_commission_percent !== undefined) {
        const parsed = parsePercentInput(partner_commission_percent, 'Percentual parceiro')
        updates.partner_commission_percent = parsed
        auditDetails.partner_commission_percent_changed = parsed
      }

      if (hasCommissionInputs || nextRole === 'corretor') {
        const nextBroker =
          broker_commission_percent !== undefined
            ? Number(updates.broker_commission_percent)
            : Number(currentTargetProfile.broker_commission_percent ?? 50)
        const nextCompany =
          company_commission_percent !== undefined
            ? Number(updates.company_commission_percent)
            : Number(currentTargetProfile.company_commission_percent ?? 50)
        const nextPartner =
          partner_commission_percent !== undefined
            ? Number(updates.partner_commission_percent)
            : Number(currentTargetProfile.partner_commission_percent ?? 0)

        const parts = [nextBroker, nextCompany, nextPartner]
        if (parts.some((value) => !Number.isFinite(value) || value < 0 || value > 100)) {
          return NextResponse.json({ error: 'Percentuais de comissão devem estar entre 0 e 100.' }, { status: 422 })
        }

        const total = nextBroker + nextCompany + nextPartner
        if (Math.abs(total - 100) > 0.0001) {
          return NextResponse.json(
            { error: 'A soma de Corretor + Vitrya + Parceiro deve ser 100%.' },
            { status: 422 }
          )
        }
      }
    } catch (validationError) {
      const message = validationError instanceof Error ? validationError.message : 'Dados de comissão inválidos.'
      return NextResponse.json({ error: message }, { status: 422 })
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'Nenhum campo para atualizar' }, { status: 400 })
    }

    updates.updated_at = new Date().toISOString()

    const { data: updatedProfile, error } = await adminSupabase
      .from('profiles')
      .update(updates)
      .eq('id', id)
      .select('id, full_name, email, phone_e164, role, is_active, created_at, updated_at')
      .single()

    if (error) {
      console.error('[PATCH /api/admin/users/[id]] Error:', error)
      return NextResponse.json({ error: 'Failed to update user' }, { status: 500 })
    }

    // Non-blocking audit log - don't fail user update if audit fails
    try {
      const { error: auditError } = await adminSupabase
        .from('user_audit_logs')
        .insert({
          actor_id: authResult.user.id,
          target_user_id: id,
          action: is_active === false ? 'user_deactivated' : 
                  is_active === true ? 'user_activated' : 
                  role ? 'role_changed' : 'user_updated',
          details: auditDetails
        })
      if (auditError) {
        console.warn('[PATCH /api/admin/users/[id]] Audit log failed (non-blocking):', auditError.message)
      }
    } catch (auditErr) {
      console.warn('[PATCH /api/admin/users/[id]] Audit log exception (non-blocking):', auditErr)
    }

    return NextResponse.json({ success: true, user: updatedProfile })
  } catch (err) {
    console.error('[PATCH /api/admin/users/[id]] Error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
