-- =====================================================================
-- maintenance.sql — Recuperação e prevenção de esgotamento de I/O
-- (Supabase free tier)
--
-- CAUSA RAIZ (confirmada em 2026-07-13):
--   Workflow n8n "GLPI Ranking Sync" rodava a CADA 1 MINUTO re-upsertando
--   TODOS os ~6.600 tickets (SELECT ... WHERE t.date >= 2 anos + upsert em
--   massa) -> reescrever milhares de linhas ~1440x/dia gerou dead tuples +
--   WAL + autovacuum constante -> esgotou o burst de I/O do plano free.
--   Corrigido: trigger 1min->15min, cleanup->diário, e query agora é DELTA
--   (só tickets com t.date_mod na última hora).
--
-- Este arquivo é a higiene pós-incidente: índice que faltava + autovacuum.
-- =====================================================================


-- #####################################################################
-- PARTE A — SEGURA PARA O SQL EDITOR DO SUPABASE
-- Cole TUDO abaixo e rode. (Não contém VACUUM, então não dá erro de
-- "cannot run inside a transaction block".)
-- #####################################################################

-- --- A1. Diagnóstico: bloat/tamanho (dead tuples no topo) ---
SELECT
    relname                                        AS tabela,
    n_live_tup                                     AS linhas_vivas,
    n_dead_tup                                     AS linhas_mortas,   -- bloat
    last_autovacuum,
    pg_size_pretty(pg_total_relation_size(relid))  AS tamanho_total
FROM pg_stat_user_tables
ORDER BY n_dead_tup DESC;

-- --- A2. Índice que faltava (dashboard filtra por date_creation) ---
--     CREATE INDEX (sem CONCURRENTLY) roda dentro de transação — OK no editor.
CREATE INDEX IF NOT EXISTS idx_dashboard_tickets_date_creation
    ON dashboard_tickets (date_creation);

CREATE INDEX IF NOT EXISTS idx_dashboard_tickets_status
    ON dashboard_tickets (status_id);

CREATE INDEX IF NOT EXISTS idx_network_events_link_created
    ON network_events (link_id, created_at);

-- --- A3. Prevenção: autovacuum mais agressivo na tabela de maior escrita ---
ALTER TABLE dashboard_tickets SET (autovacuum_vacuum_scale_factor = 0.05);
ALTER TABLE network_events    SET (autovacuum_vacuum_scale_factor = 0.05);

-- --- A4. Verificação ---
SELECT relname AS tabela, n_live_tup, n_dead_tup, last_vacuum, last_autovacuum
FROM pg_stat_user_tables
ORDER BY n_dead_tup DESC
LIMIT 10;


-- #####################################################################
-- PARTE B — VACUUM (NÃO rode no SQL Editor! Dá erro de transação.)
--
-- Na prática VOCÊ NÃO PRECISA disto: com o churn de escrita eliminado
-- (sync agora é delta) e só ~6.600 linhas, o autovacuum limpa o bloat
-- sozinho em minutos. O ALTER de A3 ainda deixa isso mais agressivo.
--
-- Se quiser forçar mesmo assim, rode via psql (conexão direta), UMA por vez:
--     psql "postgresql://postgres:[SENHA]@db.jddpcoybfacjaepodhyf.supabase.co:5432/postgres"
-- e então:
-- #####################################################################
-- VACUUM (ANALYZE) dashboard_tickets;
-- VACUUM (ANALYZE) network_events;
-- VACUUM (ANALYZE) sync_glpi_users;
-- VACUUM (ANALYZE) sync_ticket_technicians;
-- VACUUM (ANALYZE) sync_followup_counts;

-- Só se o tamanho físico continuar inflado após o autovacuum (trava a tabela):
-- VACUUM (FULL, ANALYZE) dashboard_tickets;
