import { PropertyMediaManager } from '../[id]/media/PropertyMediaManager'

export const dynamic = 'force-dynamic'
export const revalidate = 0

const TEST_PROPERTY_ID = '28d941fe-3562-4aa5-a167-60c999b8f804'

export default function MediaTestPage() {
  return (
    <main className="p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Teste de Mídias do Imóvel</h1>
        <p className="text-sm text-gray-600 mt-1">
          Esta é uma página de teste usando o imóvel com ID: <code className="bg-gray-100 px-1 rounded">{TEST_PROPERTY_ID}</code>
        </p>
      </div>
      <PropertyMediaManager propertyId={TEST_PROPERTY_ID} />
    </main>
  )
}
