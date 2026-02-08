'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'

type ProfileLike = { full_name?: string | null; email?: string | null } | null

export default function PropertyPeopleTab({ property }: { property: Record<string, unknown> }) {
  const ownerProfile = (property.owner_profile as ProfileLike) ?? null
  const ownerPerson = (property.owner_person as ProfileLike) ?? null
  const createdByProfile = (property.created_by_profile as ProfileLike) ?? null

  const ownerUserId = property.owner_user_id as string | null | undefined
  const ownerClientId = property.owner_client_id as string | null | undefined
  const createdById = property.created_by as string | null | undefined

  const renderRow = (label: string, primary?: string | null, id?: string | null) => (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius)] border border-[var(--border)] p-3 text-sm">
      <div>
        <p className="text-xs text-[var(--muted-foreground)]">{label}</p>
        <p className="font-medium text-[var(--foreground)]">{primary || '—'}</p>
      </div>
      <div className="text-xs text-[var(--muted-foreground)]">{id || '—'}</div>
    </div>
  )

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Pessoas</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {renderRow(
          'Proprietário (Pessoa)',
          ownerPerson?.full_name || ownerPerson?.email || null,
          ownerClientId || null
        )}
        {renderRow(
          'Responsável (Usuário)',
          ownerProfile?.full_name || ownerProfile?.email || null,
          ownerUserId || null
        )}
        {renderRow(
          'Criado por',
          createdByProfile?.full_name || createdByProfile?.email || null,
          createdById || null
        )}
      </CardContent>
    </Card>
  )
}
