import { PHASES, delayDays, effectiveHealth, parseDateOnly } from './domain';
import type { Health, Phase } from './domain';
import type { Project } from '@/types';

export const PHASE_LABELS: Record<Phase, string> = {
  abertura: 'Abertura',
  escopo: 'Escopo',
  execucao: 'Execução',
  seguranca: 'Segurança',
  homologacao: 'Homologação',
  encerrado: 'Encerrado',
};

export const ACTIVE_PHASES: readonly Phase[] = ['execucao', 'seguranca', 'homologacao'];

const STATUS_BLOQUEADO = 5;
const STATUS_AGUARDANDO = 12;
const DEFAULT_WIP = 8;
const LEAD_WINDOW_DAYS = 90;

export type CardInfo = {
  saude: Health;
  atrasoDias: number | null;
  vencido: boolean;
  etapasPct: number | null;
};

export type BoardIndicators = {
  emAndamento: number;
  wipLimit: number;
  wipExcedido: boolean;
  bloqueados: number;
  aguardandoRetorno: number;
  atrasados: number;
  entreguesNoMes: number;
  noPrazoPct: number | null;
  leadTimeMedioDias: number | null;
};

/** Colunas lidas de dashboard_projects pelo quadro (sem select *). */
export const ALLOWED_BOARD_COLUMNS = [
  'id', 'title', 'status', 'created_at', 'completed_at', 'due_date', 'weekly_update', 'report_emails',
  'owner', 'real_status_id', 'last_individual_sent_at', 'last_general_sent_at',
  'code', 'phase', 'health', 'health_reason', 'steps_total', 'steps_done', 'start_date', 'baseline_date',
  'requester', 'area', 'sponsor', 'origin_ticket', 'links', 'next_step', 'decision_needed', 'updated_at',
].join(',');

const HEALTH_ORDER: Record<Health, number> = { vermelho: 0, amarelo: 1, verde: 2 };

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

/** Data local de um timestamp como 'AAAA-MM-DD'; inválido/ausente -> null. */
function localDateStr(ts: string | null | undefined): string | null {
  if (!ts) return null;
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return null;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function cardInfo(p: Project, hoje: Date): CardInfo {
  const due = parseDateOnly(p.due_date);
  const total = p.steps_total;
  return {
    saude: effectiveHealth(p.health, p.baseline_date, p.due_date),
    atrasoDias: delayDays(p.baseline_date, p.due_date),
    vencido: due !== null && due < startOfDay(hoje) && p.phase !== 'encerrado',
    etapasPct: total > 0 ? Math.min(100, Math.max(0, Math.round((p.steps_done / total) * 100))) : null,
  };
}

const phaseOf = (p: Project): Phase => ((PHASES as readonly string[]).includes(p.phase) ? p.phase : 'abertura');

const cmpNullLast = (a: number | null, b: number | null, desc: boolean): number => {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return desc ? b - a : a - b;
};

const timeOf = (ts: string | null): number | null => {
  if (!ts) return null;
  const t = Date.parse(ts);
  return Number.isNaN(t) ? null : t;
};

export function groupByPhase(projects: Project[], hoje: Date): Record<Phase, Project[]> {
  const out = Object.fromEntries(PHASES.map((ph) => [ph, [] as Project[]])) as Record<Phase, Project[]>;
  const infos = new Map<Project, CardInfo>();
  for (const p of projects) {
    out[phaseOf(p)].push(p);
    infos.set(p, cardInfo(p, hoje));
  }
  out.encerrado.sort(
    (a, b) => cmpNullLast(timeOf(a.completed_at), timeOf(b.completed_at), true) || a.id - b.id,
  );
  for (const ph of PHASES) {
    if (ph === 'encerrado') continue;
    out[ph].sort((a, b) => {
      const ia = infos.get(a)!;
      const ib = infos.get(b)!;
      return (
        HEALTH_ORDER[ia.saude] - HEALTH_ORDER[ib.saude] ||
        cmpNullLast(ia.atrasoDias, ib.atrasoDias, true) ||
        cmpNullLast(parseDateOnly(a.due_date)?.getTime() ?? null, parseDateOnly(b.due_date)?.getTime() ?? null, false) ||
        a.id - b.id
      );
    });
  }
  return out;
}

export function boardIndicators(projects: Project[], agora: Date, wipLimit: number): BoardIndicators {
  const ativos = projects.filter((p) => (ACTIVE_PHASES as readonly string[]).includes(p.phase));
  const encerrados = projects.filter((p) => p.phase === 'encerrado');

  const atrasados = ativos.filter((p) => {
    const i = cardInfo(p, agora);
    return i.vencido || (i.atrasoDias !== null && i.atrasoDias > 0);
  }).length;

  const entregues = encerrados.filter((p) => {
    if (!p.completed_at) return false;
    const d = new Date(p.completed_at);
    return !Number.isNaN(d.getTime()) && d.getFullYear() === agora.getFullYear() && d.getMonth() === agora.getMonth();
  });
  const comBaseline = entregues.filter((p) => parseDateOnly(p.baseline_date) !== null);
  const noPrazo = comBaseline.filter((p) => {
    const d = localDateStr(p.completed_at);
    return d !== null && d <= (p.baseline_date as string);
  });

  const corte = agora.getTime() - LEAD_WINDOW_DAYS * 86_400_000;
  const leads: number[] = [];
  for (const p of encerrados) {
    const t = timeOf(p.completed_at);
    if (t === null || t < corte) continue;
    const dias = delayDays(p.start_date, localDateStr(p.completed_at));
    if (dias !== null) leads.push(dias);
  }

  return {
    emAndamento: ativos.length,
    wipLimit,
    wipExcedido: ativos.length > wipLimit,
    bloqueados: ativos.filter((p) => p.real_status_id === STATUS_BLOQUEADO).length,
    aguardandoRetorno: ativos.filter((p) => p.real_status_id === STATUS_AGUARDANDO).length,
    atrasados,
    entreguesNoMes: entregues.length,
    noPrazoPct: comBaseline.length ? Math.round((noPrazo.length / comBaseline.length) * 100) : null,
    leadTimeMedioDias: leads.length ? Math.round(leads.reduce((s, n) => s + n, 0) / leads.length) : null,
  };
}

/** Lê `{wip_limit}` (número ou texto numérico) -> inteiro 1..50; senão 8. */
export function wipLimitFrom(value: unknown): number {
  if (typeof value !== 'object' || value === null) return DEFAULT_WIP;
  const raw = (value as Record<string, unknown>).wip_limit;
  if (typeof raw !== 'number' && typeof raw !== 'string') return DEFAULT_WIP;
  if (typeof raw === 'string' && raw.trim() === '') return DEFAULT_WIP;
  const n = Math.floor(Number(raw));
  return Number.isFinite(n) && n >= 1 && n <= 50 ? n : DEFAULT_WIP;
}
