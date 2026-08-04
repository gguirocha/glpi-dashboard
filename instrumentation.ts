// instrumentation.ts
// Roda UMA VEZ quando o servidor Next.js inicia (dev e produção).
// Registra o scheduler do relatório semanal — sem dependência de Vercel Cron.
//
// ⚠️  ORÇAMENTO DE I/O / EGRESS (Supabase free tier)
// Regra de ouro deste arquivo: só tocar no banco quando há motivo. O tick do
// semanal roda a cada 60s mas em ~99,8% das vezes não faz nenhuma requisição —
// o gate de dia/hora é resolvido em memória antes de qualquer I/O.

// ──────────────────────────────────────────────────────────────────────────────
// Configuração dos intervalos — ajuste aqui se precisar
// ──────────────────────────────────────────────────────────────────────────────
const WEEKLY_TICK_MS = 60_000;           // tick do semanal (barato: só faz math, sem DB fora da janela)
const SCHEDULE_REFRESH_MS = 600_000;     // recarrega a config de agendamento a cada 10 min

export async function register() {
    if (process.env.NEXT_RUNTIME !== "nodejs") return;

    console.log("[Instrumentation] Iniciando scheduler do relatório semanal...");

    // ──────────────────────────────────────────────
    // Relatório semanal — tick frequente, mas só toca no banco dentro da janela
    // de disparo (dia/hora agendados). Fora disso é só Date math.
    // ──────────────────────────────────────────────
    setTimeout(() => {
        weeklyTick();
        setInterval(weeklyTick, WEEKLY_TICK_MS);
    }, 30_000);
}

// ──────────────────────────────────────────────────────────────────────────────
// Tick semanal — gate em memória ANTES de ler o banco
//
// ⚠️  DEDUP EM 3 CAMADAS (aprendizado de produção)
// O modelo antigo disparava o ciclo em dia/hora errados e reenviava os e-mails
// várias vezes. Três causas, todas corrigidas aqui:
//   1. Erro de leitura da config caía no default (Segunda 08:00) — o ciclo rodava
//      num agendamento que ninguém configurou. Agora erro de leitura = pula o tick.
//   2. Erro de leitura/escrita do marcador de disparo era só logado e o ciclo
//      rodava assim mesmo — a cada 60s, o dia inteiro. Agora é fail-closed.
//   3. Não havia guarda em memória: qualquer falha no banco reabria o disparo.
// ──────────────────────────────────────────────────────────────────────────────
let cachedSchedule: import("@/types").ScheduleConfig | null = null;
let scheduleLoadedAt = 0;

// Guarda em memória — ocorrência (instante agendado) já disparada por este
// processo. Independe do banco: mesmo com o Supabase fora, não reenviamos.
let firedOccurrenceKey: string | null = null;

// Tentativas de gravar o marcador na ocorrência corrente. Sem esse teto, uma
// indisponibilidade prolongada do banco viraria retry infinito dentro da janela.
let markerAttemptsKey: string | null = null;
let markerAttempts = 0;
const MAX_MARKER_ATTEMPTS = 5;

async function weeklyTick() {
    try {
        const wr = await import("@/lib/weeklyReport");

        // 1. Config de agendamento vem de cache (refresh a cada 10 min) — evita
        //    2 leituras/min no banco só para saber o dia/hora agendados.
        //    Se a leitura falhar, mantemos o último schedule conhecido; se nunca
        //    conseguimos ler nenhum, pulamos o tick (nunca chutamos um horário).
        const nowMs = Date.now();
        if (!cachedSchedule || nowMs - scheduleLoadedAt > SCHEDULE_REFRESH_MS) {
            const fresh = await wr.getScheduleConfig();
            if (fresh) {
                cachedSchedule = fresh;
                scheduleLoadedAt = nowMs;
            } else if (!cachedSchedule) {
                return; // sem schedule confiável → não dispara nada
            }
            // leitura falhou mas temos valor anterior: segue com ele e tenta de
            // novo no próximo tick (scheduleLoadedAt não avança)
        }
        const schedule = cachedSchedule;

        // 2. Gate barato em memória: fora da janela da ocorrência não tocamos no
        //    banco. Zero I/O em ~99,8% dos ticks.
        const now = new Date();
        const occurrence = wr.occurrenceStart(schedule, now);
        if (!occurrence) return;
        if (now.getTime() - occurrence.getTime() > wr.CATCHUP_WINDOW_MS) return;

        // 3. Já disparamos esta ocorrência neste processo? Corta antes do banco.
        const occurrenceKey = occurrence.toISOString();
        if (firedOccurrenceKey === occurrenceKey) return;

        // 4. Dentro da janela: agora sim lemos o estado de dedup do banco.
        //    Leitura falhou = não sabemos se já enviamos → não envia.
        const state = await wr.getCycleLastFiredAt();
        if (!state.ok) return;
        if (!wr.shouldFireNow(schedule, state.lastFiredAt, now)) return;

        // 5. Teto de tentativas de gravar o marcador nesta ocorrência.
        if (markerAttemptsKey !== occurrenceKey) {
            markerAttemptsKey = occurrenceKey;
            markerAttempts = 0;
        }
        if (markerAttempts >= MAX_MARKER_ATTEMPTS) return;
        markerAttempts++;

        // 6. Marca lastFiredAt ANTES de rodar. Se não conseguir gravar, ABORTA:
        //    rodar sem marcador é o que causava o reenvio a cada 60s.
        const fireTime = new Date();
        const persisted = await wr.setCycleLastFiredAt(fireTime);
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

        const cycle = await wr.runWeeklyCycle();

        console.log(
            `[WeeklyScheduler] Individual — ${cycle.individual.succeeded} enviados, ${cycle.individual.failed} falhas, ${cycle.individual.skipped} ignorados, ${cycle.individual.processed} processados.`
        );

        if (cycle.general.enabled) {
            console.log(
                `[WeeklyScheduler] Geral — sucesso=${cycle.general.success}, projetos=${cycle.general.projectsIncluded}, destinatários=${cycle.general.sentTo.length}` +
                (cycle.general.error ? `, erro=${cycle.general.error}` : "")
            );
        } else {
            console.log("[WeeklyScheduler] Geral desabilitado nas configurações.");
        }

        console.log(`[WeeklyScheduler] Cleanup — weekly_update limpo em ${cycle.cleared} projeto(s).`);
    } catch (err) {
        console.error("[WeeklyScheduler] Erro no tick:", err);
    }
}
