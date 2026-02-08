import Link from 'next/link'
import { requireActiveUser } from '@/lib/auth'
import GroupDetailClient from './GroupDetailClient'

export const dynamic = 'force-dynamic'
export const revalidate = 0

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function GroupDetailPage({ params }: PageProps) {
  const { id } = await params

  await requireActiveUser()

  return (
    <main className="p-6 space-y-6">
      <div className="flex items-center gap-2 text-sm text-[var(--muted-foreground)]">
        <Link href="/groups" className="hover:text-[var(--foreground)] transition-colors">
          Grupos
        </Link>
        <span>/</span>
        <span className="text-[var(--foreground)]">Detalhes</span>
      </div>

      <GroupDetailClient groupId={id} />
    </main>
  )
}
