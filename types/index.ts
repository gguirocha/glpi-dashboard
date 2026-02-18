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

export interface Project {
    id: number;
    title: string;
    status: 'todo' | 'in_progress' | 'done';
    created_at?: string;
    completed_at: string | null;
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
