import { AlertTriangle, CalendarClock, ChevronLeft, ChevronRight, Loader2, User } from "lucide-react"
import { PHASES } from "@/lib/projects/domain"
import type { Phase } from "@/lib/projects/domain"
import { PHASE_LABELS } from "@/lib/projects/board"
import type { CardInfo } from "@/lib/projects/board"
import type { Project, ProjectStatus } from "@/types"
import { HEALTH_DOT, HEALTH_LABELS, formatDateOnly, statusColor } from "./helpers"

export function StatusTag({ status }: { status: ProjectStatus }) {
    const color = statusColor(status.color)
    return (
        <span
            className="inline-flex items-center gap-1 max-w-full text-[11px] font-medium px-1.5 py-0.5 rounded-full border
                bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200"
            style={{ borderColor: color }}
        >
            <span className="h-2 w-2 rounded-full flex-shrink-0" style={{ backgroundColor: color }} aria-hidden="true" />
            <span className="truncate">{status.name}</span>
        </span>
    )
}

export function HealthDot({ health, reason, size = "sm" }: { health: Project["health"]; reason?: string | null; size?: "sm" | "md" }) {
    const label = `Saúde ${HEALTH_LABELS[health].toLowerCase()}${reason ? `: ${reason}` : ""}`
    return (
        <span
            role="img"
            aria-label={label}
            title={label}
            className={`inline-block rounded-full flex-shrink-0 ring-2 ring-white dark:ring-slate-800 ${HEALTH_DOT[health]}
                ${size === "md" ? "h-3.5 w-3.5" : "h-2.5 w-2.5"}`}
        />
    )
}

export function StepsBar({ done, total }: { done: number; total: number }) {
    if (total <= 0) return null
    const pct = Math.min(100, Math.max(0, Math.round((done / total) * 100)))
    return (
        <div className="flex items-center gap-2">
            <div
                role="progressbar"
                aria-label="Etapas concluídas"
                aria-valuemin={0}
                aria-valuemax={total}
                aria-valuenow={done}
                aria-valuetext={`${done} de ${total} etapas`}
                className="h-1.5 flex-1 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden"
            >
                <div className="h-full rounded-full bg-indigo-500" style={{ width: `${pct}%` }} />
            </div>
            <span className="text-[11px] font-semibold tabular-nums text-slate-700 dark:text-slate-200">
                {done}/{total}
            </span>
        </div>
    )
}

export function ProjectCard({
    project,
    info,
    status,
    pending,
    onOpen,
    onMove,
}: {
    project: Project
    info: CardInfo
    status?: ProjectStatus
    pending: boolean
    onOpen: () => void
    onMove: (phase: Phase) => void
}) {
    const idx = PHASES.indexOf(project.phase)
    const prev = idx > 0 ? PHASES[idx - 1] : null
    const next = idx >= 0 && idx < PHASES.length - 1 ? PHASES[idx + 1] : null
    const atraso = info.atrasoDias !== null && info.atrasoDias > 0 ? info.atrasoDias : null

    return (
        <article
            className="relative bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700
                hover:shadow-md hover:border-indigo-200 dark:hover:border-indigo-800 transition-all"
            aria-busy={pending}
        >
            <button
                type="button"
                onClick={onOpen}
                data-open-project={project.id}
                className="w-full text-left p-3 pb-2 rounded-t-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500"
                aria-label={`Abrir detalhes de ${project.code} — ${project.title}`}
            >
                <div className="flex items-start gap-2">
                    <span className="mt-1"><HealthDot health={info.saude} reason={project.health_reason} /></span>
                    <div className="min-w-0 flex-1">
                        <p className="text-[10px] font-mono font-semibold text-slate-500 dark:text-slate-400">{project.code}</p>
                        <p className="text-sm font-medium leading-snug text-slate-900 dark:text-slate-50 break-words">
                            {project.title}
                        </p>
                    </div>
                </div>

                {status && <div className="mt-2"><StatusTag status={status} /></div>}

                {project.steps_total > 0 && (
                    <div className="mt-2"><StepsBar done={project.steps_done} total={project.steps_total} /></div>
                )}

                <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px]">
                    {project.due_date && (
                        <span className="inline-flex items-center gap-1 text-slate-700 dark:text-slate-200">
                            <CalendarClock className="w-3 h-3" aria-hidden="true" />
                            <span className="sr-only">Previsto:</span>
                            {formatDateOnly(project.due_date)}
                        </span>
                    )}
                    {atraso !== null && (
                        <span
                            className="font-semibold text-amber-800 dark:text-amber-300"
                            title="Dias do previsto além do prazo prometido"
                        >
                            +{atraso} {atraso === 1 ? "dia" : "dias"}
                        </span>
                    )}
                    {info.vencido && (
                        <span className="inline-flex items-center gap-0.5 rounded bg-rose-600 px-1.5 py-0.5 text-[10px] font-bold uppercase text-white">
                            <AlertTriangle className="w-2.5 h-2.5" aria-hidden="true" /> vencido
                        </span>
                    )}
                </div>

                {project.owner && (
                    <p className="mt-1.5 flex items-center gap-1 text-[11px] text-slate-600 dark:text-slate-300">
                        <User className="w-3 h-3" aria-hidden="true" />
                        <span className="sr-only">Dono:</span>
                        {project.owner}
                    </p>
                )}
            </button>

            <div className="flex items-center justify-between px-2 py-1 border-t border-slate-100 dark:border-slate-700/60">
                <button
                    type="button"
                    disabled={!prev || pending}
                    onClick={() => prev && onMove(prev)}
                    className="p-1 rounded text-slate-500 dark:text-slate-400 hover:text-indigo-700 dark:hover:text-indigo-300
                        hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed"
                    aria-label={prev ? `Voltar ${project.code} para ${PHASE_LABELS[prev]}` : "Sem fase anterior"}
                    title={prev ? `Voltar para ${PHASE_LABELS[prev]}` : undefined}
                >
                    <ChevronLeft className="w-4 h-4" aria-hidden="true" />
                </button>
                {pending && (
                    <span className="inline-flex items-center gap-1 text-[11px] text-slate-600 dark:text-slate-300" role="status">
                        <Loader2 className="w-3 h-3 animate-spin" aria-hidden="true" /> salvando…
                    </span>
                )}
                <button
                    type="button"
                    disabled={!next || pending}
                    onClick={() => next && onMove(next)}
                    className="p-1 rounded text-slate-500 dark:text-slate-400 hover:text-indigo-700 dark:hover:text-indigo-300
                        hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed"
                    aria-label={next ? `Avançar ${project.code} para ${PHASE_LABELS[next]}` : "Sem próxima fase"}
                    title={next ? `Avançar para ${PHASE_LABELS[next]}` : undefined}
                >
                    <ChevronRight className="w-4 h-4" aria-hidden="true" />
                </button>
            </div>
        </article>
    )
}
