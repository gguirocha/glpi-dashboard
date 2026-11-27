"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { AlertTriangle, Loader2, Plus, RotateCw, Settings, X } from "lucide-react"
import { PHASES } from "@/lib/projects/domain"
import type { Phase } from "@/lib/projects/domain"
import { PHASE_LABELS, cardInfo, groupByPhase } from "@/lib/projects/board"
import type { BoardIndicators } from "@/lib/projects/board"
import type { Project, ProjectStatus } from "@/types"
import { BoardIndicatorsBar } from "./BoardIndicatorsBar"
import { ProjectCard } from "./ProjectCard"
import { ProjectPanel } from "./ProjectPanel"
import { PHASE_STYLES } from "./helpers"
import type { BoardActions } from "./types"

/** Encerrados mostrados por padrão: concluídos nos últimos N dias. */
const RECENT_CLOSED_DAYS = 30

export interface ProjectBoardViewProps extends BoardActions {
    projects: Project[]
    statuses: ProjectStatus[]
    indicators: BoardIndicators
    /** "Hoje" do quadro (fixo durante a sessão; a página de dev passa uma data fixa). */
    now: Date
    /** Mostra o botão de configuração do report geral. */
    onOpenSettings?: () => void
    /** Botão "atualizar": força a releitura do banco. */
    onRefresh?: () => void
    refreshing?: boolean
    /** Aviso discreto (ex.: situações ou limite WIP não carregaram). */
    warning?: string | null
}

