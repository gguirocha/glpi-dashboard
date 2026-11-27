import type { Phase } from "@/lib/projects/domain"
import type { Project, ProjectEvent, ProjectStatus } from "@/types"

/** Mensagem de erro para mostrar na tela, ou null quando deu certo. */
export type ActionResult = string | null

/** Campos que a tela pode gravar pelo painel (o container ainda filtra por whitelist). */
export const EDITABLE_FIELDS = [
    "weekly_update", "report_emails", "owner", "real_status_id",
    "next_step", "decision_needed", "health", "health_reason",
    "due_date", "baseline_date", "completed_at",
] as const

export type EditableField = (typeof EDITABLE_FIELDS)[number]
export type ProjectPatch = Partial<Pick<Project, EditableField>>

export type LoadEventsResult = { events: ProjectEvent[] } | { error: string }
export type CreateStatusResult = { status: ProjectStatus } | { error: string }

/** Callbacks do quadro. O container fala com o banco; a página de dev usa dados em memória. */
export interface BoardActions {
    /** Grava só a fase; status/completed_at vêm da trigger. */
    onMovePhase: (project: Project, phase: Phase) => Promise<ActionResult>
    /**
     * Grava só os campos do patch, com trava otimista em `project.updated_at`.
     * Se outra pessoa mudou o projeto antes, devolve erro de conflito e relê a linha.
     */
    onSave: (project: Project, patch: ProjectPatch) => Promise<ActionResult>
    onDelete: (id: number) => Promise<ActionResult>
    onCreate: (title: string) => Promise<ActionResult>
    onCreateStatus: (name: string, color: string) => Promise<CreateStatusResult>
    /** Chamado só quando o painel do card abre. */
    onLoadEvents: (projectId: number) => Promise<LoadEventsResult>
}
