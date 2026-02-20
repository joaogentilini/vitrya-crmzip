'use client'

import { type MouseEvent, useTransition } from 'react'
import { useRouter } from 'next/navigation'

import { Button } from '@/components/ui/Button'
import { useToast } from '@/components/ui/Toast'

type DeleteActionResult = {
  success: boolean
  error?: string
}

type ButtonVariant = 'default' | 'primary' | 'secondary' | 'destructive' | 'outline' | 'ghost' | 'link'
type ButtonSize = 'default' | 'sm' | 'lg' | 'icon'

interface AdminDeleteActionButtonProps {
  action: () => Promise<DeleteActionResult>
  confirmMessage: string
  label?: string
  successMessage?: string
  fallbackErrorMessage?: string
  redirectTo?: string
  stopPropagation?: boolean
  variant?: ButtonVariant
  size?: ButtonSize
  className?: string
  onSuccess?: () => void
}

export default function AdminDeleteActionButton({
  action,
  confirmMessage,
  label = 'Excluir',
  successMessage = 'Registro excluido com sucesso.',
  fallbackErrorMessage = 'Nao foi possivel excluir o registro.',
  redirectTo,
  stopPropagation = false,
  variant = 'destructive',
  size = 'sm',
  className,
  onSuccess,
}: AdminDeleteActionButtonProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const { success, error } = useToast()

  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    if (stopPropagation) {
      event.preventDefault()
      event.stopPropagation()
    }

    if (!confirm(confirmMessage)) return

    startTransition(async () => {
      try {
        const result = await action()
        if (!result?.success) {
          throw new Error(result?.error || fallbackErrorMessage)
        }

        success(successMessage)

        if (onSuccess) {
          onSuccess()
          return
        }

        if (redirectTo) {
          router.push(redirectTo)
          return
        }

        router.refresh()
      } catch (err) {
        error(err instanceof Error ? err.message : fallbackErrorMessage)
      }
    })
  }

  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      onClick={handleClick}
      disabled={isPending}
      className={className}
    >
      {isPending ? 'Excluindo...' : label}
    </Button>
  )
}
