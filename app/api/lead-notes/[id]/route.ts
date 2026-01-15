import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabaseServer'

export const dynamic = 'force-dynamic'

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = await createClient()

    const { data: userRes } = await supabase.auth.getUser()
    if (!userRes?.user) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
    }

    const { data: note } = await supabase
      .from('lead_notes')
      .select('id, lead_id, author_id')
      .eq('id', id)
      .single()

    if (!note) {
      return NextResponse.json({ error: 'Nota não encontrada' }, { status: 404 })
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', userRes.user.id)
      .single()

    const isAdminOrGestor = profile?.role === 'admin' || profile?.role === 'gestor'
    const isAuthor = note.author_id === userRes.user.id

    if (!isAuthor && !isAdminOrGestor) {
      return NextResponse.json({ error: 'Sem permissão para excluir esta nota' }, { status: 403 })
    }

    const { error } = await supabase
      .from('lead_notes')
      .delete()
      .eq('id', id)

    if (error) {
      console.error('[API lead-notes DELETE] Error:', error.message)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('[API lead-notes DELETE] Error:', err)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
