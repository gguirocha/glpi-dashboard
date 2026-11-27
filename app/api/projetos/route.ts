// POST /api/projetos — abre um projeto (PRJ-2026-092 / E2).
// Corpo: { "project": { "title": "...", ...campos opcionais }, "event"?: { "kind", "summary" } }
// Sem evento informado, o banco registra "aberto" na linha do tempo. Autor = dono da chave.
import { NextRequest } from "next/server";
import { requireApiKey } from "@/lib/requireApiKey";
import { parseCreate } from "@/lib/projects/validate";
import { erro, erroDoBanco, gravarProjeto, lerCorpo, responder } from "@/lib/projects/apiRoute";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(req: NextRequest) {
    const check = await requireApiKey(req);
    if (!check.ok) return check.response;

    const corpo = await lerCorpo(req);
    if (!corpo.ok) return corpo.response;
    const parsed = parseCreate(corpo.body);
    if (!parsed.ok) return erro(parsed.error, 400);

    const { data, error } = await gravarProjeto(check.admin, {
        id: null,
        project: parsed.value.project,
        event: parsed.value.event ?? null,
        author: check.author,
        keyId: check.keyId,
    });
    if (error) return erroDoBanco(error, "abrir projeto");
    return responder({ project: data }, 201);
}
