import type { EventKind, Health, Phase } from '@/lib/projects/domain';

export interface Ticket {
    id: number;
    name: string;
    date_creation: string;
    date_solved: string | null;
    status_id: number;
    status_label: string;
    priority_label: string;
    category_name: string | null;
    location_name: string | null;
    department_name: string | null;
    time_to_resolve: number;
    is_sla_violated: boolean;
    count_cless_one_hour: boolean; // FCR match
    sla_time_limit: string | null; // Deadline
    /** Cursor do fetch incremental — ver lib/tickets.ts */
    last_updated: string | null;
    // Colunas que existem na tabela mas NÃO são buscadas (nenhuma tela usa).
    // Opcionais para não voltarem por acidente ao select — ver TICKET_COLUMNS.
    date_closed?: string | null;
    priority_id?: number;
    slas_id_ttr?: number;
}

export type GroupedData = {
    name: string;
    value: number;
    fill?: string;
}

// Status customizável (catálogo definido pelo usuário)
export interface ProjectStatus {
    id: number;
    name: string;
    color: string | null;
    created_at?: string;
}

export interface Project {
    id: number;
    title: string;
    status: 'todo' | 'in_progress' | 'done';
    created_at?: string;
    completed_at: string | null;
    /** Data limite de entrega (YYYY-MM-DD). null = sem prazo definido. */
    due_date: string | null;
    // --- Weekly Report Feature ---
    weekly_update: string | null;
    report_emails: string[];
    owner: string | null;
    // --- v2: status real customizável e rastreamento de envio ---
    real_status_id: number | null;
    last_individual_sent_at: string | null;
    last_general_sent_at: string | null;
    // --- Quadro v2 ---
    code: string;
    phase: Phase;
    health: Health;
    health_reason: string | null;
    steps_total: number;
    steps_done: number;
    start_date: string | null;
    baseline_date: string | null;
    requester: string | null;
    area: string | null;
    sponsor: string | null;
    origin_ticket: string | null;
    links: Record<string, string>;
    next_step: string | null;
    decision_needed: string | null;
    updated_at: string;
}

export type ProjectEvent = {
    id: number;
    kind: EventKind;
    summary: string;
    author: string;
    created_at: string;
};

export interface TechnicianRanking {
    technician_id: number;
    technician_name: string;
    qtd_chamados: number;
    media_score: number;
    qtd_fora_sla: number;
    pct_fora_sla: number;
    total_chamados: number;
    qtd_atendentes_ativos: number;
    share_ok: number;
    share_real: number;
    k_bayes: number;
    media_bayes: number;
    volume_factor: number;
    media_justa: number;
    bonus_volume: number;
    media_final: number;
}

// Agendamento do ciclo semanal — configurável por admin via UI
export interface ScheduleConfig {
    dayOfWeek: number; // 0=Domingo, 1=Segunda, 2=Terça, 3=Quarta, 4=Quinta, 5=Sexta, 6=Sábado
    hour: number;      // 0-23 (fuso da EC2 / servidor)
    minute: number;    // 0-59
}

// Config do Status Report Geral (sintese executiva enviada à diretoria)
export interface GeneralReportConfig {
    emails: string[];
    enabled: boolean;
    schedule?: ScheduleConfig; // se ausente, aplica default Segunda 08:00
}

/** E-mail montado pelo ciclo semanal (devolvido só no modo prévia). */
export interface RenderedReportEmail {
    to: string[];
    subject: string;
    text: string;
    html: string;
}

export interface IndividualReportResult {
    projectId: number;
    code: string;
    title: string;
    sentTo: string[];
    success: boolean;
    error?: string;
    /** true quando a IA falhou e o texto da semana saiu sem redação (fatos continuam completos). */
    narrativeFallback: boolean;
    email?: RenderedReportEmail;
}

export interface GeneralReportResult {
    enabled: boolean;
    sentTo: string[];
    exceptions: number;
    deliveries: number;
    /** Projetos citados no e-mail entregue (exceções + entregas). Vazio se não enviou. */
    includedProjectIds: number[];
    success: boolean;
    error?: string;
    summaryFallback: boolean;
    email?: RenderedReportEmail;
}

export interface WeeklyCycleResult {
    /** Prévia: monta os e-mails e não envia, não marca envio e não limpa o andamento. */
    preview: boolean;
    at: string;
    individual: {
        processed: number;
        succeeded: number;
        failed: number;
        skipped: number;
        results: IndividualReportResult[];
    };
    general: GeneralReportResult;
    /** Quantidade de projetos cujo weekly_update foi limpo após envio bem-sucedido */
    cleared: number;
    /** Falhas que não impediram o envio (IA fora, marcação não gravada, sem destinatários). */
    warnings: string[];
}
