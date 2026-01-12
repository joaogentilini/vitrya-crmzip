'use client'

import { ReactNode, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import { AppShell } from '@/components/layout/AppShell'
import { useToast } from '@/components/ui/Toast'

interface LeadsAppShellProps {
  children: ReactNode
  userEmail?: string | null
  pageTitle?: string
  showNewLeadButton?: boolean
}

export function LeadsAppShell({ 
  children, 
  userEmail, 
  pageTitle,
  showNewLeadButton = true 
}: LeadsAppShellProps) {
  const router = useRouter()
  const { success } = useToast()

  const handleSignOut = useCallback(async () => {
    await supabase.auth.signOut()
    success('Você saiu da conta.')
    router.push('/')
  }, [router, success])

  const handleNewLead = useCallback(() => {
    router.push('/leads#new')
    setTimeout(() => {
      const form = document.querySelector('[data-lead-form]')
      if (form) {
        form.scrollIntoView({ behavior: 'smooth' })
        const input = form.querySelector('input')
        if (input) input.focus()
      }
    }, 100)
  }, [router])

  return (
    <AppShell 
      userEmail={userEmail} 
      onSignOut={handleSignOut}
      pageTitle={pageTitle}
      showNewLeadButton={showNewLeadButton}
      onNewLead={handleNewLead}
    >
      {children}
    </AppShell>
  )
}
