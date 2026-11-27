import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createWeeklyTick, MAX_MARKER_ATTEMPTS, SCHEDULE_REFRESH_MS, type WeeklyTickDeps } from '@/lib/weeklyScheduler';
import { CATCHUP_WINDOW_MS, CycleLoadError, occurrenceStart, shouldFireNow } from '@/lib/weeklyReport';
import type { ScheduleConfig, WeeklyCycleResult } from '@/types';

// Segunda-feira 2026-01-05 08:00 local = ocorrência agendada
const SCHEDULE: ScheduleConfig = { dayOfWeek: 1, hour: 8, minute: 0 };
const local = (d: number, h: number, m = 0) => new Date(2026, 0, d, h, m, 0, 0);
const SEG_0801 = local(5, 8, 1);

const CICLO: WeeklyCycleResult = {
  preview: false,
  at: '',
  individual: { processed: 2, succeeded: 2, failed: 0, skipped: 0, results: [] },
  general: { enabled: false } as WeeklyCycleResult['general'],
  cleared: 2,
  warnings: ['aviso'],
};

let clock: Date;
let deps: {
  [K in keyof WeeklyTickDeps]: WeeklyTickDeps[K] extends (...a: infer A) => infer R ? ReturnType<typeof vi.fn<(...a: A) => R>> : WeeklyTickDeps[K];
};

