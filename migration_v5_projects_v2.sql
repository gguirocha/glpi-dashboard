-- =============================================================================
-- migration_v5_projects_v2.sql — PRJ-2026-092 / E1 (Quadro de Projetos v2)
-- Aditiva e idempotente: pode rodar 2x (inclusive depois do go-live) sem efeito.
-- A tela e o script atuais continuam funcionando (colunas novas com DEFAULT; a trigger
-- mantém `phase` e `status` coerentes). Aplicar no SQL Editor do Supabase
-- (projeto jddpcoybfacjaepodhyf) ANTES de qualquer deploy.
-- Revisada por ecc:database-reviewer e ecc:security-reviewer em 27/11/2026 (achados aplicados).
-- =============================================================================
BEGIN;
SET LOCAL lock_timeout = '5s';        -- não enfileirar leituras do dashboard atrás de um lock longo
SET LOCAL statement_timeout = '60s';

-- 1) Colunas novas em dashboard_projects ------------------------------------------------
ALTER TABLE public.dashboard_projects
    ADD COLUMN IF NOT EXISTS code            TEXT,
    ADD COLUMN IF NOT EXISTS phase           TEXT        NOT NULL DEFAULT 'abertura',
    ADD COLUMN IF NOT EXISTS health          TEXT        NOT NULL DEFAULT 'verde',
    ADD COLUMN IF NOT EXISTS health_reason   TEXT,
    ADD COLUMN IF NOT EXISTS steps_total     INTEGER     NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS steps_done      INTEGER     NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS start_date      DATE,
    ADD COLUMN IF NOT EXISTS baseline_date   DATE,       -- prazo PROMETIDO (due_date = previsto)
    ADD COLUMN IF NOT EXISTS requester       TEXT,
    ADD COLUMN IF NOT EXISTS area            TEXT,
    ADD COLUMN IF NOT EXISTS sponsor         TEXT,
    ADD COLUMN IF NOT EXISTS origin_ticket   TEXT,
    ADD COLUMN IF NOT EXISTS links           JSONB       NOT NULL DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS next_step       TEXT,
    ADD COLUMN IF NOT EXISTS decision_needed TEXT,
    ADD COLUMN IF NOT EXISTS updated_at      TIMESTAMPTZ NOT NULL DEFAULT now();

DO $$
DECLARE t regclass := 'public.dashboard_projects'::regclass;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = t AND conname = 'dashboard_projects_phase_check') THEN
    ALTER TABLE public.dashboard_projects ADD CONSTRAINT dashboard_projects_phase_check
      CHECK (phase IN ('abertura','escopo','execucao','seguranca','homologacao','encerrado'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = t AND conname = 'dashboard_projects_health_check') THEN
    ALTER TABLE public.dashboard_projects ADD CONSTRAINT dashboard_projects_health_check
      CHECK (health IN ('verde','amarelo','vermelho'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = t AND conname = 'dashboard_projects_steps_check') THEN
    ALTER TABLE public.dashboard_projects ADD CONSTRAINT dashboard_projects_steps_check
      CHECK (steps_total >= 0 AND steps_done >= 0 AND steps_done <= steps_total AND steps_total <= 100);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = t AND conname = 'dashboard_projects_text_len_check') THEN
    ALTER TABLE public.dashboard_projects ADD CONSTRAINT dashboard_projects_text_len_check
      CHECK (coalesce(length(health_reason),0) <= 500 AND coalesce(length(next_step),0) <= 1000
             AND coalesce(length(decision_needed),0) <= 1000
             AND coalesce(length(requester),0) <= 200 AND coalesce(length(area),0) <= 200
             AND coalesce(length(sponsor),0) <= 200 AND coalesce(length(origin_ticket),0) <= 200);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = t AND conname = 'dashboard_projects_links_check') THEN
    ALTER TABLE public.dashboard_projects ADD CONSTRAINT dashboard_projects_links_check
      CHECK (jsonb_typeof(links) = 'object' AND octet_length(links::text) <= 4096);
  END IF;
END $$;

