'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
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

interface GroupMemberRow {
  id: string
  group_id: string
  person_id: string
  created_at: string
}

interface PersonRow {
  id: string
  full_name: string
  email: string | null
  phone_e164: string | null
}

interface MemberView {
  id: string
  person: PersonRow | null
  added_at: string
}

interface GroupDetailClientProps {
  groupId: string
}

export default function GroupDetailClient({ groupId }: GroupDetailClientProps) {
  const [group, setGroup] = useState<GroupRow | null>(null)
  const [members, setMembers] = useState<MemberView[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const [personId, setPersonId] = useState('')

  const loadGroup = useCallback(async () => {
    setLoading(true)
    setError(null)

    const { data: groupRow, error: groupError } = await supabase
      .from('groups')
      .select('id, name, description, created_at')
      .eq('id', groupId)
      .maybeSingle()

    if (groupError) {
      setError(`Erro ao carregar grupo: ${groupError.message}`)
      setLoading(false)
      return
    }

    setGroup(groupRow as GroupRow | null)

    const { data: memberRows, error: memberError } = await supabase
      .from('group_members')
      .select('id, group_id, person_id, created_at')
      .eq('group_id', groupId)
      .order('created_at', { ascending: false })

    if (memberError) {
      setError(`Erro ao carregar membros: ${memberError.message}`)
      setLoading(false)
      return
    }

    const memberList = (memberRows ?? []) as GroupMemberRow[]
    const personIds = memberList.map((member) => member.person_id)

    let peopleById = new Map<string, PersonRow>()
    if (personIds.length > 0) {
      const { data: peopleRows, error: peopleError } = await supabase
        .from('people')
        .select('id, full_name, email, phone_e164')
        .in('id', personIds)

      if (peopleError) {
        setError(`Erro ao carregar pessoas: ${peopleError.message}`)
        setLoading(false)
        return
      }

      peopleById = new Map((peopleRows ?? []).map((person) => [person.id, person as PersonRow]))
    }

    const memberViews: MemberView[] = memberList.map((member) => ({
      id: member.id,
      person: peopleById.get(member.person_id) ?? null,
      added_at: member.created_at
    }))

    setMembers(memberViews)
    setLoading(false)
  }, [groupId])

  useEffect(() => {
    loadGroup()
  }, [loadGroup])

  const memberCount = useMemo(() => members.length, [members])

  async function handleAddMember() {
    setBusy(true)
    setError(null)
    setSuccess(null)

    try {
      if (!personId.trim()) throw new Error('Informe o ID da pessoa.')

      const { data: existing, error: existingError } = await supabase
        .from('group_members')
        .select('id')
        .eq('group_id', groupId)
        .eq('person_id', personId.trim())
        .maybeSingle()

      if (existingError && existingError.code !== 'PGRST116') {
        throw new Error(existingError.message)
      }

      if (existing) throw new Error('Esta pessoa já está no grupo.')

      const { error } = await supabase
        .from('group_members')
        .insert({
          group_id: groupId,
          person_id: personId.trim()
        })

      if (error) throw new Error(error.message)

      setSuccess('Pessoa adicionada ao grupo.')
      setPersonId('')
      await loadGroup()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao adicionar pessoa.')
    } finally {
      setBusy(false)
    }
  }

  async function handleRemoveMember(member: MemberView) {
    if (!confirm('Remover esta pessoa do grupo?')) return

    setBusy(true)
    setError(null)
    setSuccess(null)

    try {
      const { error } = await supabase
        .from('group_members')
        .delete()
        .eq('id', member.id)

      if (error) throw new Error(error.message)

      setSuccess('Pessoa removida do grupo.')
      await loadGroup()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao remover pessoa.')
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
          <CardTitle>Detalhes do Grupo</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-sm text-gray-500">Carregando...</div>
          ) : group ? (
            <div className="space-y-2">
              <div className="text-lg font-semibold text-gray-900">{group.name}</div>
              <div className="text-sm text-gray-600">{group.description || 'Sem descrição.'}</div>
              <div className="text-xs text-gray-400">
                Criado em {new Date(group.created_at).toLocaleDateString('pt-BR')}
              </div>
              <div className="text-xs text-gray-500">{memberCount} pessoa(s) no grupo</div>
            </div>
          ) : (
            <div className="text-sm text-gray-500">Grupo não encontrado.</div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Adicionar Pessoa</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">ID da pessoa</label>
            <Input
              value={personId}
              onChange={(e) => setPersonId(e.target.value)}
              placeholder="UUID da pessoa"
              disabled={busy}
            />
          </div>
          <Button onClick={handleAddMember} disabled={busy}>
            {busy ? 'Adicionando...' : 'Adicionar'}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Membros do Grupo</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-sm text-gray-500">Carregando membros...</div>
          ) : members.length === 0 ? (
            <div className="text-sm text-gray-500">Nenhuma pessoa no grupo.</div>
          ) : (
            <div className="space-y-3">
              {members.map((member) => (
                <div
                  key={member.id}
                  className="flex items-center justify-between p-3 rounded-md border border-gray-200"
                >
                  <div>
                    <div className="text-sm font-medium text-gray-900">
                      {member.person?.full_name || 'Pessoa não encontrada'}
                    </div>
                    <div className="text-xs text-gray-500">
                      {member.person?.email || member.person?.phone_e164 || member.person?.id}
                    </div>
                    <div className="text-xs text-gray-400">
                      Adicionado em {new Date(member.added_at).toLocaleDateString('pt-BR')}
                    </div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleRemoveMember(member)}
                    disabled={busy}
                  >
                    Remover
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
