# AGENTS.md — glpi-dashboard

Regras permanentes para qualquer agente/sessão que trabalhe neste repositório. Ler antes de tudo.

## Contexto
- Organização: Mundo dos Ferros · Banco: Supabase do GLPI Dash (`jddpcoybfacjaepodhyf`) — produção, sem staging.
- Projeto em andamento: **PRJ-2026-092** (card id 92). PRD: `docs/PRD.md` · Documento do Projeto (escopo, etapas,
  situação atual, decisões): `docs/PROJETO.md` — ler antes de começar.
- Vault: `C:\MdF-Docs` → notas [[GLPI Dash]], [[glpi-dashboard]], runbook [[Deploy GLPI Dash]].

## Stack e comandos
| Ação | Comando |
|---|---|
| Instalar | `npm install` |
| Lint | `npm run lint` |
| Build (inclui typecheck) | `npm run build` |
| Testes | `npm test` (vitest — adicionado no PRJ-2026-092) |
| Rodar local | `npm run dev` (precisa `.env.local`) |
| Deploy | `./deploy.sh` — **só com OK explícito**; commit **e push antes** (o servidor faz `git reset --hard origin/main`) |

## Estrutura relevante
- `components/ProjectBoard.tsx` — quadro de projetos (browser, usuário autenticado, supabase client anon key + sessão).
- `lib/weeklyReport.ts` + `instrumentation.ts` — reports semanal/geral (service_role, Gemini, SMTP), agendados no processo do PM2.
- `app/api/**/route.ts` — rotas de servidor; guardas em `lib/requireAdmin.ts` (JWT + role admin).
- `migration_v*.sql` na raiz — migrations manuais, idempotentes, aplicadas no SQL Editor **antes** do deploy.

## Convenções
- Commits: `feat(etapa-N): …`, `fix: …`, `fix(security): …`, `chore: …`. Base dos PRs: `main`.
- Rotas novas: retorno `{ok}|{ok:false,response}` como `requireAdmin`; `export const dynamic = "force-dynamic"`;
  validar campos por whitelist (nunca repassar o body cru ao `update`); erro como `{ error }` + status.
- Datas de prazo são `DATE` e parseadas como meia-noite local (`parseDueDate`); nunca `timestamptz` para prazo.
- Colunas novas sempre com DEFAULT (o `addProject` do front lista campos explícitos).

## Proibições
- Segredos só em `.env.local`/variáveis do PM2; nunca em código, log, documento ou commit.
- Nada de `select("*")` em rotas novas nem na tabela de eventos; nada de polling (o egress do Supabase já estourou).
- Tabela de chaves de API: RLS ligado, sem grants para `anon`/`authenticated`; só service_role.
- Não mudar o enum `status` (`todo|in_progress|done`): o ciclo de reports depende dele.
- Não rodar `deploy.sh --validate` como teste: envia e-mails reais e zera `weekly_update`.
- Nenhuma alteração no banco de produção ou deploy sem OK por ação do gestor.

## Revisão
- Reviewer da linguagem: `ecc:typescript-reviewer` (+ `ecc:react-reviewer` para componentes)
- SQL/migrations: `ecc:database-reviewer` · Segurança: `ecc:security-reviewer` · Integrações/agendador: `ecc:silent-failure-hunter`