beforeEach(() => {
  clock = SEG_0801;
  deps = {
    getScheduleConfig: vi.fn(async () => SCHEDULE),
    getCycleLastFiredAt: vi.fn(async () => ({ ok: true as const, lastFiredAt: null })),
    setCycleLastFiredAt: vi.fn(async () => true),
    runWeeklyCycle: vi.fn(async () => CICLO),
    alert: vi.fn(async () => undefined),
    now: vi.fn(() => clock),
    CycleLoadError,
    occurrenceStart: vi.fn((s: ScheduleConfig, n: Date) => occurrenceStart(s, n)),
    shouldFireNow: vi.fn((s: ScheduleConfig, l: Date | null, n: Date) => shouldFireNow(s, l, n)),
    catchupWindowMs: CATCHUP_WINDOW_MS,
  };
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

const novo = () => createWeeklyTick(deps as WeeklyTickDeps);

describe('weeklyTick - gate em memória', () => {
  it.each([
    ['dia errado (terça)', local(6, 9)],
    ['antes da hora (07:59)', local(5, 7, 59)],
    ['passou da janela de catch-up (11:01)', local(5, 11, 1)],
  ])('%s: não toca no banco de dedup nem roda ciclo', async (_n, quando) => {
    clock = quando;
    await novo()();
    expect(deps.getCycleLastFiredAt).not.toHaveBeenCalled();
    expect(deps.setCycleLastFiredAt).not.toHaveBeenCalled();
    expect(deps.runWeeklyCycle).not.toHaveBeenCalled();
  });

  it('config só é lida de novo após 10 min (cache); fora da janela não há outra leitura', async () => {
    clock = local(6, 9);
    const tick = novo();
    await tick();
    await tick();
    expect(deps.getScheduleConfig).toHaveBeenCalledTimes(1);
    clock = new Date(clock.getTime() + SCHEDULE_REFRESH_MS + 1);
    await tick();
    expect(deps.getScheduleConfig).toHaveBeenCalledTimes(2);
  });

  it('leitura da config falhou e sem cache -> não dispara nada', async () => {
    deps.getScheduleConfig.mockResolvedValue(null);
    const tick = novo();
    await tick();
    expect(deps.getCycleLastFiredAt).not.toHaveBeenCalled();
    expect(deps.runWeeklyCycle).not.toHaveBeenCalled();
    // e tenta ler de novo no próximo tick
    await tick();
    expect(deps.getScheduleConfig).toHaveBeenCalledTimes(2);
  });

  it('leitura falhou mas há cache antigo -> segue com o cache e tenta ler de novo no próximo tick', async () => {
    clock = local(4, 9);
    const tick = novo();
    await tick();
    deps.getScheduleConfig.mockResolvedValue(null);
    clock = SEG_0801; // 1 dia depois do cache: expirado; leitura falha, usa o anterior (segunda 08:00)
    await tick();
    expect(deps.getScheduleConfig).toHaveBeenCalledTimes(2);
    expect(deps.runWeeklyCycle).toHaveBeenCalledTimes(1);
    await tick();
    expect(deps.getScheduleConfig).toHaveBeenCalledTimes(3); // scheduleLoadedAt não avançou
  });

  it('exceção ao ler a config é engolida e logada (tick nunca lança)', async () => {
    deps.getScheduleConfig.mockRejectedValue(new Error('boom'));
    await expect(novo()()).resolves.toBeUndefined();
    expect(deps.runWeeklyCycle).not.toHaveBeenCalled();
  });
});

describe('weeklyTick - disparo e dedup', () => {
  it('dentro da janela e sem marcador: grava o marcador ANTES e roda o ciclo uma vez', async () => {
    const ordem: string[] = [];
    deps.setCycleLastFiredAt.mockImplementation(async () => (ordem.push('marca'), true));
    deps.runWeeklyCycle.mockImplementation(async () => (ordem.push('ciclo'), CICLO));
    await novo()();
    expect(ordem).toEqual(['marca', 'ciclo']);
    expect(deps.setCycleLastFiredAt).toHaveBeenCalledWith(SEG_0801);
  });

  it('janela de catch-up: ainda dispara exatamente às 11:00', async () => {
    clock = local(5, 11, 0);
    await novo()();
    expect(deps.runWeeklyCycle).toHaveBeenCalledTimes(1);
  });

  it('marcador de uma ocorrência anterior não impede o disparo', async () => {
    deps.getCycleLastFiredAt.mockResolvedValue({ ok: true, lastFiredAt: local(4, 8) });
    await novo()();
    expect(deps.runWeeklyCycle).toHaveBeenCalledTimes(1);
  });

  it('marcador já gravado nesta ocorrência (outro processo/restart) -> não roda', async () => {
    deps.getCycleLastFiredAt.mockResolvedValue({ ok: true, lastFiredAt: SEG_0800Plus() });
    await novo()();
    expect(deps.setCycleLastFiredAt).not.toHaveBeenCalled();
    expect(deps.runWeeklyCycle).not.toHaveBeenCalled();
  });

  it('leitura do marcador falhou -> não roda (fail-closed)', async () => {
    deps.getCycleLastFiredAt.mockResolvedValue({ ok: false });
    await novo()();
    expect(deps.setCycleLastFiredAt).not.toHaveBeenCalled();
    expect(deps.runWeeklyCycle).not.toHaveBeenCalled();
  });

  it('marcador não persistiu -> ciclo não roda', async () => {
    deps.setCycleLastFiredAt.mockResolvedValue(false);
    await novo()();
    expect(deps.runWeeklyCycle).not.toHaveBeenCalled();
  });

  it('a mesma ocorrência não roda 2x no mesmo processo, nem lê o banco de novo', async () => {
    const tick = novo();
    await tick();
    await tick();
    await tick();
    expect(deps.runWeeklyCycle).toHaveBeenCalledTimes(1);
    expect(deps.getCycleLastFiredAt).toHaveBeenCalledTimes(1);
  });

  it('mesmo se o banco "esquecer" o marcador, a guarda em memória impede reenvio', async () => {
    const tick = novo();
    await tick();
    deps.getCycleLastFiredAt.mockResolvedValue({ ok: true, lastFiredAt: null });
    clock = local(5, 8, 30);
    await tick();
    expect(deps.runWeeklyCycle).toHaveBeenCalledTimes(1);
  });

  it('próxima semana é uma nova ocorrência e dispara de novo', async () => {
    const tick = novo();
    await tick();
    clock = local(12, 8, 1);
    deps.getCycleLastFiredAt.mockResolvedValue({ ok: true, lastFiredAt: SEG_0801 });
    await tick();
    expect(deps.runWeeklyCycle).toHaveBeenCalledTimes(2);
  });

  it('marcador não persistiu: tenta de novo no próximo tick, no máximo 5 vezes por ocorrência', async () => {
    deps.setCycleLastFiredAt.mockResolvedValue(false);
    const tick = novo();
    for (let i = 0; i < MAX_MARKER_ATTEMPTS + 3; i++) await tick();
    expect(deps.setCycleLastFiredAt).toHaveBeenCalledTimes(MAX_MARKER_ATTEMPTS);
    expect(deps.runWeeklyCycle).not.toHaveBeenCalled();
  });

  it('o contador de tentativas reinicia em outra ocorrência', async () => {
    deps.setCycleLastFiredAt.mockResolvedValue(false);
    const tick = novo();
    for (let i = 0; i < MAX_MARKER_ATTEMPTS + 1; i++) await tick();
    clock = local(12, 8, 1);
    await tick();
    expect(deps.setCycleLastFiredAt).toHaveBeenCalledTimes(MAX_MARKER_ATTEMPTS + 1);
  });

  it('loga avisos e geral habilitado com erro sem lançar', async () => {
    deps.runWeeklyCycle.mockResolvedValue({
      ...CICLO,
      general: { enabled: true, success: false, exceptions: 1, deliveries: 2, sentTo: ['a'], error: 'smtp' },
    } as unknown as WeeklyCycleResult);
    await novo()();
    expect(console.warn).toHaveBeenCalledWith('[WeeklyScheduler] Aviso: aviso');
    const logs = (console.log as unknown as { mock: { calls: string[][] } }).mock.calls.map((c) => c[0]).join('\n');
    expect(logs).toContain('erro=smtp');
  });
});

function SEG_0800Plus() {
  return local(5, 8, 0);
}

describe('weeklyTick - CycleLoadError (leitura falhou antes de qualquer envio)', () => {
  it('restaura o marcador ao valor anterior e o próximo tick tenta de novo', async () => {
    const anterior = local(4, 8);
    deps.getCycleLastFiredAt.mockResolvedValue({ ok: true, lastFiredAt: anterior });
    deps.runWeeklyCycle.mockRejectedValueOnce(new CycleLoadError('banco fora'));
    const tick = novo();
    await tick();
    expect(deps.setCycleLastFiredAt).toHaveBeenNthCalledWith(1, SEG_0801);
    expect(deps.setCycleLastFiredAt).toHaveBeenNthCalledWith(2, anterior);
    expect(deps.alert).not.toHaveBeenCalled();
    await tick();
    expect(deps.runWeeklyCycle).toHaveBeenCalledTimes(2);
  });

  it('sem marcador anterior restaura para Date(0)', async () => {
    deps.runWeeklyCycle.mockRejectedValueOnce(new CycleLoadError('x'));
    await novo()();
    expect(deps.setCycleLastFiredAt).toHaveBeenNthCalledWith(2, new Date(0));
  });

  it('após 5 tentativas para de tentar e chama o alerta (uma vez, na 5ª)', async () => {
    deps.runWeeklyCycle.mockRejectedValue(new CycleLoadError('banco fora'));
    const tick = novo();
    for (let i = 0; i < MAX_MARKER_ATTEMPTS; i++) await tick();
    expect(deps.runWeeklyCycle).toHaveBeenCalledTimes(MAX_MARKER_ATTEMPTS);
    expect(deps.alert).toHaveBeenCalledTimes(1);
    const [assunto, corpo] = deps.alert.mock.calls[0];
    expect(assunto).toContain('Report semanal NÃO saiu');
    expect(corpo).toContain(`${MAX_MARKER_ATTEMPTS} tentativa(s)`);
    expect(corpo).toContain('banco fora');
    // 6º tick: nada mais acontece
    await tick();
    expect(deps.runWeeklyCycle).toHaveBeenCalledTimes(MAX_MARKER_ATTEMPTS);
    expect(deps.alert).toHaveBeenCalledTimes(1);
  });

  it('marcador não restaurado -> alerta na hora e a guarda em memória impede nova tentativa', async () => {
    deps.runWeeklyCycle.mockRejectedValue(new CycleLoadError('x'));
    deps.setCycleLastFiredAt.mockResolvedValueOnce(true).mockResolvedValue(false);
    const tick = novo();
    await tick();
    expect(deps.alert).toHaveBeenCalledTimes(1);
    await tick();
    expect(deps.runWeeklyCycle).toHaveBeenCalledTimes(1);
  });

  it('falha ao enviar o alerta é engolida', async () => {
    deps.runWeeklyCycle.mockRejectedValue(new CycleLoadError('x'));
    deps.setCycleLastFiredAt.mockResolvedValueOnce(true).mockResolvedValue(false);
    deps.alert.mockRejectedValue(new Error('smtp fora'));
    await expect(novo()()).resolves.toBeUndefined();
    expect(console.error).toHaveBeenCalledWith('[WeeklyScheduler] Alerta para a TI não saiu:', expect.any(Error));
  });

  it('outro erro (não CycleLoadError) não restaura o marcador nem alerta, e a ocorrência não repete', async () => {
    deps.runWeeklyCycle.mockRejectedValue(new Error('smtp caiu no meio'));
    const tick = novo();
    await tick();
    expect(deps.setCycleLastFiredAt).toHaveBeenCalledTimes(1);
    expect(deps.alert).not.toHaveBeenCalled();
    await tick();
    expect(deps.runWeeklyCycle).toHaveBeenCalledTimes(1);
  });
});
