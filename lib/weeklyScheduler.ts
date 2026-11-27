// Lógica do tick do relatório semanal, extraída do instrumentation.ts para ser testável.
// O instrumentation.ts só faz a fiação (import dinâmico de @/lib/weeklyReport + setInterval).
//
// ⚠️  ORÇAMENTO DE I/O / EGRESS (Supabase free tier): o tick roda a cada 60s mas só toca no
// banco dentro da janela de disparo; o gate de dia/hora é resolvido em memória antes de qualquer I/O.
//
// ⚠️  DEDUP EM 3 CAMADAS (aprendizado de produção)
//   1. Erro de leitura da config = pula o tick (nunca cai no default).
//   2. Erro de leitura/escrita do marcador de disparo é fail-closed.
//   3. Guarda em memória (firedOccurrenceKey) independe do banco.
import type { ScheduleConfig, WeeklyCycleResult } from "@/types";

export const SCHEDULE_REFRESH_MS = 600_000; // recarrega a config de agendamento a cada 10 min
export const MAX_MARKER_ATTEMPTS = 5;

type CycleStateRead = { ok: true; lastFiredAt: Date | null } | { ok: false };

export type WeeklyTickDeps = {
    getScheduleConfig: () => Promise<ScheduleConfig | null>;
    getCycleLastFiredAt: () => Promise<CycleStateRead>;
    setCycleLastFiredAt: (when: Date) => Promise<boolean>;
    runWeeklyCycle: () => Promise<WeeklyCycleResult>;
    alert: (subject: string, body: string) => Promise<unknown>;
    now: () => Date;
    CycleLoadError: new (message: string) => Error;
    occurrenceStart: (schedule: ScheduleConfig, now: Date) => Date | null;
    shouldFireNow: (schedule: ScheduleConfig, lastFiredAt: Date | null, now: Date) => boolean;
    catchupWindowMs: number;
};

export function createWeeklyTick(deps: WeeklyTickDeps): () => Promise<void> {
    let cachedSchedule: ScheduleConfig | null = null;
    let scheduleLoadedAt = 0;
    let firedOccurrenceKey: string | null = null;
    let markerAttemptsKey: string | null = null;
    let markerAttempts = 0;

    return async function weeklyTick() {
        try {
            // 1. Config de agendamento vem de cache (refresh a cada 10 min). Se a leitura falhar,
            //    mantemos o último schedule conhecido; se nunca lemos nenhum, pulamos o tick.
            const nowMs = deps.now().getTime();
            if (!cachedSchedule || nowMs - scheduleLoadedAt > SCHEDULE_REFRESH_MS) {
                const fresh = await deps.getScheduleConfig();
                if (fresh) {
                    cachedSchedule = fresh;
                    scheduleLoadedAt = nowMs;
                } else if (!cachedSchedule) {
                    return; // sem schedule confiável → não dispara nada
                }
                // leitura falhou mas temos valor anterior: segue com ele (scheduleLoadedAt não avança)
            }
            const schedule = cachedSchedule;

            // 2. Gate barato em memória: fora da janela da ocorrência não tocamos no banco.
            const now = deps.now();
            const occurrence = deps.occurrenceStart(schedule, now);
            if (!occurrence) return;
            if (now.getTime() - occurrence.getTime() > deps.catchupWindowMs) return;

            // 3. Já disparamos esta ocorrência neste processo? Corta antes do banco.
            const occurrenceKey = occurrence.toISOString();
            if (firedOccurrenceKey === occurrenceKey) return;

            // 4. Dentro da janela: lemos o estado de dedup do banco. Falhou = não envia.
            const state = await deps.getCycleLastFiredAt();
            if (!state.ok) return;
            if (!deps.shouldFireNow(schedule, state.lastFiredAt, now)) return;

            // 5. Teto de tentativas de gravar o marcador nesta ocorrência.
            if (markerAttemptsKey !== occurrenceKey) {
                markerAttemptsKey = occurrenceKey;
                markerAttempts = 0;
            }
            if (markerAttempts >= MAX_MARKER_ATTEMPTS) return;
            markerAttempts++;

            // 6. Marca lastFiredAt ANTES de rodar. Se não conseguir gravar, ABORTA.
            const fireTime = deps.now();
            const persisted = await deps.setCycleLastFiredAt(fireTime);
            if (!persisted) {
                console.error(
                    `[WeeklyScheduler] Marcador de disparo não persistiu (tentativa ${markerAttempts}/${MAX_MARKER_ATTEMPTS}) — ciclo abortado para não duplicar envios.`
                );
                return;
            }
            firedOccurrenceKey = occurrenceKey;

            console.log(
                `[WeeklyScheduler] Disparando ciclo — ocorrência ${occurrence.toLocaleString("pt-BR")} (dia ${schedule.dayOfWeek}, ${String(schedule.hour).padStart(2, "0")}:${String(schedule.minute).padStart(2, "0")})`
            );

            let cycle: WeeklyCycleResult;
            try {
                cycle = await deps.runWeeklyCycle();
            } catch (err) {
                if (err instanceof deps.CycleLoadError) {
                    // Leitura falhou ANTES de qualquer envio: devolve o marcador para tentar de novo
                    // no próximo tick (limitado por MAX_MARKER_ATTEMPTS nesta ocorrência).
                    const restored = await deps.setCycleLastFiredAt(state.lastFiredAt ?? new Date(0));
                    if (restored) firedOccurrenceKey = null;
                    console.error(
                        `[WeeklyScheduler] Leitura do banco falhou antes do envio (tentativa ${markerAttempts}/${MAX_MARKER_ATTEMPTS})` +
                        (restored ? " — nova tentativa no próximo tick." : " — marcador não restaurado; ciclo desta semana perdido.")
                    );
                    if (!restored || markerAttempts >= MAX_MARKER_ATTEMPTS) {
                        await deps
                            .alert(
                                "[GLPI Dash] Report semanal NÃO saiu",
                                `O banco não respondeu em ${markerAttempts} tentativa(s) na janela de ${occurrence.toLocaleString("pt-BR")}. ` +
                                `Nenhum e-mail foi enviado. Rode a prévia e o envio manual pela rota /api/cron/weekly-report.\nErro: ${err.message}`
                            )
                            .catch((e) => console.error("[WeeklyScheduler] Alerta para a TI não saiu:", e));
                    }
                    return;
                }
                throw err;
            }

            console.log(
                `[WeeklyScheduler] Individual — ${cycle.individual.succeeded} enviados, ${cycle.individual.failed} falhas, ${cycle.individual.skipped} ignorados, ${cycle.individual.processed} processados.`
            );

            if (cycle.general.enabled) {
                console.log(
                    `[WeeklyScheduler] Geral — sucesso=${cycle.general.success}, exceções=${cycle.general.exceptions}, entregas=${cycle.general.deliveries}, destinatários=${cycle.general.sentTo.length}` +
                    (cycle.general.error ? `, erro=${cycle.general.error}` : "")
                );
            } else {
                console.log("[WeeklyScheduler] Geral desabilitado nas configurações.");
            }
            for (const w of cycle.warnings) console.warn(`[WeeklyScheduler] Aviso: ${w}`);

            console.log(`[WeeklyScheduler] Cleanup — weekly_update limpo em ${cycle.cleared} projeto(s).`);
        } catch (err) {
            console.error("[WeeklyScheduler] Erro no tick:", err);
        }
    };
}
