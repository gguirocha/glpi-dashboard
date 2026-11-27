import { describe, it, expect } from 'vitest';
import { parseCreate, parseUpdate } from '../validate';

type R = { ok: boolean };
const err = (r: R) => {
  expect(r.ok).toBe(false);
  return (r as unknown as { error: string }).error;
};
const val = <T>(r: R) => {
  expect(r.ok).toBe(true);
  return (r as unknown as { value: T }).value;
};

describe('parseCreate', () => {
  it('cria com título mínimo e faz trim', () => {
    const v = val<{ project: Record<string, unknown> }>(parseCreate({ project: { title: '  Meu projeto ' } }));
    expect(v.project.title).toBe('Meu projeto');
  });
  it('exige title', () => {
    expect(err(parseCreate({ project: { owner: 'x' } }))).toMatch(/title/);
    expect(parseCreate({}).ok).toBe(false);
  });
  it('title vazio/espaços/longo demais', () => {
    expect(err(parseCreate({ project: { title: '   ' } }))).toMatch(/title/);
    expect(err(parseCreate({ project: { title: '' } }))).toMatch(/title/);
    expect(parseCreate({ project: { title: 'a'.repeat(200) } }).ok).toBe(true);
    expect(err(parseCreate({ project: { title: 'a'.repeat(201) } }))).toMatch(/title/);
  });
  it('aceita evento junto', () => {
    const v = val<{ event: unknown }>(parseCreate({
      project: { title: 'x' }, event: { kind: 'aberto', summary: ' ok ' },
    }));
    expect(v.event).toEqual({ kind: 'aberto', summary: 'ok' });
  });
  it('body não-objeto', () => {
    for (const b of [null, undefined, 'x', 1, [], true]) expect(parseCreate(b).ok).toBe(false);
  });
  it('chave de topo desconhecida', () => {
    expect(err(parseCreate({ project: { title: 'x' }, extra: 1 }))).toMatch(/extra/);
  });
  it('project não-objeto', () => {
    expect(parseCreate({ project: 'x' }).ok).toBe(false);
    expect(parseCreate({ project: [] }).ok).toBe(false);
  });
});

describe('campos de projeto', () => {
  const up = (p: Record<string, unknown>) => parseUpdate({ project: p });

  it('campo desconhecido é erro sem ecoar valor', () => {
    const e = err(up({ id: 'SEGREDO123' }));
    expect(e).toMatch(/id/);
    expect(e).not.toContain('SEGREDO123');
    expect(up({ created_at: 'x' }).ok).toBe(false);
    expect(up({ toString: 'x' }).ok).toBe(false);
  });
  it('não ecoa valor inválido', () => {
    expect(err(up({ owner: 'x'.repeat(101) }))).not.toContain('xxxxx');
  });
  it('phase e health por lista', () => {
    expect(up({ phase: 'execucao' }).ok).toBe(true);
    expect(up({ phase: 'foo' }).ok).toBe(false);
    expect(up({ health: 'vermelho' }).ok).toBe(true);
    expect(up({ health: 'azul' }).ok).toBe(false);
    expect(up({ phase: 1 }).ok).toBe(false);
  });
  it('limites de texto exatos', () => {
    const cases: [string, number][] = [
      ['owner', 100], ['health_reason', 500], ['requester', 200], ['area', 200], ['sponsor', 200],
      ['origin_ticket', 200], ['next_step', 1000], ['decision_needed', 1000], ['weekly_update', 4000],
    ];
    for (const [f, n] of cases) {
      expect(up({ [f]: 'a'.repeat(n) }).ok, `${f} no limite`).toBe(true);
      expect(up({ [f]: 'a'.repeat(n + 1) }).ok, `${f} acima`).toBe(false);
      expect(up({ [f]: 5 }).ok, `${f} tipo`).toBe(false);
    }
  });
  it('string vazia vira null; trim', () => {
    const v = val<{ project: Record<string, unknown> }>(up({ owner: '   ', area: ' TI ', next_step: '' }));
    expect(v.project).toEqual({ owner: null, area: 'TI', next_step: null });
  });
  it('null explícito aceito em opcionais de texto', () => {
    const v = val<{ project: Record<string, unknown> }>(up({ owner: null }));
    expect(v.project.owner).toBeNull();
  });
  it('title null é erro', () => {
    expect(up({ title: null }).ok).toBe(false);
  });
  it('steps_total 0..100 inteiro', () => {
    expect(up({ steps_total: 0 }).ok).toBe(true);
    expect(up({ steps_total: 100 }).ok).toBe(true);
    expect(up({ steps_total: 101 }).ok).toBe(false);
    expect(up({ steps_total: -1 }).ok).toBe(false);
    expect(up({ steps_total: 1.5 }).ok).toBe(false);
    expect(up({ steps_total: '5' }).ok).toBe(false);
    expect(up({ steps_total: NaN }).ok).toBe(false);
  });
  it('steps_done >= 0 inteiro; <= total no mesmo payload', () => {
    expect(up({ steps_done: 0 }).ok).toBe(true);
    expect(up({ steps_done: 100 }).ok).toBe(true);
    expect(up({ steps_done: 101 }).ok).toBe(false);
    expect(up({ steps_done: -1 }).ok).toBe(false);
    expect(up({ steps_done: 2.5 }).ok).toBe(false);
    expect(up({ steps_done: 5, steps_total: 5 }).ok).toBe(true);
    expect(up({ steps_done: 6, steps_total: 5 }).ok).toBe(false);
  });
  it('datas válidas, null e inválidas', () => {
    for (const f of ['due_date', 'baseline_date']) {
      expect(up({ [f]: '2026-02-28' }).ok).toBe(true);
      expect(up({ [f]: null }).ok).toBe(true);
      expect(up({ [f]: '2026-02-30' }).ok).toBe(false);
      expect(up({ [f]: '28/02/2026' }).ok).toBe(false);
      expect(up({ [f]: 20260228 }).ok).toBe(false);
    }
  });
  it('real_status_id inteiro positivo ou null', () => {
    expect(up({ real_status_id: 3 }).ok).toBe(true);
    expect(up({ real_status_id: null }).ok).toBe(true);
    expect(up({ real_status_id: 0 }).ok).toBe(false);
    expect(up({ real_status_id: -2 }).ok).toBe(false);
    expect(up({ real_status_id: 1.2 }).ok).toBe(false);
    expect(up({ real_status_id: '1' }).ok).toBe(false);
  });
  describe('links', () => {
    it('aceita http(s)', () => {
      const v = val<{ project: { links: unknown } }>(up({ links: { Doc: 'https://a.com/x', B: 'http://b.com' } }));
      expect(v.project.links).toEqual({ Doc: 'https://a.com/x', B: 'http://b.com' });
    });
    it('null e objeto vazio', () => {
      expect(up({ links: null }).ok).toBe(true);
      expect(up({ links: {} }).ok).toBe(true);
    });
    it('rejeita esquemas perigosos', () => {
      for (const u of ['javascript:alert(1)', 'data:text/html,x', 'ftp://x', 'HTTPS//x', ' javascript:1', '//evil.com']) {
        expect(up({ links: { a: u } }).ok, u).toBe(false);
      }
    });
    it('rejeita não-string, array, não-objeto', () => {
      expect(up({ links: { a: 1 } }).ok).toBe(false);
      expect(up({ links: [] }).ok).toBe(false);
      expect(up({ links: 'https://a.com' }).ok).toBe(false);
    });
    it('limites de chaves, tamanho de chave e valor', () => {
      const mk = (n: number) => Object.fromEntries(Array.from({ length: n }, (_, i) => [`k${i}`, 'https://a.com']));
      expect(up({ links: mk(10) }).ok).toBe(true);
      expect(up({ links: mk(11) }).ok).toBe(false);
      expect(up({ links: { ['k'.repeat(50)]: 'https://a.com' } }).ok).toBe(true);
      expect(up({ links: { ['k'.repeat(51)]: 'https://a.com' } }).ok).toBe(false);
      expect(up({ links: { '': 'https://a.com' } }).ok).toBe(false);
      const url = (n: number) => 'https://a.com/' + 'x'.repeat(n - 14);
      expect(up({ links: { a: url(500) } }).ok).toBe(true);
      expect(up({ links: { a: url(501) } }).ok).toBe(false);
    });
  });
});