-- 2) Trigger: código PRJ, coerência fase <-> status/completed_at, guardas, updated_at -----
-- Fonte da verdade: quem mudou. Fase mudou => deriva status. Só status mudou (tela/script
-- legados) => deriva fase. `status` continua existindo: o ciclo de reports depende dele.
CREATE OR REPLACE FUNCTION public.dashboard_projects_v2_sync()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  fase_mudou   boolean;
  status_mudou boolean;
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- código sempre gerado pelo banco (ignora o enviado: evita "reservar" códigos futuros)
    NEW.code := 'PRJ-' || to_char(NEW.created_at AT TIME ZONE 'UTC', 'YYYY') || '-'
                || CASE WHEN NEW.id < 1000 THEN lpad(NEW.id::text, 3, '0') ELSE NEW.id::text END;
    IF NEW.start_date IS NULL THEN
      NEW.start_date := (NEW.created_at AT TIME ZONE 'America/Sao_Paulo')::date;
    END IF;
    fase_mudou   := NEW.phase IS DISTINCT FROM 'abertura';
    status_mudou := NOT fase_mudou AND NEW.status IS DISTINCT FROM 'todo';
  ELSE
    NEW.code := OLD.code;                                   -- imutável
    IF current_user IN ('anon', 'authenticated')
       AND OLD.baseline_date IS NOT NULL
       AND NEW.baseline_date IS DISTINCT FROM OLD.baseline_date THEN
      RAISE EXCEPTION 'prazo prometido só muda pela API (controle de mudanças)' USING ERRCODE = '42501';
    END IF;
    fase_mudou   := NEW.phase  IS DISTINCT FROM OLD.phase;
    status_mudou := NOT fase_mudou AND NEW.status IS DISTINCT FROM OLD.status;
  END IF;

  IF fase_mudou THEN
    NEW.status := CASE
      WHEN NEW.phase IN ('abertura','escopo') THEN 'todo'
      WHEN NEW.phase = 'encerrado'            THEN 'done'
      ELSE 'in_progress' END;
  ELSIF status_mudou THEN
    NEW.phase := CASE
      WHEN NEW.status = 'done' THEN 'encerrado'
      WHEN NEW.status = 'todo' THEN
        CASE WHEN NEW.phase IN ('abertura','escopo') THEN NEW.phase ELSE 'abertura' END
      ELSE
        CASE WHEN NEW.phase IN ('execucao','seguranca','homologacao') THEN NEW.phase ELSE 'execucao' END
    END;
  END IF;

  IF NEW.status = 'done' AND NEW.completed_at IS NULL THEN
    NEW.completed_at := now();
  ELSIF NEW.status <> 'done' AND TG_OP = 'UPDATE' AND OLD.status = 'done' THEN
    NEW.completed_at := NULL;
  END IF;

  -- updated_at só para mudança de conteúdo (o ciclo de reports mexe em weekly_update/last_*_sent_at toda semana)
  IF TG_OP = 'INSERT'
     OR (NEW.title, NEW.status, NEW.phase, NEW.health, NEW.health_reason, NEW.steps_total, NEW.steps_done,
         NEW.due_date, NEW.baseline_date, NEW.next_step, NEW.decision_needed, NEW.owner, NEW.real_status_id,
         NEW.requester, NEW.area, NEW.sponsor, NEW.origin_ticket, NEW.links)
        IS DISTINCT FROM
        (OLD.title, OLD.status, OLD.phase, OLD.health, OLD.health_reason, OLD.steps_total, OLD.steps_done,
         OLD.due_date, OLD.baseline_date, OLD.next_step, OLD.decision_needed, OLD.owner, OLD.real_status_id,
         OLD.requester, OLD.area, OLD.sponsor, OLD.origin_ticket, OLD.links) THEN
    NEW.updated_at := now();
  ELSE
    NEW.updated_at := OLD.updated_at;
  END IF;
  RETURN NEW;
END $$;

REVOKE ALL ON FUNCTION public.dashboard_projects_v2_sync() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_dashboard_projects_v2_sync ON public.dashboard_projects;
CREATE TRIGGER trg_dashboard_projects_v2_sync
  BEFORE INSERT OR UPDATE ON public.dashboard_projects
  FOR EACH ROW EXECUTE FUNCTION public.dashboard_projects_v2_sync();

-- 3) Backfill (só toca o que ainda não foi preenchido; no-op ao rodar de novo) ------------
-- Trigger desligada para não mexer em status/completed_at/updated_at dos registros antigos.
ALTER TABLE public.dashboard_projects DISABLE TRIGGER trg_dashboard_projects_v2_sync;

UPDATE public.dashboard_projects
   SET code = 'PRJ-' || to_char(created_at AT TIME ZONE 'UTC', 'YYYY') || '-'
              || CASE WHEN id < 1000 THEN lpad(id::text, 3, '0') ELSE id::text END
 WHERE code IS NULL;

-- Fase decidida pelo status; real_status_id só refina dentro de in_progress.
-- Depois do go-live a trigger garante que não existe abertura com status <> todo: o filtro não casa mais.
UPDATE public.dashboard_projects
   SET phase = CASE
         WHEN status = 'done' THEN 'encerrado'
         WHEN real_status_id IN (3, 4) THEN 'homologacao'
         ELSE 'execucao' END
 WHERE phase = 'abertura' AND status <> 'todo';

-- done sem data de conclusão: usa a criação (já reportado; evita que o próximo update gere now())
UPDATE public.dashboard_projects
   SET completed_at = created_at
 WHERE status = 'done' AND completed_at IS NULL;

