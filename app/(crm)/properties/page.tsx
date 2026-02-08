import Link from 'next/link'
import MyPropertyCard from './my/MyPropertyCard'
import { getPropertiesWithCover } from '@/lib/properties'

interface PropertiesPageProps {
  searchParams?: Promise<{
    status?: string
    purpose?: string
    city?: string
  }>
}

export const dynamic = 'force-dynamic'
export const revalidate = 0

function normalizeLower(value: string | null | undefined) {
  return (value ?? '').toLowerCase()
}

export default async function PropertiesPage({ searchParams }: PropertiesPageProps) {
  const params = (await searchParams) ?? {}
  const status = params.status?.trim() || ''
  const purpose = params.purpose?.trim() || ''
  const city = params.city?.trim() || ''

  let properties: Awaited<ReturnType<typeof getPropertiesWithCover>> = []
  let errorMessage: string | null = null

  try {
    properties = await getPropertiesWithCover()
  } catch (err) {
    errorMessage = err instanceof Error ? err.message : 'Erro ao carregar imóveis.'
  }

  const filtered = properties.filter((property) => {
    if (status && String(property.status ?? '') !== status) return false
    if (purpose && String(property.purpose ?? '') !== purpose) return false
    if (city && !normalizeLower(property.city).includes(normalizeLower(city))) return false
    return true
  })

  return (
    <main className="p-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--foreground)]">Imóveis</h1>
          <p className="text-sm text-[var(--muted-foreground)]">
            Lista completa de imóveis cadastrados.
          </p>
        </div>
        <Link
          href="/properties/new"
          className="rounded-[var(--radius)] bg-[var(--primary)] px-4 py-2 text-sm font-medium text-[var(--primary-foreground)]"
        >
          Novo Imóvel
        </Link>
      </div>

      <form className="grid gap-3 rounded-[var(--radius)] border border-[var(--border)] p-4 sm:grid-cols-3">
        <div>
          <label className="block text-xs font-medium text-[var(--muted-foreground)]">
            Status
          </label>
          <input
            name="status"
            defaultValue={status}
            placeholder="Ex: Rascunho, Ativo"
            className="mt-1 h-9 w-full rounded-[var(--radius)] border border-[var(--input)] bg-[var(--background)] px-3 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-[var(--muted-foreground)]">
            Finalidade
          </label>
          <input
            name="purpose"
            defaultValue={purpose}
            placeholder="Ex: Venda, Aluguel"
            className="mt-1 h-9 w-full rounded-[var(--radius)] border border-[var(--input)] bg-[var(--background)] px-3 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-[var(--muted-foreground)]">
            Cidade
          </label>
          <input
            name="city"
            defaultValue={city}
            placeholder="Digite para filtrar"
            className="mt-1 h-9 w-full rounded-[var(--radius)] border border-[var(--input)] bg-[var(--background)] px-3 text-sm"
          />
        </div>
        <div className="sm:col-span-3 flex flex-wrap gap-2">
          <button
            type="submit"
            className="rounded-[var(--radius)] bg-[var(--primary)] px-4 py-2 text-sm font-medium text-[var(--primary-foreground)]"
          >
            Filtrar
          </button>
          <Link
            href="/properties"
            className="rounded-[var(--radius)] border border-[var(--border)] px-4 py-2 text-sm font-medium text-[var(--foreground)]"
          >
            Limpar
          </Link>
        </div>
      </form>

      {errorMessage ? (
        <div className="rounded-[var(--radius)] border border-[var(--border)] p-4 text-sm text-[var(--destructive)]">
          {errorMessage}
        </div>
      ) : filtered.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((property) => (
            <MyPropertyCard
              key={property.id}
              property={{
                ...property,
                imageUrls: property.cover_url ? [property.cover_url] : [],
              } as any}
            />
          ))}
        </div>
      ) : (
        <div className="rounded-[var(--radius)] border border-[var(--border)] p-6 text-sm text-[var(--muted-foreground)]">
          Nenhum imóvel encontrado com os filtros atuais.
        </div>
      )}
    </main>
  )
}
