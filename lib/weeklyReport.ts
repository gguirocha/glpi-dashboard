// lib/weeklyReport.ts
// Lógica core do relatório semanal — usada pelo instrumentation.ts (scheduler)
// e pela API route (trigger manual / testes)

import { createClient, SupabaseClient } from "@supabase/supabase-js";
import nodemailer, { Transporter } from "nodemailer";
import {
    Project,
    ProjectStatus,
    WeeklyReportPayload,
    GeneralReportConfig,
    GeneralReportResult,
    ScheduleConfig,
} from "@/types";

// Default — Segunda-feira às 08:00 (fuso do servidor)
export const DEFAULT_SCHEDULE: ScheduleConfig = { dayOfWeek: 1, hour: 8, minute: 0 };

// Tipo local — projeto com o status real (joined) carregado
type ProjectWithStatus = Project & { real_status: ProjectStatus | null };

// ──────────────────────────────────────────────────
// Mapas de label
// ──────────────────────────────────────────────────
const WORKFLOW_STATUS_LABEL: Record<Project["status"], string> = {
    todo: "AGUARDANDO",
    in_progress: "EM ANDAMENTO",
    done: "CONCLUÍDO",
};

// ──────────────────────────────────────────────────
// Supabase com service_role (contorna RLS)
// ──────────────────────────────────────────────────
function getSupabase(): SupabaseClient {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error("Missing Supabase credentials");
    return createClient(url, key);
}

// ──────────────────────────────────────────────────
// Nodemailer — Hostinger SMTP
// ──────────────────────────────────────────────────
function createTransporter(): Transporter {
    const host = process.env.SMTP_HOST;
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;

    if (!host || !user || !pass) {
        throw new Error("Missing SMTP credentials (SMTP_HOST, SMTP_USER, SMTP_PASS)");
    }

    return nodemailer.createTransport({
        host,
        port: Number(process.env.SMTP_PORT ?? 465),
        secure: process.env.SMTP_SECURE !== "false", // Hostinger usa 465 + SSL
        auth: { user, pass },
    });
}

// ──────────────────────────────────────────────────
// Gemini — wrapper genérico com retry exponencial
// ──────────────────────────────────────────────────
async function callGemini(prompt: string, label: string): Promise<string> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("Missing GEMINI_API_KEY");

    const model = process.env.GEMINI_MODEL ?? "gemini-2.5-flash-lite";

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    const body = JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 2048,
        },
    });

    // Retry exponencial: 1s, 3s, 9s — total ~13s no pior caso
    const RETRYABLE = new Set([429, 500, 502, 503, 504]);
    const MAX_ATTEMPTS = 4;
    let response: Response | null = null;
    let lastErr = "";

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        try {
            response = await fetch(url, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body,
            });

            if (response.ok) break;

            const errBody = await response.text();
            lastErr = `Gemini API error ${response.status}: ${errBody}`;

            if (!RETRYABLE.has(response.status)) {
                throw new Error(lastErr);
            }

            console.warn(
                `[WeeklyReport] Gemini ${response.status} (tentativa ${attempt}/${MAX_ATTEMPTS}) — ${label}`
            );
        } catch (err) {
            if (err instanceof Error && !err.message.startsWith("Gemini API error")) {
                lastErr = `Network error: ${err.message}`;
                console.warn(
                    `[WeeklyReport] Network fail (tentativa ${attempt}/${MAX_ATTEMPTS}) — ${err.message}`
                );
            } else {
                throw err;
            }
        }

        if (attempt < MAX_ATTEMPTS) {
            const delayMs = 1000 * Math.pow(3, attempt - 1);
            await new Promise((r) => setTimeout(r, delayMs));
        }
    }

    if (!response || !response.ok) {
        throw new Error(`${lastErr} (após ${MAX_ATTEMPTS} tentativas)`);
    }

    const data = await response.json();
    const text =
        data?.candidates?.[0]?.content?.parts
            ?.map((p: { text?: string }) => p.text ?? "")
            .join("") ?? "";

    if (!text.trim()) {
        const finishReason = data?.candidates?.[0]?.finishReason ?? "unknown";
        throw new Error(`Gemini retornou resposta vazia (finishReason=${finishReason})`);
    }

    return text.trim();
}

