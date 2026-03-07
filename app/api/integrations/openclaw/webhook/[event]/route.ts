import { NextRequest } from 'next/server'

import { handleOpenClawWebhook } from '../handler'

export const runtime = 'nodejs'

type RouteContext = {
  params: { event: string } | Promise<{ event: string }>
}

export async function POST(request: NextRequest, context: RouteContext) {
  const { event } = await context.params
  return handleOpenClawWebhook(request, String(event || '').trim() || null)
}
