// lib/tickets.ts
// Camada de acesso a dashboard_tickets com foco em EGRESS.
//
// ⚠️  CONTEXTO (incidente medido no Supabase)
// O dashboard puxava `select('*')` da janela inteira a cada 5 min (~575 KB por
// ciclo, 21 colunas). Isso sozinho estourou o egress do plano free (13,5 GB).
//
// Modelo atual:
//   1. Fetch completo UMA vez por janela de datas (só as colunas que a UI usa).
//   2. Depois, apenas o DELTA: linhas com `last_updated` maior que o maior já
//      visto. Quando nada muda, a resposta é `[]` — poucos bytes.
//   3. O resultado fica em localStorage, então F5 não recomeça do zero.
//
// Regra de ouro: NUNCA usar select('*') aqui.

import { supabase } from "@/lib/supabaseClient";
import { Ticket } from "@/types";

/**
 * Colunas realmente consumidas pela UI (+ last_updated, que é o cursor do delta).
 * Auditado contra Dashboard.tsx/KPICard.tsx: `date_closed`, `priority_id`,
 * `slas_id_ttr`, `recipient_name`, `time_to_create` e `solution_type` não são
 * lidos em lugar nenhum e por isso ficam de fora.
 */
export const TICKET_COLUMNS = [
    "id",
    "name",
    "date_creation",
    "date_solved",
    "status_id",
    "status_label",
    "priority_label",
    "category_name",
    "location_name",
    "department_name",
    "time_to_resolve",
    "is_sla_violated",
    "count_cless_one_hour",
    "sla_time_limit",
    "last_updated",
].join(",");

/** Intervalo do poll em background. Configurável via env (build-time). */
export const REFRESH_INTERVAL_MS = Number(
    process.env.NEXT_PUBLIC_TICKETS_REFRESH_MS ?? 60_000
);

/** Reconciliação de deleções — `last_updated` não detecta linha removida. */
export const RECONCILE_INTERVAL_MS = 60 * 60 * 1000; // 1h

export type DateWindow = { start: string; end: string };

/**
 * Cursor usado quando a carga inicial não produziu nenhum `last_updated`
 * (janela sem tickets, ou linhas sem a coluna preenchida).
 *
 * Sem isso o cursor ficaria null e o poll incremental nunca rodaria — o
 * dashboard congelaria até um F5. Com o epoch, o primeiro delta simplesmente
 * traz tudo que existir na janela (que é ~nada, justamente por estar vazia).
 */
export const EPOCH_CURSOR = "1970-01-01T00:00:00Z";

/**
 * Limites da janela convertidos para UTC.
 *
 * `date_creation` no Supabase é UTC REAL desde 25/08/2026 — antes o sync do n8n
 * gravava o relógio local do GLPI rotulado como UTC, e o erro se cancelava com
 * a string ingênua usada aqui. Agora não cancela mais: mandar
 * `2026-08-25T00:00:00` faria o PostgREST ler como UTC e o dia sairia 3h
 * deslocado (chamado aberto às 22h cairia no dia seguinte).
 *
 * `new Date("YYYY-MM-DDTHH:mm:ss")` sem sufixo de fuso é interpretado como hora
 * LOCAL pelo JS, então o toISOString() abaixo dá a borda exata do dia do
 * usuário.
 */
function applyWindow<T>(query: T, w: DateWindow): T {
    const start = new Date(`${w.start}T00:00:00`).toISOString();
    const end = new Date(`${w.end}T23:59:59.999`).toISOString();
    // @ts-expect-error — encadeamento do PostgrestFilterBuilder
    return query.gte("date_creation", start).lte("date_creation", end);
}

// ──────────────────────────────────────────────────────────────────────────────
// Fetches
// ──────────────────────────────────────────────────────────────────────────────

/** Carga inicial de uma janela. Só roda quando não há cache válido. */
export async function fetchTicketsFull(w: DateWindow): Promise<Ticket[]> {
    const { data, error } = await applyWindow(
        supabase.from("dashboard_tickets").select(TICKET_COLUMNS),
        w
    );
    if (error) throw error;
    return (data ?? []) as unknown as Ticket[];
}

/**
 * Só o que mudou desde `since`. Em regime normal devolve [] (egress ~0).
 * O filtro de janela continua aplicado para não trazer alterações de tickets
 * que nem estão na tela.
 */
export async function fetchTicketsDelta(w: DateWindow, since: string): Promise<Ticket[]> {
    const { data, error } = await applyWindow(
        supabase.from("dashboard_tickets").select(TICKET_COLUMNS),
        w
    )
        .gt("last_updated", since)
        .order("last_updated", { ascending: true });

    if (error) throw error;
    return (data ?? []) as unknown as Ticket[];
}

/**
 * Só a CONTAGEM da janela — nenhuma linha trafega (head + count exact devolve o
 * número no header Content-Range, corpo vazio).
 *
 * Usado na janela de comparação: a UI só precisa do total do mês anterior para
 * calcular o % de variação. Antes puxávamos o mês inteiro de linhas para fazer
 * um `.length` no navegador.
 */
