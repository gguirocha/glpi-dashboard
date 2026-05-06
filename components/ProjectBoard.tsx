"use client"

import { useState, useEffect, useRef } from "react"
import { supabase } from "@/lib/supabaseClient"
import { useAuth } from "@/context/AuthContext"
import { Project, ProjectStatus, GeneralReportConfig, ScheduleConfig } from "@/types"
import {
    Plus, X, ArrowRight, ArrowLeft, ChevronDown, Mail, Save, User, FileText,
    Loader2, CheckCircle2, Settings, Tag, Clock, Calendar,
} from "lucide-react"

// Default — Segunda-feira às 08:00 (espelha o DEFAULT_SCHEDULE do lib/weeklyReport)
const DEFAULT_SCHEDULE: ScheduleConfig = { dayOfWeek: 1, hour: 8, minute: 0 }

const WEEKDAYS: { value: number; label: string }[] = [
    { value: 0, label: "Domingo" },
    { value: 1, label: "Segunda-feira" },
    { value: 2, label: "Terça-feira" },
    { value: 3, label: "Quarta-feira" },
    { value: 4, label: "Quinta-feira" },
    { value: 5, label: "Sexta-feira" },
    { value: 6, label: "Sábado" },
]

function formatTime(h: number, m: number): string {
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`
}

// ──────────────────────────────────────────────────
// MODAL: Configurações do Status Report Geral
// ──────────────────────────────────────────────────
function GeneralReportSettingsModal({
    open,
    onClose,
}: {
    open: boolean
    onClose: () => void
}) {
    const [enabled, setEnabled] = useState(true)
    const [emails, setEmails] = useState<string[]>([])
    const [emailInput, setEmailInput] = useState("")
    const [schedule, setSchedule] = useState<ScheduleConfig>(DEFAULT_SCHEDULE)
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [saved, setSaved] = useState(false)

    useEffect(() => {
        if (!open) return
        loadConfig()
    }, [open])

    async function loadConfig() {
        setLoading(true)
        try {
            const { data, error } = await supabase
                .from("dashboard_settings")
                .select("value")
                .eq("key", "general_report")
                .maybeSingle()

            if (error) throw error
            const cfg: GeneralReportConfig = (data?.value as GeneralReportConfig) ?? { emails: [], enabled: true }
            setEnabled(cfg.enabled)
            setEmails(cfg.emails ?? [])
            setSchedule(cfg.schedule ?? DEFAULT_SCHEDULE)
        } catch (err) {
            console.error("Erro ao carregar config do relatório geral:", err)
        } finally {
            setLoading(false)
        }
    }

    function addEmail() {
        const trimmed = emailInput.trim().toLowerCase()
        if (!trimmed || !trimmed.includes("@") || emails.includes(trimmed)) return
        setEmails([...emails, trimmed])
        setEmailInput("")
    }

    function removeEmail(email: string) {
        setEmails(emails.filter((e) => e !== email))
    }

    async function handleSave() {
        setSaving(true)
        try {
            const value: GeneralReportConfig = { emails, enabled, schedule }
            const { error } = await supabase
                .from("dashboard_settings")
                .upsert({ key: "general_report", value, updated_at: new Date().toISOString() })

            if (error) throw error
            setSaved(true)
            setTimeout(() => setSaved(false), 2500)
        } catch (err) {
            console.error("Erro ao salvar config:", err)
        } finally {
            setSaving(false)
        }
    }

    function onTimeChange(value: string) {
        // value vem como "HH:MM"
        const [h, m] = value.split(":").map((s) => parseInt(s, 10))
        if (Number.isNaN(h) || Number.isNaN(m)) return
        setSchedule({ ...schedule, hour: h, minute: m })
    }

    if (!open) return null

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
            onClick={onClose}
        >
            <div
                className="bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-slate-200 dark:border-slate-700 w-full max-w-md p-5"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-base font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                        <Settings className="w-4 h-4" />
                        Status Report Geral
                    </h3>
                    <button
                        onClick={onClose}
                        className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 rounded"
                        aria-label="Fechar"
                    >
                        <X className="w-4 h-4" />
                    </button>
                </div>

                <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
                    E-mail consolidado enviado para os heads / diretoria com a síntese de todos os projetos da semana, no dia e horário configurados abaixo.
                </p>

                {loading ? (
                    <div className="text-center py-6 text-slate-400 text-sm flex items-center justify-center gap-2">
                        <Loader2 className="w-4 h-4 animate-spin" /> Carregando...
                    </div>
                ) : (
                    <div className="space-y-4">
                        {/* Toggle enabled */}
                        <div className="flex items-center justify-between bg-slate-50 dark:bg-slate-900/50 rounded-lg px-3 py-2.5 border border-slate-100 dark:border-slate-700/50">
                            <div>
                                <p className="text-sm font-medium text-slate-800 dark:text-slate-200">
                                    Ativar relatório consolidado
                                </p>
                                <p className="text-[10px] text-slate-500 dark:text-slate-400">
                                    Quando desativado, apenas e-mails individuais são enviados.
                                </p>
                            </div>
                            <button
                                onClick={() => setEnabled(!enabled)}
                                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors flex-shrink-0
                                    ${enabled ? "bg-indigo-600" : "bg-slate-300 dark:bg-slate-600"}`}
                                aria-label="Toggle"
                            >
                                <span
                                    className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform
                                        ${enabled ? "translate-x-5" : "translate-x-1"}`}
                                />
                            </button>
                        </div>

                        {/* E-mails */}
                        <div>
                            <label className="flex items-center gap-1 text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">
                                <Mail className="w-3 h-3" />
                                Destinatários (heads / diretoria)
                            </label>

                            {emails.length > 0 && (
                                <div className="flex flex-wrap gap-1.5 mb-2">
                                    {emails.map((email) => (
                                        <span
                                            key={email}
                                            className="flex items-center gap-1 bg-indigo-50 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300
                                                text-xs font-medium px-2 py-0.5 rounded-full border border-indigo-100 dark:border-indigo-800/50"
                                        >
                                            {email}
                                            <button
                                                onClick={() => removeEmail(email)}
                                                className="hover:text-rose-500 transition-colors ml-0.5"
                                            >
                                                <X className="w-3 h-3" />
                                            </button>
                                        </span>
                                    ))}
                                </div>
                            )}

                            <div className="flex gap-1.5">
                                <input
                                    type="email"
                                    value={emailInput}
                                    onChange={(e) => setEmailInput(e.target.value)}
                                    onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addEmail())}
                                    placeholder="head@empresa.com.br"
                                    className="flex-1 text-sm border border-slate-200 dark:border-slate-600 rounded-md px-3 py-1.5
                                        bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100
                                        focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all"
                                />
                                <button
                                    onClick={addEmail}
                                    className="text-sm bg-slate-100 dark:bg-slate-700 hover:bg-indigo-100 dark:hover:bg-indigo-900/40
                                        text-slate-600 dark:text-slate-300 hover:text-indigo-700 dark:hover:text-indigo-300
                                        px-3 py-1.5 rounded-md transition-colors font-medium"
                                >
                                    + Add
                                </button>
                            </div>
                        </div>

                        {/* Agendamento */}
                        <div className="border-t border-slate-100 dark:border-slate-700/50 pt-4">
                            <p className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2 flex items-center gap-1.5">
                                <Clock className="w-3.5 h-3.5" />
                                Agendamento do disparo semanal
                            </p>
                            <p className="text-[10px] text-slate-500 dark:text-slate-400 mb-3">
                                Define quando o ciclo (relatórios individuais + consolidado) é disparado. Mudanças entram em vigor no próximo tick (até ~60s).
                            </p>

                            <div className="grid grid-cols-2 gap-2">
                                <div>
                                    <label className="flex items-center gap-1 text-[10px] font-medium text-slate-500 dark:text-slate-400 mb-1">
                                        <Calendar className="w-3 h-3" />
                                        Dia da semana
                                    </label>
                                    <select
                                        value={schedule.dayOfWeek}
                                        onChange={(e) => setSchedule({ ...schedule, dayOfWeek: Number(e.target.value) })}
                                        className="w-full text-sm border border-slate-200 dark:border-slate-600 rounded-md px-2 py-1.5
                                            bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100
                                            focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
                                    >
                                        {WEEKDAYS.map((d) => (
                                            <option key={d.value} value={d.value}>{d.label}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="flex items-center gap-1 text-[10px] font-medium text-slate-500 dark:text-slate-400 mb-1">
                                        <Clock className="w-3 h-3" />
                                        Horário (fuso da EC2)
                                    </label>
                                    <input
                                        type="time"
                                        value={formatTime(schedule.hour, schedule.minute)}
                                        onChange={(e) => onTimeChange(e.target.value)}
                                        className="w-full text-sm border border-slate-200 dark:border-slate-600 rounded-md px-2 py-1.5
                                            bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100
                                            focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Save */}
                        <button
                            onClick={handleSave}
                            disabled={saving}
                            className={`w-full flex items-center justify-center gap-1.5 text-sm font-medium py-2 rounded-md transition-all
                                ${saved
                                    ? "bg-emerald-500 text-white"
                                    : "bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-50"
                                }`}
                        >
                            {saving ? (
                                <><Loader2 className="w-4 h-4 animate-spin" /> Salvando...</>
                            ) : saved ? (
                                <><CheckCircle2 className="w-4 h-4" /> Salvo!</>
                            ) : (
                                <><Save className="w-4 h-4" /> Salvar configurações</>
                            )}
                        </button>
                    </div>
                )}
            </div>
        </div>
    )
}

// ──────────────────────────────────────────────────
// Inline EditPanel — expansível por card
// ──────────────────────────────────────────────────
function ProjectEditPanel({
    project,
    statuses,
    onSave,
    onStatusCreated,
}: {
    project: Project
    statuses: ProjectStatus[]
    onSave: (id: number, patch: Partial<Project>) => void
    onStatusCreated: (s: ProjectStatus) => void
}) {
    const [open, setOpen] = useState(false)
    const [update, setUpdate] = useState(project.weekly_update ?? "")
    const [owner, setOwner] = useState(project.owner ?? "")
    const [emailInput, setEmailInput] = useState("")
    const [emails, setEmails] = useState<string[]>(project.report_emails ?? [])
    const [realStatusId, setRealStatusId] = useState<number | null>(project.real_status_id ?? null)
    const [saving, setSaving] = useState(false)
    const [saved, setSaved] = useState(false)
    const textareaRef = useRef<HTMLTextAreaElement>(null)

    // Inline create-status
    const [creatingStatus, setCreatingStatus] = useState(false)
    const [newStatusName, setNewStatusName] = useState("")
    const [newStatusColor, setNewStatusColor] = useState("#6366f1")
    const [creatingBusy, setCreatingBusy] = useState(false)

    useEffect(() => {
        setUpdate(project.weekly_update ?? "")
        setOwner(project.owner ?? "")
        setEmails(project.report_emails ?? [])
        setRealStatusId(project.real_status_id ?? null)
    }, [project])

    function addEmail() {
        const trimmed = emailInput.trim().toLowerCase()
        if (!trimmed || !trimmed.includes("@") || emails.includes(trimmed)) return
        setEmails([...emails, trimmed])
        setEmailInput("")
    }

    function removeEmail(email: string) {
        setEmails(emails.filter((e) => e !== email))
    }

    async function createInlineStatus() {
        const name = newStatusName.trim()
        if (!name) return
        setCreatingBusy(true)
        try {
            const { data, error } = await supabase
                .from("dashboard_project_statuses")
                .insert({ name, color: newStatusColor })
                .select()
                .single()

            if (error) throw error
            const created = data as ProjectStatus
            onStatusCreated(created)
            setRealStatusId(created.id)
            setCreatingStatus(false)
            setNewStatusName("")
        } catch (err) {
            // Supabase Postgrest errors têm message/code/hint/details — nem sempre serializam com console.error direto
            const e = err as { message?: string; code?: string; hint?: string; details?: string }
            console.error("Erro ao criar status:", {
                message: e?.message,
                code: e?.code,
                hint: e?.hint,
                details: e?.details,
            })
            const reason = e?.code === "23505"
                ? "Já existe um status com esse nome."
                : e?.code === "42501"
                    ? "Permissão negada (RLS). Desabilite RLS em dashboard_project_statuses no Supabase."
                    : (e?.message ?? "Erro desconhecido")
            alert(`Não foi possível criar o status: ${reason}`)
        } finally {
            setCreatingBusy(false)
        }
    }

    async function handleSave() {
        setSaving(true)
        const patch: Partial<Project> = {
            weekly_update: update.trim() || null,
            report_emails: emails,
            owner: owner.trim() || null,
            real_status_id: realStatusId,
        }

        try {
            const { error } = await supabase
                .from("dashboard_projects")
                .update(patch)
                .eq("id", project.id)

            if (error) throw error
            onSave(project.id, patch)
            setSaved(true)
            setTimeout(() => setSaved(false), 2500)
        } catch (err) {
            console.error("Erro ao salvar projeto:", err)
        } finally {
            setSaving(false)
        }
    }

    const hasUnsavedChanges =
        update !== (project.weekly_update ?? "") ||
        owner !== (project.owner ?? "") ||
        realStatusId !== (project.real_status_id ?? null) ||
        JSON.stringify(emails) !== JSON.stringify(project.report_emails ?? [])

    const currentStatus = statuses.find((s) => s.id === realStatusId)

    return (
        <div className="mt-2">
            {/* Toggle button */}
            <button
                onClick={() => setOpen((v) => !v)}
                className={`w-full flex items-center justify-between text-xs px-2 py-1.5 rounded-md transition-all
                    ${open
                        ? "bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300"
                        : "text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/50"
                    }`}
            >
                <span className="flex items-center gap-1.5">
                    <FileText className="w-3 h-3" />
                    {project.weekly_update
                        ? <span className="font-medium text-indigo-600 dark:text-indigo-400">Atualização preenchida</span>
                        : <span>Adicionar atualização semanal</span>
                    }
                </span>
                <ChevronDown
                    className={`w-3 h-3 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
                />
            </button>

            {/* Status real chip — mostrado fora do painel quando há um selecionado */}
            {!open && currentStatus && (
                <div className="mt-1.5 flex items-center gap-1">
                    <span
                        className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full"
                        style={{
                            backgroundColor: (currentStatus.color ?? "#6366f1") + "20",
                            color: currentStatus.color ?? "#6366f1",
                        }}
                    >
                        <Tag className="w-2.5 h-2.5" />
                        {currentStatus.name}
                    </span>
                </div>
            )}

            {/* Expanded panel */}
            {open && (
                <div className="mt-2 space-y-3 bg-slate-50 dark:bg-slate-900/50 rounded-lg p-3 border border-slate-100 dark:border-slate-700/50">

                    {/* Responsável */}
                    <div>
                        <label className="flex items-center gap-1 text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
                            <User className="w-3 h-3" />
                            Responsável
                        </label>
                        <input
                            type="text"
                            value={owner}
                            onChange={(e) => setOwner(e.target.value)}
                            placeholder="Nome do responsável..."
                            className="w-full text-xs border border-slate-200 dark:border-slate-600 rounded-md px-2.5 py-1.5
                                bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100
                                focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all"
                        />
                    </div>

                    {/* Status real */}
                    <div>
                        <label className="flex items-center gap-1 text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
                            <Tag className="w-3 h-3" />
                            Status real
                        </label>
                        <div className="flex gap-1.5">
                            <select
                                value={realStatusId ?? ""}
                                onChange={(e) => {
                                    const v = e.target.value
                                    setRealStatusId(v === "" ? null : Number(v))
                                }}
                                className="flex-1 text-xs border border-slate-200 dark:border-slate-600 rounded-md px-2.5 py-1.5
                                    bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100
                                    focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all"
                            >
                                <option value="">— Não classificado —</option>
                                {statuses.map((s) => (
                                    <option key={s.id} value={s.id}>{s.name}</option>
                                ))}
                            </select>
                            <button
                                onClick={() => setCreatingStatus((v) => !v)}
                                className="text-xs bg-slate-100 dark:bg-slate-700 hover:bg-indigo-100 dark:hover:bg-indigo-900/40
                                    text-slate-600 dark:text-slate-300 hover:text-indigo-700 dark:hover:text-indigo-300
                                    px-2.5 py-1.5 rounded-md transition-colors font-medium"
                                title="Criar novo status"
                            >
                                +
                            </button>
                        </div>

                        {/* Inline form para novo status */}
                        {creatingStatus && (
                            <div className="mt-2 p-2 rounded-md bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 space-y-2">
                                <div className="flex gap-1.5 items-center">
                                    <input
                                        type="text"
                                        value={newStatusName}
                                        onChange={(e) => setNewStatusName(e.target.value)}
                                        placeholder="Nome do status..."
                                        autoFocus
                                        className="flex-1 text-xs border border-slate-200 dark:border-slate-600 rounded-md px-2 py-1
                                            bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100
                                            focus:ring-2 focus:ring-indigo-500 outline-none"
                                        onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), createInlineStatus())}
                                    />
                                    <input
                                        type="color"
                                        value={newStatusColor}
                                        onChange={(e) => setNewStatusColor(e.target.value)}
                                        className="w-7 h-7 rounded border border-slate-200 dark:border-slate-600 cursor-pointer"
                                        title="Cor do status"
                                    />
                                </div>
                                <div className="flex gap-1.5">
                                    <button
                                        onClick={createInlineStatus}
                                        disabled={!newStatusName.trim() || creatingBusy}
                                        className="flex-1 text-xs bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50
                                            text-white px-2 py-1 rounded-md font-medium flex items-center justify-center gap-1"
                                    >
                                        {creatingBusy ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}
                                        Criar
                                    </button>
                                    <button
                                        onClick={() => { setCreatingStatus(false); setNewStatusName("") }}
                                        className="text-xs bg-slate-100 dark:bg-slate-700 hover:bg-slate-200
                                            text-slate-600 dark:text-slate-300 px-2 py-1 rounded-md"
                                    >
                                        Cancelar
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Atualização da semana */}
                    <div>
                        <label className="flex items-center gap-1 text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
                            <FileText className="w-3 h-3" />
                            Atualização desta semana
                        </label>
                        <textarea
                            ref={textareaRef}
                            value={update}
                            onChange={(e) => setUpdate(e.target.value)}
                            placeholder="Descreva o que aconteceu esta semana neste projeto, pendências, próximos passos..."
                            rows={4}
                            className="w-full text-xs border border-slate-200 dark:border-slate-600 rounded-md px-2.5 py-1.5
                                bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100
                                focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none
                                resize-none transition-all leading-relaxed"
                        />
                        <p className="text-right text-[10px] text-slate-400 mt-0.5">
                            {update.length} caracteres
                        </p>
                    </div>

                    {/* E-mails destinatários */}
                    <div>
                        <label className="flex items-center gap-1 text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
                            <Mail className="w-3 h-3" />
                            E-mails do relatório individual
                        </label>

                        {emails.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 mb-2">
                                {emails.map((email) => (
                                    <span
                                        key={email}
                                        className="flex items-center gap-1 bg-indigo-50 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300
                                            text-[10px] font-medium px-2 py-0.5 rounded-full border border-indigo-100 dark:border-indigo-800/50"
                                    >
                                        {email}
                                        <button
                                            onClick={() => removeEmail(email)}
                                            className="hover:text-rose-500 transition-colors ml-0.5"
                                        >
                                            <X className="w-2.5 h-2.5" />
                                        </button>
                                    </span>
                                ))}
                            </div>
                        )}

                        <div className="flex gap-1.5">
                            <input
                                type="email"
                                value={emailInput}
                                onChange={(e) => setEmailInput(e.target.value)}
                                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addEmail())}
                                placeholder="email@empresa.com.br"
                                className="flex-1 text-xs border border-slate-200 dark:border-slate-600 rounded-md px-2.5 py-1.5
                                    bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100
                                    focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all"
                            />
                            <button
                                onClick={addEmail}
                                className="text-xs bg-slate-100 dark:bg-slate-700 hover:bg-indigo-100 dark:hover:bg-indigo-900/40
                                    text-slate-600 dark:text-slate-300 hover:text-indigo-700 dark:hover:text-indigo-300
                                    px-2.5 py-1.5 rounded-md transition-colors font-medium"
                            >
                                + Add
                            </button>
                        </div>
                    </div>

                    {/* Save button */}
                    <button
                        onClick={handleSave}
                        disabled={saving || !hasUnsavedChanges}
                        className={`w-full flex items-center justify-center gap-1.5 text-xs font-medium py-2 rounded-md transition-all
                            ${saved
                                ? "bg-emerald-500 text-white"
                                : hasUnsavedChanges
                                    ? "bg-indigo-600 hover:bg-indigo-700 text-white"
                                    : "bg-slate-100 dark:bg-slate-700 text-slate-400 dark:text-slate-500 cursor-not-allowed"
                            }`}
                    >
                        {saving ? (
                            <><Loader2 className="w-3 h-3 animate-spin" /> Salvando...</>
                        ) : saved ? (
                            <><CheckCircle2 className="w-3 h-3" /> Salvo!</>
                        ) : (
                            <><Save className="w-3 h-3" /> Salvar alterações</>
                        )}
                    </button>
                </div>
            )}
        </div>
    )
}