// ──────────────────────────────────────────────────
// Builders de prompt
// ──────────────────────────────────────────────────
function buildIndividualPrompt(project: ProjectWithStatus, weekLabel: string): string {
    const workflowStatus = WORKFLOW_STATUS_LABEL[project.status];
    const realStatus = project.real_status?.name ?? "Não classificado";

    return `Você é um assistente especializado em comunicação corporativa.
Gere um e-mail de status report semanal profissional, conciso e em português do Brasil para o seguinte projeto.

Dados do Projeto:
- Nome: ${project.title}
- Status do fluxo: ${workflowStatus}
- Status real do projeto: ${realStatus}
- Responsável: ${project.owner ?? "Não informado"}
- Semana de referência: ${weekLabel}
${project.completed_at ? `- Data de conclusão: ${new Date(project.completed_at).toLocaleDateString("pt-BR")}` : ""}

Atualização da semana (fornecida pelo gestor):
${project.weekly_update ?? "Sem atualização registrada para esta semana."}

Instruções OBRIGATÓRIAS:
- Escreva APENAS o corpo do e-mail (sem linha de assunto)
- Comece com uma saudação formal: "Prezados,"
- SEMPRE indique o status do fluxo do projeto de forma destacada no início (AGUARDANDO, EM ANDAMENTO ou CONCLUÍDO)
- SEMPRE inclua o status real (categoria detalhada) quando disponível
- Apresente os pontos relevantes da atualização de forma clara e objetiva
- Indique próximos passos quando houver
- Finalize com: "Atenciosamente,\\nEquipe de Projetos"
- Máximo de 250 palavras
- Texto puro, sem markdown, sem HTML, sem bullet points especiais`;
}

function buildGeneralPrompt(projects: ProjectWithStatus[], weekLabel: string): string {
    // Agrupa por status do fluxo
    const grouped: Record<Project["status"], ProjectWithStatus[]> = {
        in_progress: [],
        todo: [],
        done: [],
    };
    for (const p of projects) grouped[p.status].push(p);

    const formatProject = (p: ProjectWithStatus): string => {
        const realStatus = p.real_status?.name ?? "Não classificado";
        const ownerLine = p.owner ? `   Responsável: ${p.owner}` : `   Responsável: Não informado`;
        const completedLine = p.completed_at
            ? `   Concluído em: ${new Date(p.completed_at).toLocaleDateString("pt-BR")}`
            : "";
        return `• [${realStatus}] ${p.title}
${ownerLine}${completedLine ? "\n" + completedLine : ""}
   Atualização: ${p.weekly_update ?? "Sem atualização."}`;
    };

    const sections: string[] = [];
    if (grouped.in_progress.length) {
        sections.push(`## EM ANDAMENTO (${grouped.in_progress.length})\n${grouped.in_progress.map(formatProject).join("\n\n")}`);
    }
    if (grouped.todo.length) {
        sections.push(`## AGUARDANDO (${grouped.todo.length})\n${grouped.todo.map(formatProject).join("\n\n")}`);
    }
    if (grouped.done.length) {
        sections.push(`## CONCLUÍDO (${grouped.done.length})\n${grouped.done.map(formatProject).join("\n\n")}`);
    }

    return `Você é um analista executivo. Sua tarefa é gerar um STATUS REPORT CONSOLIDADO de todos os projetos abaixo, em português do Brasil, no formato de e-mail para a diretoria/heads da empresa.

Semana de referência: ${weekLabel}
Total de projetos: ${projects.length}

=== ENTRADA — PROJETOS ===

${sections.join("\n\n")}

=== INSTRUÇÕES OBRIGATÓRIAS ===

- Escreva APENAS o corpo do e-mail (sem linha de assunto)
- Comece com saudação formal: "Prezados,"
- Faça um SUMÁRIO EXECUTIVO de 2 a 3 linhas no início destacando: total de projetos ativos, marcos da semana e principais riscos/bloqueios
- Em seguida, agrupe os projetos por status do fluxo (EM ANDAMENTO / AGUARDANDO / CONCLUÍDO) — esses títulos DEVEM aparecer em CAIXA ALTA
- Para cada projeto:
  * SEMPRE mostre o nome
  * SEMPRE inclua o status real entre colchetes [ex: Em desenvolvimento, Em homologação, Bloqueado, etc]
  * SEMPRE inclua o responsável (ou "Não informado")
  * Sintetize a atualização da semana em 1-2 frases — NÃO copie o texto literal
- Destaque RISCOS, BLOQUEIOS e MARCOS importantes ao longo do texto
- Encerre com 1-2 linhas de fechamento + "Atenciosamente,\\nEquipe de Projetos"
- Máximo de 600 palavras
- Texto puro, sem markdown, sem HTML, sem tabelas — apenas formatação por quebra de linhas e CAIXA ALTA para títulos`;
}

