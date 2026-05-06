// app/api/cron/weekly-report/route.ts
// Endpoint para disparo MANUAL do ciclo semanal (testes, reprocessamento pontual).
// O disparo automático é feito pelo instrumentation.ts — sem Vercel Cron.
//
// Executa:
//   1. runWeeklyReport()  → e-mails individuais por projeto
//   2. runGeneralReport() → síntese executiva consolidada para os heads
//   3. limpa weekly_update dos projetos reportados com sucesso

import { NextResponse } from "next/server";
import { runWeeklyCycle } from "@/lib/weeklyReport";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: Request) {
    const authHeader = request.headers.get("authorization");
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        console.log("[API] Disparo manual do ciclo semanal iniciado...");
        const cycle = await runWeeklyCycle();

        return NextResponse.json({
            message: "Ciclo semanal concluído",
            individual: {
                processed: cycle.individual.processed,
                succeeded: cycle.individual.succeeded,
                failed: cycle.individual.failed,
                skipped: cycle.individual.skipped,
                results: cycle.individual.results.map((r) => ({
                    project: r.project.title,
                    workflowStatus: r.project.status,
                    sentTo: r.sentTo,
                    success: r.success,
                    error: r.error ?? null,
                })),
            },
            general: {
                enabled: cycle.general.enabled,
                sentTo: cycle.general.sentTo,
                projectsIncluded: cycle.general.projectsIncluded,
                success: cycle.general.success,
                error: cycle.general.error ?? null,
            },
            cleared: cycle.cleared,
        });
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Unknown error";
        console.error("[API] Erro no disparo manual:", message);
        return NextResponse.json({ error: message }, { status: 500 });
    }
}
