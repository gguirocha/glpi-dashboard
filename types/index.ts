export interface Ticket {
    id: number;
    name: string;
    date_creation: string;
    date_solved: string | null;
    date_closed: string | null;
    status_id: number;
    status_label: string;
    priority_id: number;
    priority_label: string;
    category_name: string | null;
    location_name: string | null;
    department_name: string | null;
    time_to_resolve: number;
    slas_id_ttr: number;
    is_sla_violated: boolean;
    count_cless_one_hour: boolean; // FCR match
    sla_time_limit: string | null; // Deadline
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
    // --- Weekly Report Feature ---
    weekly_update: string | null;
    report_emails: string[];
    owner: string | null;
    // --- v2: status real customizável e rastreamento de envio ---
    real_status_id: number | null;
    last_individual_sent_at: string | null;
    last_general_sent_at: string | null;
}

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

export interface WeeklyReportPayload {
    project: Project;
    generatedEmail: string;
    sentTo: string[];
    sentAt: string;
    success: boolean;
    error?: string;
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

export interface GeneralReportResult {
    enabled: boolean;
    sentTo: string[];
    projectsIncluded: number;
    /** IDs dos projetos que foram efetivamente incluídos no e-mail consolidado entregue com sucesso. Vazio se o envio falhou. */
    includedProjectIds: number[];
    generatedEmail: string;
    success: boolean;
    error?: string;
    sentAt: string;
}

export interface WeeklyCycleResult {
    individual: {
        processed: number;
        succeeded: number;
        failed: number;
        skipped: number;
        results: WeeklyReportPayload[];
    };
    general: GeneralReportResult;
    /** Quantidade de projetos cujo weekly_update foi limpo após envio bem-sucedido */
    cleared: number;
}
