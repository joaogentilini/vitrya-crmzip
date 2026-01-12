import { TextareaHTMLAttributes, forwardRef, useId } from 'react'

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string
  hint?: string
  error?: string
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, hint, error, className = '', id, ...props }, ref) => {
    const generatedId = useId()
    const inputId = id || generatedId
    const hintId = hint ? `${inputId}-hint` : undefined
    const errorId = error ? `${inputId}-error` : undefined
    const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined

    return (
      <div className="space-y-1.5">
        {label && (
          <label 
            htmlFor={inputId} 
            className="block text-sm font-medium text-[var(--foreground)]"
          >
            {label}
          </label>
        )}
        <textarea
          ref={ref}
          id={inputId}
          aria-describedby={describedBy}
          aria-invalid={error ? 'true' : undefined}
          className={`
            flex min-h-[80px] w-full rounded-[var(--radius)] border bg-[var(--background)] 
            px-3 py-2 text-sm transition-colors
            placeholder:text-[var(--muted-foreground)]
            focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]
            disabled:cursor-not-allowed disabled:opacity-50
            ${error 
              ? 'border-[var(--destructive)] focus-visible:ring-[var(--destructive)]' 
              : 'border-[var(--input)]'
            }
            ${className}
          `}
          {...props}
        />
        {hint && !error && (
          <p id={hintId} className="text-xs text-[var(--muted-foreground)]">
            {hint}
          </p>
        )}
        {error && (
          <p id={errorId} className="text-xs text-[var(--destructive)]" role="alert">
            {error}
          </p>
        )}
      </div>
    )
  }
)

Textarea.displayName = 'Textarea'
