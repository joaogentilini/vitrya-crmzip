'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '../../../../lib/supabaseClient'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/Card'
import { useToast } from '@/components/ui/Toast'

function LoginPageContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(true)
  const [showLogin, setShowLogin] = useState(false)
  const { success, error: showError } = useToast()

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session?.user) {
        const next = searchParams.get('next') || '/dashboard'
        router.replace(next)
      } else {
        setLoading(false)
        setShowLogin(true)
      }
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        const next = searchParams.get('next') || '/dashboard'
        router.replace(next)
      }
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [router, searchParams])

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
      const next = searchParams.get('next') || '/dashboard'
      router.replace(next)
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

  if (loading || !showLogin) {
    return (
      <main className="min-h-screen flex items-center justify-center p-6 bg-[var(--background)]">
        <div className="animate-pulse text-[var(--muted-foreground)]">Carregando...</div>
      </main>
    )
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-6 bg-[var(--background)]">
      <Card className="w-full max-w-md">
        <form onSubmit={(e) => { e.preventDefault(); signIn(); }}>
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
              autoComplete="email"
            />
            <Input
              type="password"
              label="Senha"
              placeholder="Sua senha"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
              autoComplete="current-password"
            />
          </CardContent>
          <CardFooter className="flex-col gap-3">
            <Button
              type="submit"
              className="w-full"
              loading={loading}
            >
              Entrar
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="w-full"
              onClick={resetPassword}
              disabled={loading}
            >
              Esqueci minha senha
            </Button>
          </CardFooter>
        </form>
      </Card>
    </main>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <main className="min-h-screen flex items-center justify-center p-6 bg-[var(--background)]">
        <div className="animate-pulse text-[var(--muted-foreground)]">Carregando...</div>
      </main>
    }>
      <LoginPageContent />
    </Suspense>
  )
}