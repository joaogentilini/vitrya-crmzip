export const dynamic = 'force-dynamic'
export const revalidate = 0

import Link from 'next/link'
import { redirect } from 'next/navigation'

import { ensureUserProfile } from '@/lib/auth'
import { loadConversationMessages, loadInboxConversations } from '@/lib/chat/inbox'

import { sendInboxMessageAction, setConversationStatusAction } from './actions'

type SearchParamsShape = {
  channel?: string
  status?: string
  q?: string
  conversation?: string
  inbox_error?: string
}

function formatDateTime(value: unknown): string {
  const date = new Date(String(value || ''))
  if (Number.isNaN(date.getTime())) return '-'
  return date.toLocaleString('pt-BR')
}

function channelLabel(channel: string): string {
  const normalized = String(channel || '').toLowerCase()
  if (normalized === 'whatsapp') return 'WhatsApp'
  if (normalized === 'instagram') return 'Instagram'
  if (normalized === 'facebook') return 'Facebook'
  if (normalized === 'grupoolx') return 'Grupo OLX'
  if (normalized === 'olx') return 'OLX'
  if (normalized === 'meta') return 'Meta'
  return normalized || '-'
}

function statusLabel(status: string): string {
  const normalized = String(status || '').toLowerCase()
  if (normalized === 'open') return 'Aberta'
  if (normalized === 'pending') return 'Pendente'
  if (normalized === 'resolved') return 'Resolvida'
  if (normalized === 'archived') return 'Arquivada'
  return normalized || '-'
}

function statusBadgeClasses(status: string): string {
  const normalized = String(status || '').toLowerCase()
  if (normalized === 'open') return 'bg-emerald-500/15 text-emerald-700 border-emerald-500/30'
  if (normalized === 'pending') return 'bg-amber-500/15 text-amber-700 border-amber-500/30'
  if (normalized === 'resolved') return 'bg-sky-500/15 text-sky-700 border-sky-500/30'
  return 'bg-zinc-500/10 text-zinc-700 border-zinc-500/20'
}

function messageBubbleClasses(direction: string): string {
  return direction === 'outbound'
    ? 'ml-auto bg-[var(--primary)] text-[var(--primary-foreground)] border-[var(--primary)]'
    : direction === 'system'
    ? 'mx-auto bg-zinc-100 text-zinc-700 border-zinc-200'
    : 'mr-auto bg-[var(--card)] text-[var(--foreground)] border-[var(--border)]'
}

