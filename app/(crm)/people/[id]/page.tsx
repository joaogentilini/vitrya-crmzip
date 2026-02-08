import { redirect } from 'next/navigation'
import { requireActiveUser } from '@/lib/auth'

export const dynamic = 'force-dynamic'
export const revalidate = 0

interface PageProps {
   params: Promise<{ id: string }>
}

export default async function PeopleLegacyRedirectPage({ params }: PageProps) {
  await requireActiveUser()
  const { id } = await params
  redirect(`/pessoas/${id}`)
}