// ──────────────────────────────────────────────────
// Helpers de elegibilidade
// ──────────────────────────────────────────────────
function isEligibleFor(
    project: ProjectWithStatus,
    channel: "individual" | "general"
): boolean {
    // todo / in_progress: sempre elegível
    if (project.status !== "done") return true;

    // done: só envia uma vez após a conclusão
    if (!project.completed_at) return false; // sem data de conclusão, ignora

    const lastSentRaw =
        channel === "individual"
            ? project.last_individual_sent_at
            : project.last_general_sent_at;

    if (!lastSentRaw) return true; // nunca enviou → envia
    return new Date(lastSentRaw) < new Date(project.completed_at);
}

// ──────────────────────────────────────────────────
// Fetch base — projetos com weekly_update + status real (join)
// ──────────────────────────────────────────────────
async function fetchProjectsWithUpdate(
    supabase: SupabaseClient
): Promise<ProjectWithStatus[]> {
    const { data, error } = await supabase
        .from("dashboard_projects")
        .select("*, real_status:dashboard_project_statuses(id, name, color)")
        .not("weekly_update", "is", null)
        .neq("weekly_update", "");

    if (error) throw new Error(`Supabase fetch error: ${error.message}`);
    return (data ?? []) as ProjectWithStatus[];
}

// ──────────────────────────────────────────────────
// Relatório INDIVIDUAL — um e-mail por projeto com report_emails configurado
// ──────────────────────────────────────────────────
export async function runWeeklyReport(): Promise<{
    processed: number;
    succeeded: number;
    failed: number;
    skipped: number;
    results: WeeklyReportPayload[];
}> {
    const supabase = getSupabase();

    const now = new Date();
    const weekLabel = now.toLocaleDateString("pt-BR", {
        day: "2-digit",
        month: "long",
        year: "numeric",
    });

    const allProjects = await fetchProjectsWithUpdate(supabase);

    // Apenas projetos com pelo menos 1 email configurado
    const candidates = allProjects.filter((p) => (p.report_emails?.length ?? 0) > 0);

    // Aplica regra de elegibilidade do "done"
    const eligible = candidates.filter((p) => isEligibleFor(p, "individual"));
    const skipped = candidates.length - eligible.length;

    if (eligible.length === 0) {
        console.log(
            `[WeeklyReport] Nenhum projeto elegível para envio individual (${skipped} ignorados).`
        );
        return { processed: 0, succeeded: 0, failed: 0, skipped, results: [] };
    }

    console.log(
        `[WeeklyReport] Processando ${eligible.length} projeto(s) individual(is)... (${skipped} ignorados pela regra do done)`
    );

    const transporter = createTransporter();

    const results: WeeklyReportPayload[] = await Promise.all(
        eligible.map(async (project) => {
            try {
                const emailBody = await callGemini(
                    buildIndividualPrompt(project, weekLabel),
                    `individual:${project.title}`
                );

                const subject = `[Status Report] ${project.title} — Semana de ${weekLabel}`;

                await transporter.sendMail({
                    from: `"${process.env.SMTP_FROM_NAME ?? "Gestão de Projetos"}" <${process.env.SMTP_USER}>`,
                    to: project.report_emails.join(", "),
                    subject,
                    text: emailBody,
                    html: `<div style="font-family: Arial, sans-serif; font-size: 14px; line-height: 1.7; color: #333; max-width: 600px;">
                        <pre style="white-space: pre-wrap; font-family: inherit;">${emailBody}</pre>
                    </div>`,
                });

                console.log(
                    `[WeeklyReport] ✅ "${project.title}" → ${project.report_emails.join(", ")}`
                );

                return {
                    project,
                    generatedEmail: emailBody,
                    sentTo: project.report_emails,
                    sentAt: now.toISOString(),
                    success: true,
                };
            } catch (err: unknown) {
                const message = err instanceof Error ? err.message : "Unknown error";
                console.error(`[WeeklyReport] ❌ "${project.title}": ${message}`);
                return {
                    project,
                    generatedEmail: "",
                    sentTo: [],
                    sentAt: now.toISOString(),
                    success: false,
                    error: message,
                };
            }
        })
    );

    // Batch update last_individual_sent_at apenas dos que foram bem-sucedidos
    const successIds = results.filter((r) => r.success).map((r) => r.project.id);
    if (successIds.length > 0) {
        const { error: updErr } = await supabase
            .from("dashboard_projects")
            .update({ last_individual_sent_at: now.toISOString() })
            .in("id", successIds);
        if (updErr) {
            console.error(
                `[WeeklyReport] Falha ao atualizar last_individual_sent_at: ${updErr.message}`
            );
        }
    }

    const succeeded = successIds.length;
    const failed = results.length - succeeded;

    console.log(
        `[WeeklyReport] Individual concluído — ${succeeded} enviados, ${failed} falhas, ${skipped} ignorados.`
    );

    return { processed: eligible.length, succeeded, failed, skipped, results };
}

