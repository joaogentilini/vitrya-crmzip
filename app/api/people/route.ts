import { createClient } from '@/lib/supabaseServer'
import { NextRequest, NextResponse } from 'next/server'
import { createLogger } from '@/lib/logger'

export const runtime = 'nodejs'

export async function GET() {
  const log = createLogger('/api/people', undefined)
  
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
    }

    log.context.userId = user.id

    const { data: people, error } = await supabase
      .from('people')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      log.error('Failed to fetch people', error)
      return NextResponse.json({ 
        error: 'Erro ao buscar pessoas',
        requestId: log.requestId
      }, { status: 500 })
    }

    return NextResponse.json({ people })
  } catch (err) {
    log.error('Unexpected error', err)
    return NextResponse.json({ 
      error: 'Erro interno do servidor',
      requestId: log.requestId
    }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const log = createLogger('/api/people', undefined)
  log.info('Create person request received')

  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
    }

    log.context.userId = user.id

    const { data: profile } = await supabase
      .from('profiles')
      .select('id, role, is_active')
      .eq('id', user.id)
      .single()

    if (!profile || !profile.is_active) {
      log.warn('Inactive user attempted to create person')
      return NextResponse.json({ 
        error: 'Usuário inativo',
        requestId: log.requestId
      }, { status: 403 })
    }

    const body = await request.json()
    log.debug('Request body', { full_name: body.full_name, kind_tags: body.kind_tags })

    const { full_name, email, phone_e164, document_id, kind_tags, notes, owner_profile_id } = body

    if (!full_name || !full_name.trim()) {
      return NextResponse.json({ 
        error: 'Nome completo é obrigatório',
        requestId: log.requestId
      }, { status: 400 })
    }

    const isAdminOrGestor = profile.role === 'admin' || profile.role === 'gestor'
    
    let finalOwnerId = user.id
    if (isAdminOrGestor && owner_profile_id) {
      finalOwnerId = owner_profile_id
    }

    const personData: Record<string, unknown> = {
      full_name: full_name.trim(),
      email: email?.trim() || null,
      phone_e164: phone_e164?.trim() || null,
      document_id: document_id?.trim() || null,
      kind_tags: kind_tags || [],
      notes: notes?.trim() || null,
      owner_profile_id: finalOwnerId,
      created_by_profile_id: user.id
    }

    log.info('Creating person', { full_name: personData.full_name })

    const { data: person, error: insertError } = await supabase
      .from('people')
      .insert(personData)
      .select()
      .single()

    if (insertError) {
      log.error('Failed to create person', insertError)
      return NextResponse.json({ 
        error: 'Erro ao criar pessoa',
        details: insertError.message,
        requestId: log.requestId
      }, { status: 500 })
    }

    log.info('Person created successfully', { personId: person.id })

    return NextResponse.json({ 
      success: true, 
      person,
      requestId: log.requestId
    })
  } catch (err) {
    log.error('Unexpected error', err)
    return NextResponse.json({ 
      error: 'Erro interno do servidor',
      requestId: log.requestId
    }, { status: 500 })
  }
}
