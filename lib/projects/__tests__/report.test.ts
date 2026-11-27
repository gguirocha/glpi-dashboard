import { describe, it, expect } from 'vitest';
import {
  cleanRecipients, escapeHtml, individualEligible, projectFacts, renderGeneral, renderIndividual, reportWindow,
  selectDeliveries, selectExceptions,
} from '../report';
import type { ProjectFacts, ReportEvent } from '../report';
import type { Project } from '@/types';

let seq = 0;
const mk = (o: Partial<Project> = {}): Project => ({
  id: ++seq, title: 't', status: 'in_progress', completed_at: null, due_date: null,
  weekly_update: null, report_emails: [], owner: null, real_status_id: null,
  last_individual_sent_at: null, last_general_sent_at: null,
  code: 'PRJ', phase: 'execucao', health: 'verde', health_reason: null, steps_total: 0, steps_done: 0,
  start_date: null, baseline_date: null, requester: null, area: null, sponsor: null, origin_ticket: null,
  links: {}, next_step: null, decision_needed: null, updated_at: '2026-01-01T00:00:00Z',
  ...o,
});
const hoje = new Date(2026, 10, 27, 10);
const at = (y: number, m: number, d: number, h = 9, mi = 0) => new Date(y, m, d, h, mi).toISOString();
const names = { 5: 'Bloqueado', 12: 'Aguardando retorno', 7: 'Em andamento' };

describe('projectFacts', () => {
  it('campos básicos e formatação', () => {
    const f = projectFacts(
      mk({
        id: 9, code: 'PRJ-1', title: 'Meu projeto', owner: 'Ana', phase: 'seguranca',
        steps_total: 6, steps_done: 3, baseline_date: '2026-11-01', due_date: '2026-11-10',
        next_step: '  Testar  ', decision_needed: '  Aprovar  ', real_status_id: 7,
        health: 'vermelho', health_reason: 'fornecedor',
      }),
      names, hoje,
    );
    expect(f).toEqual({
      projectId: 9, code: 'PRJ-1', title: 'Meu projeto', owner: 'Ana', fase: 'Segurança',
      saude: 'vermelho', saudeMotivo: 'fornecedor', situacao: 'Em andamento', etapas: '3/6 (50%)',
      proximo: 'Testar', decisao: 'Aprovar', prometido: '01/11/2026', previsto: '10/11/2026',
      desvioDias: 9, vencido: true,
    });
  });
  it('sem dados: nulos', () => {
    const f = projectFacts(mk({ next_step: '   ', decision_needed: '', real_status_id: 99 }), names, hoje);
    expect(f.etapas).toBeNull();
    expect(f.proximo).toBeNull();
    expect(f.decisao).toBeNull();
    expect(f.situacao).toBeNull();
    expect(f.prometido).toBeNull();
    expect(f.previsto).toBeNull();
    expect(f.desvioDias).toBeNull();
    expect(f.vencido).toBe(false);
    expect(f.saudeMotivo).toBeNull();
    expect(projectFacts(mk({ real_status_id: null }), names, hoje).situacao).toBeNull();
  });
  it('datas inválidas viram null', () => {
    const f = projectFacts(mk({ baseline_date: 'lixo', due_date: '2026-13-45' }), names, hoje);
    expect(f.prometido).toBeNull();
    expect(f.previsto).toBeNull();
    expect(f.desvioDias).toBeNull();
    expect(f.vencido).toBe(false);
  });
  it('fase inválida vira Abertura', () => {
    expect(projectFacts(mk({ phase: 'xpto' as never }), names, hoje).fase).toBe('Abertura');
  });
  it('etapas limitadas a 0..100', () => {
    expect(projectFacts(mk({ steps_total: 4, steps_done: 9 }), names, hoje).etapas).toBe('9/4 (100%)');
    expect(projectFacts(mk({ steps_total: 4, steps_done: -2 }), names, hoje).etapas).toBe('-2/4 (0%)');
    expect(projectFacts(mk({ steps_total: 3, steps_done: 1 }), names, hoje).etapas).toBe('1/3 (33%)');
  });
  it('saúde sobe para amarelo por atraso: motivo padrão', () => {
    const f = projectFacts(mk({ baseline_date: '2026-11-01', due_date: '2026-11-10' }), names, hoje);
    expect(f.saude).toBe('amarelo');
    expect(f.saudeMotivo).toBe('previsto passou do prometido');
  });
  it('motivo informado prevalece sobre o padrão; verde sem atraso sem motivo', () => {
    const a = projectFacts(
      mk({ baseline_date: '2026-11-01', due_date: '2026-11-10', health_reason: 'escopo' }), names, hoje,
    );
    expect(a.saudeMotivo).toBe('escopo');
    expect(projectFacts(mk({ health_reason: '  ' }), names, hoje).saudeMotivo).toBeNull();
  });
  it('amarelo declarado sem motivo não ganha motivo padrão', () => {
    const f = projectFacts(mk({ health: 'amarelo', baseline_date: '2026-11-01', due_date: '2026-11-10' }), names, hoje);
    expect(f.saudeMotivo).toBeNull();
  });
  it('vencido: hoje não vence, encerrado não vence', () => {
    expect(projectFacts(mk({ due_date: '2026-11-26' }), names, hoje).vencido).toBe(true);
    expect(projectFacts(mk({ due_date: '2026-11-27' }), names, hoje).vencido).toBe(false);
    expect(projectFacts(mk({ due_date: '2026-11-26', phase: 'encerrado' }), names, hoje).vencido).toBe(false);
  });
});