// ──────────────────────────────────────────────────
// Relatório GERAL — um único e-mail consolidado para os heads
// ──────────────────────────────────────────────────
export async function runGeneralReport(): Promise<GeneralReportResult> {
    const supabase = getSupabase();
    const now = new Date();

    // 1. Lê config
    const { data: configRow, error: configErr } = await supabase
        .from("dashboard_settings")
        .select("value")
        .eq("key", "general_report")
        .maybeSingle();

    if (configErr) throw new Error(`Settings fetch error: ${configErr.message}`);

    const config: GeneralReportConfig =
        (configRow?.value as GeneralReportConfig | undefined) ?? {
            emails: [],
            enabled: false,
        };

    if (!config.enabled) {
        console.log("[GeneralReport] Relatório geral desabilitado nas configurações.");
        return {
            enabled: false,
            sentTo: [],
            projectsIncluded: 0,
            includedProjectIds: [],
            generatedEmail: "",
            success: true,
            sentAt: now.toISOString(),
        };
    }

    if (!config.emails || config.emails.length === 0) {
        console.log("[GeneralReport] Sem destinatários configurados.");
        return {
            enabled: true,
            sentTo: [],
            projectsIncluded: 0,
            includedProjectIds: [],
            generatedEmail: "",
            success: true,
            sentAt: now.toISOString(),
        };
    }

    // 2. Busca projetos elegíveis
    const allProjects = await fetchProjectsWithUpdate(supabase);
    const eligible = allProjects.filter((p) => isEligibleFor(p, "general"));

    if (eligible.length === 0) {
        console.log("[GeneralReport] Nenhum projeto elegível para o relatório geral.");
        return {
            enabled: true,
            sentTo: config.emails,
            projectsIncluded: 0,
            includedProjectIds: [],
            generatedEmail: "",
            success: true,
            sentAt: now.toISOString(),
        };
    }

    const weekLabel = now.toLocaleDateString("pt-BR", {
        day: "2-digit",
        month: "long",
        year: "numeric",
    });

    console.log(
        `[GeneralReport] Sintetizando ${eligible.length} projeto(s) para ${config.emails.length} destinatário(s)...`
    );

    try {
        const emailBody = await callGemini(
            buildGeneralPrompt(eligible, weekLabel),
            `general:${eligible.length}-projects`
        );

        const subject = `[Status Report Consolidado] Projetos — Semana de ${weekLabel}`;

        const transporter = createTransporter();
        await transporter.sendMail({
            from: `"${process.env.SMTP_FROM_NAME ?? "Gestão de Projetos"}" <${process.env.SMTP_USER}>`,
            to: config.emails.join(", "),
            subject,
            text: emailBody,
            html: `<div style="font-family: Arial, sans-serif; font-size: 14px; line-height: 1.7; color: #333; max-width: 700px;">
                <pre style="white-space: pre-wrap; font-family: inherit;">${emailBody}</pre>
            </div>`,
        });

        console.log(
            `[GeneralReport] ✅ Consolidado enviado para ${config.emails.join(", ")}`
        );

        // 3. Batch update — todos os projetos incluídos receberam last_general_sent_at
        const includedIds = eligible.map((p) => p.id);
        const { error: updErr } = await supabase
            .from("dashboard_projects")
            .update({ last_general_sent_at: now.toISOString() })
            .in("id", includedIds);
        if (updErr) {
            console.error(
                `[GeneralReport] Falha ao atualizar last_general_sent_at: ${updErr.message}`
            );
        }

        return {
            enabled: true,
            sentTo: config.emails,
            projectsIncluded: eligible.length,
            includedProjectIds: includedIds,
            generatedEmail: emailBody,
            success: true,
            sentAt: now.toISOString(),
        };
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Unknown error";
        console.error(`[GeneralReport] ❌ Falha: ${message}`);
        return {
            enabled: true,
            sentTo: config.emails,
            projectsIncluded: eligible.length,
            includedProjectIds: [], // envio falhou — não marcamos nenhum como reportado
            generatedEmail: "",
            success: false,
            error: message,
            sentAt: now.toISOString(),
        };
    }
}

// ──────────────────────────────────────────────────
// Schedule helpers — usados pelo tick-scheduler do instrumentation.ts
// ──────────────────────────────────────────────────

