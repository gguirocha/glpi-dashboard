import type { Project } from '@/types';
import { PHASE_LABELS, cardInfo } from './board';
import { PHASES, parseDateOnly } from './domain';
import type { EventKind, Health, Phase } from './domain';

export type ReportEvent = { project_id: number; kind: EventKind; summary: string; created_at: string };
export type StatusNames = Record<number, string>;

export type ProjectFacts = {
  projectId: number;
  code: string;
  title: string;
  owner: string | null;
  fase: string;
  saude: Health;
  saudeMotivo: string | null;
  situacao: string | null;
  etapas: string | null;
  proximo: string | null;
  decisao: string | null;
  prometido: string | null;
  previsto: string | null;
  desvioDias: number | null;
  vencido: boolean;
};

export type ExceptionItem = { facts: ProjectFacts; motivos: string[] };
export type DeliveryItem = { projectId: number; code: string; title: string; entregas: string[] };
export type RenderedEmail = { subject: string; text: string; html: string };

const STATUS_BLOQUEADO = 5;
const STATUS_AGUARDANDO = 12;
const DAY_MS = 86_400_000;
const DELIVERY_KINDS: readonly EventKind[] = ['g2', 'g3', 'g4', 'encerrado'];
const HEALTH_ORDER: Record<Health, number> = { vermelho: 0, amarelo: 1, verde: 2 };
const HEALTH_COLOR: Record<Health, string> = { verde: '#16a34a', amarelo: '#ca8a04', vermelho: '#dc2626' };
const DEFAULT_MOTIVO = 'previsto passou do prometido';

