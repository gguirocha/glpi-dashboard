"use client"

import { useEffect, useRef, useState } from "react"
import {
    CheckCircle2, ExternalLink, FileText, Flag, Loader2, Lock, Mail, Save, Tag, Trash2, User, X,
} from "lucide-react"
import { HEALTHS, PHASES } from "@/lib/projects/domain"
import type { Health, Phase } from "@/lib/projects/domain"
import { PHASE_LABELS } from "@/lib/projects/board"
import type { CardInfo } from "@/lib/projects/board"
import type { Project, ProjectStatus } from "@/types"
import { DeadlineField } from "./DeadlineField"
import { HealthDot, StatusTag, StepsBar } from "./ProjectCard"
import { ProjectTimeline, type TimelineState } from "./ProjectTimeline"
import { HEALTH_LABELS, MAX_EMAILS, addEmail, formatDateOnly, localDateInput, safeLinks } from "./helpers"
import { ModalDialog } from "./ModalDialog"
import type { ActionResult, CreateStatusResult, LoadEventsResult, ProjectPatch } from "./types"

const inputCls = `w-full text-xs border border-slate-300 dark:border-slate-600 rounded-md px-2.5 py-1.5
    bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-500 dark:placeholder:text-slate-400
    focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all disabled:opacity-60`
const labelCls = "flex items-center gap-1 text-xs font-medium text-slate-700 dark:text-slate-300 mb-1"
const sectionTitleCls = "text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300 mb-2"

type Notice = { kind: "error" | "ok"; text: string } | null

function Field({ label, value }: { label: string; value: string | null }) {
    return (
        <div className="min-w-0">
            <dt className="text-[11px] text-slate-600 dark:text-slate-400">{label}</dt>
            <dd className="text-xs font-medium text-slate-900 dark:text-slate-100 break-words">{value || "—"}</dd>
        </div>
    )
}

