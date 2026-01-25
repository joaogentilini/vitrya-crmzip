'use client'

import { useRouter } from 'next/navigation'

export default function CampaignTabClient({ propertyId }: { propertyId: string }) {
  const router = useRouter()

  return (
    <div className="mt-4 flex gap-2">
      <button
        onClick={() => router.push(`/campaigns/${propertyId}`)}
        className="rounded-xl border border-black/10 bg-white px-3 py-2 text-sm text-black/80 hover:bg-black/5"
      >
        Abrir Kanban do imóvel
      </button>
      <button
        onClick={() => router.push('/campaigns')}
        className="rounded-xl border border-black/10 bg-white px-3 py-2 text-sm text-black/80 hover:bg-black/5"
      >
        Campanhas (geral)
      </button>
    </div>
  )
}