const phaseOf = (p: Project): Phase => ((PHASES as readonly string[]).includes(p.phase) ? p.phase : 'abertura');
const clean = (s: string | null | undefined): string | null => {
  const t = typeof s === 'string' ? s.trim() : '';
  return t === '' ? null : t;
};
const pad = (n: number) => String(n).padStart(2, '0');
const fmtDate = (d: Date) => `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
const fmtDateOnly = (s: string | null): string | null => {
  const d = parseDateOnly(s);
  return d ? fmtDate(d) : null;
};
const timeOf = (ts: string | null | undefined): number | null => {
  if (!ts) return null;
  const t = Date.parse(ts);
  return Number.isNaN(t) ? null : t;
};
const plural = (n: number, one: string, many: string) => `${n} ${Math.abs(n) === 1 ? one : many}`;

export function projectFacts(p: Project, statusNames: StatusNames, hoje: Date): ProjectFacts {
  const info = cardInfo(p, hoje);
  const total = p.steps_total;
  const motivoDeclarado = clean(p.health_reason);
  const subiuPorAtraso = info.saude === 'amarelo' && p.health === 'verde';
  return {
    projectId: p.id,
    code: p.code,
    title: p.title,
    owner: p.owner ?? null,
    fase: PHASE_LABELS[phaseOf(p)],
    saude: info.saude,
    saudeMotivo: motivoDeclarado ?? (subiuPorAtraso ? DEFAULT_MOTIVO : null),
    situacao: (p.real_status_id !== null && statusNames[p.real_status_id]) || null,
    etapas: total > 0 && info.etapasPct !== null ? `${p.steps_done}/${total} (${info.etapasPct}%)` : null,
    proximo: clean(p.next_step),
    decisao: clean(p.decision_needed),
    prometido: fmtDateOnly(p.baseline_date),
    previsto: fmtDateOnly(p.due_date),
    desvioDias: info.atrasoDias,
    vencido: info.vencido,
  };
}

function motivosOf(p: Project, f: ProjectFacts): string[] {
  const m: string[] = [];
  if (f.saude === 'vermelho') m.push(f.saudeMotivo ? `Saúde vermelha: ${f.saudeMotivo}` : 'Saúde vermelha');
  const atrasado = f.desvioDias !== null && f.desvioDias > 0;
  // A saúde que só subiu para amarelo por atraso já aparece na linha do atraso: não repetir.
  if (f.saude === 'amarelo' && !(f.saudeMotivo === DEFAULT_MOTIVO && atrasado)) {
    m.push(f.saudeMotivo ? `Saúde amarela: ${f.saudeMotivo}` : 'Saúde amarela');
  }
  if (f.desvioDias !== null && f.desvioDias > 0) {
    m.push(`Atraso de ${plural(f.desvioDias, 'dia', 'dias')} sobre o prometido`);
  }
  if (f.vencido) m.push(`Prazo previsto vencido em ${f.previsto}`);
  if (p.real_status_id === STATUS_BLOQUEADO) m.push('Bloqueado');
  if (p.real_status_id === STATUS_AGUARDANDO) m.push('Aguardando retorno');
  if (f.decisao) m.push(`Decisão pedida: ${f.decisao}`);
  return m;
}

export function selectExceptions(projects: Project[], statusNames: StatusNames, hoje: Date): ExceptionItem[] {
  const items: ExceptionItem[] = [];
  for (const p of projects) {
    if (phaseOf(p) === 'encerrado') continue;
    const facts = projectFacts(p, statusNames, hoje);
    const motivos = motivosOf(p, facts);
    if (motivos.length > 0) items.push({ facts, motivos });
  }
  return items.sort((a, b) => {
    const byHealth = HEALTH_ORDER[a.facts.saude] - HEALTH_ORDER[b.facts.saude];
    if (byHealth !== 0) return byHealth;
    const da = a.facts.desvioDias;
    const db = b.facts.desvioDias;
    if (da !== db) {
      if (da === null) return 1;
      if (db === null) return -1;
      return db - da;
    }
    return a.facts.projectId - b.facts.projectId;
  });
}

export function selectDeliveries(projects: Project[], events: ReportEvent[], desde: Date, ate: Date): DeliveryItem[] {
  const t0 = desde.getTime();
  const t1 = ate.getTime();
  const inWindow = (t: number | null): t is number => t !== null && t >= t0 && t < t1;

  const byProject = new Map<number, { t: number; summary: string; kind: EventKind }[]>();
  for (const e of events) {
    if (!DELIVERY_KINDS.includes(e.kind)) continue;
    const t = timeOf(e.created_at);
    const summary = clean(e.summary);
    if (!inWindow(t) || summary === null) continue;
    const list = byProject.get(e.project_id) ?? [];
    list.push({ t, summary, kind: e.kind });
    byProject.set(e.project_id, list);
  }

  const out: DeliveryItem[] = [];
  for (const p of projects) {
    const evs = (byProject.get(p.id) ?? []).sort((a, b) => a.t - b.t);
    const entregas = evs.map((e) => e.summary);
    const done = timeOf(p.completed_at);
    if (p.phase === 'encerrado' && inWindow(done) && !evs.some((e) => e.kind === 'encerrado')) {
      entregas.push(`Projeto concluído em ${fmtDate(new Date(done))}`);
    }
    if (entregas.length > 0) out.push({ projectId: p.id, code: p.code, title: p.title, entregas });
  }
  return out.sort((a, b) => (a.code < b.code ? -1 : a.code > b.code ? 1 : a.projectId - b.projectId));
}

export function individualEligible(p: Project): boolean {
  if (cleanRecipients(p.report_emails).length === 0) return false;
  if (phaseOf(p) !== 'encerrado') return true;
  const done = timeOf(p.completed_at);
  if (done === null) return false;
  const sent = timeOf(p.last_individual_sent_at);
  return sent === null || sent < done;
}

const EMAIL_RE = /^[A-Za-z0-9._%+'-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
const MAX_RECIPIENTS = 20;

/** Destinatários válidos: trim, um endereço por item (sem vírgula/;/<>/espaço), sem duplicatas, no máximo 20. */
export function cleanRecipients(list: unknown): string[] {
  if (!Array.isArray(list)) return [];
  const out: string[] = [];
  for (const raw of list) {
    if (typeof raw !== 'string') continue;
    const e = raw.trim();
    if (e.length > 254 || !EMAIL_RE.test(e)) continue;
    if (!out.some((x) => x.toLowerCase() === e.toLowerCase())) out.push(e);
    if (out.length >= MAX_RECIPIENTS) break;
  }
  return out;
}

export function reportWindow(agora: Date): { desde: Date; ate: Date } {
  return { desde: new Date(agora.getTime() - 7 * DAY_MS), ate: new Date(agora.getTime()) };
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Assunto é cabeçalho: sem quebras de linha. */
const oneLine = (s: string) => s.replace(/[\r\n]+/g, ' ');

const multiline = (s: string) => escapeHtml(s.replace(/\r\n?/g, '\n')).replace(/\n/g, '<br>');

const FONT = "font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#111827;line-height:1.5;";
const dot = (h: Health) =>
  `<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${HEALTH_COLOR[h]};margin-right:6px;"></span>`;