describe('selectExceptions', () => {
  it('projeto saudável não entra; encerrado nunca entra', () => {
    expect(selectExceptions([mk(), mk({ phase: 'encerrado', health: 'vermelho', due_date: '2026-01-01' })], names, hoje)).toEqual([]);
  });
  it('saúde vermelha com e sem motivo', () => {
    const [a, b] = selectExceptions(
      [mk({ health: 'vermelho', health_reason: 'sem verba' }), mk({ health: 'vermelho' })], names, hoje,
    );
    expect(a.motivos).toEqual(['Saúde vermelha: sem verba']);
    expect(b.motivos).toEqual(['Saúde vermelha']);
  });
  it('saúde amarela com e sem motivo', () => {
    const [a, b] = selectExceptions(
      [mk({ health: 'amarelo', health_reason: 'risco', id: 1 }), mk({ health: 'amarelo', id: 2 })], names, hoje,
    );
    expect(a.motivos).toEqual(['Saúde amarela: risco']);
    expect(b.motivos).toEqual(['Saúde amarela']);
  });
  it('atraso singular e plural; amarelo só por atraso não repete a saúde', () => {
    const [dois, um] = selectExceptions(
      [
        mk({ id: 1, baseline_date: '2026-12-01', due_date: '2026-12-02' }),
        mk({ id: 2, baseline_date: '2026-12-01', due_date: '2026-12-03' }),
      ],
      names, hoje,
    );
    expect(um.motivos).toEqual(['Atraso de 1 dia sobre o prometido']);
    expect(um.facts.saude).toBe('amarelo');
    expect(dois.motivos).toContain('Atraso de 2 dias sobre o prometido');
  });
  it('prazo vencido', () => {
    const [x] = selectExceptions([mk({ due_date: '2026-11-20' })], names, hoje);
    expect(x.motivos).toEqual(['Prazo previsto vencido em 20/11/2026']);
  });
  it('bloqueado e aguardando retorno', () => {
    const [a, b] = selectExceptions([mk({ id: 1, real_status_id: 5 }), mk({ id: 2, real_status_id: 12 })], names, hoje);
    expect(a.motivos).toEqual(['Bloqueado']);
    expect(b.motivos).toEqual(['Aguardando retorno']);
  });
  it('decisão pedida', () => {
    const [x] = selectExceptions([mk({ decision_needed: ' Aprovar verba ' })], names, hoje);
    expect(x.motivos).toEqual(['Decisão pedida: Aprovar verba']);
  });
  it('motivos na ordem especificada', () => {
    const [x] = selectExceptions(
      [mk({
        health: 'vermelho', health_reason: 'x', baseline_date: '2026-11-01', due_date: '2026-11-10',
        real_status_id: 5, decision_needed: 'd',
      })],
      names, hoje,
    );
    expect(x.motivos).toEqual([
      'Saúde vermelha: x', 'Atraso de 9 dias sobre o prometido', 'Prazo previsto vencido em 10/11/2026',
      'Bloqueado', 'Decisão pedida: d',
    ]);
  });
  it('ordenação: saúde, desvio desc (null por último), id asc', () => {
    const items = selectExceptions(
      [
        mk({ id: 10, real_status_id: 5 }), // verde, sem desvio
        mk({ id: 11, health: 'amarelo', baseline_date: '2026-12-01', due_date: '2026-12-03' }), // 2
        mk({ id: 12, health: 'amarelo', baseline_date: '2026-12-01', due_date: '2026-12-09' }), // 8
        mk({ id: 13, health: 'amarelo' }), // null
        mk({ id: 14, health: 'vermelho' }),
        mk({ id: 15, health: 'vermelho' }),
        mk({ id: 8, real_status_id: 12 }), // verde
      ],
      names, hoje,
    );
    expect(items.map((i) => i.facts.projectId)).toEqual([14, 15, 12, 11, 13, 8, 10]);
  });
  it('desvio igual desempata por id; ambos nulos empatam por id', () => {
    const items = selectExceptions(
      [mk({ id: 30, health: 'amarelo' }), mk({ id: 20, health: 'amarelo' })], names, hoje,
    );
    expect(items.map((i) => i.facts.projectId)).toEqual([20, 30]);
    const eq = selectExceptions(
      [
        mk({ id: 41, health: 'amarelo', baseline_date: '2026-12-01', due_date: '2026-12-03' }),
        mk({ id: 40, health: 'amarelo', baseline_date: '2026-12-01', due_date: '2026-12-03' }),
      ],
      names, hoje,
    );
    expect(eq.map((i) => i.facts.projectId)).toEqual([40, 41]);
  });
});