describe('parseUpdate', () => {
  it('exige ao menos projeto ou evento', () => {
    expect(parseUpdate({}).ok).toBe(false);
    expect(parseUpdate({ project: {} }).ok).toBe(false);
  });
  it('só evento basta', () => {
    expect(parseUpdate({ event: { kind: 'bloqueio', summary: 'parado' } }).ok).toBe(true);
  });
  it('só projeto basta', () => {
    expect(parseUpdate({ project: { health: 'verde' } }).ok).toBe(true);
  });
  it('title presente não pode ser vazio', () => {
    expect(parseUpdate({ project: { title: ' ' } }).ok).toBe(false);
  });
  it('chaves de topo extras e body inválido', () => {
    expect(parseUpdate({ project: { health: 'verde' }, foo: 1 }).ok).toBe(false);
    expect(parseUpdate(null).ok).toBe(false);
    expect(parseUpdate([]).ok).toBe(false);
  });
});

describe('event', () => {
  const ev = (e: unknown) => parseUpdate({ event: e });
  it('kind válido e summary 1..2000', () => {
    expect(ev({ kind: 'g1', summary: 'a' }).ok).toBe(true);
    expect(ev({ kind: 'g1', summary: 'a'.repeat(2000) }).ok).toBe(true);
    expect(ev({ kind: 'g1', summary: 'a'.repeat(2001) }).ok).toBe(false);
    expect(ev({ kind: 'g1', summary: '   ' }).ok).toBe(false);
    expect(ev({ kind: 'g1' }).ok).toBe(false);
  });
  it('kind inválido ou ausente', () => {
    expect(ev({ kind: 'xx', summary: 'a' }).ok).toBe(false);
    expect(ev({ summary: 'a' }).ok).toBe(false);
  });
  it('campo extra no evento é erro; tipo errado', () => {
    expect(ev({ kind: 'g1', summary: 'a', foo: 1 }).ok).toBe(false);
    expect(ev('x').ok).toBe(false);
    expect(ev(null).ok).toBe(false);
    expect(ev({ kind: 'g1', summary: 5 }).ok).toBe(false);
  });
  it('unicode e caracteres SQL preservados', () => {
    const r = ev({ kind: 'mudanca', summary: "Ação ✓ 😀 ' ; --" });
    expect(r.ok).toBe(true);
  });
});
