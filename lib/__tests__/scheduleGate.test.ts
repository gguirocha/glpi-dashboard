import { describe, it, expect } from 'vitest';
import { CATCHUP_WINDOW_MS, occurrenceStart, shouldFireNow } from '@/lib/weeklyReport';
import type { ScheduleConfig } from '@/types';

// 2026-01-05 é segunda-feira (fuso local do servidor)
const S: ScheduleConfig = { dayOfWeek: 1, hour: 8, minute: 30 };
const at = (d: number, h: number, m = 0, s = 0) => new Date(2026, 0, d, h, m, s, 0);

describe('occurrenceStart', () => {
  it('dia errado -> null', () => {
    expect(occurrenceStart(S, at(6, 9))).toBeNull();
    expect(occurrenceStart(S, at(4, 9))).toBeNull();
  });
  it('antes da hora -> null (inclusive 1s antes)', () => {
    expect(occurrenceStart(S, at(5, 8, 29, 59))).toBeNull();
  });
  it('exatamente na hora -> instante agendado', () => {
    expect(occurrenceStart(S, at(5, 8, 30))?.getTime()).toBe(at(5, 8, 30).getTime());
  });
  it('depois da hora no mesmo dia -> mesmo instante agendado (segundos zerados)', () => {
    expect(occurrenceStart(S, at(5, 23, 59, 59))?.getTime()).toBe(at(5, 8, 30).getTime());
  });
  it.each([0, 1, 2, 3, 4, 5, 6])('respeita dayOfWeek=%i', (dow) => {
    const r = occurrenceStart({ dayOfWeek: dow, hour: 0, minute: 0 }, at(5, 12)); // segunda
    expect(r !== null).toBe(dow === 1);
  });
});

describe('shouldFireNow', () => {
  it('dia errado -> false', () => expect(shouldFireNow(S, null, at(6, 9))).toBe(false));
  it('antes da hora -> false', () => expect(shouldFireNow(S, null, at(5, 8, 29))).toBe(false));
  it('na hora, sem disparo anterior -> true', () => expect(shouldFireNow(S, null, at(5, 8, 30))).toBe(true));
  it('limite exato da janela de catch-up -> true', () => {
    const now = new Date(at(5, 8, 30).getTime() + CATCHUP_WINDOW_MS);
    expect(shouldFireNow(S, null, now)).toBe(true);
  });
  it('1 ms além da janela de catch-up -> false', () => {
    const now = new Date(at(5, 8, 30).getTime() + CATCHUP_WINDOW_MS + 1);
    expect(shouldFireNow(S, null, now)).toBe(false);
  });
  it('já disparou nesta ocorrência (marcador no mesmo instante ou depois) -> false', () => {
    expect(shouldFireNow(S, at(5, 8, 30), at(5, 9))).toBe(false);
    expect(shouldFireNow(S, at(5, 8, 45), at(5, 9))).toBe(false);
  });
  it('marcador 1 ms antes da ocorrência -> true', () => {
    const antes = new Date(at(5, 8, 30).getTime() - 1);
    expect(shouldFireNow(S, antes, at(5, 9))).toBe(true);
  });
  it('marcador da semana anterior não bloqueia', () => {
    expect(shouldFireNow(S, new Date(2025, 11, 29, 8, 30), at(5, 9))).toBe(true);
  });
  it('marcador Date(0) (restaurado após CycleLoadError) não bloqueia', () => {
    expect(shouldFireNow(S, new Date(0), at(5, 9))).toBe(true);
  });
});