describe('reportWindow', () => {
  it('7 dias exatos', () => {
    const agora = new Date('2026-11-27T12:00:00Z');
    const w = reportWindow(agora);
    expect(w.ate.getTime()).toBe(agora.getTime());
    expect(agora.getTime() - w.desde.getTime()).toBe(7 * 86_400_000);
  });
  it('não muta a entrada', () => {
    const agora = new Date('2026-11-27T12:00:00Z');
    reportWindow(agora);
    expect(agora.toISOString()).toBe('2026-11-27T12:00:00.000Z');
  });
});

describe('selectDeliveries', () => {
  const desde = new Date(2026, 10, 20, 9, 0);
  const ate = new Date(2026, 10, 27, 9, 0);
  const ev = (project_id: number, kind: ReportEvent['kind'], summary: string, created_at: string): ReportEvent => ({
    project_id, kind, summary, created_at,
  });

  it('inclui g2/g3/g4/encerrado, ignora outros tipos, em ordem cronológica', () => {
    const p = mk({ id: 1, code: 'A' });
    const r = selectDeliveries(
      [p],
      [
        ev(1, 'g4', 'quarta', at(2026, 10, 25)),
        ev(1, 'g2', 'primeira', at(2026, 10, 22)),
        ev(1, 'g1', 'não conta', at(2026, 10, 23)),
        ev(1, 'atualizacao', 'não conta', at(2026, 10, 23)),
        ev(1, 'g3', 'meio', at(2026, 10, 24)),
        ev(1, 'encerrado', 'fim', at(2026, 10, 26)),
      ],
      desde, ate,
    );
    expect(r).toEqual([{ projectId: 1, code: 'A', title: 't', entregas: ['primeira', 'meio', 'quarta', 'fim'] }]);
  });
  it('janela: desde incluso, ate excluso', () => {
    const p = mk({ id: 1 });
    const r = selectDeliveries(
      [p],
      [
        ev(1, 'g2', 'antes', new Date(desde.getTime() - 1).toISOString()),
        ev(1, 'g2', 'no desde', desde.toISOString()),
        ev(1, 'g3', 'no ate', ate.toISOString()),
        ev(1, 'g3', 'último ms', new Date(ate.getTime() - 1).toISOString()),
      ],
      desde, ate,
    );
    expect(r[0].entregas).toEqual(['no desde', 'último ms']);
  });
  it('ignora projeto desconhecido, created_at inválido e resumo vazio; trim', () => {
    const p = mk({ id: 1 });
    const r = selectDeliveries(
      [p],
      [
        ev(999, 'g2', 'fantasma', at(2026, 10, 22)),
        ev(1, 'g2', 'inválido', 'lixo'),
        ev(1, 'g2', '   ', at(2026, 10, 22)),
        ev(1, 'g2', '  ok  ', at(2026, 10, 22)),
      ],
      desde, ate,
    );
    expect(r).toHaveLength(1);
    expect(r[0].entregas).toEqual(['ok']);
  });
  it('projeto sem entrega fica de fora', () => {
    expect(selectDeliveries([mk({ id: 1 })], [], desde, ate)).toEqual([]);
  });
  it('encerrado na janela sem evento encerrado: acrescenta conclusão', () => {
    const p = mk({ id: 1, phase: 'encerrado', completed_at: at(2026, 10, 25) });
    const r = selectDeliveries([p], [], desde, ate);
    expect(r[0].entregas).toEqual(['Projeto concluído em 25/11/2026']);
  });
  it('conclusão vem depois dos eventos; não duplica se há evento encerrado', () => {
    const p = mk({ id: 1, phase: 'encerrado', completed_at: at(2026, 10, 25) });
    const com = selectDeliveries([p], [ev(1, 'g4', 'homologou', at(2026, 10, 24))], desde, ate);
    expect(com[0].entregas).toEqual(['homologou', 'Projeto concluído em 25/11/2026']);
    const dup = selectDeliveries([p], [ev(1, 'encerrado', 'fechado', at(2026, 10, 25))], desde, ate);
    expect(dup[0].entregas).toEqual(['fechado']);
  });
  it('conclusão fora da janela, inválida ou fase não encerrada não conta', () => {
    expect(selectDeliveries([mk({ phase: 'encerrado', completed_at: at(2026, 10, 1) })], [], desde, ate)).toEqual([]);
    expect(selectDeliveries([mk({ phase: 'encerrado', completed_at: 'lixo' })], [], desde, ate)).toEqual([]);
    expect(selectDeliveries([mk({ phase: 'encerrado', completed_at: null })], [], desde, ate)).toEqual([]);
    expect(selectDeliveries([mk({ phase: 'execucao', completed_at: at(2026, 10, 25) })], [], desde, ate)).toEqual([]);
    const lim = selectDeliveries([mk({ phase: 'encerrado', completed_at: ate.toISOString() })], [], desde, ate);
    expect(lim).toEqual([]);
  });
  it('ordena por code asc', () => {
    const a = mk({ id: 1, code: 'PRJ-2' });
    const b = mk({ id: 2, code: 'PRJ-1' });
    const r = selectDeliveries(
      [a, b],
      [ev(1, 'g2', 'x', at(2026, 10, 22)), ev(2, 'g2', 'y', at(2026, 10, 22))],
      desde, ate,
    );
    expect(r.map((i) => i.code)).toEqual(['PRJ-1', 'PRJ-2']);
  });
});

