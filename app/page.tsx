'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'

export default function HomePage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [userEmail, setUserEmail] = useState<string | null>(null)
  const [status, setStatus] = useState('')

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
    setStatus('Entrando...')
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })
    
    if (!error) {
      setStatus('Logado com sucesso. Sincronizando sessão...')
      // Forçamos o reload para o callback/leads para garantir que o middleware/cookies SSR funcionem
      window.location.href = '/leads'
    } else {
      setStatus(`Erro: ${error.message}`)
    }
  }

  async function resetPassword() {
    if (!email) {
      setStatus('Informe o email para recuperar a senha.')
      return
    }
    setStatus('Enviando link...')
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?next=/auth/reset`,
    })
    if (error) setStatus(`Erro: ${error.message}`)
    else setStatus('Link de recuperação enviado para o email.')
  }

  async function signOut() {
    await supabase.auth.signOut()
    setUserEmail(null)
  }

  if (userEmail) {
    return (
      <main style={{ padding: 24 }}>
        <h1>Vitrya CRM</h1>
        <p>Logado como: {userEmail}</p>

        <button onClick={signOut} style={{ padding: 10 }}>
          Sair
        </button>

        <hr style={{ margin: '24px 0' }} />

        <a href="/leads">Ir para Leads</a>
      </main>
    )
  }

  return (
    <main style={{ padding: 24, maxWidth: 420 }}>
      <h1>Vitrya CRM — Login</h1>

      <input
        placeholder="Email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        style={{ width: '100%', padding: 10, marginBottom: 12 }}
      />

      <input
        placeholder="Senha"
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        style={{ width: '100%', padding: 10, marginBottom: 12 }}
      />

      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={signIn} style={{ flex: 1, padding: 10 }}>
          Entrar
        </button>
        <button onClick={resetPassword} style={{ flex: 1, padding: 10, background: '#f3f4f6', border: '1px solid #ccc' }}>
          Esqueci Senha
        </button>
      </div>

      <p style={{ marginTop: 12 }}>{status}</p>
    </main>
  )
}
