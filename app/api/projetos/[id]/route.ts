// GET   /api/projetos/:id — projeto + últimos eventos da linha do tempo
// PATCH /api/projetos/:id — atualiza campos e/ou registra portão (projeto + evento na mesma transação;
//                          sem evento, o banco registra "atualizacao" com os nomes dos campos alterados)
// Corpo do PATCH: { "project"?: { ...campos }, "event"?: { "kind", "summary" } }  (PRJ-2026-092 / E2)
import { NextRequest } from "next/server";
import { requireApiKey } from "@/lib/requireApiKey";
import { parseUpdate } from "@/lib/projects/validate";
import {
    COLUNAS_EVENTO, COLUNAS_PROJETO, LIMITE_EVENTOS,
    erro, erroDoBanco, gravarProjeto, idDaRota, lerCorpo, responder,
} from "@/lib/projects/apiRoute";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, ctx: Ctx) {
    const check = await requireApiKey(req);
    if (!check.ok) return check.response;
    const id = idDaRota((await ctx.params).id);
    if (!id) return erro("Id inválido", 400);

    const [proj, evs] = await Promise.all([
        check.admin.from("dashboard_projects").select(COLUNAS_PROJETO).eq("id", id).maybeSingle(),
        check.admin.from("dashboard_project_events").select(COLUNAS_EVENTO).eq("project_id", id)
            .order("created_at", { ascending: false }).order("id", { ascending: false }).limit(LIMITE_EVENTOS),
    ]);
    if (proj.error) return erroDoBanco(proj.error, "ler projeto");
    if (!proj.data) return erro("Projeto não encontrado", 404);
    if (evs.error) return erroDoBanco(evs.error, "ler eventos");

    return responder({ project: proj.data, events: evs.data });
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
    const check = await requireApiKey(req);
    if (!check.ok) return check.response;
    const id = idDaRota((await ctx.params).id);
    if (!id) return erro("Id inválido", 400);

    const corpo = await lerCorpo(req);
    if (!corpo.ok) return corpo.response;
    const parsed = parseUpdate(corpo.body);
    if (!parsed.ok) return erro(parsed.error, 400);

    const { data, error } = await gravarProjeto(check.admin, {
        id,
        project: parsed.value.project,
        event: parsed.value.event ?? null,
        author: check.author,
        keyId: check.keyId,
    });
    if (error) return erroDoBanco(error, "atualizar projeto");
    return responder({ project: data });
}
