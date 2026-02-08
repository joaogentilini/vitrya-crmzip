import Link from 'next/link'
import { createClient } from '@/lib/supabaseServer'
import { requireActiveUser } from '@/lib/auth'
import PersonDocumentsClient from './PersonDocumentsClient'

export const dynamic = 'force-dynamic'
export const revalidate = 0

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function PersonDocumentsPage({ params }: PageProps) {
  const { id } = await params

  await requireActiveUser()

  const supabase = await createClient()
  const { data: person } = await supabase
    .from('people')
    .select('id, full_name')
    .eq('id', id)
    .maybeSingle()
  const baseHref = `/people/${id}`

  return (
    <main className="p-6 space-y-6">
      <div className="flex items-center gap-2 text-sm text-[var(--muted-foreground)]">
        <Link href="/people" className="hover:text-[var(--foreground)] transition-colors">
          Pessoas
        </Link>
        <span>/</span>
        <Link
          href={`/people/${id}`}
          className="hover:text-[var(--foreground)] transition-colors"
        >
          {person?.full_name || 'Pessoa'}
        </Link>
        <span>/</span>
        <span className="text-[var(--foreground)]">Documentos</span>
      </div>

      <div className="flex items-center gap-2">
        <Link
          href={baseHref}
          className="text-sm font-medium text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors pb-1"
        >
          Resumo
        </Link>
        <Link
          href={`${baseHref}/documents`}
          className="text-sm font-medium text-[var(--foreground)] border-b-2 border-[var(--foreground)] pb-1"
        >
          Documentos
        </Link>
      </div>

      <div>
        <h1 className="text-2xl font-bold text-gray-900">Documentos da Pessoa</h1>
        <p className="text-sm text-gray-500">Timeline e gestão de documentos vinculados.</p>
      </div>

      <PersonDocumentsClient personId={id} />
    </main>
  )
}
