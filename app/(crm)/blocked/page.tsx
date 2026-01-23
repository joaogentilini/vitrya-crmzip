'use client'

import { useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import { Button } from '@/components/ui/Button'
import { Card, CardContent } from '@/components/ui/Card'

export default function BlockedPage() {
  const router = useRouter()

  const handleSignOut = useCallback(async () => {
    await supabase.auth.signOut()
    router.push('/')
  }, [router])

  return (
    <div className="min-h-screen bg-[var(--background)] flex items-center justify-center p-4">
      <Card className="max-w-md w-full">
        <CardContent className="pt-6 text-center space-y-4">
          <div className="w-16 h-16 mx-auto rounded-full bg-[var(--destructive)]/10 flex items-center justify-center">
            <svg className="w-8 h-8 text-[var(--destructive)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
            </svg>
          </div>
          
          <h1 className="text-xl font-semibold text-[var(--foreground)]">
            Acesso Desativado
          </h1>
          
          <p className="text-[var(--muted-foreground)]">
            Sua conta foi desativada. Entre em contato com o administrador do sistema para reativar seu acesso.
          </p>
          
          <Button onClick={handleSignOut} variant="outline" className="w-full">
            Sair da Conta
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
