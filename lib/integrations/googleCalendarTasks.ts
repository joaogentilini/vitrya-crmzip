import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { refreshGoogleTokens } from '@/lib/integrations/googleCalendarApi'

const GOOGLE_CALENDAR_API_BASE = 'https://www.googleapis.com/calendar/v3'
const DEFAULT_EVENT_DURATION_MINUTES = Number.parseInt(
  process.env.GOOGLE_CALENDAR_DEFAULT_DURATION_MINUTES || '30',
  10
)

type GoogleIntegrationRow = {
  user_id: string
  google_email: string | null
  calendar_id: string | null
  access_token: string
  refresh_token: string | null
  token_type: string | null
  scope: string | null
  expires_at: string | null
  sync_enabled: boolean
  auto_create_from_tasks: boolean
}

type GoogleTaskEventRow = {
  task_id: string
  user_id: string
  google_event_id: string
  calendar_id: string
}

type OpenTaskSyncInput = {
  id: string
  lead_id: string
  title: string
  type: string
  due_at: string
  assigned_to: string
}

type RemoveTaskSyncInput = {
  id: string
  assigned_to: string
}

const TASK_TYPE_LABELS: Record<string, string> = {
  call: 'Ligacao',
  whatsapp: 'WhatsApp',
  visit: 'Visita',
  proposal: 'Proposta',
  email: 'E-mail',
  other: 'Outro',
}

function safeText(input: string | null | undefined, fallback = '-'): string {
  const value = (input || '').trim()
  return value.length ? value : fallback
}

function buildGoogleEventPayload(task: OpenTaskSyncInput, leadTitle: string) {
  const start = new Date(task.due_at)
  const durationMinutes = Number.isFinite(DEFAULT_EVENT_DURATION_MINUTES) && DEFAULT_EVENT_DURATION_MINUTES > 0
    ? DEFAULT_EVENT_DURATION_MINUTES
    : 30
  const end = new Date(start.getTime() + durationMinutes * 60 * 1000)
  const typeLabel = TASK_TYPE_LABELS[task.type] ?? task.type

  return {
    summary: `${safeText(leadTitle, 'Lead')} - ${safeText(task.title, 'Tarefa')}`,
    description: [
      `Lead: ${safeText(leadTitle, 'Lead')}`,
      `Tipo: ${safeText(typeLabel, 'Outro')}`,
      `Task ID: ${task.id}`,
      `Lead ID: ${task.lead_id}`,
      '',
      'Evento criado automaticamente pelo CRM Vitrya.',
    ].join('\n'),
    start: { dateTime: start.toISOString() },
    end: { dateTime: end.toISOString() },
    reminders: { useDefault: true },
  }
}

async function updateIntegrationError(userId: string, message: string | null) {
  try {
    const admin = createAdminClient()
    await admin
      .from('user_google_calendar_integrations')
      .update({ last_error: message })
      .eq('user_id', userId)
  } catch (err) {
    console.error('[google-calendar] failed to update last_error', err)
  }
}

async function ensureValidAccessToken(integration: GoogleIntegrationRow): Promise<string | null> {
  const now = Date.now()
  const expiry = integration.expires_at ? Date.parse(integration.expires_at) : Number.POSITIVE_INFINITY
  const isExpired = !Number.isFinite(expiry) ? false : expiry - now < 60_000

  if (!isExpired && integration.access_token) {
    return integration.access_token
  }

  if (!integration.refresh_token) {
    await updateIntegrationError(integration.user_id, 'Google refresh token ausente.')
    return null
  }

  try {
    const refreshed = await refreshGoogleTokens(integration.refresh_token)
    const expiresAt = refreshed.expires_in
      ? new Date(Date.now() + Number(refreshed.expires_in) * 1000).toISOString()
      : null

    const admin = createAdminClient()
    await admin
      .from('user_google_calendar_integrations')
      .update({
        access_token: refreshed.access_token,
        refresh_token: refreshed.refresh_token ?? integration.refresh_token,
        token_type: refreshed.token_type ?? integration.token_type,
        scope: refreshed.scope ?? integration.scope,
        expires_at: expiresAt,
        last_error: null,
      })
      .eq('user_id', integration.user_id)

    return refreshed.access_token
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Google token refresh falhou.'
    await updateIntegrationError(integration.user_id, message)
    console.error('[google-calendar] token refresh error', err)
    return null
  }
}

async function getLeadTitle(leadId: string): Promise<string> {
  try {
    const admin = createAdminClient()
    const { data } = await admin
      .from('leads')
      .select('title')
      .eq('id', leadId)
      .maybeSingle()
    return safeText((data as any)?.title, 'Lead')
  } catch {
    return 'Lead'
  }
}

