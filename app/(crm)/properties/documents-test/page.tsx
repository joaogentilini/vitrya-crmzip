export const dynamic = 'force-dynamic'
export const revalidate = 0

import PropertyDocumentsManager from '../[id]/documents/PropertyDocumentsManager'

const TEST_PROPERTY_ID = '28d941fe-3562-4aa5-a167-60c999b8f804'

export default function PropertyDocumentsTestPage() {
  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Teste de Documentos do Imóvel</h1>
      <p className="text-gray-600 mb-6">
        Esta é uma página de teste usando o imóvel com ID:{' '}
        <code className="bg-gray-100 px-2 py-1 rounded text-sm">{TEST_PROPERTY_ID}</code>
      </p>
      <PropertyDocumentsManager propertyId={TEST_PROPERTY_ID} />
    </div>
  )
}
