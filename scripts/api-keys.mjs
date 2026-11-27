#!/usr/bin/env node
// Gestão das chaves pessoais da API /api/projetos (PRJ-2026-092 / E2).
// Rodar NO SERVIDOR, na pasta do app (usa SUPABASE_SERVICE_ROLE_KEY e NEXT_PUBLIC_SUPABASE_URL do .env.local
// ou do ambiente). A chave completa aparece UMA vez, na criação; o banco guarda só o sha256.
//
//   node scripts/api-keys.mjs create --owner "Nome da pessoa" [--label "notebook"]
//   node scripts/api-keys.mjs list
//   node scripts/api-keys.mjs revoke --id 3
//
// Formato da chave = lib/projects/apiKey.ts (mdf_<8 hex>_<32 bytes base64url>); manter os dois iguais.
import { createHash, randomBytes } from "node:crypto";
import fs from "node:fs";
import { createClient } from "@supabase/supabase-js";

function sair(msg) { console.error("api-keys: " + msg); process.exit(1); }

function env(nome) {
  if (process.env[nome]) return process.env[nome];
  for (const f of [".env.local", ".env"]) {
    if (!fs.existsSync(f)) continue;
    const l = fs.readFileSync(f, "utf8").split(/\r?\n/).find((x) => x.startsWith(nome + "="));
    if (l) return l.slice(nome.length + 1).trim().replace(/^["']|["']$/g, "");
  }
  return undefined;
}

const args = process.argv.slice(2);
const cmd = args[0];
const opt = (k) => {
  const i = args.indexOf("--" + k);
  if (i < 0) return undefined;
  const v = args[i + 1];
  if (v === undefined || v.startsWith("--")) sair(`--${k} precisa de um valor`);
  return v;
};

const url = env("NEXT_PUBLIC_SUPABASE_URL"), key = env("SUPABASE_SERVICE_ROLE_KEY");
if (!url || !key) sair("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY não encontradas");
const db = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

if (cmd === "create") {
  const owner = (opt("owner") || "").trim();
  const label = (opt("label") || "").trim() || null;
  if (!owner || owner.length > 100) sair("--owner obrigatório (até 100 caracteres)");
  const prefix = randomBytes(4).toString("hex");
  const chave = `mdf_${prefix}_${randomBytes(32).toString("base64url")}`;
  // mesmo formato aceito pela API (lib/projects/apiKey.ts): falha alto se os dois divergirem
  if (!/^mdf_[0-9a-f]{8}_[A-Za-z0-9_-]{43}$/.test(chave)) sair("formato de chave gerada inesperado");
  const hash = createHash("sha256").update(chave).digest("hex");
  const { data, error } = await db.from("dashboard_api_keys")
    .insert({ owner_name: owner, label, key_prefix: prefix, key_hash: hash }).select("id").single();
  if (error) sair("falha ao criar: " + error.code);
  console.log(`Chave criada (id ${data.id}) para ${owner}. Copie agora — ela não será mostrada de novo:\n\n${chave}\n`);
  console.log("Guarde no cofre e em %USERPROFILE%\\.ti-mdf.env como GLPIDASH_API_KEY=<chave>. Não rode este comando sob tee/log: a chave aparece só aqui.");
} else if (cmd === "list") {
  const { data, error } = await db.from("dashboard_api_keys")
    .select("id, owner_name, label, key_prefix, created_at, last_used_at, revoked_at").order("id");
  if (error) sair("falha ao listar: " + error.code);
  for (const k of data) {
    console.log(`${k.id}\t${k.owner_name}\t${k.label ?? ""}\tmdf_${k.key_prefix}_…\tcriada ${k.created_at?.slice(0, 10)}\t`
      + `último uso ${k.last_used_at?.slice(0, 16) ?? "-"}\t${k.revoked_at ? "REVOGADA " + k.revoked_at.slice(0, 10) : "ativa"}`);
  }
} else if (cmd === "revoke") {
  const id = opt("id");
  if (!/^\d+$/.test(id ?? "")) sair("--id numérico obrigatório");
  const { data, error } = await db.from("dashboard_api_keys")
    .update({ revoked_at: new Date().toISOString() }).eq("id", Number(id)).is("revoked_at", null).select("id, owner_name");
  if (error) sair("falha ao revogar: " + error.code);
  console.log(data.length ? `Chave ${id} (${data[0].owner_name}) revogada.` : `Chave ${id} não encontrada ou já revogada.`);
} else {
  console.log("Uso: node scripts/api-keys.mjs <create --owner \"Nome\" [--label x] | list | revoke --id N>");
  process.exit(cmd ? 1 : 0);
}
