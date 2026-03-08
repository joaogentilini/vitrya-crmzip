-- Índices para melhorar performance das automações da Fase 3

-- 1. Índice para AIAgentsPanel (listar bots ativos por canal)
CREATE INDEX IF NOT EXISTS idx_chat_bots_is_active_channel
  ON chat_bots(is_active DESC, channel);

-- 2. Índice para automação 24h no-response (queries rápidas de conversas sem resposta)
CREATE INDEX IF NOT EXISTS idx_chat_conversations_status_last_inbound
  ON chat_conversations(status, last_inbound_at DESC)
  WHERE status = 'open';

-- 3. Índice para buscar mensagens de conversa rapidamente
CREATE INDEX IF NOT EXISTS idx_chat_messages_conversation_occurred
  ON chat_messages(conversation_id, occurred_at DESC);

-- 4. Índice para logs de automação (auditar ações)
CREATE INDEX IF NOT EXISTS idx_chat_automation_logs_conversation
  ON chat_automation_logs(conversation_id, created_at DESC);

-- 5. Índice para buscar bots por broker (AIAgentsPanel com filtro de usuário)
CREATE INDEX IF NOT EXISTS idx_chat_bots_created_by
  ON chat_bots(created_by_profile_id, is_active DESC);

-- 6. Índice para leads por broker (qualificação, conversão)
CREATE INDEX IF NOT EXISTS idx_leads_broker_status
  ON leads(assigned_to, status, created_at DESC);

-- 7. Índice para portal_lead_links recentes
CREATE INDEX IF NOT EXISTS idx_portal_lead_links_created_provider
  ON portal_lead_links(created_at DESC, provider)
  WHERE property_id IS NULL;

-- 8. Índice composto para chat_conversations (acesso frequente no painel)
CREATE INDEX IF NOT EXISTS idx_chat_conversations_broker_status_time
  ON chat_conversations(broker_user_id, status, last_message_at DESC);

-- 9. Índice para quick_replies (buscar templates por bot)
CREATE INDEX IF NOT EXISTS idx_chat_quick_replies_bot_title
  ON chat_quick_replies(broker_user_id, title);

-- 10. Índice para buscar conversations por metadata (automation_triggered_at)
-- Nota: JSONB índice para queries de automação
CREATE INDEX IF NOT EXISTS idx_chat_conversations_metadata_automation
  ON chat_conversations USING GIN (metadata jsonb_path_ops)
  WHERE metadata ? 'automation_triggered_at';

-- Análise de performance (para verificar após aplicar índices)
-- EXPLAIN ANALYZE SELECT * FROM chat_conversations WHERE status='open' AND last_inbound_at < NOW()-'24 hours'::interval LIMIT 100;
-- EXPLAIN ANALYZE SELECT * FROM chat_bots WHERE is_active=true ORDER BY created_at DESC;
-- EXPLAIN ANALYZE SELECT * FROM chat_messages WHERE conversation_id='...' ORDER BY occurred_at DESC LIMIT 20;
