"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { supabase } from "@/lib/supabaseClient"
import { useAuth } from "@/context/AuthContext"
import { ALLOWED_BOARD_COLUMNS, boardIndicators, wipLimitFrom } from "@/lib/projects/board"
import type { Phase } from "@/lib/projects/domain"
import type { Project, ProjectEvent, ProjectStatus } from "@/types"
import { ProjectBoardView } from "./projects/ProjectBoardView"
import { GeneralReportSettingsModal } from "./projects/GeneralReportSettingsModal"
import { CONFLICT_MESSAGE, describeError, errorCode } from "./projects/errors"
import {
    EDITABLE_FIELDS,
    type ActionResult,
    type CreateStatusResult,
    type LoadEventsResult,
    type ProjectPatch,
} from "./projects/types"

/** Colunas da tabela de eventos que o papel authenticated pode ler (sem api_key_id). */
const EVENT_COLUMNS = "id,kind,summary,author,created_at"
const STATUS_COLUMNS = "id,name,color"
const MAX_EVENTS = 30
/** Cache em memória: o modo apresentação remonta o slide a cada volta e não deve reler o banco. */
const CACHE_TTL_MS = 5 * 60_000

type BoardData = { projects: Project[]; statuses: ProjectStatus[]; wipLimit: number; warning: string | null }
let boardCache: (BoardData & { fetchedAt: number }) | null = null

/** Mantém só os campos que a tela pode gravar (nunca status, code, phase...). */
function pickPatch(patch: ProjectPatch): ProjectPatch {
    const out: Record<string, unknown> = {}
    for (const k of EDITABLE_FIELDS) {
        if (Object.prototype.hasOwnProperty.call(patch, k)) out[k] = patch[k]
    }
    return out as ProjectPatch
}

const asProject = (row: unknown) => row as Project

/** Uma leitura de cada: projetos (colunas fixas), situações, limite WIP. Sem polling/realtime. */
async function fetchBoard(): Promise<BoardData> {
    const [proj, sts, cfg] = await Promise.all([
        supabase.from("dashboard_projects").select(ALLOWED_BOARD_COLUMNS).order("created_at", { ascending: false }),
        supabase.from("dashboard_project_statuses").select(STATUS_COLUMNS).order("name", { ascending: true }),
        supabase.from("dashboard_settings").select("value").eq("key", "projects_board").maybeSingle(),
    ])
    if (proj.error) throw proj.error
    const falhas: string[] = []
    if (sts.error) {
        describeError(sts.error, "Erro ao carregar situações")
        falhas.push("as situações")
    }
    if (cfg.error) {
        describeError(cfg.error, "Erro ao carregar limite WIP")
        falhas.push("o limite WIP (usando o padrão)")
    }
    return {
        projects: (proj.data ?? []).map(asProject),
        statuses: sts.error ? [] : ((sts.data ?? []) as ProjectStatus[]),
        wipLimit: wipLimitFrom(cfg.error ? null : cfg.data?.value),
        warning: falhas.length ? `Não foi possível carregar ${falhas.join(" e ")}.` : null,
    }
}

