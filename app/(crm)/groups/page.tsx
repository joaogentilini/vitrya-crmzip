import { requireActiveUser } from '@/lib/auth'
import GroupsClient from './GroupsClient'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function GroupsPage() {
  await requireActiveUser()

  return (
    <main className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Grupos</h1>
        <p className="text-sm text-gray-500">Agrupe pessoas sem duplicar cadastros.</p>
      </div>

      <GroupsClient />
    </main>
  )
}
