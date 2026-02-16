import { redirect } from 'next/navigation'
import { ensureUserProfile } from '@/lib/auth'
import { LoginClient } from './LoginClient'

interface LoginPageProps {
  searchParams?: Promise<{
    next?: string | string[]
  }>
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const resolvedSearchParams = await searchParams
  const nextParam =
    typeof resolvedSearchParams?.next === 'string' ? resolvedSearchParams.next : undefined

  const profile = await ensureUserProfile()

  if (profile) {
    if (profile.is_active === false) {
      redirect('/blocked')
    }

    redirect(nextParam || '/dashboard')
  }

  return <LoginClient nextPath={nextParam} />
}
