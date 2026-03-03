import { NextRequest, NextResponse } from 'next/server'

import { handleEvolutionWebhook } from './handler'

export const runtime = 'nodejs'

export async function GET(_request: NextRequest) {
  return NextResponse.json({
    ok: true,
    service: 'evolution_webhook',
    message: 'Endpoint ativo.',
  })
}

export async function POST(request: NextRequest) {
  return handleEvolutionWebhook(request, null)
}