const wrapHtml = (inner: string) =>
  `<!DOCTYPE html><html><body style="margin:0;padding:16px;background:#f3f4f6;${FONT}">` +
  `<div style="max-width:640px;margin:0 auto;background:#ffffff;padding:20px;border-radius:6px;">${inner}</div></body></html>`;
const row = (label: string, valueHtml: string) =>
  `<tr><td style="padding:6px 12px 6px 0;color:#6b7280;vertical-align:top;white-space:nowrap;">${escapeHtml(label)}</td>` +
  `<td style="padding:6px 0;vertical-align:top;">${valueHtml}</td></tr>`;

function desvioTexto(f: ProjectFacts): string {
  const d = f.desvioDias;
  if (f.vencido) return d !== null && d > 0 ? ` (${plural(d, 'dia', 'dias')} de atraso; previsto vencido)` : ' (previsto vencido)';
  if (d === null) return '';
  if (d > 0) return ` (${plural(d, 'dia', 'dias')} de atraso)`;
  if (d === 0) return ' (no prazo)';
  return ` (adiantado ${plural(-d, 'dia', 'dias')})`;
}

export function renderIndividual(facts: ProjectFacts, narrativa: string, semana: string, boardUrl: string): RenderedEmail {
  const subject = oneLine(`[Status Report] ${facts.code} ${facts.title} — semana de ${semana}`);
  const saude = facts.saudeMotivo ? `${facts.saude} — ${facts.saudeMotivo}` : facts.saude;
  const prazos = `${facts.prometido ?? '—'} x ${facts.previsto ?? '—'}${desvioTexto(facts)}`;
  const avanco = facts.etapas ?? 'sem etapas definidas';

  const lines: [string, string][] = [['Fase', facts.fase], ['Saúde', saude]];
  if (facts.situacao) lines.push(['Situação', facts.situacao]);
  lines.push(['Avanço', avanco], ['Prometido x Previsto', prazos], ['Próximo passo', facts.proximo ?? '—']);
  if (facts.decisao) lines.push(['Decisão pedida', facts.decisao]);

  const text = [
    `${facts.code} ${facts.title}`,
    '',
    ...lines.map(([k, v]) => `${k}: ${v}`),
    '',
    narrativa,
    '',
    `Quadro de projetos: ${boardUrl}`,
  ].join('\n');

  const rows = lines
    .map(([k, v]) => row(k, k === 'Saúde' ? `${dot(facts.saude)}${escapeHtml(v)}` : escapeHtml(v)))
    .join('');
  const html = wrapHtml(
    `<h2 style="margin:0 0 12px 0;font-size:18px;">${escapeHtml(facts.code)} ${escapeHtml(facts.title)}</h2>` +
      `<table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-bottom:16px;">${rows}</table>` +
      `<p style="margin:0 0 16px 0;">${multiline(narrativa)}</p>` +
      `<p style="margin:0;">Quadro de projetos: <a href="${escapeHtml(boardUrl)}" style="color:#2563eb;">${escapeHtml(boardUrl)}</a></p>`,
  );
  return { subject, text, html };
}