/** Lê apenas o schedule configurado (com fallback para o default). */
export async function getScheduleConfig(): Promise<ScheduleConfig> {
    const supabase = getSupabase();
    const { data, error } = await supabase
        .from("dashboard_settings")
        .select("value")
        .eq("key", "general_report")
        .maybeSingle();

    if (error) {
        console.warn(`[Schedule] Falha ao ler config (${error.message}) — usando default.`);
        return DEFAULT_SCHEDULE;
    }
    const cfg = data?.value as GeneralReportConfig | undefined;
    return cfg?.schedule ?? DEFAULT_SCHEDULE;
}

/** Lê o timestamp da última execução bem-sucedida do ciclo (ou null se nunca rodou). */
export async function getCycleLastFiredAt(): Promise<Date | null> {
    const supabase = getSupabase();
    const { data, error } = await supabase
        .from("dashboard_settings")
        .select("value")
        .eq("key", "weekly_cycle_state")
        .maybeSingle();

    if (error) {
        console.warn(`[Schedule] Falha ao ler cycle_state (${error.message}).`);
        return null;
    }
    const ts = (data?.value as { lastFiredAt?: string } | undefined)?.lastFiredAt;
    return ts ? new Date(ts) : null;
}

/** Persiste o timestamp da execução para evitar duplo-disparo no mesmo dia. */
export async function setCycleLastFiredAt(when: Date): Promise<void> {
    const supabase = getSupabase();
    const { error } = await supabase
        .from("dashboard_settings")
        .upsert({
            key: "weekly_cycle_state",
            value: { lastFiredAt: when.toISOString() },
            updated_at: new Date().toISOString(),
        });
    if (error) {
        console.error(`[Schedule] Falha ao persistir lastFiredAt: ${error.message}`);
    }
}

/**
 * Decide se o ciclo deve disparar agora.
 *
 * Regras:
 * - Dia da semana de `now` precisa bater com `schedule.dayOfWeek`
 * - Hora atual >= hora agendada (catch-up dentro do mesmo dia se servidor estava off)
 * - Não pode ter disparado nenhuma vez no mesmo dia calendário (dedup conservador)
 *
 * Pura e testável — não toca rede.
 */
export function shouldFireNow(
    schedule: ScheduleConfig,
    lastFiredAt: Date | null,
    now: Date = new Date()
): boolean {
    if (now.getDay() !== schedule.dayOfWeek) return false;

    const scheduledToday = new Date(now);
    scheduledToday.setHours(schedule.hour, schedule.minute, 0, 0);
    if (now < scheduledToday) return false;

    if (lastFiredAt) {
        const sameDay =
            lastFiredAt.getFullYear() === now.getFullYear() &&
            lastFiredAt.getMonth() === now.getMonth() &&
            lastFiredAt.getDate() === now.getDate();
        if (sameDay) return false;
    }

    return true;
}

// ──────────────────────────────────────────────────
// Orquestrador — ciclo completo (individual + geral + cleanup)
// ──────────────────────────────────────────────────
// Esta é a função usada pelo scheduler do instrumentation.ts e pelo endpoint
// manual. Garante que o `weekly_update` só seja limpo APÓS ambos relatórios
// terem rodado (do contrário o relatório geral perderia os projetos cujos
// individuais foram enviados).
//
// Apenas projetos cujos envios foram bem-sucedidos têm o campo limpo —
// projetos que falharam mantêm a atualização para o próximo ciclo retentar.
export async function runWeeklyCycle(): Promise<import("@/types").WeeklyCycleResult> {
    const supabase = getSupabase();

    const individual = await runWeeklyReport();
    const general = await runGeneralReport();

    // União dos IDs efetivamente reportados em qualquer canal
    const reported = new Set<number>();
    for (const r of individual.results) {
        if (r.success) reported.add(r.project.id);
    }
    if (general.success) {
        for (const id of general.includedProjectIds) reported.add(id);
    }

    let cleared = 0;
    if (reported.size > 0) {
        const ids = Array.from(reported);
        const { error: clearErr } = await supabase
            .from("dashboard_projects")
            .update({ weekly_update: null })
            .in("id", ids);

        if (clearErr) {
            console.error(
                `[WeeklyCycle] Falha ao limpar weekly_update: ${clearErr.message}`
            );
        } else {
            cleared = ids.length;
            console.log(
                `[WeeklyCycle] weekly_update limpo em ${cleared} projeto(s) reportado(s) com sucesso.`
            );
        }
    } else {
        console.log("[WeeklyCycle] Nada a limpar — nenhum envio bem-sucedido neste ciclo.");
    }

    return { individual, general, cleared };
}
