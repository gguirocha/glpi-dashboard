import { describe, it, expect } from 'vitest';
import { createRateLimiter } from '../rateLimit';

describe('createRateLimiter', () => {
  it('permite até o limite e bloqueia o seguinte', () => {
    const t = 0;
    const allow = createRateLimiter(3, 1000, () => t);
    expect([allow('a'), allow('a'), allow('a'), allow('a')]).toEqual([true, true, true, false]);
  });
  it('ids são independentes', () => {
    const allow = createRateLimiter(1, 1000, () => 0);
    expect(allow('a')).toBe(true);
    expect(allow('b')).toBe(true);
    expect(allow('a')).toBe(false);
  });
  it('libera ao virar a janela (limite exato de borda)', () => {
    let t = 0;
    const allow = createRateLimiter(2, 1000, () => t);
    allow('a');
    t = 500;
    allow('a');
    t = 999;
    expect(allow('a')).toBe(false);
    t = 1000;
    expect(allow('a')).toBe(true); // o primeiro expirou
    expect(allow('a')).toBe(false); // 500 e 1000 ocupam a janela
    t = 1500;
    expect(allow('a')).toBe(true);
  });
  it('requisições negadas não consomem cota', () => {
    let t = 0;
    const allow = createRateLimiter(1, 1000, () => t);
    allow('a');
    for (t = 1; t < 900; t += 100) allow('a');
    t = 1000;
    expect(allow('a')).toBe(true);
  });
  it('descarta ids antigos sem afetar o comportamento', () => {
    let t = 0;
    const allow = createRateLimiter(1, 1000, () => t);
    for (let i = 0; i < 5000; i++) allow(`id${i}`);
    t = 5000;
    expect(allow('novo')).toBe(true);
    expect(allow('id0')).toBe(true);
    expect(allow('id0')).toBe(false);
  });
  it('usa Date.now por padrão', () => {
    const allow = createRateLimiter(1, 60_000);
    expect(allow('x')).toBe(true);
    expect(allow('x')).toBe(false);
  });
});
