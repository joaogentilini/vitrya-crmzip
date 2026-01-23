'use client'

import { useMemo, useState, useTransition } from 'react'
import { updatePropertyAction } from './actions'

interface PropertyCategory {
  id: string
  name: string
  is_active: boolean
  position: number
}

interface Property {
  id: string
  status: string
  purpose: string

  // ✅ categoria/classificação
  property_category_id?: string | null
  property_category_name?: string | null

  title: string
  city?: string | null
  neighborhood?: string | null
  address?: string | null
  price?: number | null
  rent_price?: number | null
  area_m2?: number | null
  bedrooms?: number | null
  bathrooms?: number | null
  parking?: number | null
  description?: string | null

  owner_user_id: string
  created_at: string
}

interface PropertyEditorProps {
  property: Property
  propertyCategories?: PropertyCategory[] // ✅ novo
  onSave: (updatedProperty: Property) => void
  onCancel: () => void
}

export default function PropertyEditor({
  property,
  propertyCategories = [],
  onSave,
  onCancel
}: PropertyEditorProps) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const categoriesById = useMemo(() => {
    const m = new Map<string, PropertyCategory>()
    for (const c of propertyCategories) m.set(c.id, c)
    return m
  }, [propertyCategories])

  const [formData, setFormData] = useState({
    title: property.title,
    purpose: property.purpose,

    // ✅ categoria
    property_category_id: property.property_category_id ?? '',

    city: property.city || '',
    neighborhood: property.neighborhood || '',
    address: property.address || '',
    price: property.price?.toString() || '',
    rent_price: property.rent_price?.toString() || '',
    area_m2: property.area_m2?.toString() || '',
    bedrooms: property.bedrooms?.toString() || '',
    bathrooms: property.bathrooms?.toString() || '',
    parking: property.parking?.toString() || '',
    description: property.description || '',
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    startTransition(async () => {
      try {
        const normalizedCategoryId =
          formData.property_category_id && formData.property_category_id.trim()
            ? formData.property_category_id.trim()
            : null

        const result = await updatePropertyAction(property.id, {
          title: formData.title.trim(),
          purpose: formData.purpose,

          // ✅ envia pro backend
          property_category_id: normalizedCategoryId,

          city: formData.city.trim() || undefined,
          neighborhood: formData.neighborhood.trim() || undefined,
          address: formData.address.trim() || undefined,
          price: formData.price ? parseFloat(formData.price) : undefined,
          rent_price: formData.rent_price ? parseFloat(formData.rent_price) : undefined,
          area_m2: formData.area_m2 ? parseFloat(formData.area_m2) : undefined,
          bedrooms: formData.bedrooms ? parseInt(formData.bedrooms) : undefined,
          bathrooms: formData.bathrooms ? parseInt(formData.bathrooms) : undefined,
          parking: formData.parking ? parseInt(formData.parking) : undefined,
          description: formData.description.trim() || undefined,
        })

        if (!result.success) {
          setError(result.error || 'Erro ao salvar imóvel')
          return
        }

        const categoryName =
          normalizedCategoryId ? (categoriesById.get(normalizedCategoryId)?.name ?? null) : null

        onSave({
          ...property,
          ...result.data,

          // ✅ garante que a UI atualize imediatamente
          property_category_id: normalizedCategoryId,
          property_category_name: categoryName,
        })
      } catch {
        setError('Erro inesperado ao salvar imóvel')
      }
    })
  }

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  return (
    <form onSubmit={handleSubmit} style={{ opacity: 0.85 }}>
      {error && (
        <div style={{
          padding: 12,
          backgroundColor: '#fef2f2',
          border: '1px solid #fecaca',
          borderRadius: 8,
          color: '#dc2626',
          marginBottom: 16,
        }}>
          {error}
        </div>
      )}

      <div style={{ display: 'grid', gap: 16 }}>
        {/* Título e Tipo */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div>
            <label style={{ display: 'block', fontWeight: 600, marginBottom: 4 }}>
              Título *
            </label>
            <input
              type="text"
              value={formData.title}
              onChange={(e) => handleInputChange('title', e.target.value)}
              required
              style={{
                width: '100%',
                padding: '8px 12px',
                border: '1px solid #d1d5db',
                borderRadius: 6,
                fontSize: 14,
              }}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontWeight: 600, marginBottom: 4 }}>
              Tipo *
            </label>
            <select
              value={formData.purpose}
              onChange={(e) => handleInputChange('purpose', e.target.value)}
              required
              style={{
                width: '100%',
                padding: '8px 12px',
                border: '1px solid #d1d5db',
                borderRadius: 6,
                fontSize: 14,
              }}
            >
              <option value="sale">Venda</option>
              <option value="rent">Aluguel</option>
            </select>
          </div>
        </div>

        {/* ✅ Categoria do imóvel */}
        <div>
          <label style={{ display: 'block', fontWeight: 600, marginBottom: 4 }}>
            Categoria do imóvel
          </label>
          <select
            value={formData.property_category_id}
            onChange={(e) => handleInputChange('property_category_id', e.target.value)}
            style={{
              width: '100%',
              padding: '8px 12px',
              border: '1px solid #d1d5db',
              borderRadius: 6,
              fontSize: 14,
              backgroundColor: 'white',
            }}
          >
            <option value="">Selecione…</option>
            {propertyCategories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>

          {propertyCategories.length === 0 ? (
            <div style={{ marginTop: 6, fontSize: 12, opacity: 0.7 }}>
              Nenhuma categoria cadastrada/ativa ainda.
            </div>
          ) : null}
        </div>

        {/* Cidade e Bairro */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div>
            <label style={{ display: 'block', fontWeight: 600, marginBottom: 4 }}>
              Cidade
            </label>
            <input
              type="text"
              value={formData.city}
              onChange={(e) => handleInputChange('city', e.target.value)}
              style={{
                width: '100%',
                padding: '8px 12px',
                border: '1px solid #d1d5db',
                borderRadius: 6,
                fontSize: 14,
              }}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontWeight: 600, marginBottom: 4 }}>
              Bairro
            </label>
            <input
              type="text"
              value={formData.neighborhood}
              onChange={(e) => handleInputChange('neighborhood', e.target.value)}
              style={{
                width: '100%',
                padding: '8px 12px',
                border: '1px solid #d1d5db',
                borderRadius: 6,
                fontSize: 14,
              }}
            />
          </div>
        </div>

        {/* Endereço */}
        <div>
          <label style={{ display: 'block', fontWeight: 600, marginBottom: 4 }}>
            Endereço
          </label>
          <input
            type="text"
            value={formData.address}
            onChange={(e) => handleInputChange('address', e.target.value)}
            style={{
              width: '100%',
              padding: '8px 12px',
              border: '1px solid #d1d5db',
              borderRadius: 6,
              fontSize: 14,
            }}
          />
        </div>

        {/* Preços */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div>
            <label style={{ display: 'block', fontWeight: 600, marginBottom: 4 }}>
              Preço de Venda
            </label>
            <input
              type="number"
              step="0.01"
              value={formData.price}
              onChange={(e) => handleInputChange('price', e.target.value)}
              style={{
                width: '100%',
                padding: '8px 12px',
                border: '1px solid #d1d5db',
                borderRadius: 6,
                fontSize: 14,
              }}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontWeight: 600, marginBottom: 4 }}>
              Preço de Aluguel
            </label>
            <input
              type="number"
              step="0.01"
              value={formData.rent_price}
              onChange={(e) => handleInputChange('rent_price', e.target.value)}
              style={{
                width: '100%',
                padding: '8px 12px',
                border: '1px solid #d1d5db',
                borderRadius: 6,
                fontSize: 14,
              }}
            />
          </div>
        </div>

        {/* Área e Características */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 16 }}>
          <div>
            <label style={{ display: 'block', fontWeight: 600, marginBottom: 4 }}>
              Área (m²)
            </label>
            <input
              type="number"
              step="0.01"
              value={formData.area_m2}
              onChange={(e) => handleInputChange('area_m2', e.target.value)}
              style={{
                width: '100%',
                padding: '8px 12px',
                border: '1px solid #d1d5db',
                borderRadius: 6,
                fontSize: 14,
              }}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontWeight: 600, marginBottom: 4 }}>
              Quartos
            </label>
            <input
              type="number"
              min="0"
              value={formData.bedrooms}
              onChange={(e) => handleInputChange('bedrooms', e.target.value)}
              style={{
                width: '100%',
                padding: '8px 12px',
                border: '1px solid #d1d5db',
                borderRadius: 6,
                fontSize: 14,
              }}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontWeight: 600, marginBottom: 4 }}>
              Banheiros
            </label>
            <input
              type="number"
              min="0"
              value={formData.bathrooms}
              onChange={(e) => handleInputChange('bathrooms', e.target.value)}
              style={{
                width: '100%',
                padding: '8px 12px',
                border: '1px solid #d1d5db',
                borderRadius: 6,
                fontSize: 14,
              }}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontWeight: 600, marginBottom: 4 }}>
              Vagas
            </label>
            <input
              type="number"
              min="0"
              value={formData.parking}
              onChange={(e) => handleInputChange('parking', e.target.value)}
              style={{
                width: '100%',
                padding: '8px 12px',
                border: '1px solid #d1d5db',
                borderRadius: 6,
                fontSize: 14,
              }}
            />
          </div>
        </div>

        {/* Descrição */}
        <div>
          <label style={{ display: 'block', fontWeight: 600, marginBottom: 4 }}>
            Descrição
          </label>
          <textarea
            value={formData.description}
            onChange={(e) => handleInputChange('description', e.target.value)}
            rows={4}
            style={{
              width: '100%',
              padding: '8px 12px',
              border: '1px solid #d1d5db',
              borderRadius: 6,
              fontSize: 14,
              resize: 'vertical',
            }}
          />
        </div>

        {/* Botões */}
        <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end', marginTop: 24 }}>
          <button
            type="button"
            onClick={onCancel}
            disabled={isPending}
            style={{
              padding: '8px 16px',
              border: '1px solid #d1d5db',
              backgroundColor: 'white',
              borderRadius: 6,
              cursor: isPending ? 'not-allowed' : 'pointer',
              opacity: isPending ? 0.5 : 1,
            }}
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={isPending}
            style={{
              padding: '8px 16px',
              backgroundColor: '#294487',
              color: 'white',
              border: 'none',
              borderRadius: 6,
              cursor: isPending ? 'not-allowed' : 'pointer',
              opacity: isPending ? 0.5 : 1,
            }}
          >
            {isPending ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </div>
    </form>
  )
}