UPDATE public.dashboard_projects
   SET start_date = (created_at AT TIME ZONE 'America/Sao_Paulo')::date
 WHERE start_date IS NULL;

UPDATE public.dashboard_projects
   SET baseline_date = due_date
 WHERE baseline_date IS NULL AND due_date IS NOT NULL;

ALTER TABLE public.dashboard_projects ENABLE TRIGGER trg_dashboard_projects_v2_sync;

ALTER TABLE public.dashboard_projects ALTER COLUMN code SET NOT NULL;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.dashboard_projects'::regclass
                 AND conname = 'dashboard_projects_code_format_check') THEN
    ALTER TABLE public.dashboard_projects ADD CONSTRAINT dashboard_projects_code_format_check
      CHECK (code ~ '^PRJ-[0-9]{4}-[0-9]{3,}$');
  END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS dashboard_projects_code_key ON public.dashboard_projects (code);
CREATE INDEX IF NOT EXISTS idx_dashboard_projects_phase ON public.dashboard_projects (phase);

-- 4) Endurecimento das permissões existentes (achados da revisão) ------------------------
-- TRUNCATE ignora RLS; REFERENCES/TRIGGER não são usados pela tela.
REVOKE TRUNCATE, REFERENCES, TRIGGER
    ON public.dashboard_projects, public.dashboard_project_statuses, public.dashboard_settings FROM authenticated;
REVOKE ALL ON SEQUENCE public.dashboard_projects_id_seq, public.dashboard_project_statuses_id_seq FROM anon;

-- 5) Chaves pessoais da API (só hash; só service_role acessa) ----------------------------
CREATE TABLE IF NOT EXISTS public.dashboard_api_keys (
    id            BIGSERIAL PRIMARY KEY,
    owner_name    TEXT        NOT NULL CHECK (length(owner_name) BETWEEN 1 AND 100),
    label         TEXT        CHECK (length(label) <= 100),
    key_prefix    TEXT        NOT NULL CHECK (length(key_prefix) BETWEEN 4 AND 16),
    key_hash      TEXT        NOT NULL UNIQUE CHECK (key_hash ~ '^[0-9a-f]{64}$'),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_used_at  TIMESTAMPTZ,
    revoked_at    TIMESTAMPTZ
);
ALTER TABLE public.dashboard_api_keys ENABLE ROW LEVEL SECURITY;   -- sem policies: ninguém além da service_role
REVOKE ALL ON public.dashboard_api_keys FROM PUBLIC, anon, authenticated;
REVOKE ALL ON SEQUENCE public.dashboard_api_keys_id_seq FROM PUBLIC, anon, authenticated;

-- 6) Eventos (linha do tempo dos portões) -----------------------------------------------
-- RESTRICT: apagar um projeto com histórico exige apagar os eventos antes (só a service_role pode):
-- a trilha de auditoria não some por um DELETE na tela.
CREATE TABLE IF NOT EXISTS public.dashboard_project_events (
    id          BIGSERIAL PRIMARY KEY,
    project_id  BIGINT      NOT NULL REFERENCES public.dashboard_projects(id) ON DELETE RESTRICT,
    kind        TEXT        NOT NULL CHECK (kind IN ('aberto','g1','g2','g3','g4','encerrado','mudanca','bloqueio','atualizacao')),
    summary     TEXT        NOT NULL CHECK (length(summary) BETWEEN 1 AND 2000),
    author      TEXT        NOT NULL CHECK (length(author) BETWEEN 1 AND 100),
    api_key_id  BIGINT      REFERENCES public.dashboard_api_keys(id) ON DELETE SET NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_dashboard_project_events_project
    ON public.dashboard_project_events (project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_dashboard_project_events_api_key
    ON public.dashboard_project_events (api_key_id);
ALTER TABLE public.dashboard_project_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.dashboard_project_events FROM PUBLIC, anon, authenticated;
REVOKE ALL ON SEQUENCE public.dashboard_project_events_id_seq FROM PUBLIC, anon, authenticated;
-- tela lê (sem api_key_id); só a API (service_role) grava
GRANT SELECT (id, project_id, kind, summary, author, created_at) ON public.dashboard_project_events TO authenticated;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='dashboard_project_events' AND policyname='auth le eventos') THEN
    CREATE POLICY "auth le eventos" ON public.dashboard_project_events FOR SELECT TO authenticated USING (true);
  END IF;
END $$;

-- 7) Limite de WIP (indicador do quadro) -------------------------------------------------
INSERT INTO public.dashboard_settings (key, value)
VALUES ('projects_board', '{"wip_limit": 8}'::jsonb)
ON CONFLICT (key) DO NOTHING;

COMMIT;
