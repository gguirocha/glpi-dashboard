// Utilidades compartilhadas pelas rotas /api/projetos (PRJ-2026-092 / E2).
import { NextRequest, NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { EventInput, ProjectFields } from "./validate";

export const TAMANHO_MAXIMO_CORPO = 16 * 1024;

// Colunas devolvidas pela API (lista fixa: nada de select("*") — egress do Supabase)
export const COLUNAS_PROJETO =
    "id, code, title, status, phase, health, health_reason, steps_total, steps_done, start_date, " +
    "baseline_date, due_date, owner, requester, area, sponsor, origin_ticket, links, next_step, " +
    "decision_needed, real_status_id, completed_at, updated_at";
export const COLUNAS_EVENTO = "id, kind, summary, author, created_at";
export const LIMITE_EVENTOS = 20;

const CABECALHOS_BASE = { "Cache-Control": "no-store", Vary: "Authorization" };

export function responder(data: unknown, status = 200, extraHeaders?: Record<string, string>): NextResponse {
    return NextResponse.json(data, { status, headers: { ...extraHeaders, ...CABECALHOS_BASE } });
}

export function erro(mensagem: string, status: number, extraHeaders?: Record<string, string>): NextResponse {
    return responder({ error: mensagem }, status, extraHeaders);
}

type LeituraCorpo = { ok: true; body: unknown } | { ok: false; response: NextResponse };

/** Lê o corpo JSON em streaming, abortando ao passar do limite. */
export async function lerCorpo(req: NextRequest): Promise<LeituraCorpo> {
    const cl = req.headers.get("content-length");
    if (cl !== null) {
        if (!/^\d+$/.test(cl.trim())) return { ok: false, response: erro("Content-Length inválido", 400) };
        if (Number(cl) > TAMANHO_MAXIMO_CORPO) return { ok: false, response: erro("Corpo muito grande", 413) };
    }
    let texto: string;
    try {
        if (!req.body) return { ok: false, response: erro("Corpo vazio", 400) };
        const reader = req.body.getReader();
        const partes: Uint8Array[] = [];
        let total = 0;
        for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            total += value.byteLength;
            if (total > TAMANHO_MAXIMO_CORPO) {
                await reader.cancel().catch(() => {});
                return { ok: false, response: erro("Corpo muito grande", 413) };
            }
            partes.push(value);
        }
        texto = Buffer.concat(partes).toString("utf8");
    } catch {
        return { ok: false, response: erro("Falha ao ler o corpo", 400) };
    }
    if (texto.trim() === "") return { ok: false, response: erro("Corpo vazio", 400) };
    try {
        return { ok: true, body: JSON.parse(texto) };
    } catch {
        return { ok: false, response: erro("JSON inválido", 400) };
    }
}

/** Converte o id da URL; só inteiros positivos sem zeros à esquerda. */
export function idDaRota(valor: string): number | null {
    if (!/^[1-9]\d{0,11}$/.test(valor)) return null;
    return Number(valor);
}

/** Chama a função atômica do banco (projeto + evento na mesma transação). */
export async function gravarProjeto(
    admin: SupabaseClient,
    args: { id: number | null; project: Partial<ProjectFields>; event: EventInput | null; author: string; keyId: number },
) {
    return admin.rpc("api_write_project", {
        p_id: args.id,
        p_project: args.project,
        p_event: args.event,
        p_author: args.author,
        p_key_id: args.keyId,
    });
}

const CODIGOS_422 = new Set(["22023", "22007", "22008", "22P02", "22003", "22P05", "23502", "23503", "23514"]);

/** Traduz erros do Postgres/PostgREST em respostas sem vazar detalhes internos. */
export function erroDoBanco(e: { code?: string; message?: string } | null, contexto: string): NextResponse {
    const code = e?.code ?? "";
    if (code === "P0002") return erro("Projeto não encontrado", 404);
    if (CODIGOS_422.has(code)) return erro("Dados recusados pelas regras do projeto", 422);
    if (code === "42501") return erro("Operação não permitida", 403);
    if (code === "55P03") return erro("Projeto ocupado, tente de novo", 503);
    console.error(`[api/projetos] ${contexto}:`, code);
    return erro("Erro interno", 500);
}
