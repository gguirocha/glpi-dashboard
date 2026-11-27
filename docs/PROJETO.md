# Documento do Projeto — Quadro de Projetos v2 + API de projetos

> **Situação atual**
> Saúde: 🟢 (1 dia útil adiantado)
> Fase: Execução — E4 publicada, aguardando G2 · Próximo passo: conferência do gestor no quadro real e G2 da E4; depois E5 · Bloqueios: nenhum · Atualizado: 2026-11-27

## 1. Identificação
| Campo | Valor |
|---|---|
| Código / GLPI Dash | PRJ-2026-092 / id 92 |
| Organização / banco | Mundo dos Ferros / Supabase GLPI Dash (`jddpcoybfacjaepodhyf`) |
| Origem | Iniciativa da TI (novo modelo de gestão de projetos, ADR-0007) |
| Patrocinador (aprova e decide) | Gestor de Projetos da TI |
| Solicitante (valida e homologa) | Gestor de Projetos da TI; consumidores: diretoria (report geral) |
| Gestor do projeto | Guilherme Rocha |
| Responsável técnico | Guilherme Rocha (execução com Claude + agentes ECC) |
| Tamanho / prioridade | M / Alta (valor 5 × esforço 3) |
| Início / prazo baseline / prazo atual | 2026-11-27 / 2026-12-04 / 2026-12-04 |
| Repositório / branch | `gguirocha/glpi-dashboard` · `feat/prj-2026-092-quadro-v2` |

## 2. Justificativa e objetivo
O quadro atual só tem três estados (a fazer, em andamento, concluído) e o status report depende de texto escrito à
mão. Em 27/11/2026, 71 de 72 projetos estavam concluídos e nenhum tinha solicitante, etapas, linha de base ou
indicador; a diretoria não tem visão de atrasos nem bloqueios. Além disso, registrar projetos pelo Claude exigiria
distribuir a chave mestra do banco.
**Objetivo:** até 04/12/2026, o gestor e a diretoria veem o portfólio por fase, com saúde, avanço e prazo prometido ×
previsto, atualizado sozinho pelos portões do fluxo de projetos, e o registro passa a usar chave pessoal restrita a projetos.

## 3. Partes interessadas (RACI)
| Pessoa / área | Papel | R | A | C | I |
|---|---|---|---|---|---|
| Gestor de Projetos (TI) | Patrocinador, solicitante e homologador | | ✔ | | |
| Claude + agentes ECC | Execução técnica, testes, revisão | ✔ | | | |
| Diretoria | Recebe o report geral novo | | | ✔ | ✔ |
| Solicitantes dos demais projetos | Recebem o report individual novo | | | | ✔ |
| Colaboradores da TI | Futuros usuários da API (v2 só o gestor) | | | | ✔ |

## 4. Escopo
**Entra:** API `/api/projetos` com chave pessoal (abrir, atualizar/portão, concluir, consultar); script de chaves
(criar/listar/revogar, rodado no servidor); tabela de eventos (linha do tempo); campos novos de projeto (código, fase,
saúde, etapas, início, prazo prometido, solicitante/área, patrocinador, chamado, links, próximo passo, decisão pedida);
quadro em colunas por fase com etiqueta de situação, saúde, barra de etapas, desvio e linha do tempo; indicadores do
mês e alerta de WIP; report individual com fase/saúde/avanço/próximo passo/prazos; report geral com exceções +
entregas; modo prévia do report; `projeto.mjs` falando só com a API.
**Não entra:** tela admin de chaves (v3); chaves para outros colaboradores; fila priorizada valor × esforço (R11);
evento automático quando a situação muda pela tela; integração com o módulo Projetos do GLPI; medição automática de
benefícios; mudanças no sync de chamados; reescrita dos 72 projetos antigos além de código e fase; rotação da
service_role; testes E2E automatizados.
**Premissas:** cada escrita em produção (migration, backfill, deploy, chave) tem OK por ação; uma instância do PM2;
id 5 = "Bloqueado" no catálogo de situações (conferir em E1).
**Restrições:** produção sem staging; egress do Supabase sensível; deploy faz `git reset --hard origin/main`
(push antes); `deploy.sh --validate` proibido neste projeto (envia e-mails reais).