export default async function InboxPage({
  searchParams,
}: {
  searchParams: Promise<SearchParamsShape>
}) {
  const profile = await ensureUserProfile()
  if (!profile) redirect('/')
  if (profile.is_active === false) redirect('/blocked')

  const params = await searchParams
  const channel = String(params.channel || '').trim().toLowerCase() || null
  const status = String(params.status || '').trim().toLowerCase() || null
  const q = String(params.q || '').trim() || null
  const selectedConversationId = String(params.conversation || '').trim() || null
  const inboxError = String(params.inbox_error || '').trim() || null

  const conversationsRes = await loadInboxConversations({
    channel,
    status,
    q,
    limit: 180,
  })

  const conversations = (conversationsRes.data || []) as Array<Record<string, unknown>>
  const selectedConversation =
    conversations.find((item) => String(item.id || '') === selectedConversationId) || conversations[0] || null

  const messagesRes = selectedConversation
    ? await loadConversationMessages(String(selectedConversation.id), 250)
    : { data: [], error: null }
  const messages = (messagesRes.data || []) as Array<Record<string, unknown>>

  const filterSearch = new URLSearchParams()
  if (channel) filterSearch.set('channel', channel)
  if (status) filterSearch.set('status', status)
  if (q) filterSearch.set('q', q)
  const filterSearchString = filterSearch.toString()

  const lead = selectedConversation?.leads as Record<string, unknown> | null
  const person = selectedConversation?.people as Record<string, unknown> | null
  const property = selectedConversation?.properties as Record<string, unknown> | null
  const broker = selectedConversation?.brokers as Record<string, unknown> | null

  return (
    <main className="p-6 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[var(--foreground)]">Inbox Unificado</h1>
          <p className="text-sm text-[var(--muted-foreground)]">
            Conversas de WhatsApp, redes e portais em um unico lugar por corretor.
          </p>
        </div>
      </div>

      <form className="grid gap-3 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--card)] p-4 md:grid-cols-5">
        <div className="md:col-span-2">
          <label className="block text-xs font-medium text-[var(--muted-foreground)]">Buscar</label>
          <input
            name="q"
            defaultValue={q || ''}
            placeholder="Lead, telefone, imovel, corretor..."
            className="mt-1 h-9 w-full rounded-[var(--radius)] border border-[var(--input)] bg-[var(--background)] px-3 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-[var(--muted-foreground)]">Canal</label>
          <select
            name="channel"
            defaultValue={channel || ''}
            className="mt-1 h-9 w-full rounded-[var(--radius)] border border-[var(--input)] bg-[var(--background)] px-2 text-sm"
          >
            <option value="">Todos</option>
            <option value="whatsapp">WhatsApp</option>
            <option value="instagram">Instagram</option>
            <option value="facebook">Facebook</option>
            <option value="grupoolx">Grupo OLX</option>
            <option value="olx">OLX</option>
            <option value="meta">Meta</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-[var(--muted-foreground)]">Status</label>
          <select
            name="status"
            defaultValue={status || ''}
            className="mt-1 h-9 w-full rounded-[var(--radius)] border border-[var(--input)] bg-[var(--background)] px-2 text-sm"
          >
            <option value="">Todos</option>
            <option value="open">Aberta</option>
            <option value="pending">Pendente</option>
            <option value="resolved">Resolvida</option>
            <option value="archived">Arquivada</option>
          </select>
        </div>
        <div className="flex items-end gap-2">
          <button
            type="submit"
            className="h-9 rounded-[var(--radius)] bg-[var(--primary)] px-4 text-sm font-medium text-[var(--primary-foreground)]"
          >
            Filtrar
          </button>
          <Link
            href="/inbox"
            className="h-9 rounded-[var(--radius)] border border-[var(--border)] px-4 text-sm font-medium leading-9 text-[var(--foreground)]"
          >
            Limpar
          </Link>
        </div>
      </form>

      {inboxError ? (
        <div className="rounded-[var(--radius)] border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-700">
          {inboxError}
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[360px_minmax(0,1fr)]">
        <section className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--card)]">
          <header className="border-b border-[var(--border)] p-3">
            <div className="text-sm font-semibold text-[var(--foreground)]">
              Conversas ({conversations.length})
            </div>
          </header>

          <div className="max-h-[68vh] overflow-auto">
            {conversations.length === 0 ? (
              <div className="p-4 text-sm text-[var(--muted-foreground)]">
                Nenhuma conversa encontrada para os filtros atuais.
              </div>
            ) : (
              conversations.map((conversation) => {
                const isActive = selectedConversation?.id === conversation.id
                const rowParams = new URLSearchParams(filterSearchString)
                rowParams.set('conversation', String(conversation.id))
                const href = `/inbox?${rowParams.toString()}`

                const rowLead = conversation.leads as Record<string, unknown> | null
                const rowPerson = conversation.people as Record<string, unknown> | null
                const title =
                  String(conversation.subject || '') ||
                  String(rowLead?.title || '') ||
                  String(rowLead?.client_name || '') ||
                  String(rowPerson?.full_name || '') ||
                  `Conversa ${String(conversation.id).slice(0, 8)}`

                return (
                  <Link
                    key={String(conversation.id)}
                    href={href}
                    className={[
                      'block border-b border-[var(--border)] p-3 transition hover:bg-[var(--accent)]',
                      isActive ? 'bg-[var(--accent)]' : '',
                    ].join(' ')}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-[var(--foreground)]">{title}</div>
                        <div className="text-xs text-[var(--muted-foreground)]">
                          {channelLabel(String(conversation.channel || 'other'))}
                        </div>
                      </div>
                      <span
                        className={[
                          'rounded-full border px-2 py-0.5 text-[10px] font-semibold',
                          statusBadgeClasses(String(conversation.status || 'open')),
                        ].join(' ')}
                      >
                        {statusLabel(String(conversation.status || 'open'))}
                      </span>
                    </div>

                    <div className="mt-1 truncate text-xs text-[var(--muted-foreground)]">
                      {String(conversation.last_message_preview || '') || 'Sem mensagem recente'}
                    </div>
                    <div className="mt-1 text-[10px] text-[var(--muted-foreground)]">
                      {formatDateTime(conversation.last_message_at || conversation.updated_at)}
                    </div>
                  </Link>
                )
              })
            )}
          </div>
        </section>

        <section className="rounded-[var(--radius)] border border-[var(--border)] bg-[var(--card)]">
          {!selectedConversation ? (
            <div className="p-6 text-sm text-[var(--muted-foreground)]">
              Selecione uma conversa para visualizar o historico.
            </div>
          ) : (
            <div className="grid gap-3 p-4">
              <header className="grid gap-2 rounded-[var(--radius)] border border-[var(--border)] bg-[var(--accent)] p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="text-sm font-semibold text-[var(--foreground)]">
                      {String(selectedConversation.subject || '') || 'Conversa'}
                    </div>
                    <div className="text-xs text-[var(--muted-foreground)]">
                      Canal: {channelLabel(String(selectedConversation.channel || 'other'))}
                    </div>
                  </div>

                  <form action={setConversationStatusAction} className="flex items-center gap-2">
                    <input type="hidden" name="conversation_id" value={String(selectedConversation.id)} />
                    <input type="hidden" name="search" value={new URLSearchParams({ ...Object.fromEntries(filterSearch), conversation: String(selectedConversation.id) }).toString()} />
                    <select
                      name="status"
                      defaultValue={String(selectedConversation.status || 'open')}
                      className="h-8 rounded-[var(--radius)] border border-[var(--input)] bg-[var(--background)] px-2 text-xs"
                    >
                      <option value="open">Aberta</option>
                      <option value="pending">Pendente</option>
                      <option value="resolved">Resolvida</option>
                      <option value="archived">Arquivada</option>
                    </select>
                    <button
                      type="submit"
                      className="h-8 rounded-[var(--radius)] border border-[var(--border)] px-3 text-xs font-medium text-[var(--foreground)]"
                    >
                      Atualizar
                    </button>
                  </form>
                </div>

                <div className="grid gap-2 text-xs text-[var(--muted-foreground)] sm:grid-cols-2 lg:grid-cols-4">
                  <div>
                    <div className="font-semibold text-[var(--foreground)]">Lead</div>
                    <div>{String(lead?.title || lead?.client_name || '-') || '-'}</div>
                  </div>
                  <div>
                    <div className="font-semibold text-[var(--foreground)]">Pessoa</div>
                    <div>{String(person?.full_name || '-') || '-'}</div>
                  </div>
                  <div>
                    <div className="font-semibold text-[var(--foreground)]">Imovel</div>
                    <div>{String(property?.title || '-') || '-'}</div>
                  </div>
                  <div>
                    <div className="font-semibold text-[var(--foreground)]">Corretor</div>
                    <div>{String(broker?.full_name || broker?.public_name || '-') || '-'}</div>
                  </div>
                </div>
              </header>

              <div className="max-h-[52vh] space-y-3 overflow-auto rounded-[var(--radius)] border border-[var(--border)] bg-[var(--background)] p-3">
                {messages.length === 0 ? (
                  <div className="text-sm text-[var(--muted-foreground)]">Sem mensagens nesta conversa.</div>
                ) : (
                  messages.map((message) => {
                    const direction = String(message.direction || 'inbound')
                    const sender = String(message.sender_name || '')
                    const content = String(message.content_text || '').trim()
                    const media = String(message.media_url || '').trim()
                    const fallback =
                      direction === 'outbound'
                        ? '[mensagem enviada]'
                        : direction === 'system'
                        ? '[evento do sistema]'
                        : '[mensagem recebida]'
                    const display = content || media || fallback

                    return (
                      <div
                        key={String(message.id)}
                        className={[
                          'max-w-[82%] rounded-xl border px-3 py-2 text-sm',
                          messageBubbleClasses(direction),
                        ].join(' ')}
                      >
                        <div className="text-[11px] opacity-75">
                          {direction === 'outbound' ? 'Saida' : direction === 'system' ? 'Sistema' : 'Entrada'}
                          {sender ? ` • ${sender}` : ''}
                          {' • '}
                          {formatDateTime(message.occurred_at || message.created_at)}
                        </div>
                        <div className="whitespace-pre-wrap">{display}</div>
                      </div>
                    )
                  })
                )}
              </div>

              <form action={sendInboxMessageAction} className="grid gap-2">
                <input type="hidden" name="conversation_id" value={String(selectedConversation.id)} />
                <input type="hidden" name="search" value={new URLSearchParams({ ...Object.fromEntries(filterSearch), conversation: String(selectedConversation.id) }).toString()} />
                <textarea
                  name="content_text"
                  rows={3}
                  required
                  placeholder="Digite sua mensagem..."
                  className="w-full rounded-[var(--radius)] border border-[var(--input)] bg-[var(--background)] p-3 text-sm"
                />
                <div className="flex justify-end">
                  <button
                    type="submit"
                    className="rounded-[var(--radius)] bg-[var(--primary)] px-4 py-2 text-sm font-medium text-[var(--primary-foreground)]"
                  >
                    Enviar mensagem
                  </button>
                </div>
              </form>
            </div>
          )}
        </section>
      </div>
    </main>
  )
}
