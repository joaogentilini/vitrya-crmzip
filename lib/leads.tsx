import React from 'react'
import { Badge } from '@/components/ui/Badge'

export type LeadStatus = 'open' | 'won' | 'lost'

export type LeadRow = {
  id: string
  title: string
  status: LeadStatus | string
  pipeline_id: string | null
  stage_id: string | null
  created_at: string
  created_by?: string | null
  assigned_to?: string | null
  client_name?: string | null
  phone_raw?: string | null
  phone_e164?: string | null
  lead_type_id?: string | null
  lead_interest_id?: string | null
  lead_source_id?: string | null
  budget_range?: string | null
  notes?: string | null
  owner_user_id?: string | null
  updated_at?: string | null
}

export type PipelineRow = {
  id: string
  name: string
}

export type StageRow = {
  id: string
  pipeline_id: string
  name: string
  position: number
}

export type StageChange = {
  id: string
  lead_id: string
  from_stage_id: string | null
  to_stage_id: string | null
  created_at: string
}

export function getStatusBadge(status: string, size: 'sm' | 'lg' = 'sm') {
  const className = size === 'lg' ? 'text-sm px-3 py-1' : ''
  switch (status) {
    case 'won':
      return <Badge variant="success" className={className}>Ganho</Badge>
    case 'lost':
      return <Badge variant="destructive" className={className}>Perdido</Badge>
    default:
      return <Badge variant="secondary" className={className}>Aberto</Badge>
  }
}

export function getStatusLabel(status: string): string {
  switch (status) {
    case 'won':
      return 'ganho'
    case 'lost':
      return 'perdido'
    default:
      return 'aberto'
  }
}

export function normalizeError(err: unknown, fallback = 'Erro desconhecido'): string {
  if (err instanceof Error) return err.message
  if (typeof err === 'string') return err
  return fallback
}

export function getConfirmFinalizeMessage(status: 'won' | 'lost'): string {
  return `Marcar como ${status === 'won' ? 'ganho' : 'perdido'}?`
}

export function getFinalizeSuccessMessage(status: 'won' | 'lost'): string {
  return `Lead marcado como ${status === 'won' ? 'ganho' : 'perdido'}!`
}
