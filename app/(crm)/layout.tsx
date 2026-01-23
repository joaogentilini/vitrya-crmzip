export const dynamic = 'force-dynamic'
export const revalidate = 0

import { ReactNode } from 'react'
import { redirect } from 'next/navigation'
import { AppShell } from '@/components/layout/AppShell'
import { createClient } from '@/lib/supabaseServer'

interface CrmLayoutProps {
  children: ReactNode
}

export default async function CrmLayout({ children }: CrmLayoutProps) {
  const supabase = await createClient()

  // 1) precisa estar logado
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser()

  if (userErr || !user) {
    redirect('/crm/login')
  }

  // 2) buscar profile para checar se está ativo + pegar role para o sidebar
  const { data: profile, error: profileErr } = await supabase
    .from('profiles')
    .select('id, role, is_active')
    .eq('id', user.id)
    .maybeSingle()

  // Se der erro ao buscar profile, trate como bloqueio (segurança)
  if (profileErr || !profile?.is_active) {
    redirect('/blocked')
  }

  // 3) sign out (server-side)
  const onSignOut = async () => {
    'use server'
    const supabase = await createClient()
    await supabase.auth.signOut()
    redirect('/crm/login')
  }

  return (
    <AppShell
      userEmail={user.email}
      userRole={profile.role} // ✅ necessário para mostrar "Editor de Campanhas" só admin/gestor
      onSignOut={onSignOut}
    >
      {children}
    </AppShell>
  )
}
