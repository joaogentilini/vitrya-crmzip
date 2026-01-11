'use client'

import { useState, useEffect } from 'react'

export function ClientDate({ value }: { value: string }) {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return <span>—</span>

  if (!mounted) {
    return <span>{d.toISOString().split('T')[0]}</span>
  }
  
  return <span>{d.toLocaleString()}</span>
}
