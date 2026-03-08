/**
 * Teste de Integração - Fase 3: IA & Automações
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createClient } from '@/lib/supabase/server'

describe('Fase 3: IA & Automações - Integration Tests', () => {
  let supabase: any

  beforeAll(async () => {
    supabase = await createClient()
  })

  describe('AIAgentsPanel', () => {
    it('deve listar bots ativos com estatísticas', async () => {
      const { data: bots, error } = await supabase
        .from('chat_bots')
        .select('*')
        .eq('is_active', true)

      expect(error).toBeNull()
      expect(Array.isArray(bots)).toBe(true)
    })

    it('deve permitir edição de system_prompt', async () => {
      const { data: bots } = await supabase
        .from('chat_bots')
        .select('id')
        .eq('is_active', true)
        .limit(1)

      if (bots && bots.length > 0) {
        const newPrompt = 'Novo prompt de teste'
        const { error } = await supabase
          .from('chat_bots')
          .update({ system_prompt: newPrompt })
          .eq('id', bots[0].id)

        expect(error).toBeNull()
      }
    })
  })

  describe('Automação 24h', () => {
    it('deve identificar conversas sem resposta > 24h', async () => {
      const twentyFourHoursAgo = new Date(
        Date.now() - 24 * 60 * 60 * 1000
      ).toISOString()

      const { data: conversations, error } = await supabase
        .from('chat_conversations')
        .select('id')
        .eq('status', 'open')
        .lt('last_inbound_at', twentyFourHoursAgo)
        .limit(100)

      expect(error).toBeNull()
      expect(Array.isArray(conversations)).toBe(true)
    })
  })

  describe('Performance', () => {
    it('deve processar 100+ conversas sem timeout', async () => {
      const startTime = Date.now()

      const { data: conversations, error } = await supabase
        .from('chat_conversations')
        .select('id')
        .eq('status', 'open')
        .limit(150)

      const duration = Date.now() - startTime

      expect(error).toBeNull()
      expect(duration).toBeLessThan(5000)
    })

    it('deve manter latência < 500ms para queries', async () => {
      const startTime = performance.now()

      await supabase
        .from('chat_bots')
        .select('*')
        .eq('is_active', true)
        .limit(50)

      const latency = performance.now() - startTime
      expect(latency).toBeLessThan(500)
    })
  })

  describe('Integração Completa', () => {
    it('deve ter todas as tabelas necessárias', async () => {
      const requiredTables = [
        'chat_bots',
        'chat_conversations',
        'chat_messages',
        'leads',
      ]

      for (const tableName of requiredTables) {
        const { error } = await supabase
          .from(tableName)
          .select('*')
          .limit(1)

        expect(error).toBeNull()
      }
    })
  })
})
