'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabaseClient'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'

interface GroupRow {
  id: string
  name: string
  description: string | null
  created_at: string
}

export default function GroupsClient() {
  const [groups, setGroups] = useState<GroupRow[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')

  const loadGroups = useCallback(async () => {
    setLoading(true)
    setError(null)

    const { data, error } = await supabase
      .from('groups')
      .select('id, name, description, created_at')
      .order('created_at', { ascending: false })

    if (error) {
      setError(`Erro ao carregar grupos: ${error.message}`)
    } else {
      setGroups((data ?? []) as GroupRow[])
    }

    setLoading(false)
  }, [])

  useEffect(() => {
    loadGroups()
  }, [loadGroups])

  async function handleCreate() {
    setBusy(true)
    setError(null)
    setSuccess(null)

    try {
      if (!name.trim()) throw new Error('Informe o nome do grupo.')

      const { error } = await supabase
        .from('groups')
        .insert({ name: name.trim(), description: description.trim() || null })

      if (error) throw new Error(error.message)

      setSuccess('Grupo criado com sucesso.')
      setName('')
      setDescription('')
      await loadGroups()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao criar grupo.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="p-3 rounded-md bg-red-50 border border-red-200 text-red-700 text-sm">
          {error}
        </div>
      )}

      {success && (
        <div className="p-3 rounded-md bg-green-50 border border-green-200 text-green-700 text-sm">
          {success}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Novo Grupo</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nome *</label>
              <Input value={name} onChange={(e) => setName(e.target.value)} disabled={busy} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Descrição</label>
              <Input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                disabled={busy}
              />
            </div>
          </div>
          <Button onClick={handleCreate} disabled={busy}>
            {busy ? 'Salvando...' : 'Criar grupo'}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Grupos</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-sm text-gray-500">Carregando grupos...</div>
          ) : groups.length === 0 ? (
            <div className="text-sm text-gray-500">Nenhum grupo cadastrado.</div>
          ) : (
            <div className="space-y-3">
              {groups.map((group) => (
                <Link
                  key={group.id}
                  href={`/groups/${group.id}`}
                  className="flex items-center justify-between p-3 rounded-md border border-gray-200 hover:bg-gray-50"
                >
                  <div>
                    <div className="text-sm font-medium text-gray-900">{group.name}</div>
                    <div className="text-xs text-gray-500">
                      {group.description || 'Sem descrição'}
                    </div>
                  </div>
                  <div className="text-xs text-gray-400">
                    {new Date(group.created_at).toLocaleDateString('pt-BR')}
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