describe('individualEligible', () => {
  const emails = ['a@x.com'];
  it('exige report_emails', () => {
    expect(individualEligible(mk({ report_emails: [] }))).toBe(false);
    expect(individualEligible(mk({ report_emails: undefined as never }))).toBe(false);
    expect(individualEligible(mk({ report_emails: emails }))).toBe(true);
  });
  it('não encerrado é elegível sempre', () => {
    expect(individualEligible(mk({ report_emails: emails, last_individual_sent_at: at(2026, 10, 26) }))).toBe(true);
  });
  it('encerrado: precisa completed_at válido', () => {
    expect(individualEligible(mk({ report_emails: emails, phase: 'encerrado', completed_at: null }))).toBe(false);
    expect(individualEligible(mk({ report_emails: emails, phase: 'encerrado', completed_at: 'lixo' }))).toBe(false);
  });
  it('encerrado: nunca enviado ou envio inválido -> elegível', () => {
    const base = { report_emails: emails, phase: 'encerrado' as const, completed_at: at(2026, 10, 25) };
    expect(individualEligible(mk({ ...base, last_individual_sent_at: null }))).toBe(true);
    expect(individualEligible(mk({ ...base, last_individual_sent_at: 'lixo' }))).toBe(true);
  });
  it('encerrado: enviado antes da conclusão -> elegível; depois ou igual -> não', () => {
    const base = { report_emails: emails, phase: 'encerrado' as const, completed_at: at(2026, 10, 25) };
    expect(individualEligible(mk({ ...base, last_individual_sent_at: at(2026, 10, 24) }))).toBe(true);
    expect(individualEligible(mk({ ...base, last_individual_sent_at: at(2026, 10, 26) }))).toBe(false);
    expect(individualEligible(mk({ ...base, last_individual_sent_at: base.completed_at }))).toBe(false);
  });
});

