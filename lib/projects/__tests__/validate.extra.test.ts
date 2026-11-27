import { describe, it, expect } from 'vitest';
import { parseCreate, parseUpdate } from '../validate';

const up = (project: Record<string, unknown>) => parseUpdate({ project });
const errOf = (r: { ok: boolean }) => {
  expect(r.ok).toBe(false);
  return (r as unknown as { error: string }).error;
};
const valOf = (r: { ok: boolean }) => {
  expect(r.ok).toBe(true);
  return (r as unknown as { value: { project: Record<string, unknown> } }).value.project;
};

describe('contrato null x ausente no update', () => {
  it('ausente = não muda (chave não aparece)', () => {
    expect('phase' in valOf(up({ owner: 'x' }))).toBe(false);
  });
  it('null limpa campos opcionais', () => {
    const p = valOf(up({ owner: null, next_step: null, due_date: null, links: null, real_status_id: null }));
    expect(p.owner).toBeNull();
    expect(p.next_step).toBeNull();
    expect(p.due_date).toBeNull();
    expect(p.links).toBeNull();
    expect(p.real_status_id).toBeNull();
  });
  it.each(['title', 'phase', 'health', 'steps_total', 'steps_done'])('null em %s é erro', (f) => {
    expect(up({ [f]: null }).ok).toBe(false);
  });
});

describe('limites inteiros', () => {
  it('steps_done 0..100', () => {
    expect(up({ steps_done: 100 }).ok).toBe(true);
    expect(up({ steps_done: 101 }).ok).toBe(false);
    expect(up({ steps_done: Number.MAX_SAFE_INTEGER }).ok).toBe(false);
  });
  it('steps_done sem steps_total é aceito (banco confere)', () => {
    expect(up({ steps_done: 50 }).ok).toBe(true);
  });
  it('real_status_id 1..2147483647', () => {
    expect(up({ real_status_id: 1 }).ok).toBe(true);
    expect(up({ real_status_id: 2147483647 }).ok).toBe(true);
    expect(up({ real_status_id: 2147483648 }).ok).toBe(false);
    expect(up({ real_status_id: 0 }).ok).toBe(false);
    expect(up({ real_status_id: NaN }).ok).toBe(false);
  });
});

describe('caractere nulo', () => {
  it('rejeita em texto, evento e links', () => {
    expect(errOf(up({ owner: 'a\u0000b' }))).toMatch(/nulo|U\+0000/i);
    expect(errOf(parseCreate({ project: { title: 'a\u0000' } }))).toMatch(/nulo|U\+0000/i);
    expect(parseUpdate({ event: { kind: 'mudanca', summary: 'x\u0000' } }).ok).toBe(false);
    expect(errOf(up({ links: { a: 'https://a.com/\u0000' } }))).toBeTruthy();
    expect(up({ links: { 'a\u0000': 'https://a.com' } }).ok).toBe(false);
  });
});

describe('links endurecidos', () => {
  it('aceita null e mantém null', () => {
    expect(valOf(up({ links: null })).links).toBeNull();
  });
  it('rejeita chaves perigosas', () => {
    for (const k of ['__proto__', 'constructor', 'prototype']) {
      const links = JSON.parse(`{"${k}":"https://a.com"}`);
      expect(up({ links }).ok, k).toBe(false);
    }
  });
  it('objeto de saída sem protótipo', () => {
    expect(Object.getPrototypeOf(valOf(up({ links: { a: 'https://a.com' } })).links)).toBeNull();
  });
  it('protocolos e URLs inválidas', () => {
    const ruins = ['javascript:alert(1)', 'ftp://a.com', 'https://', 'http://', 'https://a .com', 'https://a.com/\u0001', 'https://a.com/\u007F', 'https://a.com/\n'];
    for (const u of ruins) expect(up({ links: { a: u } }).ok, u).toBe(false);
    expect(up({ links: { a: 'HTTPS://a.com/x' } }).ok).toBe(true);
  });
});

describe('__proto__ no corpo', () => {
  it('rejeita no topo, em project e em event', () => {
    expect(parseUpdate(JSON.parse('{"__proto__":{"a":1}}')).ok).toBe(false);
    expect(parseUpdate(JSON.parse('{"project":{"__proto__":{"a":1}}}')).ok).toBe(false);
    expect(parseCreate(JSON.parse('{"project":{"title":"x","__proto__":"y"}}')).ok).toBe(false);
    expect(parseUpdate(JSON.parse('{"event":{"kind":"mudanca","summary":"s","__proto__":1}}')).ok).toBe(false);
  });
});