export function ProjectBoardView({
    projects,
    statuses,
    indicators,
    now,
    onOpenSettings,
    onRefresh,
    refreshing = false,
    warning,
    onMovePhase,
    onSave,
    onDelete,
    onCreate,
    onCreateStatus,
    onLoadEvents,
}: ProjectBoardViewProps) {
    const [selectedId, setSelectedId] = useState<number | null>(null)
    const [pendingIds, setPendingIds] = useState<ReadonlySet<number>>(new Set())
    const [boardError, setBoardError] = useState<string | null>(null)
    const [showAllClosed, setShowAllClosed] = useState(false)
    const [isAdding, setIsAdding] = useState(false)
    const [newTitle, setNewTitle] = useState("")
    const [creating, setCreating] = useState(false)
    const [createError, setCreateError] = useState<string | null>(null)
    const [announcement, setAnnouncement] = useState("")
    // Foco pedido para depois do próximo commit (card que mudou de coluna, título da coluna após apagar).
    // Aplicado num efeito: roda depois que o <dialog> fecha (com ele aberto o resto da página é inert).
    const focusTarget = useRef<string | null>(null)
    useEffect(() => {
        const sel = focusTarget.current
        if (!sel || selectedId !== null) return
        const el = document.querySelector<HTMLElement>(sel)
        if (el) {
            el.focus()
            focusTarget.current = null
        }
    })

    const grouped = useMemo(() => groupByPhase(projects, now), [projects, now])
    const infos = useMemo(() => new Map(projects.map((p) => [p.id, cardInfo(p, now)])), [projects, now])
    const statusById = useMemo(() => new Map(statuses.map((s) => [s.id, s])), [statuses])

    const recentClosed = useMemo(() => {
        const corte = now.getTime() - RECENT_CLOSED_DAYS * 86_400_000
        return grouped.encerrado.filter((p) => {
            const t = p.completed_at ? Date.parse(p.completed_at) : NaN
            return !Number.isNaN(t) && t >= corte
        })
    }, [grouped, now])

    const selected = selectedId === null ? null : projects.find((p) => p.id === selectedId) ?? null
    const selectedInfo = selected ? infos.get(selected.id) ?? cardInfo(selected, now) : null

    async function move(project: Project, phase: Phase, fromCard: boolean): Promise<string | null> {
        if (pendingIds.has(project.id)) return null
        setBoardError(null)
        setPendingIds((s) => new Set(s).add(project.id))
        const err = await onMovePhase(project, phase)
        setPendingIds((s) => {
            const n = new Set(s)
            n.delete(project.id)
            return n
        })
        if (err) {
            setBoardError(`${project.code}: ${err}`)
            setAnnouncement(`Não foi possível mover ${project.code}.`)
        } else {
            setAnnouncement(`${project.code} movido para ${PHASE_LABELS[phase]}.`)
        }
        // o card troca de coluna (remonta): devolve o foco ao botão de abrir dele
        if (fromCard) focusTarget.current = `[data-open-project="${project.id}"]`
        return err
    }

    async function handleCreate() {
        const title = newTitle.trim()
        if (!title || creating) return
        setCreating(true)
        setCreateError(null)
        const err = await onCreate(title)
        setCreating(false)
        if (err) {
            setCreateError(err)
            return
        }
        setNewTitle("")
        setIsAdding(false)
    }


    return (
        <div className="bg-white dark:bg-slate-800 p-4 sm:p-6 rounded-xl shadow-sm border border-slate-100 dark:border-slate-700 mb-8 transition-colors">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100">Gestão de Projetos do Departamento</h3>
                <div className="flex items-center gap-2">
                    {onRefresh && (
                        <button
                            type="button"
                            onClick={onRefresh}
                            disabled={refreshing}
                            className="text-slate-500 dark:text-slate-400 hover:text-indigo-700 dark:hover:text-indigo-300 p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700/50 disabled:opacity-50"
                            aria-label="Atualizar quadro"
                            title="Atualizar quadro (relê o banco)"
                        >
                            <RotateCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} aria-hidden="true" />
                        </button>
                    )}
                    {onOpenSettings && (
                        <button
                            type="button"
                            onClick={onOpenSettings}
                            className="text-slate-500 dark:text-slate-400 hover:text-indigo-700 dark:hover:text-indigo-300 p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700/50"
                            aria-label="Configurações do Status Report Geral"
                            title="Configurações do Status Report Geral (admin)"
                        >
                            <Settings className="w-4 h-4" aria-hidden="true" />
                        </button>
                    )}
                    {!isAdding && (
                        <button
                            type="button"
                            onClick={() => setIsAdding(true)}
                            className="text-sm bg-indigo-600 text-white px-3 py-1.5 rounded-lg hover:bg-indigo-700 flex items-center"
                        >
                            <Plus className="w-4 h-4 mr-1" aria-hidden="true" /> Novo Projeto
                        </button>
                    )}
                </div>
            </div>

            {isAdding && (
                <div className="mb-4">
                    <div className="flex flex-wrap gap-2">
                        <label htmlFor="novo-projeto" className="sr-only">Nome do projeto</label>
                        <input
                            id="novo-projeto"
                            type="text"
                            maxLength={200}
                            value={newTitle}
                            onChange={(e) => setNewTitle(e.target.value)}
                            placeholder="Nome do projeto..."
                            className="flex-1 min-w-[12rem] border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 text-sm
                                bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 outline-none"
                            onKeyDown={(e) => {
                                if (e.key === "Enter") handleCreate()
                                if (e.key === "Escape") setIsAdding(false)
                            }}
                            autoFocus
                        />
                        <button
                            type="button"
                            onClick={handleCreate}
                            disabled={!newTitle.trim() || creating}
                            className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 inline-flex items-center gap-1"
                        >
                            {creating && <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />}
                            Adicionar
                        </button>
                        <button
                            type="button"
                            onClick={() => { setIsAdding(false); setCreateError(null) }}
                            className="text-slate-700 dark:text-slate-300 px-3 py-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg text-sm"
                        >
                            Cancelar
                        </button>
                    </div>
                    <p className="mt-1 text-[11px] text-slate-600 dark:text-slate-400">
                        O projeto entra em Abertura e recebe o código PRJ automaticamente.
                    </p>
                    {createError && <p role="alert" className="mt-1 text-xs text-rose-700 dark:text-rose-300">{createError}</p>}
                </div>
            )}

            <BoardIndicatorsBar indicators={indicators} />

            {warning && (
                <p className="mb-3 flex items-center gap-1.5 text-xs text-amber-800 dark:text-amber-300">
                    <AlertTriangle className="w-3.5 h-3.5" aria-hidden="true" /> {warning}
                </p>
            )}

            <div className="sr-only" aria-live="polite" aria-atomic="true">{announcement}</div>

            {boardError && (
                <div
                    role="alert"
                    className="mb-4 flex items-start justify-between gap-2 rounded-md border border-rose-300 dark:border-rose-800
                        bg-rose-50 dark:bg-rose-950/40 px-3 py-2 text-sm text-rose-800 dark:text-rose-200"
                >
                    <span>Não foi possível mover o projeto — {boardError}</span>
                    <button type="button" onClick={() => setBoardError(null)} aria-label="Fechar mensagem de erro">
                        <X className="w-4 h-4" aria-hidden="true" />
                    </button>
                </div>
            )}

            <div className="relative flex gap-3 overflow-x-auto pb-2 custom-scrollbar" role="list" aria-label="Fases do projeto">
                {PHASES.map((phase) => {
                    const all = grouped[phase]
                    const isClosed = phase === "encerrado"
                    const visible = isClosed && !showAllClosed ? recentClosed : all
                    const style = PHASE_STYLES[phase]
                    return (
                        <section
                            key={phase}
                            role="listitem"
                            aria-labelledby={`coluna-${phase}`}
                            className={`flex-1 min-w-[15.5rem] max-w-[22rem] rounded-xl border p-3 flex flex-col ${style.column}`}
                        >
                            <h4
                                id={`coluna-${phase}`}
                                tabIndex={-1}
                                className="mb-3 flex items-center justify-between gap-2 font-semibold text-sm text-slate-800 dark:text-slate-100"
                            >
                                <span className="flex items-center gap-2">
                                    <span className={`h-2.5 w-2.5 rounded-full ${style.accent}`} aria-hidden="true" />
                                    {PHASE_LABELS[phase]}
                                </span>
                                <span
                                    className="bg-white dark:bg-slate-800 px-2 py-0.5 rounded-full text-xs tabular-nums text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700"
                                    aria-label={`${all.length} projetos`}
                                >
                                    {all.length}
                                </span>
                            </h4>

                            <div className="space-y-2.5 max-h-[640px] overflow-y-auto pr-1 custom-scrollbar">
                                {visible.length === 0 && (
                                    <p className="text-xs text-slate-600 dark:text-slate-400 text-center py-6">
                                        {isClosed && all.length > 0 ? "Nenhum encerrado nos últimos 30 dias." : "Nenhum projeto."}
                                    </p>
                                )}
                                {visible.map((p) => (
                                    <ProjectCard
                                        key={p.id}
                                        project={p}
                                        info={infos.get(p.id) ?? cardInfo(p, now)}
                                        status={p.real_status_id !== null ? statusById.get(p.real_status_id) : undefined}
                                        pending={pendingIds.has(p.id)}
                                        onOpen={() => setSelectedId(p.id)}
                                        onMove={(ph) => { void move(p, ph, true) }}
                                    />
                                ))}
                            </div>

                            {isClosed && all.length > recentClosed.length && (
                                <button
                                    type="button"
                                    onClick={() => setShowAllClosed((v) => !v)}
                                    className="mt-3 text-xs font-medium text-emerald-800 dark:text-emerald-300 hover:underline self-center"
                                    aria-expanded={showAllClosed}
                                >
                                    {showAllClosed ? "ver só os últimos 30 dias" : `ver todos (${all.length})`}
                                </button>
                            )}
                        </section>
                    )
                })}
            </div>

            {selected && selectedInfo && (
                <ProjectPanel
                    key={selected.id}
                    project={selected}
                    info={selectedInfo}
                    statuses={statuses}
                    now={now}
                    movingPhase={pendingIds.has(selected.id)}
                    onClose={() => setSelectedId(null)}
                    onMovePhase={(phase) => move(selected, phase, false)}
                    onSave={(patch) => onSave(selected, patch)}
                    onDelete={async () => {
                        const { code, phase } = selected
                        const err = await onDelete(selected.id)
                        if (!err) {
                            setSelectedId(null)
                            setAnnouncement(`${code} apagado.`)
                            focusTarget.current = `#coluna-${phase}`
                        }
                        return err
                    }}
                    onCreateStatus={onCreateStatus}
                    onLoadEvents={onLoadEvents}
                />
            )}
        </div>
    )
}
