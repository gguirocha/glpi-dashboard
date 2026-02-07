import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

    if (!serviceRoleKey || !supabaseUrl) {
        return NextResponse.json({ error: "Configuration Error" }, { status: 500 });
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
        auth: { autoRefreshToken: false, persistSession: false },
    });

    try {
        const body = await req.json();
        const { userId, password, isAdmin } = body;

        if (!userId) {
            return NextResponse.json({ error: "User ID missing" }, { status: 400 });
        }

        // 1. Update Auth User (Password)
        if (password && password.trim() !== "") {
            const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(
                userId,
                { password: password }
            );
            if (authError) throw authError;
        }

        // 2. Update Profile (Role)
        // Note: We also update metadata in Auth just in case
        if (isAdmin !== undefined) {
            const role = isAdmin ? 'admin' : 'user';

            const { error: authMetaError } = await supabaseAdmin.auth.admin.updateUserById(
                userId,
                { user_metadata: { role: role } }
            );
            if (authMetaError) throw authMetaError;

            const { error: profileError } = await supabaseAdmin
                .from('profiles')
                .update({ role: role })
                .eq('id', userId);

            if (profileError) throw profileError;
        }

        return NextResponse.json({ message: "User updated successfully" }, { status: 200 });

    } catch (error: any) {
        console.error("API Error:", error);
        return NextResponse.json({ error: error.message || "Internal Server Error" }, { status: 500 });
    }
}
