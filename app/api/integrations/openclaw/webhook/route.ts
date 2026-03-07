import { NextRequest, NextResponse } from 'next/server'

import { handleOpenClawWebhook } from './handler'

export const runtime = 'nodejs'

export async function GET(_request: NextRequest) {
  return NextResponse.json({
    ok: true,
    service: 'openclaw_webhook',
    message: 'Endpoint ativo.',
  })
}

export async function POST(request: NextRequest) {
  return handleOpenClawWebhook(request, null)
}