export async function fetchTicketCount(w: DateWindow): Promise<number> {
    const { count, error } = await applyWindow(
        supabase.from("dashboard_tickets").select("id", { count: "exact", head: true }),
        w
    );
    if (error) throw error;
    return count ?? 0;
}

/** Só os ids da janela — usado para detectar tickets deletados no GLPI. */
export async function fetchTicketIds(w: DateWindow): Promise<Set<number>> {
    const { data, error } = await applyWindow(
        supabase.from("dashboard_tickets").select("id"),
        w
    );
    if (error) throw error;
    return new Set(((data ?? []) as { id: number }[]).map((r) => r.id));
}

// ──────────────────────────────────────────────────────────────────────────────
// Merge / cursor
// ──────────────────────────────────────────────────────────────────────────────

/** Upsert por id, preservando a ordem de chegada dos que já existiam. */
export function mergeTickets(current: Ticket[], incoming: Ticket[]): Ticket[] {
    if (incoming.length === 0) return current;

    const byId = new Map<number, Ticket>();
    for (const t of current) byId.set(t.id, t);
    for (const t of incoming) byId.set(t.id, t);
    return Array.from(byId.values());
}

/** Maior `last_updated` da lista (ignora nulos). Volta `fallback` se não houver. */
export function maxLastUpdated(list: Ticket[], fallback: string | null): string | null {
    let max = fallback;
    for (const t of list) {
        const lu = t.last_updated;
        if (!lu) continue;
        if (!max || lu > max) max = lu;
    }
    return max;
}

// ──────────────────────────────────────────────────────────────────────────────
// Cache local — evita refetch completo a cada F5
// ──────────────────────────────────────────────────────────────────────────────

/**
 * v2: os timestamps passaram a ser UTC real (25/08/2026). Um cache v1 guarda
 * datas 3h deslocadas e um cursor na convenção antiga, então tem que ser
 * descartado — não dá para migrar linha a linha.
 */
const CACHE_PREFIX = "glpi_tickets_v2_";
const LEGACY_PREFIXES = ["glpi_tickets_v1_"];
const MAX_CACHED_WINDOWS = 4;

/** Limpa caches de versões anteriores (uma vez, no primeiro acesso). */
function dropLegacyCache(): void {
    if (typeof window === "undefined") return;
    const stale: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && LEGACY_PREFIXES.some((p) => k.startsWith(p))) stale.push(k);
    }
    for (const k of stale) localStorage.removeItem(k);
}

export type CachedWindow = {
    tickets: Ticket[];
    /** Total do mês anterior (só o número — as linhas nunca são baixadas). */
    prevTotal: number;
    lastSeen: string | null;
    savedAt: number;
};

function cacheKey(current: DateWindow, previous: DateWindow): string {
    return `${CACHE_PREFIX}${current.start}_${current.end}__${previous.start}_${previous.end}`;
}

function ourKeys(): string[] {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k?.startsWith(CACHE_PREFIX)) keys.push(k);
    }
    return keys;
}

export function readTicketsCache(current: DateWindow, previous: DateWindow): CachedWindow | null {
    if (typeof window === "undefined") return null;
    try {
        dropLegacyCache();
        const raw = localStorage.getItem(cacheKey(current, previous));
        if (!raw) return null;
        const parsed = JSON.parse(raw) as CachedWindow;
        if (!Array.isArray(parsed.tickets) || typeof parsed.prevTotal !== "number") return null;
        return parsed;
    } catch {
        return null;
    }
}

export function writeTicketsCache(
    current: DateWindow,
    previous: DateWindow,
    payload: Omit<CachedWindow, "savedAt">
): void {
    if (typeof window === "undefined") return;
    const key = cacheKey(current, previous);
    const body = JSON.stringify({ ...payload, savedAt: Date.now() });

    try {
        localStorage.setItem(key, body);
        pruneCache(key);
    } catch {
        // Provavelmente quota estourada: limpa o que é nosso e tenta uma vez mais.
        try {
            for (const k of ourKeys()) localStorage.removeItem(k);
            localStorage.setItem(key, body);
        } catch {
            // Sem cache o app continua funcionando — só volta a fazer fetch completo.
        }
    }
}

/** Mantém no máximo MAX_CACHED_WINDOWS janelas, descartando as mais antigas. */
function pruneCache(keep: string): void {
    const keys = ourKeys().filter((k) => k !== keep);
    if (keys.length + 1 <= MAX_CACHED_WINDOWS) return;

    const aged = keys
        .map((k) => {
            try {
                return { k, savedAt: (JSON.parse(localStorage.getItem(k) ?? "{}").savedAt as number) ?? 0 };
            } catch {
                return { k, savedAt: 0 };
            }
        })
        .sort((a, b) => a.savedAt - b.savedAt);

    for (const { k } of aged.slice(0, keys.length + 1 - MAX_CACHED_WINDOWS)) {
        localStorage.removeItem(k);
    }
}
