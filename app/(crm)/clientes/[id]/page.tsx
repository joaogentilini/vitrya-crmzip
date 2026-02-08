import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabaseServer'
import { ensureUserProfile } from '@/lib/auth'

export const dynamic = 'force-dynamic'
export const revalidate = 0

interface PageProps {
  params: Promise<{ id: string }>
}

function formatValue(value: unknown) {
  if (value === null || value === undefined || value === '') return '—'
  if (Array.isArray(value)) return value.length > 0 ? value.join(', ') : '—'
  if (typeof value === 'boolean') return value ? 'Sim' : 'Não'
  if (typeof value === 'string') {
    if (/^\d{4}-\d{2}-\d{2}(T|$)/.test(value)) {
      const date = new Date(value)
      return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('pt-BR')
    }
    return value
  }
  if (typeof value === 'number') return value.toString()
  return JSON.stringify(value)
}

export default async function ClientePage({ params }: PageProps) {
  const { id } = await params

  const profile = await ensureUserProfile()
  if (!profile) {
    redirect('/')
  }

  if (profile.is_active === false) {
    redirect('/blocked')
  }

  const supabase = await createClient()
  const { data: client, error } = await supabase
    .from('clients')
    .select('id, person_id, owner_user_id, status, types, notes, created_at, updated_at')
    .eq('id', id)
    .single()

  if (error || !client) {
    notFound()
  }

  if (client.person_id) {
    redirect(`/pessoas/${client.person_id}`)
  }

  return (
    <main className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[var(--foreground)]">Cliente</h1>
        <p className="text-sm text-[var(--muted-foreground)]">
          Visualização básica do cliente.
        </p>
      </div>

      <section className="space-y-3 text-sm">
        <div>
          <p className="text-xs text-[var(--muted-foreground)]">ID</p>
          <p className="text-[var(--foreground)]">{client.id}</p>
        </div>
        <div>
          <p className="text-xs text-[var(--muted-foreground)]">Pessoa vinculada</p>
          {client.person_id ? (
            <Link
              href={`/pessoas/${client.person_id}`}
              className="text-[#294487] hover:underline"
            >
              /pessoas/{client.person_id}
            </Link>
          ) : (
            <p className="text-[var(--foreground)]">—</p>
          )}
        </div>
        <div>
          <p className="text-xs text-[var(--muted-foreground)]">Responsável</p>
          <p className="text-[var(--foreground)]">{formatValue(client.owner_user_id)}</p>
        </div>
        <div>
          <p className="text-xs text-[var(--muted-foreground)]">Status</p>
          <p className="text-[var(--foreground)]">{formatValue(client.status)}</p>
        </div>
        <div>
          <p className="text-xs text-[var(--muted-foreground)]">Tipos</p>
          <p className="text-[var(--foreground)]">{formatValue(client.types)}</p>
        </div>
        <div>
          <p className="text-xs text-[var(--muted-foreground)]">Observações</p>
          <p className="text-[var(--foreground)]">{formatValue(client.notes)}</p>
        </div>
        <div>
          <p className="text-xs text-[var(--muted-foreground)]">Criado em</p>
          <p className="text-[var(--foreground)]">{formatValue(client.created_at)}</p>
        </div>
        <div>
          <p className="text-xs text-[var(--muted-foreground)]">Atualizado em</p>
          <p className="text-[var(--foreground)]">{formatValue(client.updated_at)}</p>
        </div>
      </section>

      <section className="rounded-[var(--radius)] border border-[var(--border)] p-4 text-sm text-[var(--muted-foreground)]">
        ERP/Portal do Cliente em breve
      </section>
    </main>
  )
}
