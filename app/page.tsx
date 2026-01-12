'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/Card'
import { useToast } from '@/components/ui/Toast'
import Link from 'next/link'

export default function HomePage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const { success, error: showError } = useToast()

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setUserEmail(data.session?.user?.email ?? null)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserEmail(session?.user?.email ?? null)
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [])

  async function signIn() {
    if (!email || !password) {
      showError('Preencha email e senha.')
      return
    }
    setLoading(true)
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })
    
    if (!error) {
      success('Login realizado com sucesso!')
      window.location.href = '/leads'
    } else {
      showError(error.message)
      setLoading(false)
    }
  }

  async function resetPassword() {
    if (!email) {
      showError('Informe o email para recuperar a senha.')
      return
    }
    setLoading(true)
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?next=/auth/reset`,
    })
    setLoading(false)
    if (error) {
      showError(error.message)
    } else {
      success('Link de recuperação enviado para o email.')
    }
  }

  async function signOut() {
    await supabase.auth.signOut()
    setUserEmail(null)
    success('Você saiu da conta.')
  }

  if (userEmail) {
    return (
      <main className="min-h-screen flex items-center justify-center p-6 bg-[var(--background)]">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl">
              <span className="text-[var(--primary)]">Vitrya</span> CRM
            </CardTitle>
            <CardDescription>Bem-vindo de volta!</CardDescription>
          </CardHeader>
          <CardContent className="text-center">
            <p className="text-sm text-[var(--muted-foreground)] mb-4">
              Logado como: <span className="font-medium text-[var(--foreground)]">{userEmail}</span>
            </p>
            <Link href="/leads">
              <Button className="w-full">Ir para Leads</Button>
            </Link>
          </CardContent>
          <CardFooter className="justify-center">
            <Button variant="ghost" onClick={signOut}>
              Sair
            </Button>
          </CardFooter>
        </Card>
      </main>
    )
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-6 bg-[var(--background)]">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">
            <span className="text-[var(--primary)]">Vitrya</span> CRM
          </CardTitle>
          <CardDescription>Entre na sua conta para continuar</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Input
            type="email"
            label="Email"
            placeholder="seu@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={loading}
          />
          <Input
            type="password"
            label="Senha"
            placeholder="Sua senha"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={loading}
            onKeyDown={(e) => e.key === 'Enter' && signIn()}
          />
        </CardContent>
        <CardFooter className="flex-col gap-3">
          <Button 
            className="w-full" 
            onClick={signIn} 
            loading={loading}
          >
            Entrar
          </Button>
          <Button 
            variant="ghost" 
            className="w-full"
            onClick={resetPassword}
            disabled={loading}
          >
            Esqueci minha senha
          </Button>
        </CardFooter>
      </Card>
    </main>
  )
}
