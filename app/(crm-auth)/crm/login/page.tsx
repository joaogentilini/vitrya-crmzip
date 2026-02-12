import { redirect } from 'next/navigation'
import { ensureUserProfile } from '@/lib/auth'
import { LoginClient } from './LoginClient'

interface LoginPageProps {
  searchParams?: {
    next?: string | string[]
  }
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const nextParam = typeof searchParams?.next === 'string' ? searchParams.next : undefined

  const profile = await ensureUserProfile()

  if (profile) {
    if (profile.is_active === false) {
      redirect('/blocked')
    }

    redirect(nextParam || '/dashboard')
  }

  return <LoginClient nextPath={nextParam} />
}
