"use client"

import { useMemo, useState } from "react"
import { ProjectBoardView } from "@/components/projects/ProjectBoardView"
import type { ActionResult, ProjectPatch } from "@/components/projects/types"
import { boardIndicators } from "@/lib/projects/board"
import { statusForPhase } from "@/lib/projects/domain"
import type { Phase } from "@/lib/projects/domain"
import type { Project, ProjectEvent, ProjectStatus } from "@/types"

// "Hoje" fixo: a vitrine sempre mostra os mesmos atrasos/vencidos.
const NOW = new Date(2026, 10, 27, 10, 0)
const ts = (y: number, m: number, d: number, h = 9) => new Date(y, m - 1, d, h).toISOString()
const WIP_LIMIT = 4
const FAIL_MOVE_ID = 80 // mover este projeto simula erro do banco (otimista desfeito)

const STATUSES: ProjectStatus[] = [
    { id: 12, name: "Aguardando retorno", color: "#f59e0b" },
    { id: 5, name: "Bloqueado", color: "#e11d48" },
    { id: 1, name: "Em desenvolvimento", color: "#3b82f6" },
    { id: 3, name: "Em homologação", color: "#8b5cf6" },
]

const base: Omit<Project, "id" | "title" | "code" | "phase" | "status"> = {
    created_at: ts(2026, 11, 1),
    completed_at: null,
    due_date: null,
    weekly_update: null,
    report_emails: [],
    owner: null,
    real_status_id: null,
    last_individual_sent_at: null,
    last_general_sent_at: null,
    health: "verde",
    health_reason: null,
    steps_total: 0,
    steps_done: 0,
    start_date: "2026-11-01",
    baseline_date: null,
    requester: null,
    area: null,
    sponsor: null,
    origin_ticket: null,
    links: {},
    next_step: null,
    decision_needed: null,
    updated_at: ts(2026, 11, 27),
}

function mk(id: number, title: string, phase: Phase, o: Partial<Project> = {}): Project {
    return { ...base, id, title, phase, status: statusForPhase(phase), code: `PRJ-2026-${String(id).padStart(3, "0")}`, ...o }
}

const PROJECTS: Project[] = [
    mk(92, "Portal de solicitações internas", "execucao", {
        owner: "Pessoa A", real_status_id: 1, steps_total: 4, steps_done: 2,
        start_date: "2026-11-20", baseline_date: "2026-12-04", due_date: "2026-12-04",
        requester: "Área Exemplo 1", area: "Operações", sponsor: "Patrocinador Exemplo", origin_ticket: "CH-0001",
        next_step: "Concluir a tela de acompanhamento", report_emails: ["pessoa.a@example.com"],
        links: { PRD: "https://example.com/prd", Repositório: "https://example.com/repo", invalido: "javascript:alert(1)" },
    }),
    mk(88, "Integração do sistema Alfa com a folha", "escopo", {
        owner: "Pessoa B", health: "amarelo", health_reason: "Aguardando definição dos campos obrigatórios",
        real_status_id: 12, due_date: "2026-12-15", requester: "Área Exemplo 2", area: "Pessoas",
        decision_needed: "Definir quais campos do formulário são obrigatórios",
    }),
    mk(85, "Assistente de aprovações no chat", "seguranca", {
        owner: "Pessoa A", steps_total: 5, steps_done: 4, baseline_date: "2026-11-20", due_date: "2026-11-30",
        requester: "Área Exemplo 3", area: "Vendas", links: { Documento: "https://example.com/doc" },
        next_step: "Revisão de segurança",
    }),
    mk(80, "Roteirizador de entregas", "execucao", {
        owner: "Pessoa C", health: "vermelho", health_reason: "Dependência de fornecedor externo",
        real_status_id: 5, steps_total: 8, steps_done: 3, baseline_date: "2026-11-10", due_date: "2026-11-20",
        requester: "Área Exemplo 4", area: "Logística", sponsor: "Diretoria Exemplo", origin_ticket: "CH-0002",
        decision_needed: "Trocar de fornecedor?",
    }),
    mk(90, "Novo parceiro de cobrança", "abertura", { requester: "Área Exemplo 5", area: "Financeiro" }),
    mk(91, "Painel de indicadores de cobrança", "abertura", { due_date: "2027-01-15", owner: "Pessoa D" }),
    mk(86, "Ajuste da previsão de produção", "homologacao", {
        owner: "Pessoa A", real_status_id: 3, steps_total: 5, steps_done: 5,
        baseline_date: "2026-12-01", due_date: "2026-11-28", requester: "Área Exemplo 6", area: "Produção",
    }),
    mk(87, "Trilha de auditoria de lançamentos", "execucao", {
        owner: "Pessoa E", health: "amarelo", health_reason: "Escopo cresceu após a reunião de alinhamento",
        steps_total: 3, steps_done: 1, baseline_date: "2026-12-10", due_date: "2026-12-10", origin_ticket: "CH-0003",
    }),
    mk(70, "Atualização do sistema de atendimento", "encerrado", {
        owner: "Pessoa C", completed_at: ts(2026, 11, 18), baseline_date: "2026-11-15", due_date: "2026-11-18",
        start_date: "2026-10-01", steps_total: 4, steps_done: 4,
    }),
    mk(60, "Sincronização de dados do painel", "encerrado", {
        owner: "Pessoa A", completed_at: ts(2026, 11, 5), baseline_date: "2026-11-07", due_date: "2026-11-05",
        start_date: "2026-10-20",
    }),
    mk(40, "Inventário de ativos", "encerrado", { completed_at: ts(2026, 8, 10), start_date: "2026-06-01" }),
    mk(41, "Segmentação da rede", "encerrado", { completed_at: ts(2026, 9, 1), start_date: "2026-07-15" }),
]