## 5. Entregas (etapas)
| # | Resultado entregue | Critério de pronto | Status |
|---|---|---|---|
| E1 | Banco pronto, nada quebra: 72 projetos com código e fase; tela e script atuais funcionando igual | contagem por fase bate com `status`; migration roda 2× sem diferença; anon recebe 401 nas tabelas novas; tela antiga move/edita normal | ✔ aprovada (G2 27/11, commit `2beb289`) |
| E2 | API no ar com chave pessoal | A1, A2, A7 provados por curl; testes unitários, lint e build verdes | ✔ aprovada (G2 27/11, PR #1 / commit `1b1768a`) |
| E3 | Skill registra sem chave mestra (`projeto.mjs` só pela API) | fluxo abrir → G1 → G2 → concluir no projeto de teste; nenhuma `SERVICE_KEY` no script nem no `.ti-mdf.env` | ✔ aprovada (G2 27/11, kit ti-mdf v1.3.1) |
| E4 | Quadro v2 por fase com saúde, barra, desvio, linha do tempo, indicadores e WIP | A3, A4, A6 provados; 1 consulta com colunas fixas no carregamento; eventos só ao abrir o card | aguardando aprovação |
| E5 | Reports novos (individual e geral de exceções + entregas) | prévia revisada pelo gestor sem envio real; A5 real na segunda 07/12 | pendente |
| E6 | Homologação, segurança e encerramento | A1–A7 marcados; revisão de segurança sem CRITICAL/HIGH; vault atualizado; projeto de teste removido | pendente |

## 6. Cronograma (previsto × realizado)
| Marco / etapa | Previsto | Realizado | Desvio |
|---|---|---|---|
| G1 Escopo aprovado | 27/11 | 27/11 | 0 |
| E1 Banco (0,75 d) | 27/11–30/11 | 27/11 | −1 dia útil (adiantada) |
| E2 API (1,25 d) | 30/11–01/12 | 27/11 | −2 dias úteis (adiantada) |
| E3 Skill pela API (0,5 d) | 02/12 | 27/11 | −3 dias úteis (adiantada) |
| E4 Quadro v2 (1,25 d) | 02/12–03/12 | 27/11 | −4 dias úteis (adiantada) |
| E5 Reports (0,75 d) | 04/12 | | |
| G3 Liberação / E6 | 04/12 | | |
| G4 Aceite (A5 real) | 07/12 | | |

## 7. Riscos
| Risco | Prob. | Impacto | Resposta | Dono | Situação |
|---|---|---|---|---|---|
| Tabelas novas herdam grants padrão e a de chaves vaza | M | A | `REVOKE ALL` + RLS sem policies + `REVOKE EXECUTE FROM PUBLIC`; prova com anon e com usuário comum em E1 | Claude | aberto |
| Teste de report envia e-mail real e apaga o andamento | M | A | modo prévia em E5; `--validate` proibido | Claude | aberto |
| Trigger fase↔status diverge do que a tela antiga grava | M | M | trigger nas duas direções + `completed_at`; testar os 3 caminhos legados em E1 | Claude | aberto |
| Baseline do banco diferente do assumido | B | M | E1 começa só lendo o esquema real e versionando | Claude | aberto |
| Egress do Supabase volta a subir | B | A | colunas fixas, eventos por card com limite, sem polling; conferir egress 48 h após E4 | Claude | aberto |
| Chave pessoal vaza | B | M | escopo só de projetos, revogação imediata, `last_used_at`, limite de requisições | Gestor | aberto |
| E4 estoura o prazo | M | M | indicadores (R8) e WIP (R10) podem sair para depois de 04/12 sem travar E5 | Gestor | aberto |
| A5 só comprovável em 07/12 | A | B | aceite em 04/12 pela prévia; envio real conferido em 07/12 | Gestor | aceito |
| Deploy sobe código diferente do build | M | M | push em `main` antes de todo deploy | Claude | aberto |

## 8. Indicadores e benefícios
| Indicador | Linha de base | Meta | Resultado (encerramento) | Revisão 30 dias |
|---|---|---|---|---|
| Projetos ativos com fase e saúde atualizadas sem edição manual | 0% | 100% dos abertos pelo fluxo | | |
| Tempo do gestor com o status report | ~2 h/semana | ≤ 15 min/semana | | |
| Projetos cadastrados só no encerramento | 71 de 72 | 0 nos próximos 60 dias | | |
| Chaves mestras fora do servidor para registrar projetos | 1 (máquina do gestor) | 0 | | |

---
*Seções 1–8 aprovadas no G1 = Termo de Abertura. Daqui para baixo, preenchido durante a execução.*

## 9. Solução (resumo técnico)
- **Banco:** migration baseline (esquema real versionado) + migration v5 aditiva: colunas novas com default/CHECK,
  `dashboard_project_events`, `dashboard_api_keys` (RLS ligado, sem grants, só hash sha256), trigger de coerência
  fase ↔ `status`/`completed_at`, código PRJ gerado na inserção, função `api_apply_project_change` (projeto + evento na
  mesma transação, executável só pela service_role).
- **Fase ↔ status:** abertura/escopo → `todo`; execução/segurança/homologação → `in_progress`; encerrado → `done`.
- **Prazos:** `due_date` atual = previsto; `baseline_date` nova = prometido (backfill = `due_date`).
- **Saúde exibida:** pior entre a informada e "amarelo se previsto > prometido".
- **API:** `POST /api/projetos`, `GET|PATCH /api/projetos/[id]`; autor sempre vem da chave; lista branca de campos;
  corpo ≤ 16 KB; 60 req/min por chave; 401 genérico.
- **Chaves:** `scripts/api-keys.mjs create|list|revoke` rodado na EC2; a chave aparece uma vez.
- Detalhe técnico fica no repo e no vault ([[GLPI Dash]], [[glpi-dashboard]]).

## 10. Qualidade — evidências (ECC)
| Etapa | Testes (verification-loop / e2e) | Revisão (code + linguagem + banco) | Achados CRITICAL/HIGH corrigidos |
|---|---|---|---|
| E1 | Ensaio em produção dentro de transação desfeita: 32/32 testes (idempotência 2×, coerência fase×status, 7 caminhos legados da trigger, guardas de código/prazo prometido, RESTRICT, permissões de anon/authenticated, realtime) | ecc:database-reviewer (0 CRITICAL, 2 HIGH, 7 MEDIUM, 5 LOW) + ecc:security-reviewer (0 CRITICAL/HIGH, 3 MEDIUM) | 2 HIGH (código truncado ≥ id 1000; backfill não idempotente após go-live) e todos os MEDIUM corrigidos; LOW aplicados exceto L4 (saúde dos antigos fica verde) |
| E2 | vitest 137 testes (100% nas funções puras; tdd-guide, teste primeiro), tsc, eslint dos arquivos do projeto, build de produção; ensaio da função SQL em transação desfeita 24/24 | ecc:security-reviewer (2 passes: 1 HIGH, 4 MEDIUM; reconferência: resolvidos, 1 MEDIUM novo corrigido), ecc:typescript-reviewer (2 HIGH, 6 MEDIUM; 1 alarme falso: coerência fase×status já garantida pela trigger da E1), ecc:database-reviewer (1 HIGH, 4 MEDIUM) | todos os HIGH/MEDIUM corrigidos; aceitos: IDOR (só o gestor tem chave na v2), sem expiração/rotação de chave (v3) |
| E3 | node:test 133 testes do CLI (tdd-guide, teste primeiro; respostas simuladas no formato real da API); fluxo real contra a API: abrir → G1 → G2 → link mesclado → prometido sem mudança recusado com dica → concluir (PRJ-2026-103); instalador rodado 2× | ecc:security-reviewer (0 CRITICAL/HIGH, 5 MEDIUM) + ecc:code-reviewer (2 HIGH: G1 da skill quebrado e código PRJ calculado errado em 2027; 4 MEDIUM) | todos os HIGH/MEDIUM corrigidos; a mesclagem de links no cliente tem corrida conhecida → mover para o servidor na E4 (registrado em Controle de mudanças) |
| E4 | vitest 181 testes (board.ts 100% linhas; tdd-guide), tsc, eslint, build; tela conferida na pré-visualização local /dev/quadro (colunas, card, painel, linha do tempo, mover, foco/Esc, sem erros de console); ensaio v5_2 12/12; CLI 129 testes | ecc:react-reviewer (3 HIGH, 6 MEDIUM) + ecc:database-reviewer v5_2 (2 MEDIUM) | todos corrigidos; trava de concorrência e modal real só testáveis com Supabase → conferir na homologação |

**Segurança (G3):** —
**Quality gate / cobertura:** —

## 11. Controle de mudanças
| # | Data | Mudança | Impacto (prazo/escopo) | Aprovado por |
|---|---|---|---|---|
| 1 | 27/11 | Mesclagem de `links` passa para o servidor (função `api_write_project`) na E4, junto com o deploy do quadro; até lá o CLI mescla no cliente (corrida conhecida, risco baixo: 1 usuário com chave) | sem impacto de prazo; escopo E4 + pequeno ajuste de SQL | Claude (decisão técnica; informada ao gestor no G2 da E3) |

## 12. Implantação e volta atrás
**E1 (27/11):** cópia CSV de `dashboard_projects` (74 linhas) no OneDrive do projeto → migration v5 (COMMIT).
**E2 (27/11):** migration v5_1 (função `api_write_project`, EXECUTE só service_role) → PR [gguirocha/glpi-dashboard#1](https://github.com/gguirocha/glpi-dashboard/pull/1) mergeado → nginx: backup `/etc/nginx/conf.d/glpi-dashboard.conf.bak_20261127_112703_prj092`, config de `docs/infra/nginx-glpi-dashboard.conf`, `nginx -t` ok, reload → `deploy.sh` (sem `--validate`), BUILD_ID blVdjJlz0uOAXULYMFHpp, health 200 → chave do gestor (id 3) gravada direto no `.ti-mdf.env` (ACL só do usuário), nunca exibida.
**E4 (27/11):** migration v5_2 (links mesclados no servidor) → PR [gguirocha/glpi-dashboard#2](https://github.com/gguirocha/glpi-dashboard/pull/2) mergeado → `deploy.sh` (BUILD_ID 5N_LCYEJUpPjipbc5AO9y, health 200) → kit ti-mdf v1.4.0 (CLI envia delta de links) publicado depois da v5_2. Conferido: `/` 200, `/dev/quadro` 404, API sem chave 401, delta de links em produção ok (projeto de teste 103).
Volta atrás: app `.next.bak` + `pm2 restart`; nginx: restaurar o backup e `systemctl reload nginx`; banco: `DROP FUNCTION api_write_project` (a tela não depende dela).

Ordem: migration (aditiva, idempotente) → push + deploy de API → `projeto.mjs` → UI → reports. Volta atrás do app:
`.next.bak` do `deploy.sh`. Banco: mudanças aditivas, a tela antiga funciona com as colunas novas (sem DOWN); cópia
CSV de `dashboard_projects` antes do backfill.

## 13. Aceite
| Portão | Quem | Data | Ressalvas |
|---|---|---|---|
| G1 Escopo (patrocinador + solicitante) | Gestor de Projetos (Guilherme Rocha) | 27/11/2026 | sem ressalvas; inclui as decisões de desenho da seção 9 |
| G3 Liberação técnica (gestor) | | | |
| G4 Homologação (solicitante) | | | |
| Encerramento (patrocinador) | | | |

## 14. Encerramento e lições aprendidas
—

## Diário
| Data | Evento |
|---|---|
| 2026-11-27 | Projeto aberto (card 92); explorer mapeou o módulo de projetos; 4 decisões do gestor (fases, report de exceções, chave só do gestor, prazo 1 semana); planner montou 6 etapas (5 dias úteis) |
| 2026-11-27 | Explorer apontou "anon escreve em dashboard_projects": descartado, teste de 27/11 deu 401 (grants revogados em 24/11) |
| 2026-11-27 | **G1 aprovado** pelo gestor; card 92 → Em desenvolvimento, prazo 04/12; E1 iniciada |
| 2026-11-27 | Termo de abertura exportado (docx + pdf timbrados) em OneDrive\Trabalho\Projetos6\PRJ-2026-092 Quadro de Projetos v2 |
| 2026-11-27 | E1: esquema real lido (read-only) e versionado em migration_v5_0_baseline.sql; achado: tabelas/sequências novas nascem com grants para anon/authenticated (default privileges) |
| 2026-11-27 | E1: migration v5 revisada por database-reviewer e security-reviewer, corrigida e ensaiada em transação desfeita (32/32) |
| 2026-11-27 | Decisão: eventos com ON DELETE RESTRICT (trilha de auditoria não some por DELETE na tela); código PRJ e prazo prometido protegidos na trigger. Fora do escopo (follow-up): ALTER DEFAULT PRIVILEGES do schema public para objetos futuros |
| 2026-11-27 | E1 aplicada em produção com OK do gestor: cópia CSV (74 projetos) → migration (COMMIT) → conferência: 74 com código, fases abertura/todo=1 · encerrado/done=71 · execucao/in_progress=2; ensaio repetido no banco migrado 32/32; anon via REST 401 nas 3 tabelas; vault atualizado |
| 2026-11-27 | **G2 da E1 aprovado** pelo gestor; E2 (API) iniciada |
| 2026-11-27 | E2 construída e revisada (commit `1b1768a`); achados das revisões corrigidos; nginx sem X-Real-IP/limite (proposta em docs/infra) |
| 2026-11-27 | E2 publicada com OK do gestor (v5_1, PR #1, nginx, deploy, chave id 3). Aceite na API publicada 11/11: A1, A2 (chave descartável id 4 revogada), A7, G2 simulado, prometido sem evento recusado, campo desconhecido recusado; X-Real-IP chegando ao app. Projeto de teste PRJ-2026-102 criado (remover na E6) |
| 2026-11-27 | Card 92 atualizado pela própria API: fase execução, 1/6 etapas, prometido 04/12, eventos G1 e G2 da E1 (retroativos) |
| 2026-11-27 | **G2 da E2 aprovado** pelo gestor; card 92 → 2/6 com evento G2 pela API; E3 iniciada |
| 2026-11-27 | E3: projeto.mjs reescrito para a API (kit ti-mdf v1.3.0/1.3.1), chave mestra removida do .ti-mdf.env do gestor pelo instalador; projeto de teste PRJ-2026-103 criado e concluído (remover na E6) |
| 2026-11-27 | **G2 da E3 aprovado** pelo gestor; card 92 → 3/6 pela skill; E4 iniciada |
| 2026-11-27 | E4 construída (commit `8e0e204`): quadro por fases, painel acessível, cache do modo apresentação, junção de links no servidor (v5_2) e CLI com delta (kit local `2367d69`, publicar só após a v5_2) |
| 2026-11-27 | E4 publicada com OK do gestor (v5_2, PR #2, deploy, kit v1.4.0). Visual com dados reais depende de login do gestor (homologação) |
