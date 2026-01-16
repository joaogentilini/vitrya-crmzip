import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabaseServer'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const supabase = await createClient()
    
    const { data: userRes } = await supabase.auth.getUser()
    if (!userRes?.user) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
    }

    const { data, error } = await supabase.rpc('exec_sql', {
      query: `SELECT id, name, is_active, position, created_at FROM lead_types ORDER BY position ASC`
    })

    if (error) {
      console.error('[API lead-types GET] RPC error, falling back to direct query:', error)
      const { data: directData, error: directError } = await supabase
        .from('lead_types')
        .select('id, name, is_active, position, created_at')
        .order('position', { ascending: true })

      if (directError) {
        console.error('[API lead-types GET] Direct query error:', directError)
        return NextResponse.json({ error: directError.message }, { status: 500 })
      }
      return NextResponse.json({ data: directData || [] })
    }

    return NextResponse.json({ data: data || [] })
  } catch (err) {
    console.error('[API lead-types GET] Error:', err)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    
    const { data: userRes } = await supabase.auth.getUser()
    if (!userRes?.user) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', userRes.user.id)
      .single()

    if (profile?.role !== 'admin') {
      return NextResponse.json({ error: 'Apenas administradores podem gerenciar catálogos' }, { status: 403 })
    }

    const body = await request.json()
    const { id, name, is_active, position } = body

    if (!name?.trim()) {
      return NextResponse.json({ error: 'Nome é obrigatório' }, { status: 400 })
    }

    if (id) {
      const { data, error } = await supabase
        .from('lead_types')
        .update({
          name: name.trim(),
          is_active: is_active ?? true,
          position: position ?? 0,
        })
        .eq('id', id)
        .select()
        .single()

      if (error) {
        console.error('[API lead-types POST] Update error:', error.message)
        return NextResponse.json({ error: error.message }, { status: 500 })
      }
      return NextResponse.json({ data })
    } else {
      const { data, error } = await supabase
        .from('lead_types')
        .insert({
          name: name.trim(),
          is_active: is_active ?? true,
          position: position ?? 0,
        })
        .select()
        .single()

      if (error) {
        if (error.code === '23505') {
          return NextResponse.json({ error: 'Já existe um item com esse nome' }, { status: 409 })
        }
        console.error('[API lead-types POST] Insert error:', error.message)
        return NextResponse.json({ error: error.message }, { status: 500 })
      }
      return NextResponse.json({ data })
    }
  } catch (err) {
    console.error('[API lead-types POST] Error:', err)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
