export const dynamic = 'force-dynamic'
export const revalidate = 0

import { PropertyDocumentsManager } from './PropertyDocumentsManager'

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function PropertyDocumentsPage({ params }: PageProps) {
  const { id } = await params

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Documentos do Imóvel</h1>
      <PropertyDocumentsManager propertyId={id} />
    </div>
  )
}
