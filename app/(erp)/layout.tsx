export const dynamic = 'force-dynamic'
export const revalidate = 0

import { ReactNode } from 'react'
import { redirect } from 'next/navigation'
import { AppShell } from '@/components/layout/AppShell'
import { createClient } from '@/lib/supabaseServer'
import { CRM_THEME_BASE_VARS } from '@/lib/theme/getCrmTheme'

interface ErpLayoutProps {
  children: ReactNode
}

export default async function ErpLayout({ children }: ErpLayoutProps) {
  const supabase = await createClient()

  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser()

  if (userErr || !user) {
    redirect('/crm/login')
  }

  const { data: profile, error: profileErr } = await supabase
    .from('profiles')
    .select('id, role, is_active')
    .eq('id', user.id)
    .maybeSingle()

  if (profileErr || !profile?.is_active) {
    redirect('/blocked')
  }

  if (!['admin', 'gestor', 'corretor'].includes(String(profile.role))) {
    redirect('/dashboard')
  }

  const onSignOut = async () => {
    'use server'
    const supabase = await createClient()
    await supabase.auth.signOut()
    redirect('/crm/login')
  }

  const themeCss = `:root{\n${Object.entries(CRM_THEME_BASE_VARS)
    .map(([k, v]) => `${k}:${v};`)
    .join('\n')}\n}`

  return (
    <AppShell
      themeCss={themeCss ? <style dangerouslySetInnerHTML={{ __html: themeCss }} /> : null}
      userEmail={user.email}
      userRole={profile.role}
      onSignOut={onSignOut}
      pageTitle="ERP"
      showNewLeadButton={false}
    >
      {children}
    </AppShell>
  )
}
