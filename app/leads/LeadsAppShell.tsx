'use client'

import { ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import { AppShell } from '@/components/layout/AppShell'
import { useToast } from '@/components/ui/Toast'

interface LeadsAppShellProps {
  children: ReactNode
  userEmail?: string | null
}

export function LeadsAppShell({ children, userEmail }: LeadsAppShellProps) {
  const router = useRouter()
  const { success } = useToast()

  async function handleSignOut() {
    await supabase.auth.signOut()
    success('Você saiu da conta.')
    router.push('/')
  }

  return (
    <AppShell userEmail={userEmail} onSignOut={handleSignOut}>
      {children}
    </AppShell>
  )
}
