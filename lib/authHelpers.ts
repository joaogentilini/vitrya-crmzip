import type { UserProfile, UserRole } from './auth'

export function isAdminOrGestor(profile: UserProfile | null): boolean {
  return profile?.role === 'admin' || profile?.role === 'gestor'
}

export function isAdmin(profile: UserProfile | null): boolean {
  return profile?.role === 'admin'
}

export function hasRole(profile: UserProfile | null, roles: UserRole[]): boolean {
  if (!profile) return false
  return roles.includes(profile.role)
}

export function canManageUsers(profile: UserProfile | null): boolean {
  return isAdminOrGestor(profile)
}

export function canAssignLeads(profile: UserProfile | null): boolean {
  return isAdminOrGestor(profile)
}
