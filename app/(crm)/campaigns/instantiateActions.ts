'use server'

import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'

async function supabaseServer() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }: any) =>
              (cookieStore as any).set(name, value, options)
            )
          } catch {
            // Server Action/Server Component - ignore
          }
        },
      },
    }
  )
}

function utcDateOnly(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
}

function toDateString(date: Date) {
  return date.toISOString().slice(0, 10)
}

export async function instantiateCampaignTemplate(propertyId: string, templateId: string) {
  if (!propertyId || !templateId) {
    throw new Error('propertyId e templateId obrigatórios.')
  }

  const supabase = await supabaseServer()
  const { data: userData, error: userError } = await supabase.auth.getUser()

  if (userError || !userData?.user) {
    throw new Error('Usuário não autenticado.')
  }

  const { data: property, error: propertyError } = await supabase
    .from('properties')
    .select('id')
    .eq('id', propertyId)
    .maybeSingle()

  if (propertyError) throw new Error(propertyError.message)
  if (!property) throw new Error('Sem acesso ao imóvel.')

  const { data: existingTasks, error: existingError } = await supabase
    .from('property_campaign_tasks')
    .select('id')
    .eq('property_id', propertyId)
    .limit(1)

  if (existingError) throw new Error(existingError.message)
  if (existingTasks && existingTasks.length > 0) {
    throw new Error('Campanha já instanciada.')
  }

  const { data: templateItems, error: itemsError } = await supabase
    .from('campaign_template_items')
    .select(
      'day_offset, position, title, channel, is_required, whatsapp_text, reel_script, ads_checklist'
    )
    .eq('template_id', templateId)
    .order('day_offset', { ascending: true })
    .order('position', { ascending: true })

  if (itemsError) throw new Error(itemsError.message)
  if (!templateItems || templateItems.length === 0) {
    throw new Error('Template sem itens.')
  }

  const baseDate = utcDateOnly(new Date())
  const nowIso = new Date().toISOString()

  const payload = templateItems.map((item) => {
    const dayOffset = Number.isFinite(item.day_offset) ? item.day_offset : 0
    const dueDate = new Date(baseDate)
    dueDate.setUTCDate(dueDate.getUTCDate() + dayOffset)

    return {
      property_id: propertyId,
      day_offset: dayOffset,
      title: item.title,
      channel: item.channel,
      is_required: item.is_required ?? false,
      due_date: toDateString(dueDate),
      done_at: null,
      whatsapp_text: item.whatsapp_text ?? null,
      reel_script: item.reel_script ?? null,
      ads_checklist: item.ads_checklist ?? null,
      position: item.position ?? 0,
      created_at: nowIso,
    }
  })

  const batchSize = 100
  let inserted = 0

  for (let i = 0; i < payload.length; i += batchSize) {
    const batch = payload.slice(i, i + batchSize)
    const { error } = await supabase.from('property_campaign_tasks').insert(batch)

    if (error) throw new Error(error.message)
    inserted += batch.length
  }

  return { inserted }
}
