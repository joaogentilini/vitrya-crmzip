import PropertyMediaManager from './PropertyMediaManager'

export const dynamic = 'force-dynamic'
export const revalidate = 0

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function PropertyMediaPage({ params }: PageProps) {
  const { id } = await params
  
  return (
    <main className="p-6 max-w-4xl mx-auto">
      <PropertyMediaManager propertyId={id} />
    </main>
  )
}
