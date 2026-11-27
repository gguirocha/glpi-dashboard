import { describe, it, expect } from 'vitest';
import {
  ACTIVE_PHASES, ALLOWED_BOARD_COLUMNS, PHASE_LABELS, boardIndicators, cardInfo, groupByPhase, wipLimitFrom,
} from '../board';
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
const hoje = new Date(2026, 10, 27);
const iso = (y: number, m: number, d: number) => new Date(y, m, d, 9).toISOString();

describe('constantes', () => {
  it('rótulos e fases ativas', () => {
    expect(PHASE_LABELS).toEqual({
      abertura: 'Abertura', escopo: 'Escopo', execucao: 'Execução', seguranca: 'Segurança',
      homologacao: 'Homologação', encerrado: 'Encerrado',
    });
    expect(ACTIVE_PHASES).toEqual(['execucao', 'seguranca', 'homologacao']);
  });
  it('colunas permitidas sem select *', () => {
    const cols = ALLOWED_BOARD_COLUMNS.split(',').map((c) => c.trim());
    expect(cols).not.toContain('*');
    for (const c of ['id', 'title', 'code', 'phase', 'health', 'steps_total', 'links', 'updated_at', 'completed_at', 'real_status_id', 'report_emails', 'status'])
      expect(cols).toContain(c);
    expect(new Set(cols).size).toBe(cols.length);
  });
});

describe('cardInfo', () => {
  it('saúde efetiva sobe para amarelo com atraso', () => {
    const i = cardInfo(mk({ baseline_date: '2026-11-01', due_date: '2026-11-10' }), hoje);
    expect(i.saude).toBe('amarelo');
    expect(i.atrasoDias).toBe(9);
  });
  it('sem datas: atraso null, não vencido', () => {
    expect(cardInfo(mk(), hoje)).toEqual({ saude: 'verde', atrasoDias: null, vencido: false, etapasPct: null });
  });
  it('vencido só se due < hoje e não encerrado', () => {
    expect(cardInfo(mk({ due_date: '2026-11-26' }), hoje).vencido).toBe(true);
    expect(cardInfo(mk({ due_date: '2026-11-27' }), hoje).vencido).toBe(false);
    expect(cardInfo(mk({ due_date: '2026-11-26', phase: 'encerrado' }), hoje).vencido).toBe(false);
    expect(cardInfo(mk({ due_date: 'lixo' }), hoje).vencido).toBe(false);
  });
  it('etapasPct', () => {
    expect(cardInfo(mk({ steps_total: 3, steps_done: 1 }), hoje).etapasPct).toBe(33);
    expect(cardInfo(mk({ steps_total: 3, steps_done: 2 }), hoje).etapasPct).toBe(67);
    expect(cardInfo(mk({ steps_total: 4, steps_done: 9 }), hoje).etapasPct).toBe(100);
    expect(cardInfo(mk({ steps_total: 4, steps_done: -2 }), hoje).etapasPct).toBe(0);
    expect(cardInfo(mk({ steps_total: 0, steps_done: 0 }), hoje).etapasPct).toBeNull();
  });
});

