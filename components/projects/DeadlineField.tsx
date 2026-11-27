"use client"

import { AlertTriangle, CalendarClock, X } from "lucide-react"
import { parseDateOnly } from "@/lib/projects/domain"
import type { Project } from "@/types"

const DAY_MS = 86_400_000

/** Complemento curto ao lado da data: "atrasado 5d", "vence hoje", "faltam 3d"... */
function dueSuffix(project: Project, now: Date): { suffix: string; overdue: boolean } | null {
    const due = parseDateOnly(project.due_date)
    if (!due) return null

    // Encerrado: compara a entrega com o previsto, não com hoje
    if (project.phase === "encerrado") {
        const completed = project.completed_at ? new Date(project.completed_at) : null
        if (!completed || Number.isNaN(completed.getTime())) return { suffix: "", overdue: false }
        completed.setHours(0, 0, 0, 0)
        const lateDays = Math.round((completed.getTime() - due.getTime()) / DAY_MS)
        return lateDays > 0
            ? { suffix: `entregue ${lateDays}d depois`, overdue: false }
            : { suffix: "entregue no previsto", overdue: false }
    }

    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const diffDays = Math.round((due.getTime() - today.getTime()) / DAY_MS)
    if (diffDays < 0) return { suffix: `atrasado ${Math.abs(diffDays)}d`, overdue: true }
    if (diffDays === 0) return { suffix: "vence hoje", overdue: false }
    return { suffix: `faltam ${diffDays}d`, overdue: false }
}

/**
 * Prazo previsto (due_date). Salva na hora ao mudar a data.
 * O prometido (baseline_date) é outro campo e só muda pela API depois de definido.
 */
export function DeadlineField({
    project,
    now,
    disabled,
    onChange,
}: {
    project: Project
    now: Date
    disabled?: boolean
    onChange: (value: string) => void
}) {
    const value = project.due_date ? project.due_date.slice(0, 10) : ""
    const status = dueSuffix(project, now)
    const inputId = `previsto-${project.id}`

    if (!value) {
        return (
            <div
                className="flex items-center gap-1.5 w-max rounded-md border border-dashed px-2 py-1 transition-colors
                    border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300
                    hover:border-rose-300 dark:hover:border-rose-800/60 hover:text-rose-600 dark:hover:text-rose-400"
            >
                <CalendarClock className="w-3 h-3 flex-shrink-0" aria-hidden="true" />
                <label htmlFor={inputId} className="text-[10px] font-bold uppercase tracking-wider">Previsto</label>
                <input
                    id={inputId}
                    type="date"
                    value=""
                    disabled={disabled}
                    onChange={(e) => onChange(e.target.value)}
                    className="bg-transparent border-none text-xs p-0 m-0 focus:ring-0 cursor-pointer w-auto text-current"
                />
            </div>
        )
    }

    const overdue = status?.overdue ?? false

    return (
        <div
            className={`flex flex-wrap items-center gap-1.5 w-max max-w-full rounded-md border px-2 py-1 transition-colors
                ${overdue
                    ? "bg-rose-600 border-rose-700 text-white"
                    : "bg-rose-50 dark:bg-rose-900/30 border-rose-200 dark:border-rose-800/60 text-rose-800 dark:text-rose-200"
                }`}
        >
            {overdue
                ? <AlertTriangle className="w-3 h-3 flex-shrink-0" aria-hidden="true" />
                : <CalendarClock className="w-3 h-3 flex-shrink-0" aria-hidden="true" />}
            <label htmlFor={inputId} className="text-[10px] font-bold uppercase tracking-wider">Previsto</label>
            <input
                id={inputId}
                type="date"
                value={value}
                disabled={disabled}
                onChange={(e) => onChange(e.target.value)}
                className={`bg-transparent border-none text-xs font-semibold p-0 m-0 focus:ring-0 cursor-pointer w-auto
                    ${overdue ? "text-white [color-scheme:dark]" : "text-rose-800 dark:text-rose-200 dark:[color-scheme:dark]"}`}
            />
            {status?.suffix && (
                <span className={`text-[11px] font-medium ${overdue ? "text-rose-50" : "text-rose-700 dark:text-rose-300"}`}>
                    · {status.suffix}
                </span>
            )}
            <button
                type="button"
                disabled={disabled}
                onClick={() => {
                    if (window.confirm("Remover o prazo previsto deste projeto?")) onChange("")
                }}
                className={`ml-0.5 rounded transition-colors ${overdue ? "hover:text-rose-200" : "hover:text-rose-950 dark:hover:text-rose-50"}`}
                aria-label="Remover prazo previsto"
                title="Remover prazo previsto"
            >
                <X className="w-3 h-3" aria-hidden="true" />
            </button>
        </div>
    )
}
