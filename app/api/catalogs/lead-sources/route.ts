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

    const { data, error } = await supabase
      .from('lead_sources')
      .select('id, name, is_active, position, created_at')
      .order('position', { ascending: true })

    if (error) {
      console.error('[API lead-sources GET] Error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    console.log('[API lead-sources GET] Success, count:', data?.length || 0)
    return NextResponse.json({ data: data || [] })
  } catch (err) {
    console.error('[API lead-sources GET] Error:', err)
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
        .from('lead_sources')
        .update({
          name: name.trim(),
          is_active: is_active ?? true,
          position: position ?? 0,
        })
        .eq('id', id)
        .select()
        .single()

      if (error) {
        console.error('[API lead-sources POST update] Error:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
      }
      console.log('[API lead-sources POST update] Success:', data)
      return NextResponse.json({ data })
    } else {
      const { data, error } = await supabase
        .from('lead_sources')
        .insert({
          name: name.trim(),
          is_active: is_active ?? true,
          position: position ?? 0,
        })
        .select()
        .single()

      if (error) {
        console.error('[API lead-sources POST insert] Error:', error)
        if (error.code === '23505') {
          return NextResponse.json({ error: 'Já existe um item com esse nome' }, { status: 409 })
        }
        return NextResponse.json({ error: error.message }, { status: 500 })
      }
      console.log('[API lead-sources POST insert] Success:', data)
      return NextResponse.json({ data })
    }
  } catch (err) {
    console.error('[API lead-sources POST] Error:', err)
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 })
  }
}