export function ProjectPanel({
    project,
    info,
    statuses,
    now,
    movingPhase,
    onClose,
    onMovePhase,
    onSave,
    onDelete,
    onCreateStatus,
    onLoadEvents,
}: {
    project: Project
    info: CardInfo
    statuses: ProjectStatus[]
    now: Date
    movingPhase: boolean
    onClose: () => void
    onMovePhase: (phase: Phase) => Promise<ActionResult>
    onSave: (patch: ProjectPatch) => Promise<ActionResult>
    onDelete: () => Promise<ActionResult>
    onCreateStatus: (name: string, color: string) => Promise<CreateStatusResult>
    onLoadEvents: (projectId: number) => Promise<LoadEventsResult>
}) {
    // Formulário (inicializado do projeto; o pai monta o painel com key = id)
    const [update, setUpdate] = useState(project.weekly_update ?? "")
    const [owner, setOwner] = useState(project.owner ?? "")
    const [emails, setEmails] = useState<string[]>(project.report_emails ?? [])
    const [emailInput, setEmailInput] = useState("")
    const [emailError, setEmailError] = useState<string | null>(null)
    const [realStatusId, setRealStatusId] = useState<number | null>(project.real_status_id ?? null)
    const [nextStep, setNextStep] = useState(project.next_step ?? "")
    const [decision, setDecision] = useState(project.decision_needed ?? "")
    const [health, setHealth] = useState<Health>(project.health)
    const [healthReason, setHealthReason] = useState(project.health_reason ?? "")
    const [baselineInput, setBaselineInput] = useState("")

    const [saving, setSaving] = useState(false)
    const [quickSaving, setQuickSaving] = useState(false)
    const [deleting, setDeleting] = useState(false)
    const [notice, setNotice] = useState<Notice>(null)

    // Criar situação inline
    const [creatingStatus, setCreatingStatus] = useState(false)
    const [newStatusName, setNewStatusName] = useState("")
    const [newStatusColor, setNewStatusColor] = useState("#6366f1")
    const [creatingBusy, setCreatingBusy] = useState(false)

    // Linha do tempo: carregada uma vez ao abrir (e no "tentar de novo")
    const [timeline, setTimeline] = useState<TimelineState>({ status: "loading" })
    const [timelineReload, setTimelineReload] = useState(0)
    const loadEventsRef = useRef(onLoadEvents)
    useEffect(() => {
        loadEventsRef.current = onLoadEvents
    }, [onLoadEvents])
    useEffect(() => {
        let alive = true
        loadEventsRef.current(project.id).then(
            (r) => {
                if (!alive) return
                setTimeline("events" in r ? { status: "ok", events: r.events } : { status: "error", error: r.error })
            },
            (err: unknown) => {
                if (!alive) return
                console.error("Erro ao carregar linha do tempo:", err)
                setTimeline({ status: "error", error: "falha de comunicação. Tente de novo." })
            },
        )
        return () => {
            alive = false
        }
    }, [project.id, timelineReload])

    const titleId = `painel-titulo-${project.id}`
    const currentStatus = statuses.find((s) => s.id === project.real_status_id)
    const links = safeLinks(project.links)
    const desvio = info.atrasoDias

    // Só o que mudou em relação ao projeto: é o que vai para o banco e o que conta como "não salvo"
    const changes: ProjectPatch = {}
    const nz = (v: string) => v.trim() || null
    if (nz(update) !== (project.weekly_update ?? null)) changes.weekly_update = nz(update)
    if (nz(owner) !== (project.owner ?? null)) changes.owner = nz(owner)
    if (realStatusId !== (project.real_status_id ?? null)) changes.real_status_id = realStatusId
    if (JSON.stringify(emails) !== JSON.stringify(project.report_emails ?? [])) changes.report_emails = emails
    if (nz(nextStep) !== (project.next_step ?? null)) changes.next_step = nz(nextStep)
    if (nz(decision) !== (project.decision_needed ?? null)) changes.decision_needed = nz(decision)
    if (health !== project.health) changes.health = health
    if (nz(healthReason) !== (project.health_reason ?? null)) changes.health_reason = nz(healthReason)
    const hasUnsavedChanges = Object.keys(changes).length > 0

    function requestClose() {
        if (hasUnsavedChanges && !window.confirm("Há alterações não salvas neste projeto. Fechar e descartar?")) return
        onClose()
    }

    function show(kind: "error" | "ok", text: string) {
        setNotice({ kind, text })
    }

    function handleAddEmail() {
        const r = addEmail(emails, emailInput)
        if ("error" in r) {
            setEmailError(r.error)
            return
        }
        setEmails(r.list)
        setEmailInput("")
        setEmailError(null)
    }

    async function handleSave() {
        if (!hasUnsavedChanges) return
        setSaving(true)
        setNotice(null)
        const err = await onSave(changes)
        setSaving(false)
        if (err) show("error", err)
        else show("ok", "Alterações salvas.")
    }

    async function quickSave(patch: ProjectPatch, okText: string) {
        setQuickSaving(true)
        setNotice(null)
        const err = await onSave(patch)
        setQuickSaving(false)
        if (err) show("error", err)
        else show("ok", okText)
        return err
    }

    async function handleBaseline() {
        if (!baselineInput) return
        const ok = window.confirm(
            `Definir o prazo prometido em ${formatDateOnly(baselineInput)}?\n\n` +
            "Depois de definido, ele só muda pela API, com registro de mudança.",
        )
        if (!ok) return
        const err = await quickSave({ baseline_date: baselineInput }, "Prazo prometido definido.")
        if (!err) setBaselineInput("")
    }

    async function handlePhase(phase: Phase) {
        if (phase === project.phase) return
        setNotice(null)
        const err = await onMovePhase(phase)
        if (err) show("error", err)
    }

    async function handleDelete() {
        const ok = window.confirm(`Apagar o projeto ${project.code} — "${project.title}"? Isso não pode ser desfeito.`)
        if (!ok) return
        setDeleting(true)
        setNotice(null)
        const err = await onDelete()
        setDeleting(false)
        if (err) show("error", err)
        // sucesso: o pai remove o projeto e fecha o painel
    }

    async function createInlineStatus() {
        const name = newStatusName.trim()
        if (!name) return
        setCreatingBusy(true)
        const r = await onCreateStatus(name, newStatusColor)
        setCreatingBusy(false)
        if ("error" in r) {
            show("error", `Não foi possível criar a situação: ${r.error}`)
            return
        }
        setRealStatusId(r.status.id)
        setCreatingStatus(false)
        setNewStatusName("")
    }

    return (
        <ModalDialog
            onRequestClose={requestClose}
            labelledBy={titleId}
            className="my-0 mr-0 ml-auto h-full max-h-full w-full max-w-xl overflow-y-auto p-0 border-0 border-l
                border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-2xl
                backdrop:bg-black/40"
        >
            <div className="min-h-full">
                {/* Cabeçalho */}
                <div className="sticky top-0 z-10 bg-white/95 dark:bg-slate-800/95 backdrop-blur border-b border-slate-200 dark:border-slate-700 px-5 py-3">
                    <div className="flex items-start gap-3">
                        <span className="mt-1.5"><HealthDot health={info.saude} reason={project.health_reason} size="md" /></span>
                        <div className="min-w-0 flex-1">
                            <p className="text-[11px] font-mono font-semibold text-slate-600 dark:text-slate-400">{project.code}</p>
                            <h3 id={titleId} className="text-base font-bold leading-snug text-slate-900 dark:text-slate-50 break-words">
                                {project.title}
                            </h3>
                        </div>
                        <button
                            type="button"
                            data-autofocus
                            onClick={requestClose}
                            className="p-1.5 rounded text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-700"
                            aria-label="Fechar painel do projeto"
                        >
                            <X className="w-4 h-4" aria-hidden="true" />
                        </button>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                        <label htmlFor={`fase-${project.id}`} className="text-xs font-medium text-slate-700 dark:text-slate-300">Fase</label>
                        <select
                            id={`fase-${project.id}`}
                            value={project.phase}
                            disabled={movingPhase}
                            onChange={(e) => handlePhase(e.target.value as Phase)}
                            className="text-xs border border-slate-300 dark:border-slate-600 rounded-md px-2 py-1
                                bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-indigo-500 outline-none"
                        >
                            {PHASES.map((ph) => <option key={ph} value={ph}>{PHASE_LABELS[ph]}</option>)}
                        </select>
                        {movingPhase && <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-500" aria-label="Movendo" />}
                        {currentStatus && <StatusTag status={currentStatus} />}
                    </div>
                    {project.steps_total > 0 && (
                        <div className="mt-2 max-w-xs"><StepsBar done={project.steps_done} total={project.steps_total} /></div>
                    )}
                </div>

                <div className="px-5 py-4 space-y-5">
                    {notice && (
                        <div
                            role={notice.kind === "error" ? "alert" : "status"}
                            className={`flex items-start justify-between gap-2 rounded-md border px-3 py-2 text-xs
                                ${notice.kind === "error"
                                    ? "bg-rose-50 dark:bg-rose-950/40 border-rose-300 dark:border-rose-800 text-rose-800 dark:text-rose-200"
                                    : "bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200"}`}
                        >
                            <span>{notice.text}</span>
                            <button type="button" onClick={() => setNotice(null)} aria-label="Fechar mensagem">
                                <X className="w-3.5 h-3.5" aria-hidden="true" />
                            </button>
                        </div>
                    )}

                    {/* Identificação */}
                    <section>
                        <h4 className={sectionTitleCls}>Identificação</h4>
                        <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
                            <Field label="Solicitante" value={project.requester} />
                            <Field label="Área" value={project.area} />
                            <Field label="Patrocinador" value={project.sponsor} />
                            <Field label="Chamado de origem" value={project.origin_ticket} />
                            <Field label="Início" value={project.start_date ? formatDateOnly(project.start_date) : null} />
                            <Field label="Dono" value={project.owner} />
                        </dl>
                        {links.length > 0 && (
                            <ul className="mt-3 flex flex-wrap gap-1.5" aria-label="Links do projeto">
                                {links.map((l) => (
                                    <li key={l.name}>
                                        <a
                                            href={l.href}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="inline-flex items-center gap-1 rounded-md border border-indigo-200 dark:border-indigo-800
                                                bg-indigo-50 dark:bg-indigo-950/40 px-2 py-0.5 text-xs font-medium
                                                text-indigo-800 dark:text-indigo-200 hover:bg-indigo-100 dark:hover:bg-indigo-900/60"
                                        >
                                            {l.name}
                                            <ExternalLink className="w-3 h-3" aria-hidden="true" />
                                            <span className="sr-only">(abre em nova aba)</span>
                                        </a>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </section>

                    {/* Prazos */}
                    <section>
                        <h4 className={sectionTitleCls}>Prazos</h4>
                        <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-3 space-y-3">
                            <div>
                                <p className="text-[11px] text-slate-600 dark:text-slate-400 mb-1">Prometido (linha de base)</p>
                                {project.baseline_date ? (
                                    <p className="flex items-center gap-1.5 text-xs">
                                        <span className="font-semibold text-slate-900 dark:text-slate-100">{formatDateOnly(project.baseline_date)}</span>
                                        <span className="inline-flex items-center gap-1 text-slate-600 dark:text-slate-400">
                                            <Lock className="w-3 h-3" aria-hidden="true" />
                                            prometido só muda pela API, com registro de mudança
                                        </span>
                                    </p>
                                ) : (
                                    <div className="flex flex-wrap items-center gap-1.5">
                                        <label htmlFor={`prometido-${project.id}`} className="sr-only">Prazo prometido</label>
                                        <input
                                            id={`prometido-${project.id}`}
                                            type="date"
                                            value={baselineInput}
                                            onChange={(e) => setBaselineInput(e.target.value)}
                                            className={`${inputCls} w-auto dark:[color-scheme:dark]`}
                                        />
                                        <button
                                            type="button"
                                            onClick={handleBaseline}
                                            disabled={!baselineInput || quickSaving}
                                            className="text-xs font-medium px-2.5 py-1.5 rounded-md bg-slate-100 dark:bg-slate-700
                                                text-slate-800 dark:text-slate-100 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 disabled:opacity-50"
                                        >
                                            Definir prometido
                                        </button>
                                        <span className="text-[11px] text-slate-600 dark:text-slate-400">depois de definido, só muda pela API</span>
                                    </div>
                                )}
                            </div>
                            <div>
                                <p className="text-[11px] text-slate-600 dark:text-slate-400 mb-1">Previsto</p>
                                <DeadlineField
                                    project={project}
                                    now={now}
                                    disabled={quickSaving}
                                    onChange={(v) => quickSave({ due_date: v || null }, "Prazo previsto salvo.")}
                                />
                            </div>
                            {desvio !== null && (
                                <p className={`text-xs font-medium ${desvio > 0
                                    ? "text-amber-800 dark:text-amber-300"
                                    : "text-emerald-700 dark:text-emerald-300"}`}
                                >
                                    Desvio: {desvio > 0
                                        ? `+${desvio} ${desvio === 1 ? "dia" : "dias"} além do prometido`
                                        : desvio === 0 ? "no prometido" : `${Math.abs(desvio)} ${desvio === -1 ? "dia" : "dias"} antes do prometido`}
                                </p>
                            )}
                            {project.phase === "encerrado" && (
                                <div className="flex items-center gap-2">
                                    <label htmlFor={`concluido-${project.id}`} className="text-[11px] text-slate-600 dark:text-slate-400">
                                        Concluído em
                                    </label>
                                    <input
                                        id={`concluido-${project.id}`}
                                        type="date"
                                        value={localDateInput(project.completed_at)}
                                        disabled={quickSaving}
                                        onChange={(e) => {
                                            const v = e.target.value
                                            if (!v) return
                                            // meio-dia local: a data não "volta um dia" ao virar UTC
                                            const iso = new Date(`${v}T12:00:00`).toISOString()
                                            quickSave({ completed_at: iso }, "Data de conclusão salva.")
                                        }}
                                        className={`${inputCls} w-auto dark:[color-scheme:dark]`}
                                    />
                                </div>
                            )}
                        </div>
                    </section>

                    {/* Acompanhamento (edição) */}
                    <section>
                        <h4 className={sectionTitleCls}>Acompanhamento</h4>
                        <div className="space-y-3 bg-slate-50 dark:bg-slate-900/50 rounded-lg p-3 border border-slate-200 dark:border-slate-700/60">
                            <div className="grid grid-cols-1 sm:grid-cols-[9rem_1fr] gap-2">
                                <div>
                                    <label htmlFor={`saude-${project.id}`} className={labelCls}>Saúde</label>
                                    <select
                                        id={`saude-${project.id}`}
                                        value={health}
                                        onChange={(e) => setHealth(e.target.value as Health)}
                                        className={inputCls}
                                    >
                                        {HEALTHS.map((h) => <option key={h} value={h}>{HEALTH_LABELS[h]}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label htmlFor={`motivo-${project.id}`} className={labelCls}>Motivo da saúde</label>
                                    <input
                                        id={`motivo-${project.id}`}
                                        type="text"
                                        maxLength={500}
                                        value={healthReason}
                                        onChange={(e) => setHealthReason(e.target.value)}
                                        placeholder="Por que está assim?"
                                        className={inputCls}
                                    />
                                </div>
                            </div>
                            {info.saude !== project.health && (
                                <p className="text-[11px] text-amber-800 dark:text-amber-300">
                                    Saúde efetiva: {HEALTH_LABELS[info.saude].toLowerCase()} — previsto além do prometido.
                                </p>
                            )}

                            <div>
                                <label htmlFor={`proximo-${project.id}`} className={labelCls}>
                                    <Flag className="w-3 h-3" aria-hidden="true" /> Próximo passo
                                </label>
                                <textarea
                                    id={`proximo-${project.id}`}
                                    rows={2}
                                    maxLength={1000}
                                    value={nextStep}
                                    onChange={(e) => setNextStep(e.target.value)}
                                    className={`${inputCls} resize-y leading-relaxed`}
                                />
                            </div>
                            <div>
                                <label htmlFor={`decisao-${project.id}`} className={labelCls}>Decisão pedida</label>
                                <textarea
                                    id={`decisao-${project.id}`}
                                    rows={2}
                                    maxLength={1000}
                                    value={decision}
                                    onChange={(e) => setDecision(e.target.value)}
                                    placeholder="O que precisa ser decidido, e por quem?"
                                    className={`${inputCls} resize-y leading-relaxed`}
                                />
                            </div>

                            <div>
                                <label htmlFor={`dono-${project.id}`} className={labelCls}>
                                    <User className="w-3 h-3" aria-hidden="true" /> Responsável
                                </label>
                                <input
                                    id={`dono-${project.id}`}
                                    type="text"
                                    value={owner}
                                    onChange={(e) => setOwner(e.target.value)}
                                    placeholder="Nome do responsável..."
                                    className={inputCls}
                                />
                            </div>

                            <div>
                                <label htmlFor={`situacao-${project.id}`} className={labelCls}>
                                    <Tag className="w-3 h-3" aria-hidden="true" /> Situação
                                </label>
                                <div className="flex gap-1.5">
                                    <select
                                        id={`situacao-${project.id}`}
                                        value={realStatusId ?? ""}
                                        onChange={(e) => setRealStatusId(e.target.value === "" ? null : Number(e.target.value))}
                                        className={`${inputCls} flex-1`}
                                    >
                                        <option value="">— Não classificado —</option>
                                        {statuses.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                                    </select>
                                    <button
                                        type="button"
                                        onClick={() => setCreatingStatus((v) => !v)}
                                        className="text-xs bg-slate-100 dark:bg-slate-700 hover:bg-indigo-100 dark:hover:bg-indigo-900/40
                                            text-slate-700 dark:text-slate-200 px-2.5 py-1.5 rounded-md font-medium"
                                        aria-label="Criar nova situação"
                                        aria-expanded={creatingStatus}
                                    >
                                        +
                                    </button>
                                </div>
                                {creatingStatus && (
                                    <div className="mt-2 p-2 rounded-md bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 space-y-2">
                                        <div className="flex gap-1.5 items-center">
                                            <input
                                                type="text"
                                                value={newStatusName}
                                                onChange={(e) => setNewStatusName(e.target.value)}
                                                placeholder="Nome da situação..."
                                                aria-label="Nome da nova situação"
                                                autoFocus
                                                className={`${inputCls} flex-1`}
                                                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), createInlineStatus())}
                                            />
                                            <input
                                                type="color"
                                                value={newStatusColor}
                                                onChange={(e) => setNewStatusColor(e.target.value)}
                                                className="w-7 h-7 rounded border border-slate-300 dark:border-slate-600 cursor-pointer"
                                                aria-label="Cor da nova situação"
                                            />
                                        </div>
                                        <div className="flex gap-1.5">
                                            <button
                                                type="button"
                                                onClick={createInlineStatus}
                                                disabled={!newStatusName.trim() || creatingBusy}
                                                className="flex-1 text-xs bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50
                                                    text-white px-2 py-1 rounded-md font-medium flex items-center justify-center gap-1"
                                            >
                                                {creatingBusy
                                                    ? <Loader2 className="w-3 h-3 animate-spin" aria-hidden="true" />
                                                    : <CheckCircle2 className="w-3 h-3" aria-hidden="true" />}
                                                Criar
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => { setCreatingStatus(false); setNewStatusName("") }}
                                                className="text-xs bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600
                                                    text-slate-700 dark:text-slate-200 px-2 py-1 rounded-md"
                                            >
                                                Cancelar
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>

                            <div>
                                <label htmlFor={`semana-${project.id}`} className={labelCls}>
                                    <FileText className="w-3 h-3" aria-hidden="true" /> Atualização desta semana
                                </label>
                                <textarea
                                    id={`semana-${project.id}`}
                                    value={update}
                                    onChange={(e) => setUpdate(e.target.value)}
                                    placeholder="O que aconteceu esta semana, pendências, próximos passos..."
                                    rows={4}
                                    maxLength={4000}
                                    className={`${inputCls} resize-y leading-relaxed`}
                                />
                                <p className="text-right text-[11px] text-slate-600 dark:text-slate-400 mt-0.5">{update.length}/4000 caracteres</p>
                            </div>

                            <div>
                                <label htmlFor={`emails-${project.id}`} className={labelCls}>
                                    <Mail className="w-3 h-3" aria-hidden="true" /> E-mails do relatório individual (até {MAX_EMAILS})
                                </label>
                                {emails.length > 0 && (
                                    <ul className="flex flex-wrap gap-1.5 mb-2">
                                        {emails.map((email) => (
                                            <li
                                                key={email}
                                                className="flex items-center gap-1 bg-indigo-50 dark:bg-indigo-900/40 text-indigo-800 dark:text-indigo-200
                                                    text-[11px] font-medium px-2 py-0.5 rounded-full border border-indigo-100 dark:border-indigo-800/50"
                                            >
                                                {email}
                                                <button
                                                    type="button"
                                                    onClick={() => setEmails(emails.filter((e) => e !== email))}
                                                    className="hover:text-rose-600 ml-0.5"
                                                    aria-label={`Remover ${email}`}
                                                >
                                                    <X className="w-2.5 h-2.5" aria-hidden="true" />
                                                </button>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                                <div className="flex gap-1.5">
                                    <input
                                        id={`emails-${project.id}`}
                                        type="email"
                                        maxLength={254}
                                        value={emailInput}
                                        onChange={(e) => { setEmailInput(e.target.value); setEmailError(null) }}
                                        onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handleAddEmail())}
                                        aria-invalid={emailError ? true : undefined}
                                        aria-describedby={emailError ? `emails-erro-${project.id}` : undefined}
                                        placeholder="email@empresa.com.br"
                                        className={`${inputCls} flex-1`}
                                    />
                                    <button
                                        type="button"
                                        onClick={handleAddEmail}
                                        disabled={emails.length >= MAX_EMAILS}
                                        className="text-xs bg-slate-100 dark:bg-slate-700 hover:bg-indigo-100 dark:hover:bg-indigo-900/40
                                            text-slate-700 dark:text-slate-200 px-2.5 py-1.5 rounded-md font-medium disabled:opacity-50"
                                    >
                                        + Add
                                    </button>
                                </div>
                                {emailError && (
                                    <p id={`emails-erro-${project.id}`} role="alert" className="mt-1 text-xs text-rose-700 dark:text-rose-300">
                                        {emailError}
                                    </p>
                                )}
                            </div>

                            <button
                                type="button"
                                onClick={handleSave}
                                disabled={saving || !hasUnsavedChanges}
                                className={`w-full flex items-center justify-center gap-1.5 text-xs font-medium py-2 rounded-md transition-all
                                    ${hasUnsavedChanges
                                        ? "bg-indigo-600 hover:bg-indigo-700 text-white"
                                        : "bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 cursor-not-allowed"}`}
                            >
                                {saving
                                    ? <><Loader2 className="w-3 h-3 animate-spin" aria-hidden="true" /> Salvando...</>
                                    : <><Save className="w-3 h-3" aria-hidden="true" /> Salvar alterações</>}
                            </button>
                        </div>
                    </section>

                    <ProjectTimeline
                        state={timeline}
                        onRetry={() => {
                            setTimeline({ status: "loading" })
                            setTimelineReload((n) => n + 1)
                        }}
                    />

                    <section className="pt-3 border-t border-slate-200 dark:border-slate-700">
                        <button
                            type="button"
                            onClick={handleDelete}
                            disabled={deleting}
                            className="inline-flex items-center gap-1.5 text-xs font-medium text-rose-700 dark:text-rose-300
                                hover:bg-rose-50 dark:hover:bg-rose-950/40 px-2 py-1.5 rounded-md disabled:opacity-50"
                        >
                            {deleting
                                ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                                : <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />}
                            Apagar projeto
                        </button>
                    </section>
                </div>
            </div>
        </ModalDialog>
    )
}