// ──────────────────────────────────────────────────
// ProjectBoard — container: lê/grava no Supabase e entrega para a view
// ──────────────────────────────────────────────────
export function ProjectBoard() {
    const { isAdmin } = useAuth()
    const [projects, setProjects] = useState<Project[]>(() => boardCache?.projects ?? [])
    const [statuses, setStatuses] = useState<ProjectStatus[]>(() => boardCache?.statuses ?? [])
    const [wipLimit, setWipLimit] = useState(() => boardCache?.wipLimit ?? wipLimitFrom(null))
    const [warning, setWarning] = useState<string | null>(() => boardCache?.warning ?? null)
    const [loading, setLoading] = useState(() => boardCache === null)
    const [refreshing, setRefreshing] = useState(false)
    const [loadError, setLoadError] = useState<string | null>(null)
    const [reloadKey, setReloadKey] = useState(0)
    const [settingsOpen, setSettingsOpen] = useState(false)
    const [now, setNow] = useState(() => new Date())
    const fetchedAt = useRef(boardCache?.fetchedAt ?? 0)
    // espelho do estado para desfazer o otimista sem depender de closure velha
    const projectsRef = useRef<Project[]>(projects)

    useEffect(() => {
        projectsRef.current = projects
        // o cache acompanha as edições locais; a idade continua sendo a da última leitura do banco
        if (!loading && !loadError) boardCache = { projects, statuses, wipLimit, warning, fetchedAt: fetchedAt.current }
    }, [projects, statuses, wipLimit, warning, loading, loadError])

    // Carga: cache fresco -> nada; velho -> mostra o cache e relê em segundo plano; reloadKey > 0 -> força.
    useEffect(() => {
        const fresh = boardCache !== null && Date.now() - boardCache.fetchedAt < CACHE_TTL_MS
        if (fresh && reloadKey === 0) return
        let alive = true
        fetchBoard().then(
            (d) => {
                if (!alive) return
                fetchedAt.current = Date.now()
                setProjects(d.projects)
                setStatuses(d.statuses)
                setWipLimit(d.wipLimit)
                setWarning(d.warning)
                setLoadError(null)
                setLoading(false)
                setRefreshing(false)
                setNow(new Date())
            },
            (err: unknown) => {
                if (!alive) return
                const msg = describeError(err, "Erro ao carregar o quadro")
                if (projectsRef.current.length > 0) setWarning(`Não foi possível atualizar o quadro: ${msg}`)
                else setLoadError(msg)
                setLoading(false)
                setRefreshing(false)
            },
        )
        return () => {
            alive = false
        }
    }, [reloadKey])

    // "Hoje" acompanha a volta para a aba (sem reler o banco)
    useEffect(() => {
        const tick = () => {
            if (document.visibilityState === "visible") setNow(new Date())
        }
        document.addEventListener("visibilitychange", tick)
        window.addEventListener("focus", tick)
        return () => {
            document.removeEventListener("visibilitychange", tick)
            window.removeEventListener("focus", tick)
        }
    }, [])

    const refresh = useCallback(() => {
        setRefreshing(true)
        setReloadKey((n) => n + 1)
    }, [])

    const retryLoad = useCallback(() => {
        setLoadError(null)
        setLoading(true)
        setReloadKey((n) => n + 1)
    }, [])

    const indicators = useMemo(() => boardIndicators(projects, now, wipLimit), [projects, now, wipLimit])

    const replaceRow = useCallback((row: Project) => {
        setProjects((prev) => prev.map((p) => (p.id === row.id ? row : p)))
    }, [])

    /** Relê uma linha (após conflito). Se sumiu, tira do quadro. */
    const reloadRow = useCallback(async (id: number) => {
        const { data, error } = await supabase
            .from("dashboard_projects")
            .select(ALLOWED_BOARD_COLUMNS)
            .eq("id", id)
            .maybeSingle()
        if (error) {
            describeError(error, "Erro ao reler projeto")
            return
        }
        if (data) replaceRow(asProject(data))
        else setProjects((prev) => prev.filter((p) => p.id !== id))
    }, [replaceRow])

    const onMovePhase = useCallback(async (project: Project, phase: Phase): Promise<ActionResult> => {
        const before = projectsRef.current.find((p) => p.id === project.id)
        if (!before || before.phase === phase) return null
        // Otimista: só a fase; status/completed_at chegam da trigger na releitura
        setProjects((prev) => prev.map((p) => (p.id === project.id ? { ...p, phase } : p)))
        const { data, error } = await supabase
            .from("dashboard_projects")
            .update({ phase })
            .eq("id", project.id)
            .select(ALLOWED_BOARD_COLUMNS)
            .single()
        if (error || !data) {
            // desfaz só a fase (não apaga outras mudanças que chegaram nesse meio tempo)
            setProjects((prev) => prev.map((p) => (p.id === project.id && p.phase === phase ? { ...p, phase: before.phase } : p)))
            return describeError(error, "Erro ao mover projeto")
        }
        replaceRow(asProject(data))
        return null
    }, [replaceRow])

    const onSave = useCallback(async (project: Project, patch: ProjectPatch): Promise<ActionResult> => {
        const clean = pickPatch(patch)
        if (Object.keys(clean).length === 0) return null
        // Trava otimista: só grava se ninguém mudou o projeto desde a leitura
        const { data, error } = await supabase
            .from("dashboard_projects")
            .update(clean)
            .eq("id", project.id)
            .eq("updated_at", project.updated_at)
            .select(ALLOWED_BOARD_COLUMNS)
            .single()
        if (errorCode(error) === "PGRST116" || (!error && !data)) {
            console.warn("Conflito ao salvar projeto", project.id)
            await reloadRow(project.id)
            return CONFLICT_MESSAGE
        }
        if (error || !data) return describeError(error, "Erro ao salvar projeto")
        replaceRow(asProject(data))
        return null
    }, [replaceRow, reloadRow])

    const onDelete = useCallback(async (id: number): Promise<ActionResult> => {
        const { error } = await supabase.from("dashboard_projects").delete().eq("id", id)
        if (error) return describeError(error, "Erro ao apagar projeto")
        setProjects((prev) => prev.filter((p) => p.id !== id))
        return null
    }, [])

    const onCreate = useCallback(async (title: string): Promise<ActionResult> => {
        // Só título e status: código, fase, início e o resto vêm do banco (defaults + trigger).
        const { data, error } = await supabase
            .from("dashboard_projects")
            .insert({ title: title.slice(0, 200), status: "todo" })
            .select(ALLOWED_BOARD_COLUMNS)
            .single()
        if (error || !data) return describeError(error, "Erro ao criar projeto")
        setProjects((prev) => [asProject(data), ...prev])
        return null
    }, [])

    const onCreateStatus = useCallback(async (name: string, color: string): Promise<CreateStatusResult> => {
        const { data, error } = await supabase
            .from("dashboard_project_statuses")
            .insert({ name, color })
            .select(STATUS_COLUMNS)
            .single()
        if (error || !data) {
            return {
                error: errorCode(error) === "23505" ? "Já existe uma situação com esse nome."
                    : describeError(error, "Erro ao criar situação"),
            }
        }
        const created = data as ProjectStatus
        setStatuses((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)))
        return { status: created }
    }, [])

    const onLoadEvents = useCallback(async (projectId: number): Promise<LoadEventsResult> => {
        const { data, error } = await supabase
            .from("dashboard_project_events")
            .select(EVENT_COLUMNS)
            .eq("project_id", projectId)
            .order("created_at", { ascending: false })
            .order("id", { ascending: false })
            .limit(MAX_EVENTS)
        if (error) return { error: describeError(error, "Erro ao carregar linha do tempo") }
        return { events: (data ?? []) as ProjectEvent[] }
    }, [])

    if (loading) {
        return <div className="text-center py-4 text-slate-600 dark:text-slate-300" role="status">Carregando quadro...</div>
    }

    if (loadError) {
        return (
            <div
                role="alert"
                className="mb-8 rounded-xl border border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/40 p-4 text-sm text-rose-800 dark:text-rose-200"
            >
                <p>Não foi possível carregar o quadro de projetos. {loadError}</p>
                <button
                    type="button"
                    onClick={retryLoad}
                    className="mt-2 text-xs font-medium underline hover:no-underline"
                >
                    Tentar de novo
                </button>
            </div>
        )
    }

    return (
        <>
            <ProjectBoardView
                projects={projects}
                statuses={statuses}
                indicators={indicators}
                now={now}
                warning={warning}
                refreshing={refreshing}
                onRefresh={refresh}
                onOpenSettings={isAdmin ? () => setSettingsOpen(true) : undefined}
                onMovePhase={onMovePhase}
                onSave={onSave}
                onDelete={onDelete}
                onCreate={onCreate}
                onCreateStatus={onCreateStatus}
                onLoadEvents={onLoadEvents}
            />
            <GeneralReportSettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
        </>
    )
}
