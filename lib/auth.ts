'use server'

import { createClient } from '@/lib/supabaseServer'
import { redirect } from 'next/navigation'

export type UserRole = 'admin' | 'gestor' | 'corretor'

export interface UserProfile {
  id: string
  full_name: string
  name: string | null
  email: string | null
  phone_e164: string | null
  role: UserRole
  is_active: boolean
  created_at: string
  updated_at: string
}

export async function getCurrentUser() {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  
  if (error || !user) {
    return null
  }
  
  return user
}

export async function getCurrentUserProfile(): Promise<UserProfile | null> {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  
  if (authError || !user) {
    return null
  }
  
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()
  
  if (profileError || !profile) {
    return null
  }
  
  return profile as UserProfile
}

export async function requireAuth() {
  const user = await getCurrentUser()
  
  if (!user) {
    redirect('/')
  }
  
  return user
}

export async function requireActiveUser(): Promise<UserProfile> {
  const profile = await getCurrentUserProfile()
  
  if (!profile) {
    redirect('/')
  }
  
  if (profile && profile.is_active === false) {
    redirect('/blocked')
  }
  
  return profile
}

export async function requireRole(allowedRoles: UserRole[]): Promise<UserProfile> {
  const profile = await requireActiveUser()
  
  if (!allowedRoles.includes(profile.role)) {
    redirect('/dashboard')
  }
  
  return profile
}


export async function bootstrapAdminIfNeeded(): Promise<boolean> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) return false
  
  const { data: adminCount } = await supabase
    .from('profiles')
    .select('id', { count: 'exact', head: true })
    .eq('role', 'admin')
  
  if (adminCount && adminCount.length > 0) {
    return false
  }
  
  const { data: profile } = await supabase
    .from('profiles')
    .select('id')
    .eq('id', user.id)
    .single()
  
  if (!profile) {
    const { error: insertError } = await supabase
      .from('profiles')
      .insert({
        id: user.id,
        full_name: user.email?.split('@')[0] || 'Admin',
        email: user.email,
        role: 'admin',
        is_active: true
      })
    
    if (!insertError) {
      return true
    }
  } else {
    const { error: updateError } = await supabase
      .from('profiles')
      .update({ role: 'admin' })
      .eq('id', user.id)
    
    if (!updateError) {
      return true
    }
  }
  
  return false
}

export async function ensureUserProfile(): Promise<UserProfile | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  
  if (!user) return null
  
  const { data: existingProfile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()
  
  if (existingProfile) {
    return existingProfile as UserProfile
  }
  
  const { count: adminCount } = await supabase
    .from('profiles')
    .select('id', { count: 'exact', head: true })
    .eq('role', 'admin')
  
  const isFirstUser = (adminCount ?? 0) === 0
  
  const { data: newProfile, error } = await supabase
    .from('profiles')
    .insert({
      id: user.id,
      full_name: user.email?.split('@')[0] || 'User',
      email: user.email,
      role: isFirstUser ? 'admin' : 'corretor',
      is_active: true
    })
    .select()
    .single()
  
  if (error) {
    console.error('[ensureUserProfile] Failed to create profile:', error)
    return null
  }
  
  return newProfile as UserProfile
}
