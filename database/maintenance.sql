-- =====================================================================
-- maintenance.sql — Recuperação e prevenção de esgotamento de I/O
-- (Supabase free tier)
--
-- Rode estes blocos no SQL Editor do Supabase, na ordem indicada.
-- Contexto: o esgotamento veio de escrita constante em `network_links`
-- (upsert de todas as linhas a cada 60s). O código já foi corrigido para
-- só escrever quando o status muda; este script limpa o rastro deixado.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. DIAGNÓSTICO — veja o tamanho e o bloat das tabelas quentes
--    (rode ANTES e DEPOIS da limpeza para comparar)
-- ---------------------------------------------------------------------
SELECT
    relname                                   AS tabela,
    n_live_tup                                AS linhas_vivas,
    n_dead_tup                                AS linhas_mortas,   -- <- bloat
    last_autovacuum,
    pg_size_pretty(pg_total_relation_size(relid)) AS tamanho_total
FROM pg_stat_user_tables
ORDER BY n_dead_tup DESC;


-- ---------------------------------------------------------------------
-- 2. LIMPEZA — recupera espaço/dead tuples e atualiza estatísticas.
--    VACUUM (sem FULL) não trava a tabela e é o suficiente aqui.
-- ---------------------------------------------------------------------
VACUUM (ANALYZE) network_links;
VACUUM (ANALYZE) network_events;
VACUUM (ANALYZE) dashboard_settings;


-- ---------------------------------------------------------------------
-- 3. PODA DE HISTÓRICO — network_events só é usado para calcular
--    disponibilidade no período visível no dashboard. Eventos muito
--    antigos podem ser removidos para manter a tabela pequena.
--    Ajuste o intervalo conforme sua necessidade de histórico.
--    (Comentado por segurança — descomente para executar.)
-- ---------------------------------------------------------------------
-- DELETE FROM network_events WHERE created_at < now() - interval '12 months';
-- VACUUM (ANALYZE) network_events;


-- ---------------------------------------------------------------------
-- 4. PREVENÇÃO — autovacuum mais agressivo na tabela de maior escrita.
--    Faz o Postgres limpar dead tuples cedo, evitando acúmulo de bloat
--    caso o volume de escrita volte a subir.
-- ---------------------------------------------------------------------
ALTER TABLE network_links  SET (autovacuum_vacuum_scale_factor = 0.05);
ALTER TABLE network_events SET (autovacuum_vacuum_scale_factor = 0.05);


-- ---------------------------------------------------------------------
-- 5. VERIFICAÇÃO — confirme que dead tuples caiu perto de zero
-- ---------------------------------------------------------------------
SELECT relname AS tabela, n_live_tup, n_dead_tup, last_vacuum, last_autovacuum
FROM pg_stat_user_tables
WHERE relname IN ('network_links', 'network_events', 'dashboard_settings');