export async function syncOpenTaskToGoogleCalendar(task: OpenTaskSyncInput): Promise<void> {
  try {
    if (!task.assigned_to) return

    const admin = createAdminClient()
    const { data: integrationData } = await admin
      .from('user_google_calendar_integrations')
      .select(
        'user_id, google_email, calendar_id, access_token, refresh_token, token_type, scope, expires_at, sync_enabled, auto_create_from_tasks'
      )
      .eq('user_id', task.assigned_to)
      .maybeSingle()

    const integration = integrationData as GoogleIntegrationRow | null
    if (!integration || !integration.sync_enabled || !integration.auto_create_from_tasks) return

    const accessToken = await ensureValidAccessToken(integration)
    if (!accessToken) return

    const calendarId = integration.calendar_id || 'primary'
    const leadTitle = await getLeadTitle(task.lead_id)
    const payload = buildGoogleEventPayload(task, leadTitle)

    const { data: eventMapData } = await admin
      .from('google_calendar_task_events')
      .select('task_id, user_id, google_event_id, calendar_id')
      .eq('task_id', task.id)
      .eq('user_id', task.assigned_to)
      .maybeSingle()
    const eventMap = eventMapData as GoogleTaskEventRow | null

    if (eventMap?.google_event_id) {
      const updateRes = await fetch(
        `${GOOGLE_CALENDAR_API_BASE}/calendars/${encodeURIComponent(
          eventMap.calendar_id || calendarId
        )}/events/${encodeURIComponent(eventMap.google_event_id)}`,
        {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
          cache: 'no-store',
        }
      )

      if (updateRes.ok) {
        await admin
          .from('google_calendar_task_events')
          .update({ last_synced_at: new Date().toISOString() })
          .eq('task_id', task.id)
          .eq('user_id', task.assigned_to)
        await updateIntegrationError(task.assigned_to, null)
        return
      }

      if (updateRes.status !== 404) {
        const detail = await updateRes.text().catch(() => '')
        await updateIntegrationError(task.assigned_to, `Google event update failed: ${detail || updateRes.status}`)
        return
      }
    }

    const createRes = await fetch(
      `${GOOGLE_CALENDAR_API_BASE}/calendars/${encodeURIComponent(calendarId)}/events`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        cache: 'no-store',
      }
    )

    if (!createRes.ok) {
      const detail = await createRes.text().catch(() => '')
      await updateIntegrationError(task.assigned_to, `Google event create failed: ${detail || createRes.status}`)
      return
    }

    const eventBody = (await createRes.json().catch(() => null)) as { id?: string } | null
    if (!eventBody?.id) {
      await updateIntegrationError(task.assigned_to, 'Google event create failed: missing event id.')
      return
    }

    await admin.from('google_calendar_task_events').upsert(
      {
        task_id: task.id,
        user_id: task.assigned_to,
        google_event_id: eventBody.id,
        calendar_id: calendarId,
        last_synced_at: new Date().toISOString(),
      },
      { onConflict: 'task_id,user_id' }
    )

    await updateIntegrationError(task.assigned_to, null)
  } catch (err) {
    console.error('[google-calendar] sync open task failed', err)
  }
}

export async function removeTaskFromGoogleCalendar(task: RemoveTaskSyncInput): Promise<void> {
  try {
    if (!task.assigned_to) return
    const admin = createAdminClient()

    const { data: eventMapData } = await admin
      .from('google_calendar_task_events')
      .select('task_id, user_id, google_event_id, calendar_id')
      .eq('task_id', task.id)
      .eq('user_id', task.assigned_to)
      .maybeSingle()

    const eventMap = eventMapData as GoogleTaskEventRow | null
    if (!eventMap) return

    const { data: integrationData } = await admin
      .from('user_google_calendar_integrations')
      .select(
        'user_id, google_email, calendar_id, access_token, refresh_token, token_type, scope, expires_at, sync_enabled, auto_create_from_tasks'
      )
      .eq('user_id', task.assigned_to)
      .maybeSingle()

    const integration = integrationData as GoogleIntegrationRow | null
    if (!integration) {
      await admin
        .from('google_calendar_task_events')
        .delete()
        .eq('task_id', task.id)
        .eq('user_id', task.assigned_to)
      return
    }

    const accessToken = await ensureValidAccessToken(integration)
    if (!accessToken) return

    const deleteRes = await fetch(
      `${GOOGLE_CALENDAR_API_BASE}/calendars/${encodeURIComponent(
        eventMap.calendar_id || integration.calendar_id || 'primary'
      )}/events/${encodeURIComponent(eventMap.google_event_id)}`,
      {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: 'no-store',
      }
    )

    if (deleteRes.ok || deleteRes.status === 404) {
      await admin
        .from('google_calendar_task_events')
        .delete()
        .eq('task_id', task.id)
        .eq('user_id', task.assigned_to)
      await updateIntegrationError(task.assigned_to, null)
      return
    }

    const detail = await deleteRes.text().catch(() => '')
    await updateIntegrationError(task.assigned_to, `Google event delete failed: ${detail || deleteRes.status}`)
  } catch (err) {
    console.error('[google-calendar] remove task event failed', err)
  }
}

