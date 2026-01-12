import { HTMLAttributes } from 'react'

type BadgeVariant = 'default' | 'secondary' | 'destructive' | 'success' | 'warning' | 'outline'

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant
}

const variantStyles: Record<BadgeVariant, string> = {
  default: 'bg-[var(--primary)] text-[var(--primary-foreground)]',
  secondary: 'bg-[var(--secondary)] text-[var(--secondary-foreground)]',
  destructive: 'bg-[var(--destructive)] text-[var(--destructive-foreground)]',
  success: 'bg-[var(--success)] text-[var(--success-foreground)]',
  warning: 'bg-[var(--warning)] text-[var(--warning-foreground)]',
  outline: 'border border-[var(--border)] text-[var(--foreground)]',
}

export function Badge({ className = '', variant = 'default', children, ...props }: BadgeProps) {
  return (
    <span
      className={`
        inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium
        ${variantStyles[variant]}
        ${className}
      `}
      {...props}
    >
      {children}
    </span>
  )
}
