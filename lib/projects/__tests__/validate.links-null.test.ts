import { describe, it, expect } from 'vitest';
import { parseCreate, parseUpdate } from '../validate';

const up = (links: unknown) => parseUpdate({ project: { links } });
const valOf = (r: unknown) => (r as { value: { project: { links: Record<string, string | null> | null } } }).value.project;

describe('links com null por nome (PATCH)', () => {
  it('null dentro do objeto significa remover e é mantido no valor', () => {
    const r = up({ a: null, b: 'https://b.com' });
    expect(r.ok).toBe(true);
    expect(valOf(r).links).toEqual({ a: null, b: 'https://b.com' });
  });
  it('links inteiro null continua limpando tudo', () => {
    expect(valOf(up(null)).links).toBeNull();
  });
  it('só remoções é válido', () => {
    expect(up({ a: null }).ok).toBe(true);
  });
  it('nome inválido com null ainda é rejeitado', () => {
    expect(up({ '': null }).ok).toBe(false);
    expect(up({ ['k'.repeat(51)]: null }).ok).toBe(false);
    expect(up(JSON.parse('{"__proto__":null}')).ok).toBe(false);
  });
  it('máximo de 10 entradas inclui as nulas', () => {
    const mk = (n: number) => Object.fromEntries(Array.from({ length: n }, (_, i) => [`k${i}`, null]));
    expect(up(mk(10)).ok).toBe(true);
    expect(up(mk(11)).ok).toBe(false);
  });
  it('outros tipos continuam inválidos', () => {
    expect(up({ a: 1 }).ok).toBe(false);
    expect(up({ a: undefined }).ok).toBe(false);
  });
});

describe('links com null no create', () => {
  it('null dentro de links é erro', () => {
    const r = parseCreate({ project: { title: 'x', links: { a: null } } });
    expect(r.ok).toBe(false);
  });
  it('links válido e links null inteiro continuam ok', () => {
    expect(parseCreate({ project: { title: 'x', links: { a: 'https://a.com' } } }).ok).toBe(true);
    expect(parseCreate({ project: { title: 'x', links: null } }).ok).toBe(true);
  });
});
