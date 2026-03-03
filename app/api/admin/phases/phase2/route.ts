import { NextRequest, NextResponse } from 'next/server'

import { createClient } from '@/lib/supabaseServer'
import { createAdminClient } from '@/lib/supabase/admin'
import { evaluatePublicVisibility, isLikelyTestListing } from '@/lib/publicationChecklist'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type ReadinessCheck = {
  key: string
  label: string
  critical: boolean
  ok: boolean
  details: string
}

type ActivePropertyRow = {
  id: string
  status: string | null
  title: string | null
  description: string | null
  public_code: string | null
  city: string | null
  neighborhood: string | null
  address: string | null
  latitude: number | string | null
  longitude: number | string | null
  cover_media_url: string | null
}

type CandidateItem = {
  id: string
  title: string | null
  public_code: string | null
  status: string | null
  reason_incomplete: boolean
  reason_test_like: boolean
}

type HygieneSummary = {
  active_total: number
  active_incomplete: number
  active_test_like: number
  candidates_to_hide: number
  sample_candidates: CandidateItem[]
}

type ReadinessResult = {
  ok: boolean
  critical_failures: string[]
  checks: ReadinessCheck[]
  hygiene: HygieneSummary
}

type UserAuditLogInsert = {
  actor_id: string | null
  target_user_id: string | null
  action: string
  details?: Record<string, unknown>
  created_at?: string
}

function isSchemaMissingError(code: string | null | undefined, message: string | null | undefined): boolean {
  const normalizedCode = String(code || '')
  const normalizedMessage = String(message || '').toLowerCase()
  return (
    normalizedCode === '42P01' ||
    normalizedCode === '42703' ||
    normalizedCode === 'PGRST204' ||
    normalizedCode === 'PGRST205' ||
    normalizedMessage.includes('does not exist') ||
    normalizedMessage.includes('schema cache') ||
    normalizedMessage.includes('relation')
  )
}

function buildCheckpointId(now: Date): string {
  const yyyy = String(now.getFullYear())
  const mm = String(now.getMonth() + 1).padStart(2, '0')
  const dd = String(now.getDate()).padStart(2, '0')
  const hh = String(now.getHours()).padStart(2, '0')
  const mi = String(now.getMinutes()).padStart(2, '0')
  const ss = String(now.getSeconds()).padStart(2, '0')
  return `PHASE2-${yyyy}${mm}${dd}-${hh}${mi}${ss}`
}

async function validateManager() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return null

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, role, is_active')
    .eq('id', user.id)
    .maybeSingle()

  if (!profile || profile.is_active !== true) return null
  if (profile.role !== 'admin' && profile.role !== 'gestor') return null

  return { user, profile }
}

async function checkRelation(
  admin: ReturnType<typeof createAdminClient>,
  relation: string,
  label: string,
  critical = true
): Promise<ReadinessCheck> {
  const res = await admin.from(relation).select('*', { count: 'exact', head: true }).limit(1)

  if (res.error) {
    if (isSchemaMissingError(res.error.code, res.error.message)) {
      return {
        key: relation,
        label,
        critical,
        ok: false,
        details: 'Relacao ausente no schema (migration pendente).',
      }
    }

    return {
      key: relation,
      label,
      critical,
      ok: false,
      details: res.error.message || 'Erro ao validar relacao.',
    }
  }

  return {
    key: relation,
    label,
    critical,
    ok: true,
    details: 'OK',
  }
}

async function loadActiveProperties(admin: ReturnType<typeof createAdminClient>): Promise<ActivePropertyRow[]> {
  const pageSize = 1000
  let from = 0
  const rows: ActivePropertyRow[] = []

  while (true) {
    const to = from + pageSize - 1
    const res = await admin
      .from('properties')
      .select(
        'id,status,title,description,public_code,city,neighborhood,address,latitude,longitude,cover_media_url'
      )
      .in('status', ['active', 'published'])
      .order('created_at', { ascending: false })
      .range(from, to)

    if (res.error) {
      if (isSchemaMissingError(res.error.code, res.error.message)) {
        return []
      }
      throw new Error(res.error.message || 'Falha ao carregar imoveis ativos.')
    }

    const pageRows = ((res.data || []) as unknown) as ActivePropertyRow[]
    rows.push(...pageRows)

    if (pageRows.length < pageSize) break
    from += pageSize
  }

  return rows
}

