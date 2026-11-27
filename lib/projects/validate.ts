import { EVENT_KINDS, HEALTHS, PHASES, parseDateOnly } from './domain';
import type { EventKind, Health, Phase } from './domain';

export type ProjectFields = {
  title: string;
  owner: string | null;
  phase: Phase;
  health: Health;
  health_reason: string | null;
  steps_total: number;
  steps_done: number;
  due_date: string | null;
  baseline_date: string | null;
  requester: string | null;
  area: string | null;
  sponsor: string | null;
  origin_ticket: string | null;
  links: Record<string, string> | null;
  next_step: string | null;
  decision_needed: string | null;
  weekly_update: string | null;
  real_status_id: number | null;
};

export type CreateProjectFields = Partial<ProjectFields> & { title: string };

export type EventInput = { kind: EventKind; summary: string };

type Result<T> = { ok: true; value: T } | { ok: false; error: string };
type FieldResult = { ok: true; value: unknown } | { ok: false; error: string };

const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });
const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const NUL_MSG = (field: string) => `Campo ${field} não pode conter caractere nulo (U+0000).`;

const text = (field: string, max: number, required = false) => (v: unknown): FieldResult => {
  if (v === null && !required) return { ok: true, value: null };
  if (typeof v !== 'string') return fail(`Campo ${field} deve ser texto.`);
  if (v.includes('\u0000')) return fail(NUL_MSG(field));
  const s = v.trim();
  if (s === '') {
    return required ? fail(`Campo ${field} não pode ser vazio.`) : { ok: true, value: null };
  }
  if (s.length > max) return fail(`Campo ${field} excede ${max} caracteres.`);
  return { ok: true, value: s };
};

const oneOf = (field: string, list: readonly string[]) => (v: unknown): FieldResult =>
  typeof v === 'string' && list.includes(v) ? { ok: true, value: v } : fail(`Campo ${field} com valor inválido.`);

const int = (field: string, min: number, max: number) => (v: unknown): FieldResult =>
  typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max
    ? { ok: true, value: v }
    : fail(`Campo ${field} deve ser inteiro entre ${min} e ${max}.`);

const dateField = (field: string) => (v: unknown): FieldResult => {
  if (v === null) return { ok: true, value: null };
  return typeof v === 'string' && parseDateOnly(v) !== null
    ? { ok: true, value: v }
    : fail(`Campo ${field} deve ser data válida AAAA-MM-DD.`);
};

const realStatus = (v: unknown): FieldResult =>
  v === null ? { ok: true, value: null } : int('real_status_id', 1, 2147483647)(v);

const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const CONTROL_RE = /[\u0000-\u001f\u007f]/;

const validLinkUrl = (url: string): boolean => {
  try {
    const p = new URL(url).protocol;
    return p === 'http:' || p === 'https:';
  } catch {
    return false;
  }
};

const links = (v: unknown): FieldResult => {
  if (v === null) return { ok: true, value: null };
  if (!isPlainObject(v)) return fail('Campo links deve ser objeto.');
  const entries = Object.entries(v);
  if (entries.length > 10) return fail('Campo links aceita no máximo 10 itens.');
  const out: Record<string, string> = Object.create(null);
  for (const [k, url] of entries) {
    if (FORBIDDEN_KEYS.has(k)) return fail('Nome de link não permitido.');
    if (k.includes('\u0000')) return fail(NUL_MSG('links'));
    if (k.length < 1 || k.length > 50) return fail('Nome de link deve ter de 1 a 50 caracteres.');
    if (typeof url !== 'string') return fail('Link deve ser URL http(s) de até 500 caracteres.');
    if (url.includes('\u0000')) return fail(NUL_MSG('links'));
    if (url.length > 500 || CONTROL_RE.test(url) || !validLinkUrl(url)) {
      return fail('Link deve ser URL http(s) válida, sem caracteres de controle, de até 500 caracteres.');
    }
    out[k] = url;
  }
  return { ok: true, value: out };
};

