// app/api/cron/weekly-report/route.ts
// Endpoint MANUAL do ciclo semanal (reprocessamento pontual e PRÉVIA).
// O disparo automático é feito pelo instrumentation.ts — sem Vercel Cron.
//
//   GET /api/cron/weekly-report               → PRÉVIA (padrão): monta os e-mails e devolve em JSON;
//                                               NÃO envia, não marca envio e não limpa o andamento.
//   GET /api/cron/weekly-report?format=html   → a mesma prévia como página HTML para leitura.
//   GET /api/cron/weekly-report?send=1        → ciclo REAL (envia e-mails). Sem trava de dedup do
//                                               scheduler: não usar na segunda de manhã.
//
// Sempre exige Authorization: Bearer <CRON_SECRET>.

import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { runWeeklyCycle } from "@/lib/weeklyReport";
import { escapeHtml } from "@/lib/projects/report";
import type { WeeklyCycleResult } from "@/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 300;

const NO_STORE = { "Cache-Control": "no-store" };

function previewPage(c: WeeklyCycleResult): string {
    const blocos: string[] = [];
    const bloco = (titulo: string, to: string[], html: string) =>
        `<section style="margin:24px 0;border:1px solid #ddd;border-radius:8px;overflow:hidden">
<div style="background:#f3f4f6;padding:8px 12px;font:13px Arial"><b>${escapeHtml(titulo)}</b><br>Para: ${escapeHtml(to.join(", ") || "(sem destinatários)")}</div>
<div style="padding:12px">${html}</div></section>`;
    if (c.general.email) blocos.push(bloco(c.general.email.subject, c.general.email.to, c.general.email.html));
    for (const r of c.individual.results) {
        if (r.email) blocos.push(bloco(r.email.subject, r.email.to, r.email.html));
    }
    const avisos = c.warnings.length
        ? `<p style="color:#b45309">Avisos: ${c.warnings.map(escapeHtml).join(" · ")}</p>`
        : "";
    return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="robots" content="noindex">
<title>Prévia do report semanal</title></head><body style="max-width:820px;margin:24px auto;font-family:Arial">
<h1 style="font-size:18px">Prévia do report semanal — nada foi enviado</h1>
<p>${c.individual.processed} individual(is) · geral ${c.general.enabled ? "habilitado" : "desabilitado (mostrado só na prévia)"}</p>
${avisos}${blocos.join("\n")}</body></html>`;
}

/** Compara o Bearer com CRON_SECRET em tempo constante (hash dos dois lados). */
function authorized(header: string | null): boolean {
    const secret = process.env.CRON_SECRET;
    // Sem CRON_SECRET configurado, nega.
    if (!secret || !header) return false;
    const h = (s: string) => createHash("sha256").update(s).digest();
    return timingSafeEqual(h(header), h(`Bearer ${secret}`));
}

export async function GET(request: Request) {
    if (!authorized(request.headers.get("authorization"))) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: NO_STORE });
    }

    // Padrão é PRÉVIA. Envio real só com ?send=1 exato — erro de digitação nunca dispara e-mail.
    const params = new URL(request.url).searchParams;
    const preview = params.get("send") !== "1";

    try {
        console.log(`[API] Ciclo semanal manual iniciado (${preview ? "PRÉVIA, sem envio" : "REAL"})...`);
        const cycle = await runWeeklyCycle({ preview });

        if (preview && params.get("format") === "html") {
            return new NextResponse(previewPage(cycle), {
                status: 200,
                headers: {
                    ...NO_STORE,
                    "Content-Type": "text/html; charset=utf-8",
                    "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'",
                    "X-Content-Type-Options": "nosniff",
                },
            });
        }
        return NextResponse.json(cycle, { headers: NO_STORE });
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Unknown error";
        console.error("[API] Erro no ciclo manual:", message);
        return NextResponse.json({ error: "Falha no ciclo semanal" }, { status: 500, headers: NO_STORE });
    }
}
