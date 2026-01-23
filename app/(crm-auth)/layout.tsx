import { ReactNode } from 'react'

interface CrmAuthLayoutProps {
  children: ReactNode
}

export default function CrmAuthLayout({ children }: CrmAuthLayoutProps) {
  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f9fafb' }}>
      {children}
    </div>
  )
}