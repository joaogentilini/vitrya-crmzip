import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabaseServer'

export const dynamic = 'force-dynamic'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ leadId: string }> }
) {
  try {
    const { leadId } = await params
    const supabase = await createClient()

    const { data: userRes } = await supabase.auth.getUser()
    if (!userRes?.user) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
    }

    const { data: notes, error } = await supabase
      .from('lead_notes')
      .select('id, lead_id, author_id, content, created_at')
      .eq('lead_id', leadId)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('[API lead-notes GET] Error:', error.message)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const authorIds = [...new Set(notes?.map((n: any) => n.author_id).filter(Boolean) || [])]
    let authors: { id: string; full_name: string | null }[] = []
    
    if (authorIds.length > 0) {
      const { data: profilesRaw } = await supabase
        .from('profiles')
        .select('id, full_name')
        .in('id', authorIds)
      authors = profilesRaw || []
    }

    return NextResponse.json({ 
      data: notes || [],
      authors
    })
  } catch (err) {
    console.error('[API lead-notes GET] Error:', err)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ leadId: string }> }
) {
  try {
    const { leadId } = await params
    const supabase = await createClient()

    const { data: userRes } = await supabase.auth.getUser()
    if (!userRes?.user) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
    }

    const body = await request.json()
    const { content } = body

    if (!content?.trim()) {
      return NextResponse.json({ error: 'Conteúdo é obrigatório' }, { status: 400 })
    }

    const { data: lead } = await supabase
      .from('leads')
      .select('id')
      .eq('id', leadId)
      .single()

    if (!lead) {
      return NextResponse.json({ error: 'Lead não encontrado' }, { status: 404 })
    }

    const { data: note, error } = await supabase
      .from('lead_notes')
      .insert({
        lead_id: leadId,
        author_id: userRes.user.id,
        content: content.trim()
      })
      .select()
      .single()

    if (error) {
      console.error('[API lead-notes POST] Error:', error.message)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    try {
      await supabase.from('lead_audit_logs').insert({
        lead_id: leadId,
        actor_id: userRes.user.id,
        action: 'update',
        before: null,
        after: { note_added: true, note_id: note.id, note_preview: content.trim().substring(0, 50) }
      })
    } catch (auditErr) {
      console.error('[API lead-notes POST] Audit log error:', auditErr)
    }

    return NextResponse.json({ data: note })
  } catch (err) {
    console.error('[API lead-notes POST] Error:', err)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
