import type { EventKind, Health, Phase } from "@/lib/projects/domain"

/** 'AAAA-MM-DD' -> 'DD/MM/AAAA' sem passar por Date (sem risco de fuso). */
export function formatDateOnly(s: string | null | undefined): string {
    if (!s) return "—"
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s)
    return m ? `${m[3]}/${m[2]}/${m[1]}` : "—"
}

/** Timestamp -> data/hora local curta. */
export function formatDateTime(ts: string): string {
    const d = new Date(ts)
    if (Number.isNaN(d.getTime())) return "—"
    return d.toLocaleString("pt-BR", {
        day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
    })
}

/** Timestamp -> 'AAAA-MM-DD' local (valor do <input type="date">). */
export function localDateInput(ts: string | null): string {
    if (!ts) return ""
    const d = new Date(ts)
    if (Number.isNaN(d.getTime())) return ""
    const pad = (n: number) => String(n).padStart(2, "0")
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** Só aceita URL absoluta http/https; qualquer outra coisa (javascript:, data:, relativa) -> null. */
export function safeHttpUrl(raw: unknown): string | null {
    if (typeof raw !== "string" || raw.trim() === "") return null
    try {
        const u = new URL(raw.trim())
        return u.protocol === "http:" || u.protocol === "https:" ? u.href : null
    } catch {
        return null
    }
}

/** Links do projeto válidos para abrir, na ordem gravada. */
export function safeLinks(links: unknown): { name: string; href: string }[] {
    if (typeof links !== "object" || links === null || Array.isArray(links)) return []
    const out: { name: string; href: string }[] = []
    for (const [name, value] of Object.entries(links as Record<string, unknown>)) {
        const href = safeHttpUrl(value)
        if (href) out.push({ name, href })
    }
    return out
}

export const EVENT_KIND_LABELS: Record<EventKind, string> = {
    aberto: "Aberto",
    g1: "G1",
    g2: "G2",
    g3: "G3",
    g4: "G4",
    encerrado: "Encerrado",
    mudanca: "Mudança",
    bloqueio: "Bloqueio",
    atualizacao: "Atualização",
}

export const HEALTH_LABELS: Record<Health, string> = {
    verde: "Verde",
    amarelo: "Amarelo",
    vermelho: "Vermelho",
}

export const HEALTH_DOT: Record<Health, string> = {
    verde: "bg-emerald-500",
    amarelo: "bg-amber-400",
    vermelho: "bg-rose-600",
}

export const PHASE_STYLES: Record<Phase, { column: string; accent: string }> = {
    abertura: {
        column: "bg-slate-50 dark:bg-slate-900/60 border-slate-200 dark:border-slate-700",
        accent: "bg-slate-400",
    },
    escopo: {
        column: "bg-sky-50/70 dark:bg-sky-950/30 border-sky-100 dark:border-sky-900/60",
        accent: "bg-sky-500",
    },
    execucao: {
        column: "bg-blue-50/70 dark:bg-blue-950/30 border-blue-100 dark:border-blue-900/60",
        accent: "bg-blue-600",
    },
    seguranca: {
        column: "bg-violet-50/70 dark:bg-violet-950/30 border-violet-100 dark:border-violet-900/60",
        accent: "bg-violet-600",
    },
    homologacao: {
        column: "bg-amber-50/70 dark:bg-amber-950/30 border-amber-100 dark:border-amber-900/60",
        accent: "bg-amber-500",
    },
    encerrado: {
        column: "bg-emerald-50/70 dark:bg-emerald-950/30 border-emerald-100 dark:border-emerald-900/60",
        accent: "bg-emerald-600",
    },
}

/** Cor de etiqueta vinda do catálogo; só aceita hex (#rgb/#rrggbb), senão índigo. */
export function statusColor(color: string | null | undefined): string {
    return typeof color === "string" && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(color) ? color : "#6366f1"
}

export const MAX_EMAILS = 20
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Valida e acrescenta um e-mail à lista (minúsculo, sem repetir, até MAX_EMAILS). */
export function addEmail(list: string[], raw: string): { list: string[] } | { error: string } {
    const email = raw.trim().toLowerCase()
    if (!email) return { error: "Digite um e-mail." }
    if (email.length > 254 || !EMAIL_RE.test(email)) return { error: "E-mail inválido." }
    if (list.includes(email)) return { error: "E-mail já está na lista." }
    if (list.length >= MAX_EMAILS) return { error: `No máximo ${MAX_EMAILS} destinatários.` }
    return { list: [...list, email] }
}
