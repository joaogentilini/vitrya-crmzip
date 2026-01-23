export const dynamic = 'force-dynamic'
export const revalidate = 0

import { createClient } from '@/lib/supabaseServer'
import { redirect } from 'next/navigation'
import { CampaignsClient } from './CampaignsClient'
import { requireRole } from '@/lib/auth'

interface PropertyCategory {
  id: string
  name: string
  is_active: boolean
  position: number
}

interface TemplateWithTasks {
  id: string
  property_category_id: string | null
  property_type_id?: string | null // fallback (legado)
  name: string
  is_active: boolean
  campaign_template_tasks?: Array<any>
}

export default async function CampaignsPage() {
  const profile = await requireRole(['admin', 'gestor'])
  if (!profile) redirect('/dashboard')

  const supabase = await createClient()

  // Agora listamos CATEGORIAS (classificação)
  const { data: categoriesRaw, error: catErr } = await supabase
    .from('property_categories')
    .select('id, name, is_active, position')
    .order('position', { ascending: true })

  // Templates agora devem vir por property_category_id (mas mantemos fallback com property_type_id)
  const { data: templatesRaw, error: tplErr } = await supabase
    .from('campaign_templates')
    .select(
      'id, property_category_id, property_type_id, name, is_active, campaign_template_tasks(id, day_offset, title, channel, is_required, position, whatsapp_text, reel_script, ads_checklist)'
    )

  if (catErr || tplErr) {
    return (
      <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] p-6">
        <h1 className="text-lg font-semibold text-[var(--foreground)]">Campanhas</h1>
        <p className="mt-2 text-sm text-[var(--muted-foreground)]">
          Não foi possível carregar os dados de campanhas.
        </p>
        <pre className="mt-4 text-xs whitespace-pre-wrap text-[var(--muted-foreground)]">
          {JSON.stringify({ catErr, tplErr }, null, 2)}
        </pre>
      </div>
    )
  }

  const propertyCategories: PropertyCategory[] = categoriesRaw || []
  const templates: TemplateWithTasks[] = templatesRaw || []

  return <CampaignsClient propertyCategories={propertyCategories} templates={templates} />

}