describe('escapeHtml', () => {
  it('escapa & < > " \'', () => {
    expect(escapeHtml(`<a href="x">Tom & 'Jerry'</a>`)).toBe(
      '&lt;a href=&quot;x&quot;&gt;Tom &amp; &#39;Jerry&#39;&lt;/a&gt;',
    );
    expect(escapeHtml('')).toBe('');
  });
});

const facts = (o: Partial<ProjectFacts> = {}): ProjectFacts => ({
  projectId: 1, code: 'PRJ-1', title: 'Projeto', owner: 'Ana', fase: 'Execução', saude: 'verde',
  saudeMotivo: null, situacao: null, etapas: null, proximo: null, decisao: null,
  prometido: null, previsto: null, desvioDias: null, vencido: false, ...o,
});
const URL_ = 'https://ex.com/projetos';

describe('renderIndividual', () => {
  it('assunto', () => {
    const r = renderIndividual(facts(), 'x', '24/11 a 27/11', URL_);
    expect(r.subject).toBe('[Status Report] PRJ-1 Projeto — semana de 24/11 a 27/11');
  });
  it('campos completos em text e html', () => {
    const r = renderIndividual(
      facts({
        saude: 'vermelho', saudeMotivo: 'fornecedor', situacao: 'Em andamento', etapas: '3/6 (50%)',
        prometido: '01/11/2026', previsto: '10/11/2026', desvioDias: 9, proximo: 'Testar', decisao: 'Aprovar',
      }),
      'Segue a narrativa.', 's', URL_,
    );
    for (const body of [r.text, r.html]) {
      expect(body).toContain('Execução');
      expect(body).toContain('vermelho');
      expect(body).toContain('fornecedor');
      expect(body).toContain('Em andamento');
      expect(body).toContain('3/6 (50%)');
      expect(body).toContain('01/11/2026');
      expect(body).toContain('10/11/2026');
      expect(body).toContain('9 dias de atraso');
      expect(body).toContain('Testar');
      expect(body).toContain('Aprovar');
      expect(body).toContain('Segue a narrativa.');
      expect(body).toContain(URL_);
    }
    expect(r.html).toContain('#dc2626');
    expect(r.text.indexOf('Segue a narrativa.')).toBeGreaterThan(r.text.indexOf('Testar'));
    expect(r.text.indexOf(URL_)).toBeGreaterThan(r.text.indexOf('Segue a narrativa.'));
  });
  it('omite Situação e Decisão quando ausentes; sem etapas e sem datas', () => {
    const r = renderIndividual(facts(), 'n', 's', URL_);
    expect(r.text).not.toContain('Situação');
    expect(r.text).not.toContain('Decisão pedida');
    expect(r.html).not.toContain('Situação');
    expect(r.html).not.toContain('Decisão pedida');
    expect(r.text).toContain('sem etapas definidas');
    expect(r.html).toContain('sem etapas definidas');
    expect(r.text).toContain('— x —');
    expect(r.text).toMatch(/Próximo passo: —/);
  });
  it('desvio: 1 dia, no prazo, adiantado', () => {
    const base = { prometido: '01/12/2026', previsto: '02/12/2026' };
    expect(renderIndividual(facts({ ...base, desvioDias: 1 }), 'n', 's', URL_).text).toContain('1 dia de atraso');
    expect(renderIndividual(facts({ ...base, desvioDias: 0 }), 'n', 's', URL_).text).toContain('no prazo');
    expect(renderIndividual(facts({ ...base, desvioDias: -1 }), 'n', 's', URL_).text).toContain('adiantado 1 dia');
    expect(renderIndividual(facts({ ...base, desvioDias: -3 }), 'n', 's', URL_).text).toContain('adiantado 3 dias');
  });
  it('cores de saúde', () => {
    expect(renderIndividual(facts({ saude: 'verde' }), 'n', 's', URL_).html).toContain('#16a34a');
    expect(renderIndividual(facts({ saude: 'amarelo' }), 'n', 's', URL_).html).toContain('#ca8a04');
  });
  it('escapa HTML mas preserva texto puro; narrativa com <br>', () => {
    const r = renderIndividual(
      facts({ title: '<script>alert(1)</script> & Cia', proximo: '<b>x</b>', saudeMotivo: 'a "b"' }),
      'linha1\nlinha2 <img src=x>', 'sem<ana>', 'https://ex.com/?a=1&b=2',
    );
    expect(r.html).not.toContain('<script>');
    expect(r.html).not.toContain('<img');
    expect(r.html).toContain('&lt;script&gt;alert(1)&lt;/script&gt; &amp; Cia');
    expect(r.html).toContain('linha1<br>linha2 &lt;img src=x&gt;');
    expect(r.html).toContain('a=1&amp;b=2');
    expect(r.html).toContain('&quot;b&quot;');
    expect(r.text).toContain('<script>alert(1)</script> & Cia');
    expect(r.subject).toContain('<script>');
    expect(r.text).toContain('linha1\nlinha2 <img src=x>');
    expect(r.html).not.toMatch(/<img|<script|<link/i);
  });
  it('narrativa com CRLF vira um único <br>', () => {
    expect(renderIndividual(facts(), 'a\r\nb', 's', URL_).html).toContain('a<br>b');
  });
});

