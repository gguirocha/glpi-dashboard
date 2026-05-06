-- =====================================================
-- Migration v2: Status Report Geral + Status Real customizável
--
-- Adiciona:
--   1. Tabela dashboard_settings (configs genéricas)
--   2. Tabela dashboard_project_statuses (status customizáveis)
--   3. Campos novos em dashboard_projects:
--      - real_status_id (FK)
--      - last_individual_sent_at (timestamp do último envio individual)
--      - last_general_sent_at    (timestamp do último envio no relatório geral)
-- =====================================================

-- 1. Configurações genéricas (key/value)
CREATE TABLE IF NOT EXISTS dashboard_settings (
    key        TEXT PRIMARY KEY,
    value      JSONB NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Registro do Relatório Geral — emails dos diretores/heads
INSERT INTO dashboard_settings (key, value)
VALUES ('general_report', '{"emails": [], "enabled": true}'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- 2. Status Real customizáveis
CREATE TABLE IF NOT EXISTS dashboard_project_statuses (
    id         SERIAL PRIMARY KEY,
    name       TEXT NOT NULL UNIQUE,
    color      TEXT DEFAULT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Status iniciais sugeridos
INSERT INTO dashboard_project_statuses (name, color) VALUES
    ('Aguardando especificação', '#f59e0b'),
    ('Em desenvolvimento',       '#3b82f6'),
    ('Em homologação',           '#8b5cf6'),
    ('Em produção',              '#10b981'),
    ('Bloqueado',                '#ef4444')
ON CONFLICT (name) DO NOTHING;

-- 3. Novos campos em dashboard_projects
ALTER TABLE dashboard_projects
    ADD COLUMN IF NOT EXISTS real_status_id          INTEGER REFERENCES dashboard_project_statuses(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS last_individual_sent_at TIMESTAMPTZ DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS last_general_sent_at    TIMESTAMPTZ DEFAULT NULL;

-- Índice para acelerar a consulta de elegibilidade do "done"
CREATE INDEX IF NOT EXISTS idx_dashboard_projects_done_eligibility
    ON dashboard_projects (status, completed_at, last_individual_sent_at, last_general_sent_at);

-- 4. Desabilitar RLS nas tabelas novas
-- (mantém o mesmo padrão de dashboard_projects, que é escrita pelo cliente anon do front)
ALTER TABLE dashboard_settings          DISABLE ROW LEVEL SECURITY;
ALTER TABLE dashboard_project_statuses  DISABLE ROW LEVEL SECURITY;
