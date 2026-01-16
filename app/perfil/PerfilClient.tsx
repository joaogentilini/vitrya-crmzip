'use client'

import { useState, useTransition, useCallback, FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import { AppShell } from '@/components/layout/AppShell'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Label } from '@/components/ui/Label'
import { useToast } from '@/components/ui/Toast'

interface PerfilClientProps {
  userId: string
  userEmail?: string | null
  initialFullName: string
  initialPhone?: string | null
  role: string
}

const roleLabels: Record<string, string> = {
  admin: 'Administrador',
  gestor: 'Gestor',
  corretor: 'Corretor',
}

export function PerfilClient({ userId, userEmail, initialFullName, initialPhone, role }: PerfilClientProps) {
  const router = useRouter()
  const { success, error: showError } = useToast()
  const [isPending, startTransition] = useTransition()
  
  const [fullName, setFullName] = useState(initialFullName || '')
  const [phone, setPhone] = useState(initialPhone || '')

  const handleSignOut = useCallback(async () => {
    await supabase.auth.signOut()
    success('Você saiu da conta.')
    router.push('/')
  }, [router, success])

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    
    if (!fullName.trim()) {
      showError('Nome completo é obrigatório')
      return
    }

    startTransition(async () => {
      try {
        const { error } = await supabase
          .from('profiles')
          .update({
            full_name: fullName.trim(),
            phone_e164: phone.trim() || null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', userId)

        if (error) {
          throw new Error(error.message)
        }

        success('Perfil atualizado com sucesso!')
        router.refresh()
      } catch (err) {
        showError(err instanceof Error ? err.message : 'Erro ao salvar perfil')
      }
    })
  }

  return (
    <AppShell
      userEmail={userEmail}
      onSignOut={handleSignOut}
      pageTitle="Meu Perfil"
      showNewLeadButton={false}
    >
      <div className="max-w-2xl space-y-6">
        <div>
          <h2 className="text-lg font-semibold text-[var(--foreground)]">Meu Perfil</h2>
          <p className="text-sm text-[var(--muted-foreground)]">
            Atualize suas informações pessoais
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Informações Pessoais</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="fullName">Nome Completo *</Label>
                <Input
                  id="fullName"
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Seu nome completo"
                  disabled={isPending}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="phone">Telefone</Label>
                <Input
                  id="phone"
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+55 11 99999-9999"
                  disabled={isPending}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={userEmail || ''}
                  disabled
                  readOnly
                  className="bg-[var(--muted)] cursor-not-allowed"
                />
                <p className="text-xs text-[var(--muted-foreground)]">
                  O email não pode ser alterado
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="role">Função</Label>
                <Input
                  id="role"
                  type="text"
                  value={roleLabels[role] || role}
                  disabled
                  readOnly
                  className="bg-[var(--muted)] cursor-not-allowed"
                />
                <p className="text-xs text-[var(--muted-foreground)]">
                  A função é definida pelo administrador
                </p>
              </div>

              <div className="pt-4">
                <Button type="submit" loading={isPending}>
                  <svg className="w-4 h-4 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Salvar
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  )
}
