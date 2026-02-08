'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'

type PropertyCategory = {
  id: string
  name: string
  is_active: boolean
  position: number
}

export default function NewPropertyPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [categories, setCategories] = useState<PropertyCategory[]>([])
  const [categoriesLoading, setCategoriesLoading] = useState(true)

  const [formData, setFormData] = useState({
    purpose: 'sale',
    property_category_id: '',
  })

  useEffect(() => {
    let alive = true

    async function load() {
      setCategoriesLoading(true)
      try {
        const { data, error } = await supabase
          .from('property_categories')
          .select('id, name, is_active, position')
          .eq('is_active', true)
          .order('position', { ascending: true })

        if (error) throw error

        const list = (data ?? []) as PropertyCategory[]
        if (!alive) return
        setCategories(list)

        if (!formData.property_category_id && list[0]?.id) {
          setFormData(prev => ({ ...prev, property_category_id: list[0].id }))
        }
      } catch (e: any) {
        if (!alive) return
        setError(e?.message ?? 'Erro ao carregar categorias')
      } finally {
        if (!alive) return
        setCategoriesLoading(false)
      }
    }

    load()
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const selectedCategoryName = useMemo(() => {
    return categories.find(c => c.id === formData.property_category_id)?.name ?? null
  }, [categories, formData.property_category_id])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Usuário não autenticado')

      if (!formData.property_category_id) {
        throw new Error('Selecione uma categoria do imóvel.')
      }

      const propertyData = {
        status: 'draft',
        purpose: formData.purpose,
        property_category_id: formData.property_category_id,
        title: 'Novo imóvel',
        owner_user_id: user.id,
        created_by: user.id,
      }

      const { data, error: insertError } = await supabase
        .from('properties')
        .insert(propertyData)
        .select('id')
        .single()

      if (insertError) throw new Error(`Erro ao criar imóvel: ${insertError.message}`)

      router.push(`/properties/${data.id}`)
    } catch (err: any) {
      setError(err?.message ?? 'Erro ao criar imóvel')
    } finally {
      setLoading(false)
    }
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFormData(prev => ({
      ...prev,
      [e.target.name]: e.target.value
    }))
  }

  return (
    <div style={{ padding: 24, maxWidth: 600, margin: '0 auto' }}>
      <div style={{ marginBottom: 24 }}>
        <h1>Novo Imóvel</h1>
        <p style={{ color: '#6b7280' }}>Preencha as informações básicas do imóvel</p>
      </div>

      {error && (
        <div style={{
          padding: 12,
          backgroundColor: '#fef2f2',
          border: '1px solid #fecaca',
          borderRadius: 8,
          color: '#dc2626',
          marginBottom: 24
        }}>
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div>
          <label style={{ display: 'block', marginBottom: 4, fontWeight: 500 }}>
            Categoria do imóvel *
          </label>
          <select
            name="property_category_id"
            value={formData.property_category_id}
            onChange={handleChange}
            required
            disabled={categoriesLoading || loading}
            style={{
              width: '100%',
              padding: '8px 12px',
              border: '1px solid #d1d5db',
              borderRadius: 6,
              fontSize: 14,
              backgroundColor: (categoriesLoading || loading) ? '#f9fafb' : 'white',
            }}
          >
            {categoriesLoading ? (
              <option value="">Carregando categorias...</option>
            ) : categories.length === 0 ? (
              <option value="">Nenhuma categoria ativa</option>
            ) : (
              categories.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))
            )}
          </select>

          {selectedCategoryName ? (
            <div style={{ marginTop: 6, fontSize: 12, opacity: 0.75 }}>
              Template de campanha será baseado em: <strong>{selectedCategoryName}</strong>
            </div>
          ) : null}
        </div>

        <div>
          <label style={{ display: 'block', marginBottom: 4, fontWeight: 500 }}>
            Tipo *
          </label>
          <select
            name="purpose"
            value={formData.purpose}
            onChange={handleChange}
            required
            style={{
              width: '100%',
              padding: '8px 12px',
              border: '1px solid #d1d5db',
              borderRadius: 6,
              fontSize: 14
            }}
          >
            <option value="sale">Venda</option>
            <option value="rent">Aluguel</option>
          </select>
        </div>

        <div className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--card)] p-3 text-sm text-[var(--muted-foreground)]">
          Após criar o imóvel, você será redirecionado para o editor completo.
        </div>

        <div style={{ display: 'flex', gap: 12, marginTop: 24 }}>
          <button
            type="button"
            onClick={() => router.back()}
            style={{
              padding: '8px 16px',
              border: '1px solid #d1d5db',
              backgroundColor: 'white',
              borderRadius: 6,
              cursor: 'pointer'
            }}
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={loading || categoriesLoading || categories.length === 0}
            style={{
              padding: '8px 16px',
              backgroundColor: (loading || categoriesLoading || categories.length === 0) ? '#9ca3af' : '#294487',
              color: 'white',
              border: 'none',
              borderRadius: 6,
              cursor: (loading || categoriesLoading || categories.length === 0) ? 'not-allowed' : 'pointer',
              fontWeight: 500
            }}
          >
            {loading ? 'Criando...' : 'Criar Imóvel'}
          </button>
        </div>
      </form>
    </div>
  )
}