const FIELDS: Record<keyof ProjectFields, (v: unknown) => FieldResult> = {
  title: text('title', 200, true),
  owner: text('owner', 100),
  phase: oneOf('phase', PHASES),
  health: oneOf('health', HEALTHS),
  health_reason: text('health_reason', 500),
  steps_total: int('steps_total', 0, 100),
  steps_done: int('steps_done', 0, 100),
  due_date: dateField('due_date'),
  baseline_date: dateField('baseline_date'),
  requester: text('requester', 200),
  area: text('area', 200),
  sponsor: text('sponsor', 200),
  origin_ticket: text('origin_ticket', 200),
  links,
  next_step: text('next_step', 1000),
  decision_needed: text('decision_needed', 1000),
  weekly_update: text('weekly_update', 4000),
  real_status_id: realStatus,
};

function parseProject(input: unknown): Result<Partial<ProjectFields>> {
  if (!isPlainObject(input)) return fail('Campo project deve ser objeto.');
  const out: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(input)) {
    if (!Object.prototype.hasOwnProperty.call(FIELDS, key)) {
      return fail(`Campo desconhecido em project: ${key.slice(0, 50)}.`);
    }
    const r = FIELDS[key as keyof ProjectFields](raw);
    if (!r.ok) return r;
    out[key] = r.value;
  }
  const done = out.steps_done;
  const total = out.steps_total;
  if (typeof done === 'number' && typeof total === 'number' && done > total) {
    return fail('steps_done não pode exceder steps_total.');
  }
  return { ok: true, value: out as Partial<ProjectFields> };
}

function parseEvent(input: unknown): Result<EventInput> {
  if (!isPlainObject(input)) return fail('Campo event deve ser objeto.');
  for (const key of Object.keys(input)) {
    if (key !== 'kind' && key !== 'summary') return fail(`Campo desconhecido em event: ${key.slice(0, 50)}.`);
  }
  const kind = oneOf('event.kind', EVENT_KINDS)(input.kind);
  if (!kind.ok) return kind;
  const summary = text('event.summary', 2000, true)(input.summary);
  if (!summary.ok) return summary;
  return { ok: true, value: { kind: kind.value as EventKind, summary: summary.value as string } };
}

function parseBody(body: unknown): Result<{ project?: Partial<ProjectFields>; event?: EventInput }> {
  if (!isPlainObject(body)) return fail('Corpo da requisição deve ser um objeto JSON.');
  for (const key of Object.keys(body)) {
    if (key !== 'project' && key !== 'event') return fail(`Campo desconhecido: ${key.slice(0, 50)}.`);
  }
  const value: { project?: Partial<ProjectFields>; event?: EventInput } = {};
  if (body.project !== undefined) {
    const p = parseProject(body.project);
    if (!p.ok) return p;
    value.project = p.value;
  }
  if (body.event !== undefined) {
    const e = parseEvent(body.event);
    if (!e.ok) return e;
    value.event = e.value;
  }
  return { ok: true, value };
}

export function parseCreate(body: unknown): Result<{ project: CreateProjectFields; event?: EventInput }> {
  const r = parseBody(body);
  if (!r.ok) return r;
  const project = r.value.project;
  if (!project || typeof project.title !== 'string') return fail('Campo title é obrigatório.');
  const result: { project: CreateProjectFields; event?: EventInput } = { project: { ...project, title: project.title } };
  if (r.value.event) result.event = r.value.event;
  return { ok: true, value: result };
}

export function parseUpdate(body: unknown): Result<{ project: Partial<ProjectFields>; event?: EventInput }> {
  const r = parseBody(body);
  if (!r.ok) return r;
  const project = r.value.project ?? {};
  if (Object.keys(project).length === 0 && !r.value.event) {
    return fail('Informe ao menos um campo de project ou um event.');
  }
  const result: { project: Partial<ProjectFields>; event?: EventInput } = { project };
  if (r.value.event) result.event = r.value.event;
  return { ok: true, value: result };
}
