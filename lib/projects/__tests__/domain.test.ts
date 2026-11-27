import { describe, it, expect } from 'vitest';
import {
  PHASES, HEALTHS, EVENT_KINDS, statusForPhase, parseDateOnly, delayDays, effectiveHealth,
} from '../domain';

describe('constantes', () => {
  it('expõe as listas esperadas', () => {
    expect(PHASES).toEqual(['abertura', 'escopo', 'execucao', 'seguranca', 'homologacao', 'encerrado']);
    expect(HEALTHS).toEqual(['verde', 'amarelo', 'vermelho']);
    expect(EVENT_KINDS).toHaveLength(9);
  });
});

describe('statusForPhase', () => {
  it.each([
    ['abertura', 'todo'], ['escopo', 'todo'], ['execucao', 'in_progress'],
    ['seguranca', 'in_progress'], ['homologacao', 'in_progress'], ['encerrado', 'done'],
  ] as const)('%s -> %s', (p, s) => expect(statusForPhase(p)).toBe(s));
});

describe('parseDateOnly', () => {
  it('interpreta como meia-noite local', () => {
    const d = parseDateOnly('2026-03-05')!;
    expect([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours()]).toEqual([2026, 2, 5, 0]);
  });
  it('aceita 29/02 em ano bissexto', () => {
    expect(parseDateOnly('2028-02-29')).not.toBeNull();
  });
  it.each(['2026-02-30', '2026-02-29', '2026-13-01', '2026-00-10', '2026-01-00', '2026-1-1',
    '2026-01-01T00:00', '', 'abc', ' 2026-01-01'])('rejeita %j', (s) => {
    expect(parseDateOnly(s)).toBeNull();
  });
  it('null/undefined/não-string -> null', () => {
    expect(parseDateOnly(null)).toBeNull();
    expect(parseDateOnly(undefined)).toBeNull();
    expect(parseDateOnly(123 as unknown as string)).toBeNull();
  });
});

describe('delayDays', () => {
  it('positivo quando previsto depois do prometido', () => {
    expect(delayDays('2026-01-01', '2026-01-11')).toBe(10);
  });
  it('zero e negativo', () => {
    expect(delayDays('2026-01-10', '2026-01-10')).toBe(0);
    expect(delayDays('2026-01-10', '2026-01-08')).toBe(-2);
  });
  it('inteiro mesmo atravessando mudança de horário', () => {
    expect(delayDays('2026-03-01', '2026-11-01')).toBe(245);
  });
  it('null se faltar algum ou inválido', () => {
    expect(delayDays(null, '2026-01-01')).toBeNull();
    expect(delayDays('2026-01-01', null)).toBeNull();
    expect(delayDays('2026-02-30', '2026-03-01')).toBeNull();
  });
});

describe('effectiveHealth', () => {
  it('atraso eleva verde para amarelo', () => {
    expect(effectiveHealth('verde', '2026-01-01', '2026-01-02')).toBe('amarelo');
  });
  it('mantém vermelho com atraso', () => {
    expect(effectiveHealth('vermelho', '2026-01-01', '2026-02-01')).toBe('vermelho');
  });
  it('mantém amarelo com atraso', () => {
    expect(effectiveHealth('amarelo', '2026-01-01', '2026-02-01')).toBe('amarelo');
  });
  it('sem atraso mantém a informada', () => {
    expect(effectiveHealth('verde', '2026-01-01', '2026-01-01')).toBe('verde');
    expect(effectiveHealth('verde', '2026-01-05', '2026-01-01')).toBe('verde');
  });
  it('sem datas mantém a informada', () => {
    expect(effectiveHealth('verde', null, null)).toBe('verde');
  });
});
