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
