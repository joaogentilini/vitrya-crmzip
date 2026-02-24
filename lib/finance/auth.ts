import { createClient } from '@/lib/supabaseServer'

type ManagerContextSuccess = {
  ok: true
  userId: string
  role: 'admin' | 'gestor'
}

type ManagerContextError = {
  ok: false
  status: 401 | 403
  error: string
}

export type ManagerContext = ManagerContextSuccess | ManagerContextError

export async function getManagerContext(): Promise<ManagerContext> {
  const supabase = await createClient()

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser()

  if (authError || !user) {
    return { ok: false, status: 401, error: 'Não autenticado.' }
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role, is_active')
    .eq('id', user.id)
    .maybeSingle()

  if (profileError || !profile) {
    return { ok: false, status: 403, error: 'Perfil não encontrado.' }
  }

  if (!profile.is_active) {
    return { ok: false, status: 403, error: 'Usuário inativo.' }
  }

  if (profile.role !== 'admin' && profile.role !== 'gestor') {
    return { ok: false, status: 403, error: 'Acesso permitido apenas para admin/gestor.' }
  }

  return {
    ok: true,
    userId: user.id,
    role: profile.role,
  }
}
