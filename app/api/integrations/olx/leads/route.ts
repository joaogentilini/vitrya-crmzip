import { NextResponse } from 'next/server'

import { ingestPortalLeadEvent } from '@/lib/integrations/portals/leadIngestion'
import { isPortalIntegrationsEnabled, isValidBearerToken } from '@/lib/integrations/portals/security'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  if (!isPortalIntegrationsEnabled()) {
    return NextResponse.json(
      { ok: false, error: 'PORTAL_INTEGRATIONS_ENABLED desabilitado.' },
      { status: 503 }
    )
  }

  const expectedToken = process.env.OLX_WEBHOOK_TOKEN
  if (!isValidBearerToken(request, expectedToken)) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  const payload = await request.json().catch(() => null)
  if (!payload || typeof payload !== 'object') {
    return NextResponse.json({ ok: false, error: 'Payload JSON inválido.' }, { status: 400 })
  }

  const headers: Record<string, string> = {}
  request.headers.forEach((value, key) => {
    headers[key] = value
  })

  const result = await ingestPortalLeadEvent({
    provider: 'olx',
    payload: payload as Record<string, unknown>,
    headers,
  })

  if (!result.ok) {
    return NextResponse.json(result, { status: 500 })
  }

  if (result.status === 'ignored') {
    return NextResponse.json(result, { status: 202 })
  }

  return NextResponse.json(result)
}
