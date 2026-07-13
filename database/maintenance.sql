-- =====================================================================
-- maintenance.sql — Recuperação e prevenção de esgotamento de I/O
-- (Supabase free tier)
--
-- CAUSA RAIZ (confirmada em 2026-07-13):
--   Workflow n8n "GLPI Ranking Sync" rodava a CADA 1 MINUTO fazendo upsert
--   em massa no `dashboard_tickets` (Prefer: resolution=merge-duplicates) +
--   rotina de limpeza de órfãos. Reescrever linhas ~1440x/dia gerou um volume
--   enorme de dead tuples + WAL + autovacuum constante -> esgotou o burst de
--   I/O de disco do plano free. O trigger já foi reduzido para 15 min.
--
-- Este script limpa o bloat deixado e adiciona o índice que faltava.
-- Rode no SQL Editor do Supabase (ou via psql) APÓS o banco voltar a responder.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. DIAGNÓSTICO — tamanho e bloat das tabelas (dead tuples no topo).
--    Espera-se `dashboard_tickets` (e as tabelas sync_*) com muito dead_tup.
-- ---------------------------------------------------------------------
SELECT
    relname                                        AS tabela,
    n_live_tup                                     AS linhas_vivas,
    n_dead_tup                                     AS linhas_mortas,   -- bloat
    last_autovacuum,
    pg_size_pretty(pg_total_relation_size(relid))  AS tamanho_total
FROM pg_stat_user_tables
ORDER BY n_dead_tup DESC;


-- ---------------------------------------------------------------------
-- 2. ÍNDICE QUE FALTAVA — o dashboard filtra dashboard_tickets por
--    date_creation (SELECT ... WHERE date_creation BETWEEN ...) a cada 5 min.
--    Sem índice = seq scan da tabela inteira a cada refresh = leitura de disco.
-- ---------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_dashboard_tickets_date_creation
    ON dashboard_tickets (date_creation);

-- (opcional) consultas por técnico/status também aparecem no dashboard:
CREATE INDEX IF NOT EXISTS idx_dashboard_tickets_status
    ON dashboard_tickets (status_id);

-- network_events é filtrado por link_id + created_at no NetworkMonitor:
CREATE INDEX IF NOT EXISTS idx_network_events_link_created
    ON network_events (link_id, created_at);


-- ---------------------------------------------------------------------
-- 3. LIMPEZA — recupera dead tuples e atualiza estatísticas.
--    VACUUM (sem FULL) não trava a tabela.
--    Ajuste a lista se os nomes das tabelas sync_* forem diferentes
--    (veja o resultado do passo 1).
-- ---------------------------------------------------------------------
VACUUM (ANALYZE) dashboard_tickets;
VACUUM (ANALYZE) network_events;
VACUUM (ANALYZE) network_links;
VACUUM (ANALYZE) dashboard_settings;
-- VACUUM (ANALYZE) sync_glpi_users;      -- descomente conforme passo 1
-- VACUUM (ANALYZE) sync_ticket_...;
-- VACUUM (ANALYZE) sync_followups;


-- ---------------------------------------------------------------------
-- 4. (OPCIONAL) RECLAMAR ESPAÇO EM DISCO — se `dashboard_tickets` estiver
--    muito inchado no passo 1, um VACUUM FULL encolhe o arquivo físico.
--    ATENÇÃO: trava a tabela durante a operação e usa I/O. Rode só quando
--    o banco já estiver saudável e em horário de baixo uso.
-- ---------------------------------------------------------------------
-- VACUUM (FULL, ANALYZE) dashboard_tickets;


-- ---------------------------------------------------------------------
-- 5. PREVENÇÃO — autovacuum mais agressivo na tabela de maior escrita,
--    para limpar dead tuples cedo caso o volume volte a subir.
-- ---------------------------------------------------------------------
ALTER TABLE dashboard_tickets SET (autovacuum_vacuum_scale_factor = 0.05);
ALTER TABLE network_events    SET (autovacuum_vacuum_scale_factor = 0.05);


-- ---------------------------------------------------------------------
-- 6. VERIFICAÇÃO — dead tuples deve cair perto de zero após o VACUUM
-- ---------------------------------------------------------------------
SELECT relname AS tabela, n_live_tup, n_dead_tup, last_vacuum, last_autovacuum
FROM pg_stat_user_tables
ORDER BY n_dead_tup DESC
LIMIT 10;
