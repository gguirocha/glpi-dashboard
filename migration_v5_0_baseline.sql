-- =============================================================================
-- migration_v5_0_baseline.sql — PRJ-2026-092 / E1
-- Versiona o esquema REAL das tabelas de projetos como estava em 27/11/2026
-- (lido de information_schema/pg_catalog em transação read-only).
-- NÃO RODAR EM PRODUÇÃO (já está assim lá). Serve para recriar o ambiente do zero e como
-- ponto de partida documentado da migration_v5_projects_v2.sql.
-- Estado de segurança encontrado: RLS ligado nas 3 tabelas, policy ALL para
-- `authenticated` (qual/with_check = true), `anon` sem grants (revogado em 24/11).
-- Privilégios padrão do schema public concedem tudo a anon/authenticated em
-- tabelas e sequências NOVAS: toda tabela nova precisa de REVOKE explícito.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.dashboard_project_statuses (
    id          SERIAL PRIMARY KEY,
    name        TEXT NOT NULL UNIQUE,
    color       TEXT,
    created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.dashboard_projects (
    id                       BIGINT PRIMARY KEY,           -- default nextval('dashboard_projects_id_seq')
    title                    TEXT NOT NULL,
    status                   TEXT NOT NULL CHECK (status IN ('todo', 'in_progress', 'done')),
    created_at               TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    completed_at             TIMESTAMPTZ,
    weekly_update            TEXT,
    report_emails            TEXT[] DEFAULT '{}'::text[],
    owner                    TEXT,
    real_status_id           INTEGER REFERENCES public.dashboard_project_statuses(id) ON DELETE SET NULL,
    last_individual_sent_at  TIMESTAMPTZ,
    last_general_sent_at     TIMESTAMPTZ,
    due_date                 DATE
);
-- sequência real: public.dashboard_projects_id_seq (pg_get_serial_sequence). Só define o default num banco NOVO:
DO $$
BEGIN
  IF (SELECT column_default FROM information_schema.columns
       WHERE table_schema='public' AND table_name='dashboard_projects' AND column_name='id') IS NULL THEN
    CREATE SEQUENCE IF NOT EXISTS public.dashboard_projects_id_seq OWNED BY public.dashboard_projects.id;
    ALTER TABLE public.dashboard_projects ALTER COLUMN id SET DEFAULT nextval('public.dashboard_projects_id_seq');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.dashboard_settings (
    key         TEXT PRIMARY KEY,
    value       JSONB NOT NULL,
    updated_at  TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.dashboard_project_statuses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dashboard_projects        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dashboard_settings        ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='dashboard_project_statuses' AND policyname='auth status') THEN
    CREATE POLICY "auth status" ON public.dashboard_project_statuses FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='dashboard_projects' AND policyname='auth projetos') THEN
    CREATE POLICY "auth projetos" ON public.dashboard_projects FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='dashboard_settings' AND policyname='auth settings') THEN
    CREATE POLICY "auth settings" ON public.dashboard_settings FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

REVOKE ALL ON public.dashboard_project_statuses, public.dashboard_projects, public.dashboard_settings FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dashboard_project_statuses, public.dashboard_projects, public.dashboard_settings TO authenticated;

-- Nomes das policies conferidos em pg_policies (27/11/2026): "auth status", "auth projetos", "auth settings".
-- Catálogo de situações em 27/11/2026 (ids usados pela fase no backfill da v5):
-- 1 Aguardando especificação · 2 Em desenvolvimento · 3 Em homologação · 4 Em produção · 5 Bloqueado
-- 10 Teste · 11 Concluído · 12 Aguardando Retorno · 13 Em andamento
