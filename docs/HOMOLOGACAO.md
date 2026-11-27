# Roteiro de homologação — PRJ-2026-092 Quadro de Projetos v2 + API

Quem homologa: Guilherme Rocha (gestor de projetos, solicitante).
Onde: https://dash.mundodosferros.com.br (logado) e e-mail de segunda 30/11.
Tempo estimado: 15 minutos + conferência do e-mail de segunda.

| # | Critério (PRD §7) | Como testar | Evidência já coletada | Resultado |
|---|---|---|---|---|
| A1 | Projeto aberto pela API aparece em Abertura, com código PRJ e evento "aberto" no nome de quem abriu | Já provado pela API em 27/11 (projeto de teste, apagado depois). Opcional: pedir ao Claude um `abrir` de teste e conferir o card | Aceite automatizado 11/11 em 27/11 (`201`, código PRJ, evento com o nome do gestor) | ✔ 27/11 (evidência automatizada) |
| A2 | Chave revogada é recusada e nada muda | Já provado em 27/11 (chave descartável revogada → 401, projeto intacto) | Aceite automatizado em 27/11 | ✔ 27/11 (evidência automatizada) |
| A3 | Etapa aprovada atualiza a barra e a linha do tempo | Abrir o card **PRJ-2026-092** → barra 5/6 e linha do tempo com os G2 das etapas 1–5 | Card registrado pela skill a cada portão | ✔ 27/11 com o gestor: barra 5/6, linha do tempo com G3/G2/atualizações no nome do gestor |
| A4 | Previsto depois do prometido mostra o desvio e a saúde no mínimo amarela | No card **PRJ-2026-015 Roteirizador**, mudar o **previsto** para 05/01/2027 → o card mostra +5 dias e bolinha amarela; voltar para 31/12/2026 | Regra coberta por teste (board/report) | ✔ 27/11 com o gestor: previsto 05/01/2027 → "Desvio: +5 dias" e saúde efetiva amarela (declarada verde); voltado para 31/12/2026 e conferido no banco |
| A5 | Report semanal sai com fase, saúde, avanço e próximo passo de cada projeto | Conferir os e-mails de **segunda 30/11 07:00** (geral na caixa da diretoria/ti@; individual nos solicitantes). Comparar com a prévia aprovada | Prévia real gerada em 27/11 (nada enviado) | ☐ aguarda segunda 30/11 07:00 |
| A6 | Edição pela tela continua funcionando (situação, dono, e-mails, andamento) | No painel de um projeto: trocar a situação, o dono, acrescentar/remover um e-mail e escrever o andamento → Salvar → reabrir e conferir; desfazer | — | ✔ 27/11 com o gestor no PRJ-2026-092: situação → Em homologação, andamento atualizado, e-mail de teste incluído/salvo/removido/salvo; banco conferido (real_status 3, report_emails vazio, texto novo) |
| A7 | Sem chave ou com chave inválida, a API recusa sem dados | Já provado: `/api/projetos/1` sem chave → 401 | Conferido em produção em 27/11 | ✔ 27/11 (401) |

## Ressalvas e riscos aceitos (para o aceite)
- Qualquer usuário logado no Dash pode editar os e-mails de report de qualquer projeto e os destinatários do report geral (permissão herdada da tela antiga; cadastro público desligado).
- A chave da API dá acesso a todos os projetos (só o gestor tem chave).
- O ECC é instalado pelo kit sem versão fixa.
- Lint tem 5 erros antigos em telas fora do escopo (admin, reset de senha, painel de chamados).

## Aceite (G4)
- Aceito por: ____________________  Data: ___/___/2026
- Ressalvas: ____________________________________________
