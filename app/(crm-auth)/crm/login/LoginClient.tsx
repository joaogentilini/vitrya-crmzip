'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '../../../../lib/supabaseClient'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/Card'
import { useToast } from '@/components/ui/Toast'

interface LoginClientProps {
  nextPath?: string
}

export function LoginClient({ nextPath }: LoginClientProps) {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  const [recoveryMode, setRecoveryMode] = useState(false)
  const [recoveryEmail, setRecoveryEmail] = useState('')
  const [codeSent, setCodeSent] = useState(false)
  const [verificationCode, setVerificationCode] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  const { success, error: showError } = useToast()

  const handlePostLogin = () => {
    const target = nextPath ? `/crm/login?next=${encodeURIComponent(nextPath)}` : '/crm/login'
    router.replace(target)
    router.refresh()
  }

  const openRecovery = () => {
    setRecoveryMode(true)
    setRecoveryEmail(email.trim())
    setCodeSent(false)
    setVerificationCode('')
    setNewPassword('')
    setConfirmPassword('')
  }

  const closeRecovery = () => {
    setRecoveryMode(false)
    setCodeSent(false)
    setVerificationCode('')
    setNewPassword('')
    setConfirmPassword('')
  }

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
    setLoading(false)

    if (!error) {
      success('Login realizado com sucesso!')
      handlePostLogin()
      return
    }

    showError(error.message)
  }

  async function sendRecoveryCode() {
    if (!recoveryEmail) {
      showError('Informe o email para recuperar a senha.')
      return
    }

    setLoading(true)
    const { error } = await supabase.auth.signInWithOtp({
      email: recoveryEmail,
      options: {
        shouldCreateUser: false,
      },
    })
    setLoading(false)

    if (error) {
      showError(error.message)
      return
    }

    setCodeSent(true)
    success('Codigo de verificacao enviado para o email.')
  }

  async function confirmRecovery() {
    if (!recoveryEmail) {
      showError('Informe o email.')
      return
    }

    if (!verificationCode.trim()) {
      showError('Informe o codigo de verificacao.')
      return
    }

    if (newPassword.length < 6) {
      showError('A nova senha deve ter no minimo 6 caracteres.')
      return
    }

    if (newPassword !== confirmPassword) {
      showError('As senhas nao conferem.')
      return
    }

    setLoading(true)

    const { error: verifyError } = await supabase.auth.verifyOtp({
      email: recoveryEmail,
      token: verificationCode.trim(),
      type: 'email',
    })

    if (verifyError) {
      setLoading(false)
      showError(verifyError.message)
      return
    }

    const { error: updateError } = await supabase.auth.updateUser({ password: newPassword })
    if (updateError) {
      setLoading(false)
      showError(updateError.message)
      return
    }

    await supabase.auth.signOut()
    setLoading(false)

    setEmail(recoveryEmail)
    closeRecovery()
    success('Senha redefinida com sucesso. Faça login com a nova senha.')
    router.push('/crm/login')
    router.refresh()
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-6 bg-[var(--background)]">
      <Card className="w-full max-w-md">
        {!recoveryMode ? (
          <form
            onSubmit={(e) => {
              e.preventDefault()
              signIn()
            }}
          >
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
              <Button type="submit" className="w-full" loading={loading}>
                Entrar
              </Button>
              <Button type="button" variant="ghost" className="w-full" onClick={openRecovery} disabled={loading}>
                Esqueci minha senha
              </Button>
            </CardFooter>
          </form>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault()
              if (!codeSent) {
                sendRecoveryCode()
              } else {
                confirmRecovery()
              }
            }}
          >
            <CardHeader className="text-center">
              <CardTitle className="text-2xl">Recuperar Senha</CardTitle>
              <CardDescription>
                {!codeSent
                  ? 'Informe o email para receber o codigo de verificacao.'
                  : 'Informe o codigo recebido e defina a nova senha.'}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Input
                type="email"
                label="Email"
                placeholder="seu@email.com"
                value={recoveryEmail}
                onChange={(e) => setRecoveryEmail(e.target.value)}
                disabled={loading || codeSent}
                autoComplete="email"
              />

              {codeSent ? (
                <>
                  <Input
                    type="text"
                    label="Codigo de verificacao"
                    placeholder="Digite o codigo"
                    value={verificationCode}
                    onChange={(e) => setVerificationCode(e.target.value)}
                    disabled={loading}
                    autoComplete="one-time-code"
                  />
                  <Input
                    type="password"
                    label="Nova senha"
                    placeholder="Minimo 6 caracteres"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    disabled={loading}
                    autoComplete="new-password"
                  />
                  <Input
                    type="password"
                    label="Confirmar nova senha"
                    placeholder="Repita a nova senha"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    disabled={loading}
                    autoComplete="new-password"
                  />
                </>
              ) : null}
            </CardContent>
            <CardFooter className="flex-col gap-3">
              <Button type="submit" className="w-full" loading={loading}>
                {!codeSent ? 'Enviar Codigo' : 'Redefinir Senha'}
              </Button>

              {codeSent ? (
                <Button type="button" variant="ghost" className="w-full" onClick={sendRecoveryCode} disabled={loading}>
                  Reenviar Codigo
                </Button>
              ) : null}

              <Button type="button" variant="outline" className="w-full" onClick={closeRecovery} disabled={loading}>
                Voltar para login
              </Button>
            </CardFooter>
          </form>
        )}
      </Card>
    </main>
  )
}
