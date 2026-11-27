"use client"

import { useEffect, useRef, useState } from "react"
import { supabase } from "@/lib/supabaseClient"
import { GeneralReportConfig, ScheduleConfig } from "@/types"
import { X, Mail, Save, Loader2, CheckCircle2, Settings, Clock, Calendar, RotateCw } from "lucide-react"
import { ModalDialog } from "./ModalDialog"
import { describeError } from "./errors"
import { MAX_EMAILS, addEmail } from "./helpers"

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

type LoadResult = { ok: true; cfg: GeneralReportConfig } | { ok: false; error: string }

async function fetchConfig(): Promise<LoadResult> {
    try {
        const { data, error } = await supabase
            .from("dashboard_settings")
            .select("value")
            .eq("key", "general_report")
            .maybeSingle()
        if (error) return { ok: false, error: describeError(error, "Erro ao carregar config do relatório geral") }
        return { ok: true, cfg: (data?.value as GeneralReportConfig) ?? { emails: [], enabled: true } }
    } catch (err) {
        return { ok: false, error: describeError(err, "Erro ao carregar config do relatório geral") }
    }
}

const fieldCls = `w-full text-sm border border-slate-300 dark:border-slate-600 rounded-md px-2 py-1.5
    bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100
    focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none`

// ──────────────────────────────────────────────────
// MODAL: Configurações do Status Report Geral
// ──────────────────────────────────────────────────
export function GeneralReportSettingsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
    if (!open) return null
    return <SettingsDialog onClose={onClose} />
}

