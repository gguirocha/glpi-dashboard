// instrumentation.ts
// Roda UMA VEZ quando o servidor Next.js inicia (dev e produção).
// Registra dois schedulers em background — sem dependência de Vercel Cron.
//
// ⚠️  ORÇAMENTO DE I/O (Supabase free tier)
// Este arquivo foi reescrito para minimizar escritas/leituras no banco. O modelo
// antigo fazia upsert de TODOS os network_links a cada 60s (mesmo sem mudança),
// o que gerava dead tuples + autovacuum constante e esgotava o burst de I/O do
// plano free. Regra de ouro aqui: SÓ escrever no banco quando algo muda.

// ──────────────────────────────────────────────────────────────────────────────
// Configuração dos intervalos — ajuste aqui se precisar
// ──────────────────────────────────────────────────────────────────────────────
const PING_INTERVAL_MS = 120_000;        // ping de rede a cada 2 min (era 60s)
const LINKS_REFRESH_MS = 300_000;        // recarrega a lista de links do banco a cada 5 min
const WEEKLY_TICK_MS = 60_000;           // tick do semanal (barato: só faz math, sem DB fora da janela)
const SCHEDULE_REFRESH_MS = 600_000;     // recarrega a config de agendamento a cada 10 min

export async function register() {
    if (process.env.NEXT_RUNTIME !== "nodejs") return;

    console.log("[Instrumentation] Iniciando schedulers em background (modo I/O reduzido)...");

    // ──────────────────────────────────────────────
    // Scheduler 1: Ping de rede
    // ──────────────────────────────────────────────
    setTimeout(() => {
        runPingCycle();
        setInterval(runPingCycle, PING_INTERVAL_MS);
    }, 10_000);

    // ──────────────────────────────────────────────
    // Scheduler 2: Relatório semanal — tick frequente, mas só toca no banco
    // dentro da janela de disparo (dia/hora agendados). Fora disso é só Date math.
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

// ──────────────────────────────────────────────────────────────────────────────
// Ping de rede — SÓ escreve no banco quando o status de um link muda.
//
// Antes: upsert de TODOS os links a cada ciclo (esgotava o I/O).
// Agora: a lista de links fica em memória (refresh a cada 5 min); comparamos o
// status atual com o último conhecido em memória e só gravamos as linhas que
// realmente mudaram + o evento correspondente. `last_checked` não é exibido em
// lugar nenhum, então não vale uma escrita por ciclo.
// ──────────────────────────────────────────────────────────────────────────────
type CachedLink = { id: any; name: string; ip_address: string; last_status: string | null };
let cachedLinks: CachedLink[] | null = null;
let linksLoadedAt = 0;

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

        // Recarrega a lista de links do banco no máximo a cada LINKS_REFRESH_MS.
        // No restante dos ciclos usamos a cópia em memória (sem leitura no banco).
        const nowMs = Date.now();
        if (!cachedLinks || nowMs - linksLoadedAt > LINKS_REFRESH_MS) {
            const { data: links, error: fetchError } = await supabase
                .from("network_links")
                .select("id, name, ip_address, last_status");
            if (fetchError) {
                console.error("[PingScheduler] Erro ao carregar links:", fetchError.message);
                return;
            }
            cachedLinks = (links as CachedLink[]) ?? [];
            linksLoadedAt = nowMs;
        }

        if (!cachedLinks || cachedLinks.length === 0) return;

        const results = await Promise.all(
            cachedLinks.map(async (link) => {
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

        const newEvents: any[] = [];
        const changedLinks: { id: any; currentStatus: string }[] = [];

        for (const res of results) {
            if (res.hasStatusChanged) {
                newEvents.push({ link_id: res.link.id, status: res.currentStatus });
                changedLinks.push({ id: res.link.id, currentStatus: res.currentStatus });
                // Atualiza o cache em memória para o próximo ciclo
                res.link.last_status = res.currentStatus;
                console.log(`[PingScheduler] STATUS CHANGED: ${res.link.name} (${res.link.ip_address}) → ${res.currentStatus.toUpperCase()} via ${res.method}`);
            }
        }

        // ── SÓ escreve no banco se houve mudança de status ──
        if (newEvents.length > 0) {
            await supabase.from("network_events").insert(newEvents);
        }
        // Atualiza last_status apenas nas linhas que mudaram (uma por uma; são raras).
        for (const c of changedLinks) {
            await supabase
                .from("network_links")
                .update({ last_status: c.currentStatus, last_checked: new Date().toISOString() })
                .eq("id", c.id);
        }

    } catch (err) {
        console.error("[PingScheduler] Error:", err);
    }
}
