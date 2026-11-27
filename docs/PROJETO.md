# Documento do Projeto — Quadro de Projetos v2 + API de projetos

> **Situação atual**
> Fase: **Execução — E1 (banco)** · Saúde: 🟢 (no prazo)
> Próximo passo: ler o esquema real, escrever migrations, revisão ECC, pedir OK para aplicar · Bloqueios: nenhum · Atualizado: 2026-11-27

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
| E1 | Banco pronto, nada quebra: 72 projetos com código e fase; tela e script atuais funcionando igual | contagem por fase bate com `status`; migration roda 2× sem diferença; anon recebe 401 nas tabelas novas; tela antiga move/edita normal | em andamento |
| E2 | API no ar com chave pessoal | A1, A2, A7 provados por curl; testes unitários, lint e build verdes | pendente |
| E3 | Skill registra sem chave mestra (`projeto.mjs` só pela API) | fluxo abrir → G1 → G2 → concluir no projeto de teste; nenhuma `SERVICE_KEY` no script nem no `.ti-mdf.env` | pendente |
| E4 | Quadro v2 por fase com saúde, barra, desvio, linha do tempo, indicadores e WIP | A3, A4, A6 provados; 1 consulta com colunas fixas no carregamento; eventos só ao abrir o card | pendente |
| E5 | Reports novos (individual e geral de exceções + entregas) | prévia revisada pelo gestor sem envio real; A5 real na segunda 07/12 | pendente |
| E6 | Homologação, segurança e encerramento | A1–A7 marcados; revisão de segurança sem CRITICAL/HIGH; vault atualizado; projeto de teste removido | pendente |

## 6. Cronograma (previsto × realizado)
| Marco / etapa | Previsto | Realizado | Desvio |
|---|---|---|---|
| G1 Escopo aprovado | 27/11 | 27/11 | 0 |
| E1 Banco (0,75 d) | 27/11–30/11 | | |
| E2 API (1,25 d) | 30/11–01/12 | | |
| E3 Skill pela API (0,5 d) | 02/12 | | |
| E4 Quadro v2 (1,25 d) | 02/12–03/12 | | |
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

**Segurança (G3):** —
**Quality gate / cobertura:** —

## 11. Controle de mudanças
| # | Data | Mudança | Impacto (prazo/escopo) | Aprovado por |
|---|---|---|---|---|

## 12. Implantação e volta atrás
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
