// Guarda das rotas /api/projetos: só passa quem manda uma chave pessoal ativa
// (Authorization: Bearer mdf_<prefixo>_<segredo>). O banco guarda só o sha256 da chave
// (tabela dashboard_api_keys, acessível apenas pela service_role). PRJ-2026-092 / E2.
//
// Limites (antes de qualquer consulta ao banco, para chave falsa não gastar o Supabase):
//  - por IP: 30 falhas de autenticação por minuto (IP vem de X-Real-IP, posto pelo nginx com $remote_addr);
//  - global: 300 falhas por minuto, somando todos os IPs (segura o caso de IP ausente/forjado);
//  - por chave válida: 60 requisições por minuto.
// O Next escuta na 3000 só atrás do nginx (porta fechada no firewalld); 1 instância no PM2,
// então limite em memória basta.
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { hashApiKey, parseBearer } from "@/lib/projects/apiKey";
import { createRateLimiter } from "@/lib/projects/rateLimit";
import { erro } from "@/lib/projects/apiRoute";

type ApiKeyCheck =
    | { ok: true; admin: SupabaseClient; keyId: number; author: string }
    | { ok: false; response: NextResponse };

const JANELA_MS = 60_000;
const falhasPorIp = createRateLimiter(30, JANELA_MS);
const falhasGlobais = createRateLimiter(300, JANELA_MS);
const porChave = createRateLimiter(60, JANELA_MS);
// last_used_at é gravado no máximo a cada 5 min por chave (evita uma escrita por requisição)
const ultimoRegistro = new Map<number, number>();
const INTERVALO_USO_MS = 5 * 60_000;

// O limitador "consome" ao ser consultado; para checar sem consumir, guardamos quem estourou.
const bloqueadoAte = new Map<string, number>();
const GLOBAL = "__global__";
let ultimaVarredura = 0;
// Hashes de chaves validadas há pouco: quem apresenta uma delas NÃO cai nos bloqueios por IP/global
// (um atacante com chaves falsas não consegue tirar o gestor do ar). A chave continua sendo
// conferida no banco a cada requisição, então revogar vale na hora.
const validadasRecentes = new Map<string, number>();
const TTL_VALIDADA_MS = 10 * 60_000;
let avisouSemIp = 0;

function ipDe(req: NextRequest): string | null {
    // Só X-Real-IP (definido pelo nginx com $remote_addr). Nunca X-Forwarded-For, que o cliente controla.
    return req.headers.get("x-real-ip")?.trim() || null;
}

function varrer(agora: number) {
    if (agora - ultimaVarredura < JANELA_MS) return;
    ultimaVarredura = agora;
    for (const [id, ate] of bloqueadoAte) if (ate <= agora) bloqueadoAte.delete(id);
    for (const [h, ate] of validadasRecentes) if (ate <= agora) validadasRecentes.delete(h);
}

function emBloqueio(id: string, agora: number): boolean {
    const ate = bloqueadoAte.get(id);
    if (!ate) return false;
    if (ate > agora) return true;
    bloqueadoAte.delete(id);
    return false;
}

function registrarFalha(ip: string | null, agora: number) {
    // Sem IP confiável não existe balde por IP (todos cairiam no mesmo): só o teto global vale.
    if (ip && !falhasPorIp(ip)) bloqueadoAte.set(ip, agora + JANELA_MS);
    if (!falhasGlobais(GLOBAL)) bloqueadoAte.set(GLOBAL, agora + JANELA_MS);
}

const muitas = () => erro("Muitas requisições", 429, { "Retry-After": "60" });

export async function requireApiKey(req: NextRequest): Promise<ApiKeyCheck> {
    const agora = Date.now();
    varrer(agora);
    const ip = ipDe(req);
    if (!ip && agora - avisouSemIp > JANELA_MS) {
        avisouSemIp = agora;
        console.warn("[api/projetos] requisição sem X-Real-IP: confira o proxy_set_header no nginx");
    }
    const key = parseBearer(req.headers.get("authorization"));
    const hash = key ? hashApiKey(key) : null;
    const conhecida = hash !== null && (validadasRecentes.get(hash) ?? 0) > agora;
    if (!conhecida && ((ip && emBloqueio(ip, agora)) || emBloqueio(GLOBAL, agora))) {
        return { ok: false, response: muitas() };
    }

    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!serviceRoleKey || !supabaseUrl) {
        console.error("[api/projetos] SUPABASE_SERVICE_ROLE_KEY/NEXT_PUBLIC_SUPABASE_URL ausentes no ambiente");
        return { ok: false, response: erro("Erro interno", 500) };
    }

    if (!key || !hash) {
        registrarFalha(ip, agora);
        return { ok: false, response: erro("Não autorizado", 401) };
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, {
        auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data, error } = await admin
        .from("dashboard_api_keys")
        .select("id, owner_name, revoked_at")
        .eq("key_hash", hash)
        .maybeSingle();
    if (error) {
        console.error("[api/projetos] falha ao validar chave:", error.code);
        return { ok: false, response: erro("Erro interno", 500) };
    }
    if (!data || data.revoked_at) {
        validadasRecentes.delete(hash);
        registrarFalha(ip, agora);
        return { ok: false, response: erro("Não autorizado", 401) };
    }
    validadasRecentes.set(hash, agora + TTL_VALIDADA_MS);

    if (!porChave(String(data.id))) return { ok: false, response: muitas() };

    if ((ultimoRegistro.get(data.id) ?? 0) + INTERVALO_USO_MS < agora) {
        const { error: errUso } = await admin
            .from("dashboard_api_keys")
            .update({ last_used_at: new Date(agora).toISOString() })
            .eq("id", data.id);
        if (errUso) console.error("[api/projetos] falha ao registrar uso da chave", data.id, errUso.code);
        else ultimoRegistro.set(data.id, agora);
    }

    return { ok: true, admin, keyId: data.id, author: data.owner_name };
}