async function loadImageCountMap(
  admin: ReturnType<typeof createAdminClient>,
  propertyIds: string[]
): Promise<Map<string, number>> {
  const counts = new Map<string, number>()
  const chunkSize = 200

  for (let offset = 0; offset < propertyIds.length; offset += chunkSize) {
    const chunk = propertyIds.slice(offset, offset + chunkSize)
    if (chunk.length === 0) continue

    const res = await admin
      .from('property_media')
      .select('property_id,url')
      .in('property_id', chunk)
      .eq('kind', 'image')

    if (res.error) {
      if (isSchemaMissingError(res.error.code, res.error.message)) {
        continue
      }
      throw new Error(res.error.message || 'Falha ao carregar imagens dos imoveis.')
    }

    for (const row of (res.data || []) as Array<{ property_id?: string | null; url?: string | null }>) {
      const propertyId = row.property_id
      const url = typeof row.url === 'string' ? row.url.trim() : ''
      if (!propertyId || !url) continue
      counts.set(propertyId, (counts.get(propertyId) || 0) + 1)
    }
  }

  return counts
}

async function buildHygieneSummary(
  admin: ReturnType<typeof createAdminClient>
): Promise<{ summary: HygieneSummary; candidates: CandidateItem[] }> {
  const activeRows = await loadActiveProperties(admin)
  if (activeRows.length === 0) {
    return {
      summary: {
        active_total: 0,
        active_incomplete: 0,
        active_test_like: 0,
        candidates_to_hide: 0,
        sample_candidates: [],
      },
      candidates: [],
    }
  }

  const imageCountMap = await loadImageCountMap(
    admin,
    activeRows.map((row) => row.id)
  )

  let incompleteCount = 0
  let testLikeCount = 0
  const candidates: CandidateItem[] = []

  for (const row of activeRows) {
    const hasCover = typeof row.cover_media_url === 'string' && row.cover_media_url.trim().length > 0
    const mediaCount = Math.max(hasCover ? 1 : 0, imageCountMap.get(row.id) || 0)

    const visibility = evaluatePublicVisibility({
      mediaCount,
      city: row.city,
      neighborhood: row.neighborhood,
      address: row.address,
      latitude: row.latitude,
      longitude: row.longitude,
      requireAddressLine: true,
      requireCoordinates: true,
    })

    const isIncomplete = !visibility.publicReady
    const isTestLike = isLikelyTestListing({
      title: row.title,
      description: row.description,
      publicCode: row.public_code,
    })

    if (isIncomplete) incompleteCount += 1
    if (isTestLike) testLikeCount += 1

    if (isIncomplete || isTestLike) {
      candidates.push({
        id: row.id,
        title: row.title,
        public_code: row.public_code,
        status: row.status,
        reason_incomplete: isIncomplete,
        reason_test_like: isTestLike,
      })
    }
  }

  return {
    summary: {
      active_total: activeRows.length,
      active_incomplete: incompleteCount,
      active_test_like: testLikeCount,
      candidates_to_hide: candidates.length,
      sample_candidates: candidates.slice(0, 20),
    },
    candidates,
  }
}

async function buildReadiness(): Promise<ReadinessResult> {
  const admin = createAdminClient()
  const checks = await Promise.all([
    checkRelation(admin, 'properties', 'Tabela de imoveis (properties)', true),
    checkRelation(admin, 'property_media', 'Tabela de midias de imoveis (property_media)', true),
    checkRelation(admin, 'v_public_properties', 'View publica base de imoveis', true),
    checkRelation(admin, 'v_public_properties_ext', 'View publica estendida de imoveis', true),
  ])

  const criticalFailures = checks.filter((item) => item.critical && !item.ok).map((item) => item.label)

  let hygiene: HygieneSummary = {
    active_total: 0,
    active_incomplete: 0,
    active_test_like: 0,
    candidates_to_hide: 0,
    sample_candidates: [],
  }

  if (criticalFailures.length === 0) {
    const hygieneResult = await buildHygieneSummary(admin)
    hygiene = hygieneResult.summary
  }

  const ok = criticalFailures.length === 0 && hygiene.candidates_to_hide === 0

  return {
    ok,
    critical_failures: criticalFailures,
    checks,
    hygiene,
  }
}

