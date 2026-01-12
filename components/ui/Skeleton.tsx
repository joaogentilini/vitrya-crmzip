import { HTMLAttributes } from 'react'

interface SkeletonProps extends HTMLAttributes<HTMLDivElement> {}

export function Skeleton({ className = '', ...props }: SkeletonProps) {
  return (
    <div
      className={`animate-pulse rounded-[var(--radius)] bg-[var(--muted)] ${className}`}
      {...props}
    />
  )
}

export function CardSkeleton() {
  return (
    <div className="rounded-[var(--radius-lg)] border bg-[var(--card)] p-6 shadow-sm">
      <Skeleton className="h-4 w-3/4 mb-4" />
      <Skeleton className="h-3 w-1/2 mb-2" />
      <Skeleton className="h-3 w-2/3" />
    </div>
  )
}

export function TableRowSkeleton() {
  return (
    <div className="flex items-center gap-4 py-3 border-b border-[var(--border)]">
      <Skeleton className="h-4 w-1/4" />
      <Skeleton className="h-4 w-1/4" />
      <Skeleton className="h-4 w-1/6" />
      <Skeleton className="h-4 w-1/6" />
    </div>
  )
}