describe('groupByPhase', () => {
  it('cria todas as fases, mesmo vazias', () => {
    const g = groupByPhase([], hoje);
    expect(Object.keys(g).sort()).toEqual(Object.keys(PHASE_LABELS).sort());
    for (const k of Object.keys(g)) expect(g[k as keyof typeof g]).toEqual([]);
  });
  it('fase desconhecida ou ausente vai para abertura', () => {
    const a = mk({ phase: 'xpto' as never });
    const b = mk({ phase: undefined as never });
    expect(groupByPhase([a, b], hoje).abertura.map((p) => p.id)).toEqual([a.id, b.id]);
  });
  it('ordena por saúde, atraso, prazo e id', () => {
    const verde = mk({ health: 'verde' });
    const amar = mk({ health: 'amarelo' });
    const verm = mk({ health: 'vermelho' });
    const atraso5 = mk({ baseline_date: '2026-11-01', due_date: '2026-11-06' });
    const atraso9 = mk({ baseline_date: '2026-11-01', due_date: '2026-11-10' });
    const amarPrazoTarde = mk({ health: 'amarelo', due_date: '2026-12-01' });
    const amarPrazoCedo = mk({ health: 'amarelo', due_date: '2026-11-30' });
    const r = groupByPhase([verde, amarPrazoTarde, atraso5, verm, amarPrazoCedo, amar, atraso9], hoje)
      .execucao.map((p) => p.id);
    expect(r).toEqual([verm.id, atraso9.id, atraso5.id, amarPrazoCedo.id, amarPrazoTarde.id, amar.id, verde.id]);
  });
  it('desempate por id asc com prazos iguais', () => {
    const a = mk({ due_date: '2026-12-01' });
    const b = mk({ due_date: '2026-12-01' });
    expect(groupByPhase([b, a], hoje).execucao.map((p) => p.id)).toEqual([a.id, b.id]);
  });
  it('atraso zero vem antes de null', () => {
    const nulo = mk({ health: 'amarelo' });
    const zero = mk({ health: 'amarelo', baseline_date: '2026-11-10', due_date: '2026-11-10' });
    expect(groupByPhase([nulo, zero], hoje).execucao.map((p) => p.id)).toEqual([zero.id, nulo.id]);
  });
  it('encerrado por completed_at desc, sem data por último', () => {
    const a = mk({ phase: 'encerrado', completed_at: '2026-11-01T10:00:00Z' });
    const b = mk({ phase: 'encerrado', completed_at: '2026-11-20T10:00:00Z' });
    const c = mk({ phase: 'encerrado', completed_at: null });
    const d = mk({ phase: 'encerrado', completed_at: null });
    expect(groupByPhase([c, a, d, b], hoje).encerrado.map((p) => p.id)).toEqual([b.id, a.id, c.id, d.id]);
  });
  it('não muta a entrada', () => {
    const list = [mk({ health: 'verde' }), mk({ health: 'vermelho' })];
    const ids = list.map((p) => p.id);
    groupByPhase(list, hoje);
    expect(list.map((p) => p.id)).toEqual(ids);
  });
});