describe('renderGeneral', () => {
  const exc = (o: Partial<ProjectFacts> = {}, motivos = ['Bloqueado']) => ({ facts: facts(o), motivos });
  const del = { projectId: 2, code: 'PRJ-2', title: 'Outro', entregas: ['G3 aprovado', 'G4 ok'] };

  it('assunto e seções', () => {
    const r = renderGeneral({
      semana: 'S1', resumo: 'Resumo da semana.',
      exceptions: [exc({ proximo: 'Cobrar fornecedor' }, ['Bloqueado', 'Atraso de 2 dias sobre o prometido'])],
      deliveries: [del], ativos: 7, boardUrl: URL_,
    });
    expect(r.subject).toBe('[Projetos] Exceções e entregas — semana de S1');
    for (const b of [r.text, r.html]) {
      expect(b).toContain('Resumo da semana.');
      expect(b).toContain('Pede atenção (1)');
      expect(b).toContain('PRJ-1');
      expect(b).toContain('Projeto');
      expect(b).toContain('Execução');
      expect(b).toContain('Ana');
      expect(b).toContain('Bloqueado');
      expect(b).toContain('Atraso de 2 dias sobre o prometido');
      expect(b).toContain('Cobrar fornecedor');
      expect(b).toContain('Entregas da semana (1)');
      expect(b).toContain('PRJ-2');
      expect(b).toContain('G3 aprovado');
      expect(b).toContain('G4 ok');
      expect(b).toContain('(7 projetos ativos)');
      expect(b).toContain(URL_);
    }
    expect(r.text).toContain(`Lista completa: ${URL_} (7 projetos ativos)`);
  });
  it('listas vazias', () => {
    const r = renderGeneral({ semana: 'S', resumo: 'r', exceptions: [], deliveries: [], ativos: 1, boardUrl: URL_ });
    for (const b of [r.text, r.html]) {
      expect(b).toContain('Pede atenção (0)');
      expect(b).toContain('Nenhum projeto pede atenção nesta semana.');
      expect(b).toContain('Entregas da semana (0)');
      expect(b).toContain('Nenhuma entrega registrada nesta semana.');
    }
    expect(r.text).toContain('(1 projeto ativo)');
  });
  it('sem dono e sem próximo passo não quebram', () => {
    const r = renderGeneral({
      semana: 'S', resumo: 'r', exceptions: [exc({ owner: null, proximo: null })], deliveries: [], ativos: 0, boardUrl: URL_,
    });
    expect(r.text).toContain('sem dono');
    expect(r.html).toContain('sem dono');
  });
  it('escapa HTML mas preserva texto puro', () => {
    const r = renderGeneral({
      semana: '<s>', resumo: 'a\nb <i>x</i>',
      exceptions: [exc({ title: '<script>1</script> & Co', owner: '<o>', proximo: '<p>' }, ['Decisão pedida: <x>'])],
      deliveries: [{ ...del, title: '<u>t</u>', entregas: ['<e> & f'] }],
      ativos: 2, boardUrl: 'https://ex.com/?a=1&b=2',
    });
    expect(r.html).not.toMatch(/<script|<i>|<u>|<e>|<o>|<p>|<x>/);
    expect(r.html).toContain('&lt;script&gt;1&lt;/script&gt; &amp; Co');
    expect(r.html).toContain('a<br>b &lt;i&gt;x&lt;/i&gt;');
    expect(r.html).toContain('&lt;e&gt; &amp; f');
    expect(r.html).toContain('a=1&amp;b=2');
    expect(r.text).toContain('<script>1</script> & Co');
    expect(r.text).toContain('<e> & f');
    expect(r.subject).toContain('<s>');
  });
});

