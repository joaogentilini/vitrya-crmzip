import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabaseServer'
import { createAdminClient } from '@/lib/supabase/admin'

type ActorProfile = {
  id: string
  role: 'admin' | 'gestor' | 'corretor'
  is_active: boolean
}

async function validateAdminOrGestor() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, role, is_active')
    .eq('id', user.id)
    .maybeSingle()

  const actorProfile = profile as ActorProfile | null
  if (!actorProfile || actorProfile.is_active === false) return null
  if (actorProfile.role !== 'admin' && actorProfile.role !== 'gestor') return null

  return { user, profile: actorProfile }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await validateAdminOrGestor()
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params
    const body = await request.json().catch(() => ({}))
    const newPassword = typeof body?.newPassword === 'string' ? body.newPassword.trim() : ''

    if (newPassword.length < 6) {
      return NextResponse.json(
        { error: 'A nova senha deve ter pelo menos 6 caracteres.' },
        { status: 422 }
      )
    }

    const admin = createAdminClient()

    const { data: targetProfile } = await admin
      .from('profiles')
      .select('id, email')
      .eq('id', id)
      .maybeSingle()

    if (!targetProfile) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const { error: updateAuthError } = await admin.auth.admin.updateUserById(id, {
      password: newPassword,
    })

    if (updateAuthError) {
      return NextResponse.json(
        { error: updateAuthError.message || 'Falha ao atualizar senha.' },
        { status: 400 }
      )
    }

    await admin.from('user_audit_logs').insert({
      actor_id: auth.user.id,
      target_user_id: id,
      action: 'password_reset_in_app',
      details: { target_email: targetProfile.email || null },
    })

    return NextResponse.json({
      success: true,
      message: 'Senha atualizada com sucesso.',
    })
  } catch (err) {
    console.error('[POST /api/admin/users/[id]/reset-password] Error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
