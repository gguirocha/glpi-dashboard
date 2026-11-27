import { History, Loader2, RotateCw } from "lucide-react"
import type { ProjectEvent } from "@/types"
import { EVENT_KIND_LABELS, formatDateTime } from "./helpers"

export type TimelineState =
    | { status: "loading" }
    | { status: "ok"; events: ProjectEvent[] }
    | { status: "error"; error: string }

const KIND_STYLE: Record<string, string> = {
    bloqueio: "bg-rose-100 text-rose-800 dark:bg-rose-900/50 dark:text-rose-200",
    mudanca: "bg-amber-100 text-amber-900 dark:bg-amber-900/50 dark:text-amber-200",
    encerrado: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200",
}
const KIND_DEFAULT = "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/50 dark:text-indigo-200"

/** Linha do tempo do projeto (até 30 eventos, mais novo primeiro). */
export function ProjectTimeline({ state, onRetry }: { state: TimelineState; onRetry: () => void }) {
    return (
        <section aria-labelledby="timeline-title">
            <h4
                id="timeline-title"
                className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300 mb-2"
            >
                <History className="w-3.5 h-3.5" aria-hidden="true" />
                Linha do tempo
            </h4>

            {state.status === "loading" && (
                <p className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300" role="status">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" /> Carregando eventos…
                </p>
            )}

            {state.status === "error" && (
                <div className="flex items-center gap-2 text-xs text-rose-700 dark:text-rose-300" role="alert">
                    <span>Não foi possível carregar a linha do tempo: {state.error}</span>
                    <button
                        type="button"
                        onClick={onRetry}
                        className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-medium underline hover:no-underline"
                    >
                        <RotateCw className="w-3 h-3" aria-hidden="true" /> Tentar de novo
                    </button>
                </div>
            )}

            {state.status === "ok" && state.events.length === 0 && (
                <p className="text-xs text-slate-600 dark:text-slate-300">Nenhum evento registrado ainda.</p>
            )}

            {state.status === "ok" && state.events.length > 0 && (
                <ol className="relative border-l border-slate-200 dark:border-slate-700 ml-1.5 space-y-3">
                    {state.events.map((ev) => (
                        <li key={ev.id} className="ml-4">
                            <span
                                className="absolute -left-[5px] mt-1.5 h-2.5 w-2.5 rounded-full border-2 border-white dark:border-slate-800 bg-indigo-500"
                                aria-hidden="true"
                            />
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                                <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${KIND_STYLE[ev.kind] ?? KIND_DEFAULT}`}>
                                    {EVENT_KIND_LABELS[ev.kind] ?? ev.kind}
                                </span>
                                <time dateTime={ev.created_at} className="text-[11px] text-slate-600 dark:text-slate-300">
                                    {formatDateTime(ev.created_at)}
                                </time>
                                <span className="text-[11px] text-slate-600 dark:text-slate-300">· {ev.author}</span>
                            </div>
                            <p className="mt-0.5 text-xs text-slate-800 dark:text-slate-100 whitespace-pre-line break-words">
                                {ev.summary}
                            </p>
                        </li>
                    ))}
                </ol>
            )}
        </section>
    )
}
