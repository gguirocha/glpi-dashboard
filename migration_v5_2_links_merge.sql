-- =============================================================================
-- migration_v5_2_links_merge.sql — PRJ-2026-092 / E4 (controle de mudanças #1)
-- `links` no PATCH passa a ser DELTA mesclado no servidor, dentro da mesma transação:
--   nome→URL adiciona/troca · nome→null remove · links null limpa tudo · total ≤ 10.
-- Elimina a corrida da mescla no cliente (GET + PATCH) usada pelo CLI até a v1.3.
-- Só muda o tratamento de links e o limite de 10; o resto da função é igual à v5_1.
-- Idempotente (CREATE OR REPLACE preserva os grants; reaplicados abaixo por garantia).
-- =============================================================================
BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE OR REPLACE FUNCTION public.api_write_project(
    p_id       BIGINT,   -- NULL = abrir projeto novo
    p_project  JSONB,    -- campos da lista branca (ver lib/projects/validate.ts)
    p_event    JSONB,    -- {kind, summary} ou NULL
    p_author   TEXT,     -- vem da chave, nunca do corpo
    p_key_id   BIGINT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
SET lock_timeout = '5s'
AS $$
DECLARE
  v          JSONB := coalesce(p_project, '{}'::jsonb);
  permitidos CONSTANT TEXT[] := ARRAY['title','owner','phase','health','health_reason','steps_total','steps_done',
                                      'due_date','baseline_date','requester','area','sponsor','origin_ticket','links',
                                      'next_step','decision_needed','weekly_update','real_status_id'];
  k          TEXT;
  antes      public.dashboard_projects%ROWTYPE;
  r          public.dashboard_projects%ROWTYPE;
  alterados  TEXT[] := '{}';
  ev         JSONB := p_event;
BEGIN
  -- ---- validações de forma (defesa em profundidade; a rota já valida) ----
  IF jsonb_typeof(v) <> 'object' THEN
    RAISE EXCEPTION 'project deve ser objeto' USING ERRCODE = '22023';
  END IF;
  IF ev IS NOT NULL AND jsonb_typeof(ev) = 'null' THEN ev := NULL; END IF;
  IF ev IS NOT NULL AND (jsonb_typeof(ev) <> 'object' OR coalesce(ev->>'kind','') = '' OR coalesce(ev->>'summary','') = '') THEN
    RAISE EXCEPTION 'event inválido' USING ERRCODE = '22023';
  END IF;
  IF coalesce(btrim(p_author), '') = '' THEN
    RAISE EXCEPTION 'autor obrigatório' USING ERRCODE = '22023';
  END IF;
  FOR k IN SELECT jsonb_object_keys(v) LOOP
    IF NOT k = ANY (permitidos) THEN
      RAISE EXCEPTION 'campo não permitido' USING ERRCODE = '22023';
    END IF;
  END LOOP;
  FOREACH k IN ARRAY ARRAY['steps_total','steps_done','real_status_id'] LOOP
    IF v ? k AND jsonb_typeof(v->k) NOT IN ('number','null') THEN
      RAISE EXCEPTION 'número inválido' USING ERRCODE = '22023';
    END IF;
  END LOOP;
  FOREACH k IN ARRAY ARRAY['due_date','baseline_date'] LOOP
    IF v ? k AND jsonb_typeof(v->k) <> 'null' AND (v->>k) !~ '^\d{4}-\d{2}-\d{2}$' THEN
      RAISE EXCEPTION 'data inválida' USING ERRCODE = '22023';
    END IF;
  END LOOP;
  FOREACH k IN ARRAY ARRAY['title','phase','health','steps_total','steps_done'] LOOP
    IF v ? k AND (jsonb_typeof(v->k) = 'null' OR btrim(v->>k) = '') THEN
      RAISE EXCEPTION 'campo obrigatório não pode ser vazio' USING ERRCODE = '22023';
    END IF;
  END LOOP;
  IF v ? 'links' AND jsonb_typeof(v->'links') NOT IN ('object','null') THEN
    RAISE EXCEPTION 'links deve ser objeto' USING ERRCODE = '22023';
  END IF;
  IF jsonb_typeof(v->'links') = 'object'
     AND EXISTS (SELECT 1 FROM jsonb_each(v->'links') e WHERE jsonb_typeof(e.value) NOT IN ('string','null')) THEN
    RAISE EXCEPTION 'valor de link deve ser texto' USING ERRCODE = '22023';
  END IF;

  IF p_id IS NULL THEN
    IF coalesce(btrim(v->>'title'), '') = '' THEN
      RAISE EXCEPTION 'title obrigatório' USING ERRCODE = '22023';
    END IF;
    INSERT INTO public.dashboard_projects (
        title, status, owner, phase, health, health_reason, steps_total, steps_done,
        due_date, baseline_date, requester, area, sponsor, origin_ticket, links,
        next_step, decision_needed, weekly_update, real_status_id, report_emails)
    VALUES (
        v->>'title', 'todo', v->>'owner',
        coalesce(v->>'phase', 'abertura'), coalesce(v->>'health', 'verde'), v->>'health_reason',
        coalesce((v->>'steps_total')::int, 0), coalesce((v->>'steps_done')::int, 0),
        (v->>'due_date')::date, (v->>'baseline_date')::date,
        v->>'requester', v->>'area', v->>'sponsor', v->>'origin_ticket',
        CASE WHEN jsonb_typeof(v->'links') = 'object' THEN jsonb_strip_nulls(v->'links') ELSE '{}'::jsonb END,
        v->>'next_step', v->>'decision_needed', v->>'weekly_update',
        (v->>'real_status_id')::int, '{}'::text[])
    RETURNING * INTO r;
    IF ev IS NULL THEN
      ev := jsonb_build_object('kind', 'aberto', 'summary', 'Projeto aberto.');
    END IF;
  ELSE
    SELECT * INTO antes FROM public.dashboard_projects WHERE id = p_id FOR NO KEY UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'projeto não encontrado' USING ERRCODE = 'P0002';
    END IF;
    IF v ? 'baseline_date'
       AND (v->>'baseline_date')::date IS DISTINCT FROM antes.baseline_date
       AND antes.baseline_date IS NOT NULL
       AND coalesce(ev->>'kind', '') <> 'mudanca' THEN
      RAISE EXCEPTION 'mudar o prazo prometido exige evento mudanca' USING ERRCODE = '22023';
    END IF;
    UPDATE public.dashboard_projects SET
        title           = CASE WHEN v ? 'title'           THEN v->>'title'                 ELSE title END,
        owner           = CASE WHEN v ? 'owner'           THEN v->>'owner'                 ELSE owner END,
        phase           = CASE WHEN v ? 'phase'           THEN v->>'phase'                 ELSE phase END,
        health          = CASE WHEN v ? 'health'          THEN v->>'health'                ELSE health END,
        health_reason   = CASE WHEN v ? 'health_reason'   THEN v->>'health_reason'         ELSE health_reason END,
        steps_total     = CASE WHEN v ? 'steps_total'     THEN (v->>'steps_total')::int    ELSE steps_total END,
        steps_done      = CASE WHEN v ? 'steps_done'      THEN (v->>'steps_done')::int     ELSE steps_done END,
        due_date        = CASE WHEN v ? 'due_date'        THEN (v->>'due_date')::date      ELSE due_date END,
        baseline_date   = CASE WHEN v ? 'baseline_date'   THEN (v->>'baseline_date')::date ELSE baseline_date END,
        requester       = CASE WHEN v ? 'requester'       THEN v->>'requester'             ELSE requester END,
        area            = CASE WHEN v ? 'area'            THEN v->>'area'                  ELSE area END,
        sponsor         = CASE WHEN v ? 'sponsor'         THEN v->>'sponsor'               ELSE sponsor END,
        origin_ticket   = CASE WHEN v ? 'origin_ticket'   THEN v->>'origin_ticket'         ELSE origin_ticket END,
        links           = CASE WHEN v ? 'links' THEN
                            CASE WHEN jsonb_typeof(v->'links') = 'object'
                                 THEN (coalesce(links, '{}'::jsonb) || jsonb_strip_nulls(v->'links'))
                                      - coalesce(ARRAY(SELECT e.key FROM jsonb_each(v->'links') e WHERE jsonb_typeof(e.value) = 'null'), '{}')
                                 ELSE '{}'::jsonb END
                          ELSE links END,
        next_step       = CASE WHEN v ? 'next_step'       THEN v->>'next_step'             ELSE next_step END,
        decision_needed = CASE WHEN v ? 'decision_needed' THEN v->>'decision_needed'       ELSE decision_needed END,
        weekly_update   = CASE WHEN v ? 'weekly_update'   THEN v->>'weekly_update'         ELSE weekly_update END,
        real_status_id  = CASE WHEN v ? 'real_status_id'  THEN (v->>'real_status_id')::int ELSE real_status_id END
      WHERE id = p_id
    RETURNING * INTO r;

    -- nomes (nunca valores) dos campos que mudaram de fato, para a trilha
    SELECT coalesce(array_agg(n.key ORDER BY n.key), '{}') INTO alterados
      FROM jsonb_each(to_jsonb(r)) n
      JOIN jsonb_each(to_jsonb(antes)) o USING (key)
     WHERE n.key = ANY (permitidos) AND n.value IS DISTINCT FROM o.value;
    IF ev IS NULL AND cardinality(alterados) > 0 THEN
      ev := jsonb_build_object('kind', 'atualizacao', 'summary', 'Campos alterados: ' || array_to_string(alterados, ', '));
    END IF;
  END IF;

  IF (p_id IS NULL OR v ? 'links') AND (SELECT count(*) FROM jsonb_object_keys(r.links)) > 10 THEN
    RAISE EXCEPTION 'no máximo 10 links por projeto' USING ERRCODE = '22023';
  END IF;

  IF ev IS NOT NULL THEN
    INSERT INTO public.dashboard_project_events (project_id, kind, summary, author, api_key_id)
    VALUES (r.id, ev->>'kind', ev->>'summary', p_author, p_key_id);
  END IF;

  RETURN jsonb_build_object(
    'id', r.id, 'code', r.code, 'title', r.title, 'status', r.status, 'phase', r.phase,
    'health', r.health, 'health_reason', r.health_reason, 'steps_total', r.steps_total, 'steps_done', r.steps_done,
    'start_date', r.start_date, 'baseline_date', r.baseline_date, 'due_date', r.due_date, 'owner', r.owner,
    'requester', r.requester, 'area', r.area, 'sponsor', r.sponsor, 'origin_ticket', r.origin_ticket,
    'links', r.links, 'next_step', r.next_step, 'decision_needed', r.decision_needed,
    'real_status_id', r.real_status_id, 'completed_at', r.completed_at, 'updated_at', r.updated_at);
END $$;

REVOKE ALL ON FUNCTION public.api_write_project(BIGINT, JSONB, JSONB, TEXT, BIGINT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.api_write_project(BIGINT, JSONB, JSONB, TEXT, BIGINT) TO service_role;

COMMIT;
