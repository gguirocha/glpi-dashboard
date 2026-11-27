export const PHASES = ['abertura', 'escopo', 'execucao', 'seguranca', 'homologacao', 'encerrado'] as const;
export type Phase = (typeof PHASES)[number];

export const HEALTHS = ['verde', 'amarelo', 'vermelho'] as const;
export type Health = (typeof HEALTHS)[number];

export const EVENT_KINDS = [
  'aberto', 'g1', 'g2', 'g3', 'g4', 'encerrado', 'mudanca', 'bloqueio', 'atualizacao',
] as const;
export type EventKind = (typeof EVENT_KINDS)[number];

export function statusForPhase(phase: Phase): 'todo' | 'in_progress' | 'done' {
  if (phase === 'abertura' || phase === 'escopo') return 'todo';
  if (phase === 'encerrado') return 'done';
  return 'in_progress';
}

/** 'AAAA-MM-DD' como meia-noite local; inválido -> null. */
export function parseDateOnly(s: string | null | undefined): Date | null {
  if (typeof s !== 'string') return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const date = new Date(y, mo - 1, d);
  if (date.getFullYear() !== y || date.getMonth() !== mo - 1 || date.getDate() !== d) return null;
  return date;
}

/** Dias (inteiros) de forecast - baseline; positivo = atraso. */
export function delayDays(baseline: string | null, forecast: string | null): number | null {
  const b = parseDateOnly(baseline);
  const f = parseDateOnly(forecast);
  if (!b || !f) return null;
  // UTC dos componentes locais: imune a mudança de horário de verão.
  const utc = (d: Date) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  return Math.round((utc(f) - utc(b)) / 86_400_000);
}

const HEALTH_RANK: Record<Health, number> = { verde: 0, amarelo: 1, vermelho: 2 };

export function effectiveHealth(health: Health, baseline: string | null, forecast: string | null): Health {
  const delay = delayDays(baseline, forecast);
  if (delay !== null && delay > 0 && HEALTH_RANK[health] < HEALTH_RANK.amarelo) return 'amarelo';
  return health;
}