export async function GET() {
  const auth = await validateManager()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const readiness = await buildReadiness()

  const checksByKey = new Map(readiness.checks.map((item) => [item.key, item]))
  const viewsReady =
    Boolean(checksByKey.get('v_public_properties')?.ok) &&
    Boolean(checksByKey.get('v_public_properties_ext')?.ok)

  return NextResponse.json({
    phase: 'phase2_public_hygiene',
    generated_at: new Date().toISOString(),
    requested_by: {
      id: auth.user.id,
      role: auth.profile.role,
    },
    production_ready: {
      views_ready: viewsReady,
      no_active_incomplete_or_test: readiness.hygiene.candidates_to_hide === 0,
      can_close_phase2: readiness.ok,
    },
    readiness,
    how_to_cleanup: {
      method: 'POST',
      endpoint: '/api/admin/phases/phase2',
      body: {
        confirm: true,
        include_incomplete: true,
        include_test_like: true,
        dry_run: false,
        note: 'Executando limpeza de vitrine da Fase 2',
      },
    },
  })
}

export async function POST(request: NextRequest) {
  const auth = await validateManager()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const confirm = body?.confirm === true
  const includeIncomplete = body?.include_incomplete !== false
  const includeTestLike = body?.include_test_like !== false
  const dryRun = body?.dry_run === true
  const noteRaw = typeof body?.note === 'string' ? body.note.trim() : ''
  const note = noteRaw.length > 0 ? noteRaw.slice(0, 1500) : null

  if (!confirm) {
    return NextResponse.json(
      {
        ok: false,
        error: 'Confirmacao obrigatoria. Envie { "confirm": true } para executar a limpeza da Fase 2.',
      },
      { status: 400 }
    )
  }

  const admin = createAdminClient()
  const hygiene = await buildHygieneSummary(admin)

  const targetCandidates = hygiene.candidates.filter((item) => {
    const incompleteMatch = includeIncomplete && item.reason_incomplete
    const testLikeMatch = includeTestLike && item.reason_test_like
    return incompleteMatch || testLikeMatch
  })

  const targetIds = targetCandidates.map((item) => item.id)

  if (dryRun) {
    return NextResponse.json({
      ok: true,
      dry_run: true,
      phase: 'phase2_public_hygiene',
      selected: {
        include_incomplete: includeIncomplete,
        include_test_like: includeTestLike,
      },
      hygiene: hygiene.summary,
      targets: {
        count: targetIds.length,
        sample: targetCandidates.slice(0, 20),
      },
    })
  }

  if (targetIds.length > 0) {
    const chunkSize = 200
    for (let offset = 0; offset < targetIds.length; offset += chunkSize) {
      const chunk = targetIds.slice(offset, offset + chunkSize)
      const res = await admin
        .from('properties')
        .update({ status: 'draft' })
        .in('id', chunk)
        .in('status', ['active', 'published'])

      if (res.error) {
        return NextResponse.json(
          {
            ok: false,
            error: `Falha ao limpar vitrine: ${res.error.message}`,
          },
          { status: 500 }
        )
      }
    }
  }

  const now = new Date()
  const checkpointId = buildCheckpointId(now)

  const auditPayload: UserAuditLogInsert = {
    actor_id: auth.user.id,
    target_user_id: auth.user.id,
    action: 'phase2_cleanup_vitrine',
    details: {
      phase: 'phase2_public_hygiene',
      checkpoint_id: checkpointId,
      note,
      selected: {
        include_incomplete: includeIncomplete,
        include_test_like: includeTestLike,
      },
      cleaned_total: targetIds.length,
      cleaned_ids_sample: targetIds.slice(0, 50),
      hygiene_before: hygiene.summary,
    },
    created_at: now.toISOString(),
  }

  const auditInsert = await admin.from('user_audit_logs').insert(auditPayload)
  if (auditInsert.error) {
    return NextResponse.json(
      {
        ok: false,
        error: `Limpeza aplicada, mas falha ao registrar auditoria da Fase 2: ${auditInsert.error.message}`,
      },
      { status: 500 }
    )
  }

  return NextResponse.json({
    ok: true,
    message: 'Limpeza da Fase 2 executada com sucesso.',
    phase: 'phase2_public_hygiene',
    checkpoint_id: checkpointId,
    cleaned_total: targetIds.length,
    cleaned_sample: targetCandidates.slice(0, 20),
    executed_at: now.toISOString(),
  })
}
