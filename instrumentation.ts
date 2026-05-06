// instrumentation.ts
// Roda UMA VEZ quando o servidor Next.js inicia (dev e produção).
// Registra dois schedulers em background — sem dependência de Vercel Cron.

export async function register() {
    if (process.env.NEXT_RUNTIME !== "nodejs") return;

    console.log("[Instrumentation] Iniciando schedulers em background...");

    // ──────────────────────────────────────────────
    // Scheduler 1: Ping de rede — a cada 60 segundos
    // ──────────────────────────────────────────────
    setTimeout(() => {
        runPingCycle();
        setInterval(runPingCycle, 60_000);
    }, 10_000);

    // ──────────────────────────────────────────────
    // Scheduler 2: Relatório semanal — tick a cada 60s, configurável via UI
    //
    // O tick lê dia/horário configurados em dashboard_settings.general_report.schedule
    // e dispara quando bate o momento. Mudanças na config são pegas no próximo tick
    // (sem necessidade de restart). Dedup via dashboard_settings.weekly_cycle_state.
    // ──────────────────────────────────────────────
    setTimeout(() => {
        weeklyTick();
        setInterval(weeklyTick, 60_000);
    }, 30_000);
}

// ──────────────────────────────────────────────────────────────────────────────
// Tick semanal — executa a cada 60s, decide se dispara
// ──────────────────────────────────────────────────────────────────────────────
async function weeklyTick() {
    try {
        const { getScheduleConfig, getCycleLastFiredAt, setCycleLastFiredAt, shouldFireNow, runWeeklyCycle } =
            await import("@/lib/weeklyReport");

        const [schedule, lastFiredAt] = await Promise.all([
            getScheduleConfig(),
            getCycleLastFiredAt(),
        ]);

        if (!shouldFireNow(schedule, lastFiredAt)) return;

        const fireTime = new Date();
        console.log(
            `[WeeklyScheduler] Disparando ciclo — agendamento: dia ${schedule.dayOfWeek}, ${String(schedule.hour).padStart(2, "0")}:${String(schedule.minute).padStart(2, "0")}`
        );

        // Marca lastFiredAt ANTES de rodar — se o ciclo crashar mid-flight,
        // não fica em loop tentando re-disparar a cada tick subsequente
        await setCycleLastFiredAt(fireTime);

        const cycle = await runWeeklyCycle();

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

// ──────────────────────────────────────────────────────────────────────────────
// Ping de rede (código original — sem alterações)
// ──────────────────────────────────────────────────────────────────────────────
async function runPingCycle() {
    try {
        const { createClient } = await import("@supabase/supabase-js");
        const pingModule = await import("ping");
        const ping = pingModule.default;

        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

        if (!supabaseUrl || !supabaseKey) {
            console.warn("[PingScheduler] Missing Supabase credentials, skipping.");
            return;
        }

        const supabase = createClient(supabaseUrl, supabaseKey);

        const { data: links, error: fetchError } = await supabase
            .from("network_links")
            .select("*");

        if (fetchError || !links || links.length === 0) return;

        const results = await Promise.all(
            links.map(async (link: any) => {
                let alive = false;
                let method = "none";

                try {
                    const res = await ping.promise.probe(link.ip_address, { timeout: 4 });
                    if (res.alive) { alive = true; method = "icmp"; }
                } catch { /* ICMP failed */ }

                if (!alive) {
                    try {
                        const controller = new AbortController();
                        const tid = setTimeout(() => controller.abort(), 4000);
                        await fetch(`http://${link.ip_address}`, { method: "HEAD", signal: controller.signal, redirect: "manual" });
                        clearTimeout(tid);
                        alive = true; method = "http";
                    } catch { /* HTTP failed */ }
                }

                if (!alive) {
                    try {
                        const controller = new AbortController();
                        const tid = setTimeout(() => controller.abort(), 4000);
                        await fetch(`https://${link.ip_address}`, { method: "HEAD", signal: controller.signal, redirect: "manual" });
                        clearTimeout(tid);
                        alive = true; method = "https";
                    } catch { /* HTTPS failed */ }
                }

                const currentStatus = alive ? "up" : "down";
                const hasStatusChanged = link.last_status !== currentStatus;
                return { link, currentStatus, hasStatusChanged, method };
            })
        );

        const updates: any[] = [];
        const newEvents: any[] = [];

        for (const res of results) {
            if (res.hasStatusChanged) {
                newEvents.push({ link_id: res.link.id, status: res.currentStatus });
                console.log(`[PingScheduler] STATUS CHANGED: ${res.link.name} (${res.link.ip_address}) → ${res.currentStatus.toUpperCase()} via ${res.method}`);
            }
            updates.push({
                id: res.link.id,
                name: res.link.name,
                ip_address: res.link.ip_address,
                last_status: res.currentStatus,
                last_checked: new Date().toISOString(),
            });
        }

        if (newEvents.length > 0) await supabase.from("network_events").insert(newEvents);
        if (updates.length > 0) await supabase.from("network_links").upsert(updates);

    } catch (err) {
        console.error("[PingScheduler] Error:", err);
    }
}
