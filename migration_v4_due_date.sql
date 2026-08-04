-- =====================================================
-- Migration v4: Data limite de entrega por projeto
--
-- Adiciona:
--   1. Campo due_date em dashboard_projects (data limite individual)
--   2. Índice para ordenação/consulta por prazo
--
-- Seguro de rodar múltiplas vezes (IF NOT EXISTS).
-- =====================================================

ALTER TABLE dashboard_projects
    ADD COLUMN IF NOT EXISTS due_date DATE DEFAULT NULL;

COMMENT ON COLUMN dashboard_projects.due_date IS
    'Data limite de entrega definida individualmente por projeto. NULL = sem prazo definido.';

-- Ordenação do quadro por prazo (mais próximo primeiro) e consultas de atraso
CREATE INDEX IF NOT EXISTS idx_dashboard_projects_due_date
    ON dashboard_projects (due_date)
    WHERE due_date IS NOT NULL;
