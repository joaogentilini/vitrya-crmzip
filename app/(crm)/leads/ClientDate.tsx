'use client'

import { useState, useEffect } from 'react'

interface ClientDateProps {
  value: string
  format?: 'full' | 'short' | 'date'
}

export function ClientDate({ value, format = 'full' }: ClientDateProps) {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return <span>—</span>

  if (!mounted) {
    return <span>{d.toISOString().split('T')[0]}</span>
  }

  if (format === 'short') {
    return <span>{d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}</span>
  }

  if (format === 'date') {
    return <span>{d.toLocaleDateString('pt-BR')}</span>
  }
  
  return <span>{d.toLocaleString('pt-BR')}</span>
}