describe('E5 revisão', () => {
  it('cleanRecipients: trim, inválidos fora, sem duplicata, sem lista com vírgula', () => {
    expect(cleanRecipients([' a@x.com ', 'A@x.com', 'b@x.com, fora@y.com', 'c@x', '', 3, 'd@y.com.br'])).toEqual(['a@x.com', 'd@y.com.br']);
    expect(cleanRecipients(null)).toEqual([]);
    expect(cleanRecipients(Array.from({ length: 30 }, (_, i) => `u${i}@x.com`))).toHaveLength(20);
  });
  it('individualEligible ignora e-mails inválidos', () => {
    expect(individualEligible(mk({ report_emails: ['sem-arroba'] }))).toBe(false);
  });
  it('previsto vencido aparece no individual', () => {
    const f = projectFacts(mk({ baseline_date: '2026-11-20', due_date: '2026-11-20' }), names, hoje);
    expect(renderIndividual(f, 'n', 's', 'https://q/').text).toContain('(previsto vencido)');
    const g = projectFacts(mk({ baseline_date: '2026-11-18', due_date: '2026-11-20' }), names, hoje);
    expect(renderIndividual(g, 'n', 's', 'https://q/').text).toContain('2 dias de atraso; previsto vencido');
  });
  it('assunto sem quebra de linha', () => {
    const f = projectFacts(mk({ title: 'a\r\nBcc: x@y' }), names, hoje);
    expect(renderIndividual(f, 'n', 's', 'https://q/').subject).not.toMatch(/[\r\n]/);
  });
});
