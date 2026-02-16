export const dynamic = 'force-dynamic'
export const revalidate = 0

import { createClient } from '@/lib/supabaseServer'
import PropertyDocumentsManager from './PropertyDocumentsManager'

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function PropertyDocumentsPage({ params }: PageProps) {
  const { id } = await params
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <h1 className="text-2xl font-bold text-gray-900 mb-3">Documentos do Imóvel</h1>
        <p className="text-sm text-[var(--muted-foreground)]">Você precisa estar logado para acessar esta area.</p>
      </div>
    )
  }

  const [{ data: profile }, { data: property, error: propertyError }] = await Promise.all([
    supabase.from('profiles').select('role').eq('id', user.id).maybeSingle(),
    supabase.from('properties').select('id, owner_user_id').eq('id', id).maybeSingle(),
  ])

  if (propertyError || !property) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <h1 className="text-2xl font-bold text-gray-900 mb-3">Documentos do Imóvel</h1>
        <p className="text-sm text-[var(--destructive)]">Imóvel não encontrado.</p>
      </div>
    )
  }

  const isManager = profile?.role === 'admin' || profile?.role === 'gestor'
  const isResponsible = property.owner_user_id === user.id

  if (!isManager && !isResponsible) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <h1 className="text-2xl font-bold text-gray-900 mb-3">Documentos do Imóvel</h1>
        <p className="text-sm text-[var(--muted-foreground)]">
          Matrícula e documentos jurídicos ficam ocultos para corretor que não é responsável por este imóvel.
        </p>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Documentos do Imóvel</h1>
      <PropertyDocumentsManager propertyId={id} />
    </div>
  )
}