function SettingsDialog({ onClose }: { onClose: () => void }) {
    const [enabled, setEnabled] = useState(true)
    const [emails, setEmails] = useState<string[]>([])
    const [emailInput, setEmailInput] = useState("")
    const [emailError, setEmailError] = useState<string | null>(null)
    const [schedule, setSchedule] = useState<ScheduleConfig>(DEFAULT_SCHEDULE)
    const [loading, setLoading] = useState(true)
    const [loadError, setLoadError] = useState<string | null>(null)
    const [reloadKey, setReloadKey] = useState(0)
    const [saving, setSaving] = useState(false)
    const [saved, setSaved] = useState(false)
    const [saveError, setSaveError] = useState<string | null>(null)
    const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

    useEffect(() => {
        let alive = true
        fetchConfig().then((r) => {
            if (!alive) return
            if (r.ok) {
                setEnabled(r.cfg.enabled)
                setEmails(r.cfg.emails ?? [])
                setSchedule(r.cfg.schedule ?? DEFAULT_SCHEDULE)
                setLoadError(null)
            } else {
                setLoadError(r.error)
            }
            setLoading(false)
        })
        return () => {
            alive = false
        }
    }, [reloadKey])

    useEffect(() => () => {
        if (savedTimer.current) clearTimeout(savedTimer.current)
    }, [])

    function retryLoad() {
        setLoading(true)
        setLoadError(null)
        setReloadKey((n) => n + 1)
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
        // sem a config carregada, salvar sobrescreveria a do banco com os defaults
        if (loading || loadError) return
        setSaving(true)
        setSaveError(null)
        try {
            const value: GeneralReportConfig = { emails, enabled, schedule }
            const { error } = await supabase
                .from("dashboard_settings")
                .upsert({ key: "general_report", value, updated_at: new Date().toISOString() })
            if (error) {
                setSaveError(describeError(error, "Erro ao salvar config"))
                return
            }
            setSaved(true)
            if (savedTimer.current) clearTimeout(savedTimer.current)
            savedTimer.current = setTimeout(() => setSaved(false), 2500)
        } catch (err) {
            setSaveError(describeError(err, "Erro ao salvar config"))
        } finally {
            setSaving(false)
        }
    }

    function onTimeChange(value: string) {
        const [h, m] = value.split(":").map((s) => parseInt(s, 10))
        if (Number.isNaN(h) || Number.isNaN(m)) return
        setSchedule({ ...schedule, hour: h, minute: m })
    }

    const canSave = !loading && !loadError && !saving

    return (
        <ModalDialog
            onRequestClose={onClose}
            labelledBy="general-report-title"
            className="m-auto w-full max-w-md rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800
                p-0 shadow-xl backdrop:bg-black/40 backdrop:backdrop-blur-sm"
        >
            <div className="p-5 text-slate-800 dark:text-slate-100">
                <div className="flex items-center justify-between mb-4">
                    <h3 id="general-report-title" className="text-base font-bold flex items-center gap-2">
                        <Settings className="w-4 h-4" aria-hidden="true" />
                        Status Report Geral
                    </h3>
                    <button
                        type="button"
                        onClick={onClose}
                        className="text-slate-500 hover:text-slate-800 dark:hover:text-slate-100 p-1 rounded"
                        aria-label="Fechar"
                    >
                        <X className="w-4 h-4" aria-hidden="true" />
                    </button>
                </div>

                <p className="text-xs text-slate-600 dark:text-slate-400 mb-4">
                    E-mail consolidado enviado para os heads / diretoria com a síntese de todos os projetos da semana, no dia e horário configurados abaixo.
                </p>

                {loading ? (
                    <div className="text-center py-6 text-slate-600 dark:text-slate-300 text-sm flex items-center justify-center gap-2" role="status">
                        <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> Carregando...
                    </div>
                ) : loadError ? (
                    <div
                        role="alert"
                        className="rounded-md border border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/40 p-3 text-sm text-rose-800 dark:text-rose-200"
                    >
                        <p>Não foi possível carregar a configuração atual: {loadError}</p>
                        <p className="mt-1 text-xs">Salvar fica bloqueado até carregar, para não sobrescrever a configuração do banco.</p>
                        <button
                            type="button"
                            onClick={retryLoad}
                            className="mt-2 inline-flex items-center gap-1 text-xs font-medium underline hover:no-underline"
                        >
                            <RotateCw className="w-3 h-3" aria-hidden="true" /> Tentar de novo
                        </button>
                    </div>
                ) : (
                    <div className="space-y-4">
                        {/* Toggle enabled */}
                        <div className="flex items-center justify-between bg-slate-50 dark:bg-slate-900/50 rounded-lg px-3 py-2.5 border border-slate-200 dark:border-slate-700/50">
                            <div>
                                <p id="general-report-enabled" className="text-sm font-medium">Ativar relatório consolidado</p>
                                <p className="text-[11px] text-slate-600 dark:text-slate-400">
                                    Quando desativado, apenas e-mails individuais são enviados.
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setEnabled(!enabled)}
                                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors flex-shrink-0
                                    ${enabled ? "bg-indigo-600" : "bg-slate-400 dark:bg-slate-600"}`}
                                role="switch"
                                aria-checked={enabled}
                                aria-labelledby="general-report-enabled"
                            >
                                <span
                                    className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform
                                        ${enabled ? "translate-x-5" : "translate-x-1"}`}
                                />
                            </button>
                        </div>

                        {/* E-mails */}
                        <div>
                            <label htmlFor="general-report-email" className="flex items-center gap-1 text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                                <Mail className="w-3 h-3" aria-hidden="true" />
                                Destinatários (heads / diretoria) — até {MAX_EMAILS}
                            </label>

                            {emails.length > 0 && (
                                <ul className="flex flex-wrap gap-1.5 mb-2">
                                    {emails.map((email) => (
                                        <li
                                            key={email}
                                            className="flex items-center gap-1 bg-indigo-50 dark:bg-indigo-900/40 text-indigo-800 dark:text-indigo-200
                                                text-xs font-medium px-2 py-0.5 rounded-full border border-indigo-100 dark:border-indigo-800/50"
                                        >
                                            {email}
                                            <button
                                                type="button"
                                                onClick={() => setEmails(emails.filter((e) => e !== email))}
                                                className="hover:text-rose-600 transition-colors ml-0.5"
                                                aria-label={`Remover ${email}`}
                                            >
                                                <X className="w-3 h-3" aria-hidden="true" />
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                            )}

                            <div className="flex gap-1.5">
                                <input
                                    id="general-report-email"
                                    type="email"
                                    maxLength={254}
                                    value={emailInput}
                                    onChange={(e) => { setEmailInput(e.target.value); setEmailError(null) }}
                                    onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), handleAddEmail())}
                                    placeholder="head@empresa.com.br"
                                    aria-invalid={emailError ? true : undefined}
                                    aria-describedby={emailError ? "general-report-email-error" : undefined}
                                    className={`${fieldCls} flex-1 px-3`}
                                />
                                <button
                                    type="button"
                                    onClick={handleAddEmail}
                                    disabled={emails.length >= MAX_EMAILS}
                                    className="text-sm bg-slate-100 dark:bg-slate-700 hover:bg-indigo-100 dark:hover:bg-indigo-900/40
                                        text-slate-700 dark:text-slate-200 px-3 py-1.5 rounded-md transition-colors font-medium disabled:opacity-50"
                                >
                                    + Add
                                </button>
                            </div>
                            {emailError && (
                                <p id="general-report-email-error" role="alert" className="mt-1 text-xs text-rose-700 dark:text-rose-300">
                                    {emailError}
                                </p>
                            )}
                        </div>

                        {/* Agendamento */}
                        <div className="border-t border-slate-200 dark:border-slate-700/50 pt-4">
                            <p className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2 flex items-center gap-1.5">
                                <Clock className="w-3.5 h-3.5" aria-hidden="true" />
                                Agendamento do disparo semanal
                            </p>
                            <p className="text-[11px] text-slate-600 dark:text-slate-400 mb-3">
                                Define quando o ciclo (relatórios individuais + consolidado) é disparado. Mudanças entram em vigor no próximo tick (até ~60s).
                            </p>

                            <div className="grid grid-cols-2 gap-2">
                                <div>
                                    <label htmlFor="general-report-day" className="flex items-center gap-1 text-[11px] font-medium text-slate-700 dark:text-slate-300 mb-1">
                                        <Calendar className="w-3 h-3" aria-hidden="true" />
                                        Dia da semana
                                    </label>
                                    <select
                                        id="general-report-day"
                                        value={schedule.dayOfWeek}
                                        onChange={(e) => setSchedule({ ...schedule, dayOfWeek: Number(e.target.value) })}
                                        className={fieldCls}
                                    >
                                        {WEEKDAYS.map((d) => (
                                            <option key={d.value} value={d.value}>{d.label}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label htmlFor="general-report-time" className="flex items-center gap-1 text-[11px] font-medium text-slate-700 dark:text-slate-300 mb-1">
                                        <Clock className="w-3 h-3" aria-hidden="true" />
                                        Horário (fuso da EC2)
                                    </label>
                                    <input
                                        id="general-report-time"
                                        type="time"
                                        value={formatTime(schedule.hour, schedule.minute)}
                                        onChange={(e) => onTimeChange(e.target.value)}
                                        className={`${fieldCls} dark:[color-scheme:dark]`}
                                    />
                                </div>
                            </div>
                        </div>

                        {saveError && (
                            <p role="alert" className="rounded-md border border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/40 px-3 py-2 text-xs text-rose-800 dark:text-rose-200">
                                Não foi possível salvar: {saveError}
                            </p>
                        )}

                        <button
                            type="button"
                            onClick={handleSave}
                            disabled={!canSave}
                            className={`w-full flex items-center justify-center gap-1.5 text-sm font-medium py-2 rounded-md transition-all
                                ${saved
                                    ? "bg-emerald-600 text-white"
                                    : "bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-50"
                                }`}
                        >
                            {saving ? (
                                <><Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> Salvando...</>
                            ) : saved ? (
                                <><CheckCircle2 className="w-4 h-4" aria-hidden="true" /> Salvo!</>
                            ) : (
                                <><Save className="w-4 h-4" aria-hidden="true" /> Salvar configurações</>
                            )}
                        </button>
                        <p className="sr-only" role="status">{saved ? "Configurações salvas." : ""}</p>
                    </div>
                )}
            </div>
        </ModalDialog>
    )
}
