import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabaseServer'
import { requireActiveUser } from '@/lib/auth'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import PersonEditor from './PersonEditor'

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

      <PersonEditor
        person={person}
        ownerProfile={ownerProfile}
        creatorProfile={creatorProfile}
      />

      {leads && leads.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Leads Associados</CardTitle>
              <Link href={`/leads#new?person_id=${person.id}`}>
                <Button className="bg-[#294487] hover:bg-[#1e3366] text-white">
                  Novo Lead
                </Button>
              </Link>
            </div>
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

      {(!leads || leads.length === 0) && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Leads Associados</CardTitle>
              <Link href={`/leads#new?person_id=${person.id}`}>
                <Button className="bg-[#294487] hover:bg-[#1e3366] text-white">
                  Criar Primeiro Lead
                </Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-[var(--muted-foreground)]">
              Nenhum lead associado a esta pessoa ainda.
            </p>
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
