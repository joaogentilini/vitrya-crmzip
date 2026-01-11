'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { useRouter } from 'next/navigation'

export default function ResetPasswordPage() {
  const [password, setPassword] = useState('')
  const [status, setStatus] = useState('')
  const router = useRouter()

  async function handleReset(e: React.FormEvent) {
    e.preventDefault()
    setStatus('Atualizando...')
    
    const { error } = await supabase.auth.updateUser({ password })
    
    if (error) {
      setStatus(`Erro: ${error.message}`)
    } else {
      setStatus('Senha atualizada com sucesso!')
      setTimeout(() => router.push('/leads'), 2000)
    }
  }

  return (
    <main style={{ padding: 24, maxWidth: 400 }}>
      <h1>Nova Senha</h1>
      <form onSubmit={handleReset}>
        <input
          type="password"
          placeholder="Digite a nova senha"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          style={{ width: '100%', padding: 10, marginBottom: 12 }}
        />
        <button type="submit" style={{ width: '100%', padding: 10 }}>
          Redefinir Senha
        </button>
      </form>
      <p style={{ marginTop: 12 }}>{status}</p>
    </main>
  )
}
