-- =====================================================
-- Migration v3: Agendamento configurável do ciclo semanal
--
-- Adiciona:
--   1. Campo "schedule" no general_report (com default Segunda 08:00)
--   2. Nova chave "weekly_cycle_state" para dedup do scheduler
-- =====================================================

-- 1. Garante schedule default no registro general_report já existente
UPDATE dashboard_settings
   SET value = jsonb_set(
        value,
        '{schedule}',
        '{"dayOfWeek": 1, "hour": 8, "minute": 0}'::jsonb,
        true
   )
 WHERE key = 'general_report'
   AND NOT (value ? 'schedule');

-- 2. Estado do scheduler (lastFiredAt — usado para dedup do tick)
INSERT INTO dashboard_settings (key, value)
VALUES ('weekly_cycle_state', '{}'::jsonb)
ON CONFLICT (key) DO NOTHING;
