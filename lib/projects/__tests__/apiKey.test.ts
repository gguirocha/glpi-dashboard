import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { generateApiKey, hashApiKey, parseBearer } from '../apiKey';

const KEY_RE = /^mdf_[0-9a-f]{8}_[A-Za-z0-9_-]{43}$/;

describe('generateApiKey', () => {
  it('gera formato correto e hash coerente', () => {
    const { key, prefix, hash } = generateApiKey();
    expect(key).toMatch(KEY_RE);
    expect(prefix).toMatch(/^[0-9a-f]{8}$/);
    expect(key.startsWith(`mdf_${prefix}_`)).toBe(true);
    expect(key).not.toContain('=');
    expect(hash).toBe(createHash('sha256').update(key).digest('hex'));
  });
  it('gera chaves distintas', () => {
    const set = new Set(Array.from({ length: 50 }, () => generateApiKey().key));
    expect(set.size).toBe(50);
  });
});

describe('hashApiKey', () => {
  it('sha256 hex determinístico', () => {
    expect(hashApiKey('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
});

describe('parseBearer', () => {
  const { key } = generateApiKey();
  it('aceita Bearer válido', () => expect(parseBearer(`Bearer ${key}`)).toBe(key));
  it.each([null, undefined, '', 'Bearer', 'Bearer ', 'bearer x', 'Basic abc'])('rejeita %j', (h) => {
    expect(parseBearer(h)).toBeNull();
  });
  it('rejeita chave sem prefixo mdf_', () => {
    expect(parseBearer(`Bearer ${key.slice(4)}`)).toBeNull();
    expect(parseBearer(key)).toBeNull();
  });
  it('rejeita tamanho errado, hex inválido, caracteres extras', () => {
    expect(parseBearer(`Bearer ${key}x`)).toBeNull();
    expect(parseBearer(`Bearer ${key.slice(0, -1)}`)).toBeNull();
    expect(parseBearer(`Bearer ${key.replace(/^mdf_[0-9a-f]{8}/, 'mdf_ZZZZZZZZ')}`)).toBeNull();
    expect(parseBearer(`Bearer ${key} extra`)).toBeNull();
    expect(parseBearer(`Bearer  ${key}`)).toBeNull();
    expect(parseBearer(`Bearer ${key}\n`)).toBeNull();
  });
  it('rejeita não-string', () => {
    expect(parseBearer(5 as unknown as string)).toBeNull();
  });
});

describe('parseBearer esquema case-insensitive', () => {
  const { key } = generateApiKey();
  it('aceita bearer/BEARER', () => {
    expect(parseBearer(`bearer ${key}`)).toBe(key);
    expect(parseBearer(`BEARER ${key}`)).toBe(key);
  });
  it('exige exatamente um espaço', () => {
    expect(parseBearer(`Bearer  ${key}`)).toBeNull();
    expect(parseBearer(`Bearer\t${key}`)).toBeNull();
    expect(parseBearer(`Bearer ${key} `)).toBeNull();
  });
});
