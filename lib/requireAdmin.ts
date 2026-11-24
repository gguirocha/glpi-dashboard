// Guarda das rotas /api/admin/*: só passa quem manda o JWT de uma sessão válida
// (Authorization: Bearer <access_token>) E tem profiles.role = 'admin'.
// Antes de 24/11/2026 essas rotas usavam a service_role sem checar o chamador —
// qualquer um na internet criava admin ou trocava senha.
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

type AdminCheck =
    | { ok: true; admin: SupabaseClient; callerId: string }
    | { ok: false; response: NextResponse };

export async function requireAdmin(req: NextRequest): Promise<AdminCheck> {
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (!serviceRoleKey || !supabaseUrl) {
        return { ok: false, response: NextResponse.json({ error: "Configuration Error" }, { status: 500 }) };
    }

    const auth = req.headers.get("authorization") ?? "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
    if (!token) {
        return { ok: false, response: NextResponse.json({ error: "Não autenticado" }, { status: 401 }) };
    }

    const admin = createClient(supabaseUrl, serviceRoleKey, {
        auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: userData, error: userError } = await admin.auth.getUser(token);
    if (userError || !userData.user) {
        return { ok: false, response: NextResponse.json({ error: "Sessão inválida" }, { status: 401 }) };
    }

    const { data: profile } = await admin
        .from("profiles")
        .select("role")
        .eq("id", userData.user.id)
        .single();
    if (profile?.role !== "admin") {
        return { ok: false, response: NextResponse.json({ error: "Acesso restrito a administradores" }, { status: 403 }) };
    }

    return { ok: true, admin, callerId: userData.user.id };
}
