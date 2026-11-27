// instrumentation.ts
// Roda UMA VEZ quando o servidor Next.js inicia (dev e produção).
// Registra o scheduler do relatório semanal — sem dependência de Vercel Cron.
//
// A lógica do tick (gate em memória, dedup em 3 camadas, marcador de disparo) vive em
// lib/weeklyScheduler.ts; aqui fica só a fiação.
//
// ⚠️  ORÇAMENTO DE I/O / EGRESS (Supabase free tier): o tick roda a cada 60s mas em ~99,8% das
// vezes não faz nenhuma requisição — o gate de dia/hora é resolvido em memória antes de qualquer I/O.

const WEEKLY_TICK_MS = 60_000;           // tick do semanal (barato: só faz math, sem DB fora da janela)

export async function register() {
    if (process.env.NEXT_RUNTIME !== "nodejs") return;

    console.log("[Instrumentation] Iniciando scheduler do relatório semanal...");

    setTimeout(() => {
        weeklyTick();
        setInterval(weeklyTick, WEEKLY_TICK_MS);
    }, 30_000);
}

let tick: (() => Promise<void>) | null = null;

async function weeklyTick() {
    try {
        if (!tick) {
            const wr = await import("@/lib/weeklyReport");
            const { createWeeklyTick } = await import("@/lib/weeklyScheduler");
            tick = createWeeklyTick({
                getScheduleConfig: wr.getScheduleConfig,
                getCycleLastFiredAt: wr.getCycleLastFiredAt,
                setCycleLastFiredAt: wr.setCycleLastFiredAt,
                runWeeklyCycle: () => wr.runWeeklyCycle(),
                alert: (subject, body) => wr.supabaseDeps().alert(subject, body),
                now: () => new Date(),
                CycleLoadError: wr.CycleLoadError,
                occurrenceStart: wr.occurrenceStart,
                shouldFireNow: wr.shouldFireNow,
                catchupWindowMs: wr.CATCHUP_WINDOW_MS,
            });
        }
        await tick();
    } catch (err) {
        console.error("[WeeklyScheduler] Erro no tick:", err);
    }
}
