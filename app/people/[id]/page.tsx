import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabaseServer'
import { requireActiveUser } from '@/lib/auth'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'

export const dynamic = 'force-dynamic'
export const revalidate = 0

interface PageProps {
  params: Promise<{ id: string }>
}

const kindTagLabels: Record<string, string> = {
  comprador: 'Comprador',
  vendedor: 'Vendedor',
  proprietario: 'Proprietário',
  inquilino: 'Inquilino',
  investidor: 'Investidor',
  fornecedor: 'Fornecedor'
}

const clientTypeLabels: Record<string, string> = {
  buyer: 'Comprador',
  seller: 'Vendedor',
  tenant: 'Locatário',
  landlord: 'Locador',
  investor: 'Investidor',
}

const statusLabels: Record<string, string> = {
  open: 'Aberto',
  won: 'Comprou',
  lost: 'Não Comprou',
}

export default async function PersonPage({ params }: PageProps) {
  const { id } = await params
  
  await requireActiveUser()
  
  const supabase = await createClient()

  const { data: person, error: personError } = await supabase
    .from('people')
    .select('*')
    .eq('id', id)
    .single()

  if (personError || !person) {
    notFound()
  }

  const { data: client } = await supabase
    .from('clients')
    .select('*, owner:profiles!clients_owner_user_id_fkey(id, full_name, email)')
    .eq('person_id', id)
    .single()

  const { data: leads } = await supabase
    .from('leads')
    .select('id, title, status, created_at')
    .eq('person_id', id)
    .order('created_at', { ascending: false })

  const { data: ownerProfile } = person.owner_profile_id ? await supabase
    .from('profiles')
    .select('id, full_name, email')
    .eq('id', person.owner_profile_id)
    .single() : { data: null }

  const { data: creatorProfile } = person.created_by_profile_id ? await supabase
    .from('profiles')
    .select('id, full_name, email')
    .eq('id', person.created_by_profile_id)
    .single() : { data: null }

  return (
    <main className="p-6 space-y-6">
      <div className="flex items-center gap-2 text-sm text-[var(--muted-foreground)]">
        <Link href="/people" className="hover:text-[var(--foreground)] transition-colors">
          Pessoas
        </Link>
        <span>/</span>
        <span className="text-[var(--foreground)]">{person.full_name}</span>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-[#294487] flex items-center justify-center text-white text-lg font-semibold">
                {person.full_name?.charAt(0)?.toUpperCase() || '?'}
              </div>
              <div>
                <h1 className="text-xl font-bold">{person.full_name}</h1>
                <div className="flex flex-wrap gap-1 mt-1">
                  {client && (
                    <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full bg-[#294487] text-white">
                      Cliente
                    </span>
                  )}
                  {person.kind_tags?.map((tag: string) => (
                    <span 
                      key={tag}
                      className="inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full bg-[var(--muted)] text-[var(--muted-foreground)]"
                    >
                      {kindTagLabels[tag] || tag}
                    </span>
                  ))}
                </div>
              </div>
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {person.phone_e164 && (
              <div>
                <p className="text-xs text-[var(--muted-foreground)] mb-1">Telefone</p>
                <p className="text-sm font-medium text-[var(--foreground)]">{person.phone_e164}</p>
              </div>
            )}
            {person.email && (
              <div>
                <p className="text-xs text-[var(--muted-foreground)] mb-1">Email</p>
                <p className="text-sm font-medium text-[var(--foreground)]">{person.email}</p>
              </div>
            )}
            {person.document_id && (
              <div>
                <p className="text-xs text-[var(--muted-foreground)] mb-1">CPF/CNPJ</p>
                <p className="text-sm font-medium text-[var(--foreground)]">{person.document_id}</p>
              </div>
            )}
            {ownerProfile && (
              <div>
                <p className="text-xs text-[var(--muted-foreground)] mb-1">Responsável</p>
                <p className="text-sm font-medium text-[var(--foreground)]">
                  {ownerProfile.full_name || ownerProfile.email || '—'}
                </p>
              </div>
            )}
            {creatorProfile && (
              <div>
                <p className="text-xs text-[var(--muted-foreground)] mb-1">Criado por</p>
                <p className="text-sm font-medium text-[var(--foreground)]">
                  {creatorProfile.full_name || creatorProfile.email || '—'}
                </p>
              </div>
            )}
            <div>
              <p className="text-xs text-[var(--muted-foreground)] mb-1">Cadastrado em</p>
              <p className="text-sm font-medium text-[var(--foreground)]">
                {new Date(person.created_at).toLocaleDateString('pt-BR')}
              </p>
            </div>
            {client?.types && client.types.length > 0 && (
              <div>
                <p className="text-xs text-[var(--muted-foreground)] mb-1">Tipo de Cliente</p>
                <p className="text-sm font-medium text-[var(--foreground)]">
                  {client.types.map((t: string) => clientTypeLabels[t] || t).join(', ')}
                </p>
              </div>
            )}
            {client?.owner && (
              <div>
                <p className="text-xs text-[var(--muted-foreground)] mb-1">Corretor (Cliente)</p>
                <p className="text-sm font-medium text-[var(--foreground)]">
                  {(client.owner as { full_name?: string; email?: string })?.full_name || (client.owner as { full_name?: string; email?: string })?.email || '—'}
                </p>
              </div>
            )}
          </div>
          {(person.notes || client?.notes) && (
            <div className="mt-4 pt-4 border-t border-[var(--border)]">
              <p className="text-xs text-[var(--muted-foreground)] mb-1">Observações</p>
              <p className="text-sm text-[var(--foreground)] whitespace-pre-wrap">
                {person.notes || client?.notes}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {leads && leads.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Leads Associados</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {leads.map((lead) => (
                <Link 
                  key={lead.id} 
                  href={`/leads/${lead.id}`}
                  className="flex items-center justify-between p-3 rounded-[var(--radius)] border border-[var(--border)] hover:bg-[var(--accent)] transition-colors"
                >
                  <div>
                    <p className="text-sm font-medium text-[var(--foreground)]">{lead.title}</p>
                    <p className="text-xs text-[var(--muted-foreground)]">
                      {new Date(lead.created_at).toLocaleDateString('pt-BR')}
                    </p>
                  </div>
                  <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                    lead.status === 'won' 
                      ? 'bg-[var(--success)]/10 text-[var(--success)]'
                      : lead.status === 'lost'
                      ? 'bg-[var(--destructive)]/10 text-[var(--destructive)]'
                      : 'bg-[var(--muted)] text-[var(--muted-foreground)]'
                  }`}>
                    {statusLabels[lead.status] || lead.status}
                  </span>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex gap-2">
        <Link href="/people">
          <Button variant="outline">Voltar para Pessoas</Button>
        </Link>
      </div>
    </main>
  )
}
