import { NextRequest, NextResponse } from 'next/server'

import { createClient } from '@/lib/supabaseServer'
import { createAdminClient } from '@/lib/supabase/admin'

const PROVIDERS = new Set(['grupoolx', 'olx', 'meta'])
const STATUSES = new Set(['received', 'duplicate', 'processed', 'ignored', 'error'])

function parseLimit(raw: string | null): number {
  const parsed = Number(raw || 50)
  if (!Number.isFinite(parsed)) return 50
  return Math.max(1, Math.min(200, Math.floor(parsed)))
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

export async function GET(request: NextRequest) {
  const auth = await validateManager()
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const provider = String(request.nextUrl.searchParams.get('provider') || '')
    .trim()
    .toLowerCase()
  const status = String(request.nextUrl.searchParams.get('status') || '')
    .trim()
    .toLowerCase()
  const limit = parseLimit(request.nextUrl.searchParams.get('limit'))

  const admin = createAdminClient()
  let query = admin
    .from('portal_webhook_events')
    .select(
      'id, provider, external_event_id, idempotency_key, event_type, status, error_message, processing_result, received_at, processed_at'
    )
    .order('received_at', { ascending: false })
    .limit(limit)

  if (PROVIDERS.has(provider)) {
    query = query.eq('provider', provider)
  }

  if (STATUSES.has(status)) {
    query = query.eq('status', status)
  }

  const eventsRes = await query
  if (eventsRes.error) {
    return NextResponse.json({ error: eventsRes.error.message }, { status: 500 })
  }

  return NextResponse.json({ events: eventsRes.data || [] })
}

