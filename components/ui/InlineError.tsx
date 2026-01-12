'use client'

import { Button } from './Button'

interface InlineErrorProps {
  title?: string
  message?: string
  onRetry?: () => void
  retryLabel?: string
}

export function InlineError({ 
  title = 'Erro ao carregar',
  message = 'Ocorreu um erro ao carregar os dados. Tente novamente.',
  onRetry,
  retryLabel = 'Tentar novamente'
}: InlineErrorProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
      <div className="mb-4 p-3 rounded-full bg-[var(--destructive)]/10">
        <svg 
          className="w-8 h-8 text-[var(--destructive)]" 
          fill="none" 
          viewBox="0 0 24 24" 
          stroke="currentColor"
        >
          <path 
            strokeLinecap="round" 
            strokeLinejoin="round" 
            strokeWidth={2} 
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" 
          />
        </svg>
      </div>
      <h3 className="text-lg font-medium text-[var(--foreground)] mb-1">
        {title}
      </h3>
      <p className="text-sm text-[var(--muted-foreground)] mb-4 max-w-sm">
        {message}
      </p>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          <svg className="w-4 h-4 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          {retryLabel}
        </Button>
      )}
    </div>
  )
}
