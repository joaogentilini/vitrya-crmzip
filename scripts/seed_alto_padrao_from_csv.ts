import fs from 'node:fs'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'

const csvPath = path.resolve(process.cwd(), 'docs/alto_padrao_plan.csv')
const propertyId = process.env.PROPERTY_ID ?? process.argv[2]
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!propertyId) {
  throw new Error('Missing property id. Provide PROPERTY_ID env var or first CLI arg.')
}

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

const baseDate = new Date()
baseDate.setHours(0, 0, 0, 0)

const nowIso = new Date().toISOString()

const allowedChannels = new Set(['whatsapp', 'reels', 'story', 'feed', 'ads'])
const channelMap: Record<string, string> = {
  whatsapp: 'whatsapp',
  reels: 'reels',
  stories: 'story',
  story: 'story',
  instagram: 'feed',
  feed: 'feed',
  carrossel: 'feed',
  ads: 'ads',
}

function normalizeChannel(rawValue: string) {
  const normalized = rawValue.trim().toLowerCase()
  const mapped = channelMap[normalized] ?? 'feed'
  if (!allowedChannels.has(mapped)) {
    throw new Error(`Unsupported channel value: ${rawValue}`)
  }
  if (mapped !== normalized && normalized.length > 0) {
    console.warn(`Channel "${rawValue}" mapped to "${mapped}".`)
  }
  return mapped
}

const payload = rows
  .filter((row) => row.some((value) => value.trim().length > 0))
  .map((row) => {
    const dayOffsetRaw = row[headerIndex.day_offset] ?? '0'
    const dayOffset = Number.parseInt(dayOffsetRaw, 10)
    const dueDate = new Date(baseDate)
    dueDate.setDate(dueDate.getDate() + (Number.isNaN(dayOffset) ? 0 : dayOffset))

    const isRequiredRaw = (row[headerIndex.is_required] ?? '').trim().toLowerCase()

    return {
      property_id: propertyId,
      day_offset: Number.isNaN(dayOffset) ? 0 : dayOffset,
      title: (row[headerIndex.title] ?? '').trim(),
      channel: normalizeChannel(row[headerIndex.channel] ?? ''),
      is_required: isRequiredRaw === 'true',
      due_date: dueDate.toISOString(),
      done_at: null,
      whatsapp_text: (row[headerIndex.whatsapp_text] ?? '').trim(),
      reel_script: (row[headerIndex.reel_script] ?? '').trim(),
      ads_checklist: (row[headerIndex.ads_checklist] ?? '').trim(),
      position: Number.parseInt((row[headerIndex.position] ?? '0').trim(), 10) || 0,
      created_at: nowIso,
    }
  })

if (payload.length === 0) {
  throw new Error('No valid rows parsed from CSV.')
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false },
})

const chunkSize = 100

async function runSeed() {
  for (let i = 0; i < payload.length; i += chunkSize) {
    const chunk = payload.slice(i, i + chunkSize)
    const { error } = await supabase.from('property_campaign_tasks').insert(chunk)
    if (error) {
      throw new Error(error.message)
    }
  }

  console.log(`Inserted ${payload.length} tasks for property ${propertyId}.`)
}

runSeed().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
