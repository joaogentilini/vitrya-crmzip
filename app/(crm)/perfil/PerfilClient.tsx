'use client'

import { useRouter } from 'next/navigation'
import { useCallback, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'
import Link from 'next/link'

interface Profile {
  id: string
  full_name: string | null
  email: string
  role: string
  created_at?: string | null
}

interface ProfileClientProps {
  userId: string
  userEmail: string | null
  initialFullName: string | null
  initialPhone?: string | null
  role: 'admin' | 'gestor' | 'corretor'
  createdAt?: string | null
}

export function PerfilClient({ userId, userEmail, initialFullName, initialPhone, role, createdAt }: ProfileClientProps) {
  const profile: Profile = {
    id: userId,
    full_name: initialFullName,
    email: userEmail || '',
    role,
    created_at: createdAt || null,
  }
  const isAdmin = role === 'admin' || role === 'gestor'
  const router = useRouter()
  const { success } = useToast()
  const [isEditing, setIsEditing] = useState(false)
  const [fullName, setFullName] = useState(profile.full_name || '')
  const [isLoading, setIsLoading] = useState(false)

  const handleSignOut = useCallback(async () => {
    await supabase.auth.signOut()
    success('Você saiu da conta.')
    router.push('/')
  }, [router, success])

  const handleSave = async () => {
    setIsLoading(true)
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ full_name: fullName.trim() || null })
        .eq('id', profile.id)

      if (error) throw error

      success('Perfil atualizado com sucesso!')
      setIsEditing(false)
      router.refresh()
    } catch (err) {
      console.error('Error updating profile:', err)
      // You might want to add error toast here
    } finally {
      setIsLoading(false)
    }
  }

  const handleCancel = () => {
    setFullName(profile.full_name || '')
    setIsEditing(false)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Meu Perfil</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Informações Pessoais</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-[var(--muted-foreground)] mb-1">
              Nome Completo
            </label>
            {isEditing ? (
              <div className="flex gap-2">
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="flex-1 px-3 py-2 border border-[var(--border)] rounded-[var(--radius)] bg-[var(--card)] focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
                  placeholder="Digite seu nome completo"
                />
                <Button onClick={handleSave} loading={isLoading} size="sm">
                  Salvar
                </Button>
                <Button onClick={handleCancel} variant="outline" size="sm">
                  Cancelar
                </Button>
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <p className="text-[var(--foreground)]">
                  {profile.full_name || 'Nome não informado'}
                </p>
                <Button onClick={() => setIsEditing(true)} variant="outline" size="sm">
                  Editar
                </Button>
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-[var(--muted-foreground)] mb-1">
              Email
            </label>
            <p className="text-[var(--foreground)]">{profile.email}</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-[var(--muted-foreground)] mb-1">
              Função
            </label>
            <Badge variant="outline" className="capitalize">
              {profile.role === 'admin' ? 'Administrador' : 
               profile.role === 'manager' ? 'Gerente' : 'Corretor'}
            </Badge>
          </div>

          <div>
            <label className="block text-sm font-medium text-[var(--muted-foreground)] mb-1">
              Data de Cadastro
            </label>
            <p className="text-[var(--foreground)]">
              {profile.created_at ? new Date(profile.created_at).toLocaleDateString('pt-BR') : '-'}
            </p>
          </div>
        </CardContent>
      </Card>

      {isAdmin && (
        <Card>
          <CardHeader>
            <CardTitle>Administração</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <Link href="/admin">
                <Button variant="outline" className="w-full justify-start">
                  <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  Painel Administrativo
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Ações da Conta</CardTitle>
        </CardHeader>
        <CardContent>
          <Button 
            onClick={handleSignOut} 
            variant="destructive" 
            className="w-full"
          >
            Sair da Conta
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
