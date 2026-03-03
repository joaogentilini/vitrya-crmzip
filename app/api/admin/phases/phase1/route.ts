import { NextRequest, NextResponse } from 'next/server'

import { createClient } from '@/lib/supabaseServer'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type ReadinessCheck = {
  key: string
  label: string
  critical: boolean
  ok: boolean
  details: string
}

type ReadinessResult = {
  ok: boolean
  critical_failures: string[]
  checks: ReadinessCheck[]
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
  return `PHASE1-${yyyy}${mm}${dd}-${hh}${mi}${ss}`
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
        details: 'Relação ausente no schema (migration pendente).',
      }
    }

    return {
      key: relation,
      label,
      critical,
      ok: false,
      details: res.error.message || 'Erro ao validar relação.',
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

async function checkDoctor(admin: ReturnType<typeof createAdminClient>): Promise<ReadinessCheck> {
  const doctorRes = await admin.rpc('vitrya_doctor')

  if (doctorRes.error) {
    if (isSchemaMissingError(doctorRes.error.code, doctorRes.error.message)) {
      return {
        key: 'vitrya_doctor',
        label: 'Diagnóstico de schema (vitrya_doctor)',
        critical: true,
        ok: false,
        details: 'Função vitrya_doctor() não encontrada.',
      }
    }

    return {
      key: 'vitrya_doctor',
      label: 'Diagnóstico de schema (vitrya_doctor)',
      critical: true,
      ok: false,
      details: doctorRes.error.message || 'Erro ao executar vitrya_doctor().',
    }
  }

  const payload = (doctorRes.data || {}) as { ok?: boolean; error?: string }
  if (payload.ok !== true) {
    return {
      key: 'vitrya_doctor',
      label: 'Diagnóstico de schema (vitrya_doctor)',
      critical: true,
      ok: false,
      details: payload.error || 'Diagnóstico retornou inconsistências.',
    }
  }

  return {
    key: 'vitrya_doctor',
    label: 'Diagnóstico de schema (vitrya_doctor)',
    critical: true,
    ok: true,
    details: 'OK',
  }
}

async function buildReadiness(): Promise<ReadinessResult> {
  const admin = createAdminClient()

  const checks: ReadinessCheck[] = []
  checks.push(await checkDoctor(admin))

  const relationChecks = await Promise.all([
    checkRelation(admin, 'deals', 'Tabela de deals (ERP core)', true),
    checkRelation(admin, 'deal_commission_snapshots', 'Tabela de snapshots de comissão por deal', true),
    checkRelation(admin, 'receivables', 'Tabela de contas a receber', true),
    checkRelation(admin, 'payables', 'Tabela de contas a pagar', true),
    checkRelation(admin, 'payments', 'Tabela de pagamentos', true),
    checkRelation(admin, 'property_proposals', 'Tabela de propostas (origem comercial)', true),
    checkRelation(admin, 'v_public_properties', 'View pública de imóveis', false),
    checkRelation(admin, 'v_public_properties_ext', 'View pública estendida de imóveis', false),
  ])

  checks.push(...relationChecks)

  const criticalFailures = checks.filter((item) => item.critical && !item.ok).map((item) => item.label)
  return {
    ok: criticalFailures.length === 0,
    critical_failures: criticalFailures,
    checks,
  }
}

function summarizeProductionReady(readiness: ReadinessResult) {
  const checksByKey = new Map(readiness.checks.map((item) => [item.key, item]))
  return {
    crm_core: true,
    vitrine_base:
      Boolean(checksByKey.get('v_public_properties')?.ok) && Boolean(checksByKey.get('v_public_properties_ext')?.ok),
    erp_finance_schema:
      Boolean(checksByKey.get('deals')?.ok) &&
      Boolean(checksByKey.get('deal_commission_snapshots')?.ok) &&
      Boolean(checksByKey.get('receivables')?.ok) &&
      Boolean(checksByKey.get('payables')?.ok) &&
      Boolean(checksByKey.get('payments')?.ok),
    schema_doctor: Boolean(checksByKey.get('vitrya_doctor')?.ok),
  }
}

export async function GET() {
  const auth = await validateManager()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const readiness = await buildReadiness()

  return NextResponse.json({
    phase: 'phase1_erp_core',
    generated_at: new Date().toISOString(),
    requested_by: {
      id: auth.user.id,
      role: auth.profile.role,
    },
    production_ready: summarizeProductionReady(readiness),
    readiness,
    how_to_start: {
      method: 'POST',
      endpoint: '/api/admin/phases/phase1',
      body: { confirm: true, note: 'Iniciando Fase 1 ERP V1' },
    },
  })
}

export async function POST(request: NextRequest) {
  const auth = await validateManager()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const confirm = body?.confirm === true
  const noteRaw = typeof body?.note === 'string' ? body.note.trim() : ''
  const note = noteRaw.length > 0 ? noteRaw.slice(0, 1500) : null

  if (!confirm) {
    return NextResponse.json(
      {
        ok: false,
        error: 'Confirmação obrigatória. Envie { "confirm": true } para iniciar a Fase 1.',
      },
      { status: 400 }
    )
  }

  const readiness = await buildReadiness()
  if (!readiness.ok) {
    return NextResponse.json(
      {
        ok: false,
        error: 'Readiness reprovado. Corrija as falhas críticas antes de iniciar a Fase 1.',
        readiness,
      },
      { status: 412 }
    )
  }

  const now = new Date()
  const checkpointId = buildCheckpointId(now)
  const admin = createAdminClient()

  const auditPayload: UserAuditLogInsert = {
    actor_id: auth.user.id,
    target_user_id: auth.user.id,
    action: 'phase1_kickoff',
    details: {
      phase: 'phase1_erp_core',
      checkpoint_id: checkpointId,
      note,
      production_ready: summarizeProductionReady(readiness),
      readiness_summary: readiness.checks.map((item) => ({
        key: item.key,
        ok: item.ok,
        critical: item.critical,
      })),
    },
    created_at: now.toISOString(),
  }

  const auditInsert = await admin.from('user_audit_logs').insert(auditPayload)
  if (auditInsert.error) {
    return NextResponse.json(
      {
        ok: false,
        error: `Falha ao registrar checkpoint da Fase 1: ${auditInsert.error.message}`,
      },
      { status: 500 }
    )
  }

  return NextResponse.json(
    {
      ok: true,
      message: 'Fase 1 iniciada com sucesso.',
      phase: 'phase1_erp_core',
      checkpoint_id: checkpointId,
      started_at: now.toISOString(),
      started_by: {
        id: auth.user.id,
        role: auth.profile.role,
      },
      production_ready: summarizeProductionReady(readiness),
    },
    { status: 201 }
  )
}