describe('boardIndicators', () => {
  const agora = new Date(2026, 10, 27, 12, 0, 0);
  it('vazio', () => {
    expect(boardIndicators([], agora, 8)).toEqual({
      emAndamento: 0, wipLimit: 8, wipExcedido: false, bloqueados: 0, aguardandoRetorno: 0,
      atrasados: 0, entreguesNoMes: 0, noPrazoPct: null, leadTimeMedioDias: null,
    });
  });
  it('WIP e contagens só em fases ativas', () => {
    const ps = [
      mk({ phase: 'execucao', real_status_id: 5 }),
      mk({ phase: 'seguranca', real_status_id: 12 }),
      mk({ phase: 'homologacao', due_date: '2026-11-01' }),
      mk({ phase: 'homologacao', baseline_date: '2026-11-01', due_date: '2026-11-05' }),
      mk({ phase: 'escopo', real_status_id: 5, due_date: '2020-01-01' }),
      mk({ phase: 'encerrado', real_status_id: 5, due_date: '2020-01-01' }),
    ];
    const r = boardIndicators(ps, agora, 4);
    expect(r.emAndamento).toBe(4);
    expect(r.wipExcedido).toBe(false);
    expect(r.bloqueados).toBe(1);
    expect(r.aguardandoRetorno).toBe(1);
    expect(r.atrasados).toBe(2);
    expect(boardIndicators(ps, agora, 3).wipExcedido).toBe(true);
  });
  it('entregues no mês e no prazo', () => {
    const ps = [
      mk({ phase: 'encerrado', completed_at: iso(2026, 10, 3), baseline_date: '2026-11-03' }),
      mk({ phase: 'encerrado', completed_at: iso(2026, 10, 10), baseline_date: '2026-11-09' }),
      mk({ phase: 'encerrado', completed_at: iso(2026, 10, 12) }),
      mk({ phase: 'encerrado', completed_at: iso(2026, 9, 31), baseline_date: '2026-10-31' }),
      mk({ phase: 'encerrado', completed_at: iso(2025, 10, 5), baseline_date: '2025-11-05' }),
      mk({ phase: 'encerrado', completed_at: null }),
      mk({ phase: 'encerrado', completed_at: 'invalido' }),
      mk({ phase: 'execucao', completed_at: iso(2026, 10, 5) }),
    ];
    const r = boardIndicators(ps, agora, 8);
    expect(r.entreguesNoMes).toBe(3);
    expect(r.noPrazoPct).toBe(50);
  });
  it('noPrazoPct null sem baseline entre os entregues', () => {
    const ps = [mk({ phase: 'encerrado', completed_at: iso(2026, 10, 3) })];
    expect(boardIndicators(ps, agora, 8).noPrazoPct).toBeNull();
  });
  it('lead time médio dos últimos 90 dias', () => {
    const ps = [
      mk({ phase: 'encerrado', start_date: '2026-11-01', completed_at: iso(2026, 10, 11) }),
      mk({ phase: 'encerrado', start_date: '2026-10-01', completed_at: iso(2026, 10, 6) }),
      mk({ phase: 'encerrado', start_date: '2026-10-01', completed_at: iso(2026, 10, 7) }),
      mk({ phase: 'encerrado', start_date: null, completed_at: iso(2026, 10, 7) }),
      mk({ phase: 'encerrado', start_date: '2025-01-01', completed_at: iso(2025, 5, 1) }),
      mk({ phase: 'encerrado', start_date: 'lixo', completed_at: iso(2026, 10, 7) }),
      mk({ phase: 'encerrado', start_date: '2026-10-01', completed_at: null }),
      mk({ phase: 'execucao', start_date: '2026-10-01', completed_at: iso(2026, 10, 7) }),
    ];
    // (10 + 36 + 37) / 3 = 27,67
    expect(boardIndicators(ps, agora, 8).leadTimeMedioDias).toBe(28);
  });
  it('lead time null sem elegíveis', () => {
    const ps = [mk({ phase: 'encerrado', completed_at: iso(2026, 10, 7) })];
    expect(boardIndicators(ps, agora, 8).leadTimeMedioDias).toBeNull();
  });
  it('janela de 90 dias', () => {
    const dentro = new Date(2026, 10, 27, 9);
    dentro.setDate(dentro.getDate() - 89);
    const fora = new Date(2026, 10, 27, 9);
    fora.setDate(fora.getDate() - 95);
    const p1 = mk({ phase: 'encerrado', start_date: '2026-01-01', completed_at: dentro.toISOString() });
    const p2 = mk({ phase: 'encerrado', start_date: '2026-01-01', completed_at: fora.toISOString() });
    expect(boardIndicators([p1], agora, 8).leadTimeMedioDias).not.toBeNull();
    expect(boardIndicators([p2], agora, 8).leadTimeMedioDias).toBeNull();
  });
});

describe('wipLimitFrom', () => {
  it.each([
    [{ wip_limit: 5 }, 5], [{ wip_limit: '12' }, 12], [{ wip_limit: 5.7 }, 5], [{ wip_limit: 1 }, 1],
    [{ wip_limit: 50 }, 50], [{ wip_limit: 0 }, 8], [{ wip_limit: 51 }, 8], [{ wip_limit: -3 }, 8],
    [{ wip_limit: 'abc' }, 8], [{ wip_limit: null }, 8], [{ wip_limit: NaN }, 8], [{}, 8],
    [null, 8], [undefined, 8], ['x', 8], [7, 8],
  ])('%j -> %i', (v, esperado) => {
    expect(wipLimitFrom(v)).toBe(esperado);
  });
});