const EVENTS: Record<number, ProjectEvent[]> = {
    92: [
        { id: 905, kind: "g2", summary: "Etapa 2 aprovada.", author: "Pessoa A", created_at: ts(2026, 11, 27, 16) },
        { id: 904, kind: "g2", summary: "Etapa 1 aprovada.", author: "Pessoa A", created_at: ts(2026, 11, 25, 14) },
        { id: 903, kind: "g1", summary: "Escopo validado pelo solicitante, sem ressalvas.", author: "Pessoa A", created_at: ts(2026, 11, 21, 10) },
        { id: 902, kind: "aberto", summary: "Projeto aberto pela API.", author: "Pessoa A", created_at: ts(2026, 11, 20, 9) },
    ],
    80: [
        { id: 803, kind: "bloqueio", summary: "Fornecedor sem retorno há 7 dias.", author: "Pessoa C", created_at: ts(2026, 11, 21, 11) },
        { id: 802, kind: "mudanca", summary: "Previsto 10/11 → 20/11: retrabalho no cálculo de rotas.", author: "Pessoa C", created_at: ts(2026, 11, 5, 15) },
        { id: 801, kind: "aberto", summary: "Projeto aberto.", author: "Pessoa C", created_at: ts(2026, 10, 2, 9) },
    ],
    70: [
        { id: 702, kind: "encerrado", summary: "Aceite da equipe de suporte.", author: "Pessoa C", created_at: ts(2026, 11, 18, 17) },
        { id: 701, kind: "aberto", summary: "Projeto aberto.", author: "Pessoa C", created_at: ts(2026, 10, 1, 9) },
    ],
}

const delay = (ms = 350) => new Promise((r) => setTimeout(r, ms))

export function QuadroDevClient() {
    const [projects, setProjects] = useState<Project[]>(PROJECTS)
    const [statuses, setStatuses] = useState<ProjectStatus[]>(STATUSES)
    const indicators = useMemo(() => boardIndicators(projects, NOW, WIP_LIMIT), [projects])

    const patchRow = (id: number, patch: Partial<Project>) =>
        setProjects((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)))

    async function onMovePhase(project: Project, phase: Phase): Promise<ActionResult> {
        const before = project
        patchRow(project.id, { phase })
        await delay()
        if (project.id === FAIL_MOVE_ID) {
            setProjects((prev) => prev.map((p) => (p.id === project.id ? { ...p, phase: before.phase } : p)))
            return "Erro ao salvar: falha simulada (projeto de exemplo que sempre falha ao mover)."
        }
        const status = statusForPhase(phase)
        patchRow(project.id, {
            status,
            completed_at: status === "done" ? (project.completed_at ?? NOW.toISOString()) : null,
        })
        return null
    }

    async function onSave(project: Project, patch: ProjectPatch): Promise<ActionResult> {
        await delay()
        if (project.baseline_date && patch.baseline_date !== undefined && patch.baseline_date !== project.baseline_date) {
            return "O prazo prometido só muda pela API, com registro de mudança."
        }
        patchRow(project.id, { ...patch, updated_at: new Date().toISOString() })
        return null
    }

    async function onDelete(id: number): Promise<ActionResult> {
        await delay()
        if (EVENTS[id]?.length) return "Projeto com histórico não pode ser apagado — encerre-o."
        setProjects((prev) => prev.filter((p) => p.id !== id))
        return null
    }

    async function onCreate(title: string): Promise<ActionResult> {
        await delay()
        const id = Math.max(...projects.map((p) => p.id)) + 1
        setProjects((prev) => [mk(id, title, "abertura", { start_date: "2026-11-27", created_at: NOW.toISOString() }), ...prev])
        return null
    }

    async function onCreateStatus(name: string, color: string) {
        await delay()
        if (statuses.some((s) => s.name.toLowerCase() === name.toLowerCase())) {
            return { error: "Já existe uma situação com esse nome." }
        }
        const created: ProjectStatus = { id: Math.max(...statuses.map((s) => s.id)) + 1, name, color }
        setStatuses((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)))
        return { status: created }
    }

    async function onLoadEvents(projectId: number) {
        await delay(500)
        return { events: EVENTS[projectId] ?? [] }
    }

    return (
        <ProjectBoardView
            projects={projects}
            statuses={statuses}
            indicators={indicators}
            now={NOW}
            onOpenSettings={() => window.alert("Na tela real abre a configuração do Status Report Geral.")}
            onMovePhase={onMovePhase}
            onSave={onSave}
            onDelete={onDelete}
            onCreate={onCreate}
            onCreateStatus={onCreateStatus}
            onLoadEvents={onLoadEvents}
        />
    )
}
