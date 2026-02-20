import { unstable_cache } from 'next/cache'

import { createPublicClient } from '@/lib/supabase/publicServer'

type PublicCategoryRow = {
  id: string
  name: string | null
}

export const revalidate = 300

const getPublicCategories = unstable_cache(
  async (): Promise<PublicCategoryRow[]> => {
    const supabase = createPublicClient()
    const { data } = await supabase
      .from('property_categories')
      .select('id,name')
      .eq('is_active', true)
      .order('name', { ascending: true })

    return (data || []) as PublicCategoryRow[]
  },
  ['public-search-categories-v1'],
  { revalidate: 300 }
)

export default async function PublicSearchPage() {
  const categories = await getPublicCategories()

  return (
    <main className="pv-main">
      <div className="pv-container">
        <div className="pv-glass">
          <section className="pv-hero pv-hero-search">
            <h1 className="pv-title">Encontre seu imóvel ideal</h1>
            <p className="pv-subtitle">Busque por localização, preço e características</p>

            <form method="get" action="/imoveis/resultados" className="pv-searchbar">
              <div className="pv-field">
                <div className="pv-label">Localização</div>
                <input className="pv-input" type="text" name="query" placeholder="Rua ou bairro" />
              </div>

              <div className="pv-field">
                <div className="pv-label">Código</div>
                <input className="pv-input" type="text" name="cod" placeholder="Ex: COD-000123" />
              </div>

              <div className="pv-field">
                <div className="pv-label">Negócio</div>
                <select className="pv-select" name="purpose" defaultValue="">
                  <option value="">Comprar ou Alugar</option>
                  <option value="sale">Comprar</option>
                  <option value="rent">Alugar</option>
                </select>
              </div>

              <div className="pv-field">
                <div className="pv-label">Tipo de imóvel</div>
                <select className="pv-select" name="category" defaultValue="">
                  <option value="">Casa, apartamento, terreno...</option>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name || 'Categoria'}
                    </option>
                  ))}
                </select>
              </div>

              <div className="pv-field">
                <div className="pv-label">Preço mínimo</div>
                <input
                  className="pv-input"
                  type="number"
                  inputMode="numeric"
                  name="min"
                  placeholder="Preço mínimo"
                />
              </div>

              <div className="pv-field">
                <div className="pv-label">Preço máximo</div>
                <input
                  className="pv-input"
                  type="number"
                  inputMode="numeric"
                  name="max"
                  placeholder="Preço máximo"
                />
              </div>

              <div className="pv-field">
                <div className="pv-label">Quartos</div>
                <select className="pv-select" name="bedrooms" defaultValue="">
                  <option value="">Quartos</option>
                  <option value="1">1+</option>
                  <option value="2">2+</option>
                  <option value="3">3+</option>
                  <option value="4">4+</option>
                </select>
              </div>

              <button type="submit" className="pv-btn pv-btn-primary">
                Buscar imóveis
              </button>
            </form>
          </section>

          <section style={{ marginTop: 22, textAlign: 'center' }}>
            <h2 style={{ margin: 0 }}>Newsletter</h2>
            <p style={{ margin: '8px 0 14px', opacity: 0.8 }}>
              Inscreva-se para receber novidades sobre imóveis
            </p>

            <div
              style={{
                display: 'flex',
                gap: 10,
                justifyContent: 'center',
                flexWrap: 'wrap',
              }}
            >
              <input
                className="pv-input"
                type="email"
                placeholder="Seu email"
                style={{ width: 320, maxWidth: '100%' }}
              />
              <button type="button" className="pv-btn" style={{ background: 'var(--cobalt)', color: 'white' }}>
                Inscrever
              </button>
            </div>
          </section>
        </div>
      </div>
    </main>
  )
}