export function renderGeneral(input: {
  semana: string;
  resumo: string;
  exceptions: ExceptionItem[];
  deliveries: DeliveryItem[];
  ativos: number;
  boardUrl: string;
}): RenderedEmail {
  const { semana, resumo, exceptions, deliveries, ativos, boardUrl } = input;
  const subject = oneLine(`[Projetos] Exceções e entregas — semana de ${semana}`);
  const excTitle = `Pede atenção (${exceptions.length})`;
  const delTitle = `Entregas da semana (${deliveries.length})`;
  const ativosTxt = ativos === 1 ? "1 projeto ativo" : `${ativos} projetos ativos`;
  const rodape = `Lista completa: ${boardUrl} (${ativosTxt})`;
  const nenhumaExc = 'Nenhum projeto pede atenção nesta semana.';
  const nenhumaEnt = 'Nenhuma entrega registrada nesta semana.';

  const excHead = (f: ProjectFacts) => `${f.code} ${f.title} — ${f.fase} — ${f.owner ?? 'sem dono'}`;
  const excText = exceptions.length
    ? exceptions
        .map(({ facts: f, motivos }) =>
          [`- ${excHead(f)}`, ...motivos.map((m) => `    * ${m}`), `    Próximo passo: ${f.proximo ?? '—'}`].join('\n'),
        )
        .join('\n')
    : nenhumaExc;
  const delText = deliveries.length
    ? deliveries.map((d) => [`- ${d.code} ${d.title}`, ...d.entregas.map((e) => `    * ${e}`)].join('\n')).join('\n')
    : nenhumaEnt;
  const text = [resumo, '', excTitle, excText, '', delTitle, delText, '', rodape].join('\n');

  const h3 = (s: string) => `<h3 style="margin:20px 0 8px 0;font-size:16px;">${escapeHtml(s)}</h3>`;
  const ul = (items: string[]) =>
    `<ul style="margin:4px 0 0 0;padding-left:20px;">${items.map((i) => `<li style="margin:2px 0;">${i}</li>`).join('')}</ul>`;
  const excHtml = exceptions.length
    ? exceptions
        .map(
          ({ facts: f, motivos }) =>
            `<div style="margin:0 0 12px 0;padding:8px 10px;border-left:4px solid ${HEALTH_COLOR[f.saude]};background:#f9fafb;">` +
            `<div>${dot(f.saude)}<strong>${escapeHtml(excHead(f))}</strong></div>` +
            ul(motivos.map(escapeHtml)) +
            `<div style="margin-top:4px;color:#374151;">Próximo passo: ${escapeHtml(f.proximo ?? '—')}</div></div>`,
        )
        .join('')
    : `<p style="margin:0;">${nenhumaExc}</p>`;
  const delHtml = deliveries.length
    ? deliveries
        .map((d) => `<div style="margin:0 0 10px 0;"><strong>${escapeHtml(`${d.code} ${d.title}`)}</strong>${ul(d.entregas.map(escapeHtml))}</div>`)
        .join('')
    : `<p style="margin:0;">${nenhumaEnt}</p>`;
  const html = wrapHtml(
    `<p style="margin:0 0 8px 0;">${multiline(resumo)}</p>` +
      h3(excTitle) + excHtml + h3(delTitle) + delHtml +
      `<p style="margin:20px 0 0 0;">Lista completa: <a href="${escapeHtml(boardUrl)}" style="color:#2563eb;">${escapeHtml(boardUrl)}</a> (${ativosTxt})</p>`,
  );
  return { subject, text, html };
}
