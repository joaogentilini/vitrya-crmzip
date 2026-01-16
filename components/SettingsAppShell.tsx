'use client'

import { ReactNode, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import { AppShell } from '@/components/layout/AppShell'
import { useToast } from '@/components/ui/Toast'

interface SettingsAppShellProps {
  children: ReactNode
  userEmail?: string | null
  pageTitle?: string
}

export function SettingsAppShell({ 
  children, 
  userEmail, 
  pageTitle = 'Configurações'
}: SettingsAppShellProps) {
  const router = useRouter()
  const { success } = useToast()

  const handleSignOut = useCallback(async () => {
    await supabase.auth.signOut()
    success('Você saiu da conta.')
    router.push('/')
  }, [router, success])

  return (
    <AppShell 
      userEmail={userEmail} 
      onSignOut={handleSignOut}
      pageTitle={pageTitle}
      showNewLeadButton={false}
    >
      {children}
    </AppShell>
  )
}
