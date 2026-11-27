# PRD — Quadro de Projetos v2 + API de projetos (PRJ-2026-092)

> Documento para o **solicitante validar**. Linguagem de negócio.
> Versão 0.2 · 2026-11-27 · Status: **aguardando validação no G1**

## 1. Problema
O quadro de projetos do GLPI Dash só diz se um projeto está "a fazer", "em andamento" ou "concluído". Não mostra
em que fase ele está, se está saudável, quanto já foi entregue nem se vai cumprir o prazo prometido. Por isso:
- os projetos eram cadastrados no fim, muitas vezes já como concluídos (em 27/11/2026: 72 projetos, 71 concluídos,
  nenhum com solicitante, prioridade, etapas, linha de base ou indicador; 27 concluídos sem situação);
- o status report depende de alguém escrever à mão o andamento de cada projeto;
- a diretoria não tem visão de portfólio (atrasos, bloqueios, o que foi entregue no mês);
- para registrar projetos pelo Claude, cada colaborador precisaria da chave mestra do banco do Dash, que dá acesso total.

## 2. Objetivo
Depois do projeto, **o gestor e a diretoria** veem **o portfólio inteiro em uma tela (fase, saúde, avanço e prazo)**,
atualizado **sozinho** a cada portão do fluxo de projetos, e **cada colaborador da TI** registra projetos com uma
**chave pessoal** que só mexe em projetos.

## 3. Quem usa
| Perfil | O que faz |
|---|---|
| Gestor de projetos (TI) | Acompanha o portfólio, cria/revoga chaves, decide prioridades, recebe alertas de exceção |
| Colaborador da TI | Pelo Claude (skill `fluxo-projeto`), abre e atualiza projetos via API com a própria chave |
| Diretoria | Recebe o status report geral (exceções, entregas, decisões pedidas) |
| Solicitante de cada projeto | Recebe o report individual do seu projeto (já existe hoje, por e-mail) |

## 4. Como vai funcionar
1. O colaborador decide com o gestor que um trabalho vira projeto; o Claude abre o projeto pela API → o card aparece
   na coluna **Abertura** com código `PRJ-AAAA-NNN`.
2. A cada portão (escopo aprovado, etapa aprovada, liberação, aceite, encerramento) o Claude chama a API → o card muda
   de fase, a barra de etapas avança, o prazo previsto é atualizado e fica um registro na **linha do tempo** do projeto
   (quem, quando, o quê).
3. O gestor abre o quadro e vê, por fase, a saúde (verde/amarelo/vermelho), o avanço e o desvio de prazo de cada
   projeto, além dos indicadores do mês.
4. O status report semanal sai com fase, saúde, avanço, próximo passo e decisão pedida; o geral da diretoria destaca
   exceções.

## 5. Requisitos
| # | O sistema deve… | Prioridade |
|---|---|---|
| R1 | Receber abrir/atualizar/concluir/consultar projeto por uma API, autenticada por **chave pessoal** | Essencial |
| R2 | Permitir ao gestor criar, listar e revogar chaves (cada chave ligada a uma pessoa). Primeira leva: só o gestor | Essencial |
| R3 | Registrar cada portão/mudança como evento (projeto, tipo, resumo, autor, data) e mostrar como linha do tempo no card | Essencial |
| R4 | Guardar por projeto: código PRJ, fase, saúde + motivo, etapas total/concluídas, início, prazo prometido (baseline) e previsto, solicitante/área, patrocinador, chamado de origem, links (PRD, documento, repo, vault) | Essencial |
| R5 | Quadro em colunas por **fase** (Abertura, Escopo, Execução, Segurança, Homologação, Encerrado), com saúde, barra de etapas, desvio de prazo e a **situação atual como etiqueta** (ex.: Bloqueado, Aguardando retorno) | Essencial |
| R6 | Continuar permitindo editar pela tela o que hoje se edita (situação, dono, e-mails do report, texto do andamento) | Essencial |
| R7 | Status report semanal (individual) com fase, saúde, avanço, próximo passo e prazo prometido × previsto | Essencial |
| R8 | Visão de portfólio com indicadores do mês (em andamento, % no prazo, tempo médio abertura→aceite, bloqueados, entregues) | Desejável |
| R9 | Report da diretoria com **exceções** (saúde amarela/vermelha, atrasos, bloqueios, decisões pedidas) **e entregas do período**; lista completa só pelo link do quadro | Essencial |
| R10 | Limite de projetos simultâneos (WIP) com alerta | Desejável |
| R11 | Fila de entrada priorizada por valor × esforço | Desejável (pode ficar para uma v3) |

## 6. Fora do escopo
- Integração com o módulo Projetos do GLPI.
- Medição automática de benefícios (o indicador é informado pelo fluxo; a revisão de 30 dias continua manual).
- Mudar o sync de chamados ou outras telas do Dash.
- Reescrever os 72 projetos antigos (só recebem código e fase "encerrado").

## 7. Critérios de aceite
| # | Dado que… | Quando… | Então… |
|---|---|---|---|
| A1 | um colaborador tem chave ativa | o Claude abre um projeto pela API | o card aparece em Abertura com código PRJ e evento "aberto" com o nome dele |
| A2 | a chave foi revogada | o Claude tenta atualizar | a API recusa e nada muda no projeto |
| A3 | um projeto com 4 etapas | o G2 da etapa 2 é registrado | a barra mostra 2/4 e a linha do tempo mostra o evento |
| A4 | prazo previsto passou do prometido | o quadro é aberto | o card mostra o desvio em dias e a saúde fica no mínimo amarela |
| A5 | é segunda às 8h | o report semanal sai | cada projeto aparece com fase, saúde, avanço e próximo passo |
| A6 | um usuário logado na tela | edita situação/dono/e-mails como hoje | continua funcionando |
| A7 | alguém sem chave ou com chave inválida | chama a API | recebe recusa sem dados do banco |

## 8. Indicador de sucesso
| Indicador | Hoje | Meta | Como medir |
|---|---|---|---|
| Projetos ativos com fase e saúde atualizadas sem edição manual | 0% | 100% dos abertos pelo fluxo | eventos por projeto na tabela nova |
| Tempo do gestor montando o status report | ~2 h/semana | ≤ 15 min/semana | relato do gestor na revisão de 30 dias |
| Projetos cadastrados só no encerramento | 71 de 72 | 0 nos próximos 60 dias | data de abertura × data de conclusão |

## 9. Restrições e premissas
- Dash em produção (Next.js na EC2 do n8n, Supabase `jddpcoybfacjaepodhyf`); egress do Supabase já estourou antes —
  a tela nova não pode multiplicar leituras.
- Mudanças no banco e deploy só com OK por ação.
- A chave mestra fica só no servidor; nunca vai para máquina de colaborador.

## 10. Decisões do gestor (27/11/2026)
- Colunas = fases; situação atual vira etiqueta.
- Report da diretoria = exceções + entregas.
- Chaves: só o gestor na primeira leva.
- Prazo desejado: 1 semana (até 04/12/2026).
- Prazo prometido × previsto passa a aparecer nos reports (hoje o prazo é só controle interno).

## Validação
| Solicitante | Data | Ressalvas |
|---|---|---|
| | | |
