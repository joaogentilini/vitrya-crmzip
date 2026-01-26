import fs from 'node:fs'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'

const csvPath = path.resolve(process.cwd(), 'docs/alto_padrao_plan.csv')
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.')
}

if (!fs.existsSync(csvPath)) {
  throw new Error(`CSV not found at ${csvPath}`)
}

function parseCSV(content: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false

  for (let i = 0; i < content.length; i += 1) {
    const char = content[i]

    if (inQuotes) {
      if (char === '"') {
        const next = content[i + 1]
        if (next === '"') {
          field += '"'
          i += 1
        } else {
          inQuotes = false
        }
      } else {
        field += char
      }
      continue
    }

    if (char === '"') {
      inQuotes = true
      continue
    }

    if (char === ',') {
      row.push(field)
      field = ''
      continue
    }

    if (char === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
      continue
    }

    if (char === '\r') {
      continue
    }

    field += char
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field)
    rows.push(row)
  }

  return rows
}

const csvContent = fs.readFileSync(csvPath, 'utf8')
const rows = parseCSV(csvContent)

if (rows.length <= 1) {
  throw new Error('CSV has no data rows.')
}

const header = rows.shift() as string[]
const headerIndex = header.reduce<Record<string, number>>((acc, name, idx) => {
  acc[name.trim()] = idx
  return acc
}, {})

const requiredColumns = [
  'day_offset',
  'position',
  'channel',
  'is_required',
  'title',
  'whatsapp_text',
  'reel_script',
  'ads_checklist',
]

for (const column of requiredColumns) {
  if (headerIndex[column] === undefined) {
    throw new Error(`Missing column ${column} in CSV.`)
  }
}

function normalizeChannel(rawValue: string) {
  const normalized = rawValue.trim().toLowerCase()

  if (normalized.includes('whatsapp')) return 'whatsapp'
  if (normalized.includes('reels')) return 'reels'
  if (normalized.includes('stories') || normalized.includes('story')) return 'story'
  if (normalized.includes('ads')) return 'ads'
  if (
    normalized.includes('instagram') ||
    normalized.includes('feed') ||
    normalized.includes('carrossel') ||
    normalized.includes('carrousel')
  ) {
    return 'feed'
  }

  if (!normalized) return 'feed'
  return 'feed'
}

const templateName = 'Alto Padrão 30 dias'

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false },
})

async function ensureTemplate() {
  const { data: existing, error } = await supabase
    .from('campaign_templates')
    .select('id, name')
    .eq('name', templateName)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (error) throw new Error(error.message)
  if (existing?.id) return existing.id

  const { data: created, error: createError } = await supabase
    .from('campaign_templates')
    .insert({ name: templateName, is_active: true })
    .select('id')
    .single()

  if (createError) throw new Error(createError.message)
  return created.id
}

async function runSeed() {
  const templateId = await ensureTemplate()

  const { count, error: countError } = await supabase
    .from('campaign_template_items')
    .select('id', { count: 'exact', head: true })
    .eq('template_id', templateId)

  if (countError) throw new Error(countError.message)
  if ((count ?? 0) > 0) {
    console.log('Template já possui itens. Nada para inserir.')
    return
  }

  const nowIso = new Date().toISOString()
  const payload = rows
    .filter((row) => row.some((value) => value.trim().length > 0))
    .map((row) => {
      const dayOffsetRaw = row[headerIndex.day_offset] ?? '0'
      const dayOffset = Number.parseInt(dayOffsetRaw, 10)
      const isRequiredRaw = (row[headerIndex.is_required] ?? '').trim().toLowerCase()

      return {
        template_id: templateId,
        day_offset: Number.isNaN(dayOffset) ? 0 : dayOffset,
        position: Number.parseInt((row[headerIndex.position] ?? '0').trim(), 10) || 0,
        title: (row[headerIndex.title] ?? '').trim(),
        channel: normalizeChannel(row[headerIndex.channel] ?? ''),
        is_required: isRequiredRaw === 'true',
        whatsapp_text: (row[headerIndex.whatsapp_text] ?? '').trim() || null,
        reel_script: (row[headerIndex.reel_script] ?? '').trim() || null,
        ads_checklist: (row[headerIndex.ads_checklist] ?? '').trim() || null,
        created_at: nowIso,
      }
    })
    .filter((item) => item.title.length > 0)

  if (payload.length === 0) {
    throw new Error('No valid rows parsed from CSV.')
  }

  const chunkSize = 100

  for (let i = 0; i < payload.length; i += chunkSize) {
    const chunk = payload.slice(i, i + chunkSize)
    const { error } = await supabase.from('campaign_template_items').insert(chunk)
    if (error) {
      throw new Error(error.message)
    }
  }

  console.log(`Inserted ${payload.length} items into template ${templateName}.`)
}

runSeed().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
