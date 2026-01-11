'use client'

import Link from 'next/link'

export default function AuthCodeErrorPage() {
  return (
    <main style={{ padding: 24, maxWidth: 400 }}>
      <h1>Erro de Autenticação</h1>
      <p style={{ marginTop: 12, opacity: 0.8 }}>
        Não foi possível processar o link de autenticação. 
        O link pode ter expirado ou já foi utilizado.
      </p>
      <p style={{ marginTop: 12 }}>
        <Link href="/" style={{ color: '#3b82f6' }}>
          Voltar para o login
        </Link>
      </p>
    </main>
  )
}
