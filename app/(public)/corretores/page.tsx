import Link from 'next/link'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { createPublicClient } from '@/lib/supabase/publicServer'

export const dynamic = 'force-dynamic'
export const revalidate = 0

type BrokerRow = {
  id: string
  full_name: string | null
  public_name: string | null
  tagline: string | null
  creci: string | null
  avatar_url: string | null
}

function brokerName(broker: BrokerRow) {
  return broker.public_name || broker.full_name || 'Corretor Vitrya'
}

export default async function PublicBrokersPage() {
  const supabase = createPublicClient()
  const { data, error } = await supabase
    .from('v_public_brokers')
    .select('id,full_name,public_name,tagline,creci,avatar_url')
    .order('public_name', { ascending: true })

  if (error) {
    return (
      <main className="mx-auto w-full max-w-6xl space-y-4 px-4 py-8">
        <h1 className="text-3xl font-bold text-[var(--foreground)]">Corretores</h1>
        <p className="text-sm text-[var(--destructive)]">Erro ao carregar corretores: {error.message}</p>
      </main>
    )
  }

  const brokers = (data || []) as BrokerRow[]

  return (
    <main className="mx-auto w-full max-w-6xl space-y-6 px-4 py-8">
      <header className="space-y-2">
        <Link href="/imóveis" className="text-sm text-[var(--muted-foreground)] hover:underline">
          Imóveis
        </Link>
        <h1 className="text-3xl font-bold text-[var(--foreground)]">Corretores</h1>
        <p className="text-sm text-[var(--muted-foreground)]">
          Escolha um corretor para ver o perfil público e os imóveis anunciados.
        </p>
      </header>

      {brokers.length === 0 ? (
        <Card>
          <CardContent className="pt-6 text-sm text-[var(--muted-foreground)]">
            Nenhum corretor publicado no momento.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {brokers.map((broker) => (
            <Link key={broker.id} href={`/corretores/${broker.id}`} className="group">
              <Card className="overflow-hidden border-black/10 bg-white shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-lg">
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-3">
                    <div className="h-12 w-12 overflow-hidden rounded-full border border-black/10 bg-black/5">
                      {broker.avatar_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={broker.avatar_url} alt={brokerName(broker)} className="h-full w-full object-cover" />
                      ) : null}
                    </div>
                    <div className="min-w-0">
                      <CardTitle className="truncate text-lg">{brokerName(broker)}</CardTitle>
                      <p className="truncate text-xs text-[var(--muted-foreground)]">
                        {broker.creci ? `CRECI ${broker.creci}` : 'Corretor Vitrya'}
                      </p>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <p className="line-clamp-2 text-sm text-[var(--muted-foreground)]">
                    {broker.tagline || 'Especialista em intermediar negociacoes imobiliarias.'}
                  </p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </main>
  )
}
