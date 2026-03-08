export function OperacionalSkeleton() {
  return (
    <div className="space-y-6 p-6">
      {/* KPI Dashboard Skeleton */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-lg border border-[var(--border)] bg-[var(--card)] p-4">
            <div className="space-y-3">
              <div className="h-8 w-16 animate-pulse rounded bg-[var(--muted-foreground)] opacity-20" />
              <div className="h-4 w-24 animate-pulse rounded bg-[var(--muted-foreground)] opacity-20" />
            </div>
          </div>
        ))}
      </div>

      {/* Tabs and Content Skeleton */}
      <div className="rounded-lg border border-[var(--border)] bg-[var(--card)]">
        {/* Tab headers skeleton */}
        <div className="border-b border-[var(--border)] flex gap-4 p-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-6 w-24 animate-pulse rounded bg-[var(--muted-foreground)] opacity-20" />
          ))}
        </div>

        {/* Inbox content skeleton */}
        <div className="flex h-96 gap-4 p-4">
          {/* Left panel - Conversation list */}
          <div className="w-96 space-y-2 border-r border-[var(--border)] pr-4">
            <div className="h-10 w-full animate-pulse rounded bg-[var(--muted-foreground)] opacity-20" />
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="space-y-2">
                <div className="h-4 w-full animate-pulse rounded bg-[var(--muted-foreground)] opacity-20" />
                <div className="h-4 w-5/6 animate-pulse rounded bg-[var(--muted-foreground)] opacity-20" />
              </div>
            ))}
          </div>

          {/* Right panel - Chat details */}
          <div className="flex-1 space-y-4">
            <div className="space-y-2">
              <div className="h-6 w-48 animate-pulse rounded bg-[var(--muted-foreground)] opacity-20" />
              <div className="h-4 w-64 animate-pulse rounded bg-[var(--muted-foreground)] opacity-20" />
            </div>
            <div className="flex-1 space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-12 w-full animate-pulse rounded bg-[var(--muted-foreground)] opacity-20" />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