// ──────────────────────────────────────────────────
// ProjectBoard principal
// ──────────────────────────────────────────────────
export function ProjectBoard() {
    const { isAdmin } = useAuth()
    const [projects, setProjects] = useState<Project[]>([])
    const [statuses, setStatuses] = useState<ProjectStatus[]>([])
    const [loading, setLoading] = useState(true)
    const [newProject, setNewProject] = useState("")
    const [isAdding, setIsAdding] = useState(false)
    const [settingsOpen, setSettingsOpen] = useState(false)

    useEffect(() => {
        Promise.all([fetchProjects(), fetchStatuses()]).finally(() => setLoading(false))
    }, [])

    async function fetchProjects() {
        try {
            const { data, error } = await supabase
                .from("dashboard_projects")
                .select("*")
                .order("created_at", { ascending: false })

            if (error) throw error
            if (data) setProjects(data as Project[])
        } catch (error) {
            console.error("Error fetching projects:", error)
        }
    }

    async function fetchStatuses() {
        try {
            const { data, error } = await supabase
                .from("dashboard_project_statuses")
                .select("*")
                .order("name", { ascending: true })

            if (error) throw error
            if (data) setStatuses(data as ProjectStatus[])
        } catch (error) {
            console.error("Error fetching statuses:", error)
        }
    }

    async function addProject(status: "todo" | "in_progress" | "done" = "todo") {
        if (!newProject.trim()) return

        try {
            const { data, error } = await supabase
                .from("dashboard_projects")
                .insert([{
                    title: newProject,
                    status,
                    weekly_update: null,
                    report_emails: [],
                    owner: null,
                    real_status_id: null,
                }])
                .select()

            if (error) throw error
            if (data) {
                setProjects([data[0] as Project, ...projects])
                setNewProject("")
                setIsAdding(false)
            }
        } catch (error) {
            console.error("Error adding project:", error)
        }
    }

    async function deleteProject(id: number) {
        try {
            const { error } = await supabase
                .from("dashboard_projects")
                .delete()
                .eq("id", id)

            if (error) throw error
            setProjects(projects.filter((p) => p.id !== id))
        } catch (error) {
            console.error("Error deleting project:", error)
        }
    }

    async function moveProject(project: Project, direction: "next" | "prev") {
        const flow = ["todo", "in_progress", "done"]
        const currentIndex = flow.indexOf(project.status)
        const nextIndex = direction === "next" ? currentIndex + 1 : currentIndex - 1

        if (nextIndex < 0 || nextIndex >= flow.length) return

        const newStatus = flow[nextIndex] as "todo" | "in_progress" | "done"
        const updates: Partial<Project> = { status: newStatus }

        if (newStatus === "done") {
            updates.completed_at = new Date().toISOString()
        } else if (project.status === "done") {
            updates.completed_at = null
        }

        try {
            const { error } = await supabase
                .from("dashboard_projects")
                .update(updates)
                .eq("id", project.id)

            if (error) throw error
            setProjects(projects.map((p) => (p.id === project.id ? { ...p, ...updates } : p)))
        } catch (error) {
            console.error("Error updating project:", error)
        }
    }

    async function updateCompletionDate(project: Project, dateStr: string) {
        if (!dateStr) return
        try {
            const isoDate = new Date(dateStr).toISOString()
            const { error } = await supabase
                .from("dashboard_projects")
                .update({ completed_at: isoDate })
                .eq("id", project.id)

            if (error) throw error
            setProjects(projects.map((p) =>
                p.id === project.id ? { ...p, completed_at: isoDate } : p
            ))
        } catch (error) {
            console.error("Error updating completion date:", error)
        }
    }

    function handleProjectPatch(id: number, patch: Partial<Project>) {
        setProjects(projects.map((p) => (p.id === id ? { ...p, ...patch } : p)))
    }

    function handleStatusCreated(s: ProjectStatus) {
        setStatuses((prev) => [...prev, s].sort((a, b) => a.name.localeCompare(b.name)))
    }

    const getSortedProjects = (status: string) => {
        const filtered = projects.filter((p) => p.status === status)
        if (status === "done") {
            filtered.sort((a, b) => {
                const dateA = a.completed_at ? new Date(a.completed_at).getTime() : 0
                const dateB = b.completed_at ? new Date(b.completed_at).getTime() : 0
                return dateB - dateA
            })
        }
        return filtered
    }

    const columns = [
        { id: "todo", title: "Ações a serem Realizadas", color: "bg-slate-100 dark:bg-slate-900 border-slate-200 dark:border-slate-700" },
        { id: "in_progress", title: "Em Andamento", color: "bg-blue-50 dark:bg-blue-900/20 border-blue-100 dark:border-blue-800/50" },
        { id: "done", title: "Ações Realizadas", color: "bg-emerald-50 dark:bg-emerald-900/20 border-emerald-100 dark:border-emerald-800/50" },
    ]

    if (loading) return <div className="text-center py-4 text-slate-400">Carregando quadro...</div>

    return (
        <div className="bg-white dark:bg-slate-800 p-6 rounded-xl shadow-sm border border-slate-100 dark:border-slate-700 mb-8 transition-colors">
            <h3 className="text-lg font-bold text-slate-800 dark:text-slate-100 mb-6 flex items-center justify-between">
                <span>Gestão de Projetos do Departamento</span>
                <div className="flex items-center gap-2">
                    {isAdmin && (
                        <button
                            onClick={() => setSettingsOpen(true)}
                            className="text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 p-1.5 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
                            title="Configurações do Status Report Geral (admin)"
                        >
                            <Settings className="w-4 h-4" />
                        </button>
                    )}
                    {!isAdding && (
                        <button
                            onClick={() => setIsAdding(true)}
                            className="text-sm bg-indigo-600 text-white px-3 py-1.5 rounded-lg hover:bg-indigo-700 flex items-center transition-colors"
                        >
                            <Plus className="w-4 h-4 mr-1" /> Novo Projeto
                        </button>
                    )}
                </div>
            </h3>

            {isAdding && (
                <div className="mb-6 flex gap-2">
                    <input
                        type="text"
                        value={newProject}
                        onChange={(e) => setNewProject(e.target.value)}
                        placeholder="Nome do projeto..."
                        className="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                        onKeyDown={(e) => e.key === "Enter" && addProject()}
                        autoFocus
                    />
                    <button
                        onClick={() => addProject()}
                        className="bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700"
                    >
                        Adicionar
                    </button>
                    <button
                        onClick={() => setIsAdding(false)}
                        className="text-slate-500 px-3 py-2 hover:bg-slate-100 rounded-lg"
                    >
                        Cancelar
                    </button>
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {columns.map((col) => (
                    <div key={col.id} className={`rounded-xl p-4 border ${col.color} min-h-[300px]`}>
                        <h4 className="font-semibold text-slate-700 dark:text-slate-300 mb-4 flex items-center justify-between">
                            {col.title}
                            <span className="bg-white dark:bg-slate-800 px-2 py-0.5 rounded-full text-xs text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
                                {projects.filter((p) => p.status === col.id).length}
                            </span>
                        </h4>

                        <div className="space-y-3 max-h-[600px] overflow-y-auto pr-2 custom-scrollbar">
                            {getSortedProjects(col.id).map((project) => (
                                <div
                                    key={project.id}
                                    className="bg-white dark:bg-slate-800 p-3 rounded-lg shadow-sm border border-slate-100 dark:border-slate-700 group hover:shadow-md transition-shadow relative"
                                >
                                    <div className="flex justify-between items-start mb-2">
                                        <div className="pr-6">
                                            <p className="text-sm text-slate-800 dark:text-slate-100 font-medium leading-tight">
                                                {project.title}
                                            </p>
                                            {project.owner && (
                                                <p className="text-[10px] text-slate-400 mt-0.5 flex items-center gap-1">
                                                    <User className="w-2.5 h-2.5" />
                                                    {project.owner}
                                                </p>
                                            )}
                                        </div>
                                        <button
                                            onClick={() => deleteProject(project.id)}
                                            className="text-slate-400 hover:text-rose-500 opacity-0 group-hover:opacity-100 transition-opacity absolute top-2 right-2 p-1 bg-white/80 dark:bg-slate-800/80 rounded"
                                            title="Excluir Projeto"
                                        >
                                            <X className="w-4 h-4" />
                                        </button>
                                    </div>

                                    {project.completed_at && project.status === "done" && (
                                        <div className="text-xs text-emerald-600 dark:text-emerald-400 mb-2 font-medium flex items-center gap-1 hover:bg-emerald-50 dark:hover:bg-emerald-900/30 rounded p-1 -ml-1 w-max">
                                            <span>Data:</span>
                                            <input
                                                type="date"
                                                className="bg-transparent border-none text-xs p-0 m-0 focus:ring-0 cursor-pointer w-auto"
                                                value={project.completed_at.split("T")[0]}
                                                onChange={(e) => updateCompletionDate(project, e.target.value)}
                                            />
                                        </div>
                                    )}

                                    <ProjectEditPanel
                                        project={project}
                                        statuses={statuses}
                                        onSave={handleProjectPatch}
                                        onStatusCreated={handleStatusCreated}
                                    />

                                    <div className="flex justify-between items-center mt-3 pt-2 border-t border-slate-50 dark:border-slate-700/50">
                                        {col.id !== "todo" ? (
                                            <button
                                                onClick={() => moveProject(project, "prev")}
                                                className="text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400"
                                                title="Mover para trás"
                                            >
                                                <ArrowLeft className="w-4 h-4" />
                                            </button>
                                        ) : (
                                            <div></div>
                                        )}

                                        {col.id !== "done" ? (
                                            <button
                                                onClick={() => moveProject(project, "next")}
                                                className="text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400"
                                                title="Mover para frente"
                                            >
                                                <ArrowRight className="w-4 h-4" />
                                            </button>
                                        ) : (
                                            <div></div>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                ))}
            </div>

            <GeneralReportSettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
        </div>
    )
}
